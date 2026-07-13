// AI Export: turns a room's (or several rooms') floor-plan + elevation data
// into material a user can hand to an external image-gen model (Gemini/
// Imagen) — no API call happens here, this module only produces a PNG and
// two text formats for the user to copy/paste themselves.
//
// Reuses elevation.js's projection math (window.elevation*, exposed for
// exactly this reason) rather than re-deriving wall/footprint geometry.
// Prompt structure follows Google's own documented conventions, not
// invented: the six-view grid is fed to the model as a "sketch" reference
// image using Google's documented sketch-to-photo template ("Turn this
// rough sketch of a [subject] into a [style] photo. Keep the [features]
// from the sketch but add [details]" — ai.google.dev/gemini-api/docs/
// image-generation), the JSON prompt isolates visual dimensions into named
// sections (core/style/environment/composition/materials/quality) per the
// community-standard schema (github.com/pauhu/gemini-image-prompting-
// handbook). Exclusions are folded into the same prompt (as a trailing
// "Avoid: ..." clause / a negative_prompt array) rather than a separate
// negative-prompt output — Gemini's API has no distinct negative-prompt
// field, everything has to live in one natural-language prompt
// (ai.google.dev/gemini-api/docs/prompting-strategies); the token list
// stays in the 5-15 token "sweet spot" documented as most effective rather
// than dumping every possible exclusion (ltx.io/blog/negative-prompts).
(function initAiExport() {
  const worldCmToPx = (cm) => cm * window.BASE_SCALE;

  const VIEW_ORDER = ['top', 'right', 'bottom', 'left', 'ceiling', 'floor'];
  const VIEW_LABEL_KEYS = {
    top: 'elevation.wallTop', right: 'elevation.wallRight',
    bottom: 'elevation.wallBottom', left: 'elevation.wallLeft',
    ceiling: 'elevation.ceiling', floor: 'elevation.floor',
  };
  function viewLabel(view) { return window.t(VIEW_LABEL_KEYS[view] || view); }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // small monochrome outlet glyph (circle + two prong marks) — electricals.js's
  // own buildElectricalVisual bakes its stroke color into a Konva.Shape
  // sceneFunc, which can't be re-themed after the fact, so line-art draws a
  // simpler dedicated glyph instead of fighting that
  function socketGlyph(cxPx, cyPx, diameterPx) {
    const r = Math.max(diameterPx / 2, 4);
    const g = new Konva.Group({ x: cxPx, y: cyPx });
    g.add(new Konva.Circle({ radius: r, stroke: '#000000', strokeWidth: 1.3 }));
    const m = r * 0.45;
    g.add(new Konva.Line({ points: [-m, -m, -m, m], stroke: '#000000', strokeWidth: 1 }));
    g.add(new Konva.Line({ points: [m, -m, m, m], stroke: '#000000', strokeWidth: 1 }));
    return g;
  }

  // fixtures.js's buildFixtureVisual hardcodes color (blue window line, cream
  // door-gap erase line, brown swing arc) — its Line/Path children all use the
  // standard .stroke() property (no custom sceneFunc), so recoloring them to
  // pure monochrome is a safe post-pass rather than a geometry reimplementation
  function monochromize(group) {
    group.getChildren().forEach((node) => {
      if (typeof node.stroke === 'function' && node.stroke()) {
        node.stroke(node.stroke() === '#F5F0E8' ? '#FFFFFF' : '#000000');
      }
      if (typeof node.fill === 'function' && node.fill()) node.fill('#FFFFFF');
    });
    return group;
  }

  // Renders one view (a wall id, 'ceiling', or 'floor') of a room as a clean
  // white-background / black-outline PNG dataURL, on a detached offscreen
  // Konva.Stage (never attached to the document, so it never flickers/steals
  // events from the visible canvas). Per the plan: pure outlines, no fill, no
  // occlusion handling — this is just reference geometry for an external
  // image model, not the app's own interactive elevation preview.
  window.renderLineArtView = function renderLineArtView(room, view, cellW, cellH) {
    cellW = cellW || 700; cellH = cellH || 525;
    const isPlan = view === 'floor' || view === 'ceiling';

    const container = document.createElement('div');
    const stage = new Konva.Stage({ container, width: cellW, height: cellH });
    const bgLayer = new Konva.Layer();
    bgLayer.add(new Konva.Rect({ x: 0, y: 0, width: cellW, height: cellH, fill: '#FFFFFF' }));
    bgLayer.add(new Konva.Rect({ x: 0.5, y: 0.5, width: cellW - 1, height: cellH - 1, stroke: '#2C2416', strokeWidth: 1 }));
    bgLayer.add(new Konva.Text({
      x: 8, y: 6, text: viewLabel(view), fontFamily: 'Courier New, monospace', fontSize: 14, fill: '#000000',
    }));
    stage.add(bgLayer);
    const layer = new Konva.Layer();
    stage.add(layer);

    let contentWCm, contentHCm;

    if (isPlan) {
      contentWCm = room.w; contentHCm = room.h;
      const wPx = worldCmToPx(room.w), hPx = worldCmToPx(room.h);
      layer.add(new Konva.Rect({ x: 0, y: 0, width: wPx, height: hPx, stroke: '#000000', strokeWidth: 2 }));

      const contentView = view === 'ceiling' ? 'floor' : 'ceiling';
      window.appState.fixtures.forEach((f) => {
        if (f.roomId !== room.id) return;
        const fWall = window.roomWallsFor(room).find((w) => w.id === f.wallId);
        if (!fWall) return;
        layer.add(monochromize(window.buildFixtureVisual(f, fWall, room, room.x, room.y)));
      });
      window.appState.furniture.forEach((item) => {
        if (!window.elevationOverlapsRoom(item, room)) return;
        const touchesCeiling = item.distanceFromCeiling <= window.ELEVATION_TOUCHES_CEILING_CM;
        if (contentView === 'ceiling' && !touchesCeiling) return;
        if (contentView === 'floor' && touchesCeiling) {
          const cx = worldCmToPx(item.x + item.w / 2 - room.x);
          const cy = worldCmToPx(item.y + item.h / 2 - room.y);
          const r = worldCmToPx(Math.min(item.w, item.h) / 2);
          layer.add(new Konva.Circle({ x: cx, y: cy, radius: r, stroke: '#000000', dash: [4, 3], strokeWidth: 1.5 }));
          return;
        }
        layer.add(new Konva.Rect({
          x: worldCmToPx(item.x - room.x), y: worldCmToPx(item.y - room.y),
          width: worldCmToPx(item.w), height: worldCmToPx(item.h), stroke: '#000000', strokeWidth: 1.5,
        }));
      });
      window.appState.electricals.forEach((item) => {
        if (!window.elevationOverlapsRoom(item, room)) return;
        const touchesCeiling = item.distanceFromCeiling <= window.ELEVATION_TOUCHES_CEILING_CM;
        if (contentView === 'ceiling' && !touchesCeiling) return;
        layer.add(socketGlyph(
          worldCmToPx(item.x + item.w / 2 - room.x), worldCmToPx(item.y + item.h / 2 - room.y), worldCmToPx(item.w)
        ));
      });
    } else {
      const wall = window.elevationWallForView(room, view);
      const wallLenCm = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      contentWCm = wallLenCm; contentHCm = room.height;
      const wallLenPx = worldCmToPx(wallLenCm), roomHPx = worldCmToPx(room.height);
      layer.add(new Konva.Line({ points: [0, 0, wallLenPx, 0], stroke: '#000000', strokeWidth: 2 }));
      layer.add(new Konva.Line({ points: [0, roomHPx, wallLenPx, roomHPx], stroke: '#000000', strokeWidth: 2 }));

      const blocks = [];
      window.appState.furniture.forEach((item) => {
        if (!window.elevationOverlapsRoom(item, room)) return;
        blocks.push({ proj: window.elevationProjectToWall(window.elevationFurnitureSamples(item), wall, room), item, kind: 'furn' });
      });
      window.appState.electricals.forEach((item) => {
        if (!window.elevationOverlapsRoom(item, room)) return;
        const proj = window.elevationProjectToWall(window.elevationElectricalSamples(item), wall, room);
        if (Math.abs(proj.depth) > window.ELEVATION_SOCKET_WALL_PROXIMITY_CM) return;
        blocks.push({ proj, item, kind: 'sock' });
      });
      window.appState.fixtures.forEach((item) => {
        const proj = window.elevationFixtureProjectionOnWall(item, wall, room);
        if (!proj) return;
        blocks.push({ proj, item, kind: 'fix' });
      });

      blocks.forEach(({ proj, item, kind }) => {
        const topCm = room.height - (item.heightFromFloor + item.objectHeight);
        const xPx = worldCmToPx(proj.u0), yPx = worldCmToPx(topCm);
        const wPx = worldCmToPx(proj.u1 - proj.u0), hPx = worldCmToPx(item.objectHeight);
        if (kind === 'sock') {
          layer.add(socketGlyph(xPx + wPx / 2, yPx + hPx / 2, Math.max(wPx, hPx)));
        } else {
          layer.add(new Konva.Rect({ x: xPx, y: yPx, width: wPx, height: hPx, stroke: '#000000', strokeWidth: 1.5 }));
        }
      });
    }

    const contentWPx = worldCmToPx(contentWCm), contentHPx = worldCmToPx(contentHCm);
    const margin = 44;
    const fitScale = Math.min((cellW - margin * 2) / contentWPx, (cellH - margin * 2 - 20) / contentHPx);
    layer.scale({ x: fitScale, y: fitScale });
    layer.position({ x: (cellW - contentWPx * fitScale) / 2, y: 24 + (cellH - 24 - contentHPx * fitScale) / 2 });
    stage.batchDraw();
    const dataUrl = stage.toDataURL({ pixelRatio: 1 });
    stage.destroy();
    return dataUrl;
  };

  // 2x3 grid (Top/Right/Bottom/Left/Ceiling/Floor), one room
  window.buildSixGridPng = async function buildSixGridPng(room) {
    const CELL_W = 700, CELL_H = 525, PAD = 14, TITLE_H = 34;
    const cols = 3, rows = 2;
    const canvas = document.createElement('canvas');
    canvas.width = cols * CELL_W + (cols + 1) * PAD;
    canvas.height = TITLE_H + rows * CELL_H + (rows + 1) * PAD;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '18px "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`${room.name} — ${room.w}×${room.h}cm, H:${room.height}cm`, PAD, 8);

    for (let i = 0; i < VIEW_ORDER.length; i++) {
      const view = VIEW_ORDER[i];
      const dataUrl = window.renderLineArtView(room, view, CELL_W, CELL_H);
      const img = await loadImage(dataUrl);
      const col = i % cols, row = Math.floor(i / cols);
      const x = PAD + col * (CELL_W + PAD);
      const y = TITLE_H + PAD + row * (CELL_H + PAD);
      ctx.drawImage(img, x, y, CELL_W, CELL_H);
    }
    return canvas.toDataURL('image/png');
  };

  // N rooms x 6 views, one row per room
  window.buildCombinedGridPng = async function buildCombinedGridPng(rooms) {
    const CELL_W = 380, CELL_H = 285, PAD = 10, TITLE_H = 30, ROW_LABEL_W = 140;
    const cols = VIEW_ORDER.length;
    const canvas = document.createElement('canvas');
    canvas.width = ROW_LABEL_W + cols * CELL_W + (cols + 1) * PAD;
    canvas.height = TITLE_H + rooms.length * (CELL_H + PAD) + PAD;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '18px "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`Combined export — ${rooms.length} rooms`, PAD, 6);

    for (let r = 0; r < rooms.length; r++) {
      const room = rooms[r];
      const rowY = TITLE_H + PAD + r * (CELL_H + PAD);
      ctx.font = '13px "Courier New", monospace';
      ctx.fillStyle = '#000000';
      ctx.fillText(room.name, PAD, rowY + CELL_H / 2 - 8);
      ctx.fillText(`${room.w}×${room.h}cm`, PAD, rowY + CELL_H / 2 + 8);
      for (let i = 0; i < VIEW_ORDER.length; i++) {
        const view = VIEW_ORDER[i];
        const dataUrl = window.renderLineArtView(room, view, CELL_W, CELL_H);
        const img = await loadImage(dataUrl);
        const x = ROW_LABEL_W + PAD + i * (CELL_W + PAD);
        ctx.drawImage(img, x, rowY, CELL_W, CELL_H);
      }
    }
    return canvas.toDataURL('image/png');
  };

  // ── prompt text generation ──────────────────────────────────────────────
  const STYLE_DESCRIPTIONS = {
    'Industrial': 'exposed brick or raw concrete textures, black matte metal fixtures, warm Edison-bulb lighting, utilitarian materials, visible structural elements',
    'Scandinavian': 'light natural wood tones, white and soft neutral palette, minimal clutter, natural textiles, abundant soft daylight, cozy minimalism',
    'Modern Minimalist': 'clean simple lines, neutral monochrome palette, matte finishes, uncluttered negative space, understated elegant furniture',
  };
  function styleDescription() {
    const S = window.appState.ui;
    if (S.aiExportStylePreset === 'Custom') return S.aiExportCustomStyle.trim() || 'a tasteful, cohesive interior style';
    return STYLE_DESCRIPTIONS[S.aiExportStylePreset] || STYLE_DESCRIPTIONS['Modern Minimalist'];
  }
  function stylePresetLabel() {
    const S = window.appState.ui;
    return S.aiExportStylePreset === 'Custom' ? (S.aiExportCustomStyle.trim() || 'Custom') : S.aiExportStylePreset;
  }

  function furnitureForRoom(room) { return window.appState.furniture.filter((f) => window.elevationOverlapsRoom(f, room)); }
  function fixturesForRoom(room) { return window.appState.fixtures.filter((f) => f.roomId === room.id); }
  function electricalsForRoom(room) { return window.appState.electricals.filter((e) => window.elevationOverlapsRoom(e, room)); }

  function itemListText(room) {
    const furn = furnitureForRoom(room).map((f) => `${f.name} (${f.w}×${f.h}cm)`);
    const fix = fixturesForRoom(room).map((f) => `${f.type} "${f.name}" (${f.width}cm wide)`);
    const elec = electricalsForRoom(room).map((e) => e.name);
    return { furn, fix, elec };
  }

  // Sticky notes carry real information the user typed on purpose (e.g. "this
  // wall has a crack, don't render damage" or "keep this corner empty for a
  // plant") — flattened across all 7 of the room's note contexts (floorplan +
  // six elevation views) into one deduped list, since the prompt is a single
  // combined string per room anyway; attributing each note to its exact
  // originating view wouldn't add anything a text model could act on.
  function noteListText(room) {
    const texts = window.appState.stickyNotes
      .filter((n) => n.roomId === room.id && n.text.trim())
      .map((n) => n.text.trim());
    return Array.from(new Set(texts));
  }

  // Gemini/Imagen has no separate negative-prompt API field — exclusions have
  // to be woven into the one text prompt (ai.google.dev/gemini-api/docs/
  // prompting-strategies), so this stays a plain token list folded into
  // buildPromptText/buildJsonPrompt rather than a standalone output.
  const NEGATIVE_TOKENS = ['blurry', 'low resolution', 'distorted walls', 'warped perspective', 'unrealistic furniture placement', 'floating objects', 'duplicated furniture', 'extra rooms', 'text', 'watermark', 'logo', 'cluttered interior'];

  window.buildPromptText = function buildPromptText(room) {
    const { furn, fix, elec } = itemListText(room);
    const notes = noteListText(room);
    const parts = [];
    parts.push(`Turn this six-view line-art elevation reference sheet of "${room.name}" (${room.w}×${room.h}cm floor area, ${room.height}cm ceiling height) into a photorealistic ${stylePresetLabel()} interior photograph.`);
    parts.push(`The sheet shows six labeled views — Top, Right, Bottom, Left wall elevations, plus Ceiling and Floor plans — each outlined rectangle is a piece of furniture or a fixture at its exact proportions and position; keep the room's true proportions and the layout shown, but render it as a real photograph rather than a diagram.`);
    parts.push(`Style: ${styleDescription()}.`);
    if (furn.length) parts.push(`Furniture to render: ${furn.join(', ')}.`);
    if (fix.length) parts.push(`Openings: ${fix.join(', ')}.`);
    if (elec.length) parts.push(`Fixtures/outlets: ${elec.join(', ')}.`);
    if (notes.length) parts.push(`Notes: ${notes.join('; ')}.`);
    parts.push('Natural daylight through any windows blended with soft ambient interior lighting, shot from eye level with a wide-angle lens, professional interior-photography composition.');
    parts.push(`Avoid: ${NEGATIVE_TOKENS.join(', ')}.`);
    return parts.join(' ');
  };

  window.buildJsonPrompt = function buildJsonPrompt(room) {
    const { furn, fix, elec } = itemListText(room);
    return JSON.stringify({
      core: { subject: `interior photograph of "${room.name}"`, reference: 'attached six-view line-art elevation sheet (Top/Right/Bottom/Left/Ceiling/Floor)' },
      style: { preset: stylePresetLabel(), description: styleDescription() },
      environment: {
        dimensions_cm: { width: room.w, depth: room.h, ceiling_height: room.height },
        lighting: 'natural daylight through windows + soft ambient interior lighting',
      },
      composition: { camera: 'eye level, wide-angle lens, professional interior-photography framing', views_provided: VIEW_ORDER },
      materials: { furniture: furn, openings: fix, fixtures: elec },
      user_notes: noteListText(room),
      quality: { photorealistic: true, resolution: 'high', keep_proportions_from_reference: true },
      negative_prompt: NEGATIVE_TOKENS,
    }, null, 2);
  };

  window.buildCombinedPromptText = function buildCombinedPromptText(rooms) {
    const roomLines = rooms.map((r) => {
      const { furn } = itemListText(r);
      return `- "${r.name}" (${r.w}×${r.h}cm, ceiling ${r.height}cm)${furn.length ? ': ' + furn.join(', ') : ''}`;
    });
    const allNotes = Array.from(new Set(rooms.flatMap((r) => noteListText(r))));
    const lines = [
      `Turn this combined line-art reference sheet (${rooms.length} rooms, six elevation views each) into a cohesive set of photorealistic ${stylePresetLabel()} interior photographs — one per room, matching proportions and layout from the sketch.`,
      `Rooms:`,
      roomLines.join('\n'),
      `Style: ${styleDescription()}.`,
    ];
    if (allNotes.length) lines.push(`Notes: ${allNotes.join('; ')}.`);
    lines.push(
      `Keep a consistent material palette and lighting language across all rooms so they read as one connected home. Natural daylight blended with soft ambient interior lighting, eye-level wide-angle framing, professional interior-photography composition.`,
      `Avoid: ${NEGATIVE_TOKENS.join(', ')}.`,
    );
    return lines.join('\n');
  };

  window.buildCombinedJsonPrompt = function buildCombinedJsonPrompt(rooms) {
    return JSON.stringify({
      core: { subject: 'interior photographs for a multi-room home', reference: 'attached combined line-art elevation sheet (one row per room, six views each)' },
      style: { preset: stylePresetLabel(), description: styleDescription() },
      composition: { camera: 'eye level, wide-angle lens, professional interior-photography framing', views_provided: VIEW_ORDER },
      rooms: rooms.map((r) => {
        const { furn, fix, elec } = itemListText(r);
        return {
          name: r.name,
          dimensions_cm: { width: r.w, depth: r.h, ceiling_height: r.height },
          furniture: furn, openings: fix, fixtures: elec,
          user_notes: noteListText(r),
        };
      }),
      quality: { photorealistic: true, resolution: 'high', keep_proportions_from_reference: true, consistent_style_across_rooms: true },
      negative_prompt: NEGATIVE_TOKENS,
    }, null, 2);
  };
})();
