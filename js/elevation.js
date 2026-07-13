// Elevation mode: orthographic projection of a room's contents onto one of
// its actual walls (dynamic per-room-shape view tabs, not a fixed Front/Back/
// Left/Right — see plan), plus Ceiling (RCP) and Floor (= the floor plan
// itself) views. Renders onto window.elevationLayer, a Konva layer separate
// from the floor-plan layers; canvas.js toggles which set is visible based on
// appState.ui.mode.
(function initElevation() {
  const cmToPx = (cm) => cm * window.BASE_SCALE;
  const UI = () => window.appState.ui;
  const TOUCHES_CEILING_CM = 5; // tolerance for "this item is mounted at/near the ceiling"
  const SOCKET_WALL_PROXIMITY_CM = 30; // matches electricals.js's own wall-flush snap threshold

  function currentRoom() {
    return window.appState.rooms.find((r) => r.id === UI().currentRoomId) || null;
  }
  window.elevationCurrentRoom = currentRoom;

  const WALL_LABEL_KEYS = { top: 'elevation.wallTop', right: 'elevation.wallRight', bottom: 'elevation.wallBottom', left: 'elevation.wallLeft' };

  // dynamic view tabs: this room's actual walls plus Ceiling/Floor
  function viewsFor(room) {
    if (!room) return [];
    const walls = window.roomWallsFor(room).map((w) => ({ id: w.id, label: window.t(WALL_LABEL_KEYS[w.id] || w.id) }));
    return [...walls, { id: 'ceiling', label: window.t('elevation.ceiling') }, { id: 'floor', label: window.t('elevation.floor') }];
  }
  window.elevationViewsFor = viewsFor;

  // A view tab names where the VIEWER stands (matches the minimap's arrow
  // marker, which points inward FROM that wall), not which wall's content is
  // drawn — same as a real elevation: stand at the "Top" side of the room
  // and look across it, and the "Bottom" wall (the far one) is what's in
  // front of you, not the one at your back. So the "Top" tab renders the
  // Bottom wall's fixtures/furniture, and vice versa; Left/Right likewise.
  // Confirmed with the user against a concrete case (window stored on the
  // Bottom wall must appear under the Top tab).
  const OPPOSITE_WALL_ID = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  function wallForView(room, view) {
    const targetId = OPPOSITE_WALL_ID[view] || view;
    return window.roomWallsFor(room).find((w) => w.id === targetId);
  }
  window.elevationWallForView = wallForView;

  // switches into elevation mode, picking a sensible room/view if the current
  // ones are missing or no longer valid (e.g. the room was deleted)
  window.enterElevationMode = function enterElevationMode(roomId, viewId) {
    const rooms = window.appState.rooms;
    if (!rooms.length) return;
    const room = (roomId && rooms.find((r) => r.id === roomId)) || rooms.find((r) => r.id === UI().currentRoomId) || rooms[0];
    UI().currentRoomId = room.id;
    const views = viewsFor(room);
    if (viewId && views.some((v) => v.id === viewId)) {
      UI().currentElevation = viewId;
    } else if (!views.some((v) => v.id === UI().currentElevation)) {
      UI().currentElevation = views[0].id;
    }
    UI().mode = 'elevation';
    UI().selectedIds = [];
  };

  function furnitureSamples(item) { return window.furnitureFootprintSamples(item); }
  function electricalSamples(item) {
    return [
      { x: item.x, y: item.y }, { x: item.x + item.w, y: item.y },
      { x: item.x, y: item.y + item.h }, { x: item.x + item.w, y: item.y + item.h },
      { x: item.x + item.w / 2, y: item.y + item.h / 2 },
    ];
  }
  window.elevationFurnitureSamples = furnitureSamples;
  window.elevationElectricalSamples = electricalSamples;

  // "does this item substantially overlap this specific room" — an overlap-
  // AREA test (not roomId equality), so furniture genuinely spanning two
  // rooms (e.g. a table straddling an open doorway) still shows up in both
  // rooms' elevations. Uses the item's axis-aligned x/y/w/h box (ignoring
  // rotation — the same approximation furniture.js's own primaryRoomFor()
  // already uses), NOT a per-sample-point test: a wall-flush socket sitting
  // exactly on a shared boundary between two rooms has a footprint CORNER
  // that mathematically touches both rooms' rectangles at once, which a
  // per-point test would wrongly count as "also in the neighbouring room" —
  // requiring a minimum overlap area filters out that hairline false positive
  // while still catching real spanning cases, which have substantial area.
  const MIN_OVERLAP_AREA_CM2 = 4;
  function overlapAreaWithRoom(item, room) {
    const ox = Math.max(0, Math.min(item.x + item.w, room.x + room.w) - Math.max(item.x, room.x));
    const oy = Math.max(0, Math.min(item.y + item.h, room.y + room.h) - Math.max(item.y, room.y));
    return ox * oy;
  }
  function overlapsRoom(item, room) {
    return overlapAreaWithRoom(item, room) >= MIN_OVERLAP_AREA_CM2;
  }
  window.elevationOverlapsRoom = overlapsRoom;

  // project a footprint's sample points onto a wall's local (u = along wall,
  // depth = perpendicular, into the room) frame
  function projectToWall(samples, wall, room) {
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const inward = window.inwardNormalFor(wall, room);
    let u0 = Infinity, u1 = -Infinity, depthSum = 0;
    samples.forEach((p) => {
      const rx = p.x - wall.x1, ry = p.y - wall.y1;
      const u = rx * ux + ry * uy;
      depthSum += rx * inward.x + ry * inward.y;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
    });
    return { u0, u1, depth: depthSum / samples.length };
  }
  window.elevationProjectToWall = projectToWall;

  // Horizontal position/width info for the CURRENTLY SELECTED item, in the
  // current wall view's local frame — used by index.html's elevation-mode
  // panel to show/edit "from left / from right / width". Exposed separately
  // from render() since the panel needs it even while nothing is re-drawing.
  //   kind: 'furn' | 'sock' | 'fix'
  // Width is only safely editable (maps 1:1 back to item.w) when the item
  // isn't rotated — a rotated item's projected extent on this wall isn't
  // equal to its stored w, so width switches to read-only there.
  // Position (left/right) is always editable: translating an item by a
  // vector along the wall's own direction changes its u-coordinate without
  // touching its perpendicular depth, regardless of rotation or wall angle.
  window.elevationHorizontalInfo = function elevationHorizontalInfo(item, kind) {
    const room = currentRoom();
    const view = UI().currentElevation;
    if (!room || !view || view === 'ceiling' || view === 'floor') return null;
    const wall = wallForView(room, view);
    if (!wall) return null;
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
    const wallLen = Math.hypot(dx, dy) || 1;
    const ux = dx / wallLen, uy = dy / wallLen;
    const axisAligned = Math.abs(ux) < 1e-6 || Math.abs(uy) < 1e-6;

    if (kind === 'fix') {
      if (item.roomId !== room.id || item.wallId !== wall.id) return null;
      return { u0: item.posOnWall, u1: item.posOnWall + item.width, wallLen, ux, uy, widthEditable: true };
    }
    if (!overlapsRoom(item, room)) return null;
    const samples = kind === 'furn' ? furnitureSamples(item) : electricalSamples(item);
    const proj = projectToWall(samples, wall, room);
    return {
      u0: proj.u0, u1: proj.u1, wallLen, ux, uy,
      widthEditable: axisAligned && !item.rotation,
    };
  };

  // A door/window is a hole in a physical wall — if the current room's wall
  // being viewed is the SAME physical wall as an adjacent room's wall (rooms
  // sharing a boundary), the opening is real from both sides, not just from
  // the room it happens to be stored under. Fast path: exact roomId+wallId
  // match (the common case). Slow path: project the fixture's own segment
  // (computed via ITS room/wall) onto the wall being viewed and check the two
  // lines coincide (near-zero perpendicular offset) and overlap along it.
  const WALL_COINCIDE_TOLERANCE_CM = 15;
  function fixtureProjectionOnWall(item, wall, room) {
    if (item.roomId === room.id && item.wallId === wall.id) {
      return { u0: item.posOnWall, u1: item.posOnWall + item.width, depth: 0 };
    }
    const ownRoom = window.appState.rooms.find((r) => r.id === item.roomId);
    if (!ownRoom) return null;
    const ownWall = window.roomWallsFor(ownRoom).find((w) => w.id === item.wallId);
    if (!ownWall) return null;
    const ownLen = Math.hypot(ownWall.x2 - ownWall.x1, ownWall.y2 - ownWall.y1) || 1;
    const oux = (ownWall.x2 - ownWall.x1) / ownLen, ouy = (ownWall.y2 - ownWall.y1) / ownLen;
    const p0 = { x: ownWall.x1 + oux * item.posOnWall, y: ownWall.y1 + ouy * item.posOnWall };
    const p1 = { x: ownWall.x1 + oux * (item.posOnWall + item.width), y: ownWall.y1 + ouy * (item.posOnWall + item.width) };

    const wx = wall.x2 - wall.x1, wy = wall.y2 - wall.y1;
    const wlen = Math.hypot(wx, wy) || 1;
    const wux = wx / wlen, wuy = wy / wlen;
    const nx = -wuy, ny = wux;
    const dist0 = Math.abs((p0.x - wall.x1) * nx + (p0.y - wall.y1) * ny);
    const dist1 = Math.abs((p1.x - wall.x1) * nx + (p1.y - wall.y1) * ny);
    if (dist0 > WALL_COINCIDE_TOLERANCE_CM || dist1 > WALL_COINCIDE_TOLERANCE_CM) return null;

    const u0raw = (p0.x - wall.x1) * wux + (p0.y - wall.y1) * wuy;
    const u1raw = (p1.x - wall.x1) * wux + (p1.y - wall.y1) * wuy;
    const u0 = Math.min(u0raw, u1raw), u1 = Math.max(u0raw, u1raw);
    if (u1 <= 0 || u0 >= wlen) return null; // doesn't actually overlap this wall's own extent
    return { u0, u1, depth: 0 };
  }
  window.elevationFixtureProjectionOnWall = fixtureProjectionOnWall;
  window.ELEVATION_TOUCHES_CEILING_CM = TOUCHES_CEILING_CM;
  window.ELEVATION_SOCKET_WALL_PROXIMITY_CM = SOCKET_WALL_PROXIMITY_CM;

  let lastFitKey = null;

  function render() {
    const layer = window.elevationLayer;
    layer.destroyChildren();
    if (UI().mode !== 'elevation') { layer.batchDraw(); return; }
    const room = currentRoom();
    const view = UI().currentElevation;
    if (!room || !view) { layer.batchDraw(); return; }

    const scale = window.stage.scaleX();
    const fitKey = room.id + ':' + view;
    const shouldFit = fitKey !== lastFitKey;
    lastFitKey = fitKey;

    function addBlock(x, y, w, h, fill, id, label) {
      const group = new Konva.Group({ x, y });
      const isSelected = id && UI().selectedIds.includes(id);
      group.add(new Konva.Rect({
        width: w, height: h, fill,
        stroke: isSelected ? '#C17F3B' : '#2C2416',
        strokeWidth: isSelected ? 2.5 : 1.5,
      }));
      // two separate labels, same split as room.js/furniture.js: NAME centred
      // inside the block, SIZE above it outside the fill. Size shown is the
      // actual RENDERED width × height (cm) — for a rotated item projected
      // onto this wall, or a fixture's own width, that's the extent actually
      // drawn, not necessarily the item's stored w/h.
      if (label && w > 30 / scale && h > 14 / scale) {
        group.add(new Konva.Text({
          text: label, fontSize: 10 / scale, fontFamily: 'Courier New, monospace', fill: '#2C2416',
          width: w, height: h, align: 'center', verticalAlign: 'middle', listening: false,
        }));
      }
      if (w > 30 / scale) {
        group.add(new Konva.Text({
          text: `${Math.round(w / window.BASE_SCALE)}×${Math.round(h / window.BASE_SCALE)}`,
          fontSize: 9 / scale, fontFamily: 'Courier New, monospace', fill: '#4A7FA5',
          width: w, align: 'center', y: -12 / scale, listening: false,
        }));
      }
      if (id) {
        group.on('click tap', (e) => {
          if (window.consumeClickSuppression && window.consumeClickSuppression()) return;
          e.cancelBubble = true;
          UI().selectedIds = [id];
        });
      }
      layer.add(group);
    }

    if (view === 'floor' || view === 'ceiling') {
      if (shouldFit) window.fitElevationToContent(room.w, room.h);
      // Same "tab = where the viewer stands, content = the opposite surface"
      // rule as the wall tabs (Top shows Bottom's content, etc.) — the
      // "Ceiling" tab means the eye is AT the ceiling looking down, so it
      // shows what's on the FLOOR; "Floor" tab means the eye is at the floor
      // looking up, so it shows what's near the CEILING. Confirmed with the
      // user for internal consistency with the wall-view convention, even
      // though it inverts the standalone real-world "Floor Plan is always
      // drawn top-down" terminology.
      const contentView = view === 'ceiling' ? 'floor' : 'ceiling';
      // room outline — drawn even with nothing in it, so the view never looks blank/broken
      const wPx = cmToPx(room.w), hPx = cmToPx(room.h);
      layer.add(new Konva.Rect({ x: 0, y: 0, width: wPx, height: hPx, stroke: '#2C2416', strokeWidth: 2, listening: false }));
      // dimension labels — same convention as room.js's own floor-plan labels
      const dimFont = 10 / scale;
      if (wPx * scale > 26) {
        layer.add(new Konva.Text({
          text: `${room.w}`, fontFamily: 'Courier New, monospace', fontSize: dimFont, fill: '#4A7FA5',
          width: wPx, align: 'center', y: -dimFont * 1.6, listening: false,
        }));
      }
      if (hPx * scale > 26) {
        layer.add(new Konva.Text({
          text: `${room.h}`, fontFamily: 'Courier New, monospace', fontSize: dimFont, fill: '#4A7FA5',
          width: hPx, align: 'center', rotation: -90, x: -dimFont * 1.6, y: hPx, listening: false,
        }));
      }

      // door/window frames — a fixture is a hole in the WALL itself (a
      // structural boundary feature), not something sitting on the floor or
      // hanging from the ceiling, so unlike furniture it always shows in
      // BOTH Floor and Ceiling (reusing the exact same swing-arc/thick-window
      // visual via fixtures.js's shared builder) regardless of its own
      // heightFromFloor/distanceFromCeiling.
      window.appState.fixtures.forEach((f) => {
        if (f.roomId !== room.id) return;
        const fWall = window.roomWallsFor(room).find((w) => w.id === f.wallId);
        if (!fWall) return;
        const fGroup = window.buildFixtureVisual(f, fWall, room, room.x, room.y);
        fGroup.on('click tap', (e) => {
          if (window.consumeClickSuppression && window.consumeClickSuppression()) return;
          e.cancelBubble = true;
          UI().selectedIds = [f.id];
        });
        layer.add(fGroup);
      });

      window.appState.furniture.forEach((item) => {
        if (!overlapsRoom(item, room)) return;
        const touchesCeiling = item.distanceFromCeiling <= TOUCHES_CEILING_CM;
        if (contentView === 'ceiling' && !touchesCeiling) return;
        if (contentView === 'floor' && touchesCeiling) {
          // ceiling-hung item on the floor plan: dashed circle symbol instead
          // of a full silhouette, so it doesn't visually block the floor
          // furniture underneath it (matches the plan's floor-view convention)
          const cx = cmToPx(item.x + item.w / 2 - room.x);
          const cy = cmToPx(item.y + item.h / 2 - room.y);
          const r = cmToPx(Math.min(item.w, item.h) / 2);
          const circ = new Konva.Circle({
            x: cx, y: cy, radius: r,
            stroke: UI().selectedIds.includes(item.id) ? '#C17F3B' : item.color,
            dash: [4 / scale, 3 / scale], strokeWidth: 1.5 / scale,
          });
          circ.on('click tap', (e) => {
            if (window.consumeClickSuppression && window.consumeClickSuppression()) return;
            e.cancelBubble = true;
            UI().selectedIds = [item.id];
          });
          layer.add(circ);
          return;
        }
        addBlock(cmToPx(item.x - room.x), cmToPx(item.y - room.y), cmToPx(item.w), cmToPx(item.h), item.color, item.id, item.name);
      });

      // sockets: same ceiling-touch filter as furniture, drawn at their real
      // x,y (a socket in the middle of the floor/ceiling shows centred there
      // — same as the floor plan itself)
      window.appState.electricals.forEach((item) => {
        if (!overlapsRoom(item, room)) return;
        const touchesCeiling = item.distanceFromCeiling <= TOUCHES_CEILING_CM;
        if (contentView === 'ceiling' && !touchesCeiling) return;
        const sGroup = window.buildElectricalVisual(item, room.x, room.y);
        sGroup.on('click tap', (e) => {
          if (window.consumeClickSuppression && window.consumeClickSuppression()) return;
          e.cancelBubble = true;
          UI().selectedIds = [item.id];
        });
        layer.add(sGroup);
      });

      // sticky notes for this (room, view) context — always drawn last, on
      // top of everything else, since they're annotations. x/y are already
      // room-relative cm (see stickynotes.js), matching this branch's own
      // coordinate space, so buildStickyNoteVisual needs no offset here.
      window.appState.stickyNotes.forEach((note) => {
        if (note.roomId !== room.id || note.view !== view) return;
        const nGroup = window.buildStickyNoteVisual(note);
        nGroup.on('click tap', (e) => {
          if (window.consumeClickSuppression && window.consumeClickSuppression()) return;
          e.cancelBubble = true;
          UI().selectedIds = [note.id];
        });
        layer.add(nGroup);
      });

      layer.batchDraw();
      return;
    }

    // wall view: `view` names where the viewer stands — wallForView() resolves
    // it to the OPPOSITE wall, whose contents are what's actually drawn (see
    // OPPOSITE_WALL_ID above)
    const wall = wallForView(room, view);
    if (!wall) { layer.batchDraw(); return; }
    const wallLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (shouldFit) window.fitElevationToContent(wallLen, room.height);

    const blocks = [];
    window.appState.furniture.forEach((item) => {
      if (!overlapsRoom(item, room)) return;
      blocks.push({ proj: projectToWall(furnitureSamples(item), wall, room), item });
    });
    window.appState.electricals.forEach((item) => {
      // unlike furniture (which legitimately shows on every wall — you can
      // see a chair from any direction), a socket is mounted ON a surface:
      // it only belongs to the ONE wall it's actually near, never "floats"
      // into a wall view just because it's somewhere else in the same room
      if (!overlapsRoom(item, room)) return;
      const proj = projectToWall(electricalSamples(item), wall, room);
      if (Math.abs(proj.depth) > SOCKET_WALL_PROXIMITY_CM) return;
      blocks.push({ proj, item });
    });
    window.appState.fixtures.forEach((item) => {
      // shows up if this is its own wall, OR its wall physically coincides
      // with an adjacent room's shared boundary (see fixtureProjectionOnWall)
      const proj = fixtureProjectionOnWall(item, wall, room);
      if (!proj) return;
      blocks.push({ proj, item });
    });

    // painter's algorithm: small depth (close to this wall) drawn first as
    // background, large depth (close to room centre / the far side, i.e.
    // closer to an implied viewer standing in the room facing this wall)
    // drawn last so it occludes what's behind it
    blocks.sort((a, b) => a.proj.depth - b.proj.depth);
    blocks.forEach(({ proj, item }) => {
      const top = room.height - (item.heightFromFloor + item.objectHeight);
      const fill = item.color || (item.type === 'window' ? 'rgba(74,127,165,0.4)' : 'rgba(160,140,110,0.4)');
      addBlock(cmToPx(proj.u0), cmToPx(top), cmToPx(proj.u1 - proj.u0), cmToPx(item.objectHeight), fill, item.id, item.name);
    });

    const wallLenPx = cmToPx(wallLen), roomHPx = cmToPx(room.height);
    layer.add(new Konva.Line({ points: [0, roomHPx, wallLenPx, roomHPx], stroke: '#2C2416', strokeWidth: 2, listening: false }));
    layer.add(new Konva.Line({ points: [0, 0, wallLenPx, 0], stroke: '#2C2416', strokeWidth: 2, listening: false }));

    // dimension labels: wall length (horizontal) and room height (vertical) —
    // same convention as room.js's own floor-plan labels
    const dimFont = 10 / scale;
    if (wallLenPx * scale > 26) {
      layer.add(new Konva.Text({
        text: `${Math.round(wallLen)}`, fontFamily: 'Courier New, monospace', fontSize: dimFont, fill: '#4A7FA5',
        width: wallLenPx, align: 'center', y: roomHPx + dimFont * 0.6, listening: false,
      }));
    }
    if (roomHPx * scale > 26) {
      layer.add(new Konva.Text({
        text: `${room.height}`, fontFamily: 'Courier New, monospace', fontSize: dimFont, fill: '#4A7FA5',
        width: roomHPx, align: 'center', rotation: -90, x: -dimFont * 1.6, y: roomHPx, listening: false,
      }));
    }

    // Door/window head/sill dimensions — standard architectural elevation
    // practice is to dimension an opening's height from the finished floor
    // line and/or ceiling, plus its horizontal position off the wall ends;
    // skipped when 0 (a door sitting flush on the floor doesn't need a "0").
    function addVDim(xPx, yTopPx, yBotPx, valueCm) {
      const tick = 3 / scale;
      layer.add(new Konva.Line({ points: [xPx, yTopPx, xPx, yBotPx], stroke: '#4A7FA5', strokeWidth: 1 / scale, listening: false }));
      layer.add(new Konva.Line({ points: [xPx - tick, yTopPx, xPx + tick, yTopPx], stroke: '#4A7FA5', strokeWidth: 1 / scale, listening: false }));
      layer.add(new Konva.Line({ points: [xPx - tick, yBotPx, xPx + tick, yBotPx], stroke: '#4A7FA5', strokeWidth: 1 / scale, listening: false }));
      layer.add(new Konva.Text({
        text: `${Math.round(valueCm)}`, x: xPx + tick + 2 / scale, y: (yTopPx + yBotPx) / 2 - 5 / scale,
        fontSize: 8 / scale, fontFamily: 'Courier New, monospace', fill: '#4A7FA5', listening: false,
      }));
    }
    function addHDim(x1Px, x2Px, yPx, valueCm) {
      const tick = 3 / scale;
      layer.add(new Konva.Line({ points: [x1Px, yPx, x2Px, yPx], stroke: '#4A7FA5', strokeWidth: 1 / scale, listening: false }));
      layer.add(new Konva.Line({ points: [x1Px, yPx - tick, x1Px, yPx + tick], stroke: '#4A7FA5', strokeWidth: 1 / scale, listening: false }));
      layer.add(new Konva.Line({ points: [x2Px, yPx - tick, x2Px, yPx + tick], stroke: '#4A7FA5', strokeWidth: 1 / scale, listening: false }));
      layer.add(new Konva.Text({
        text: `${Math.round(valueCm)}`, x: x1Px, y: yPx + tick + 2 / scale, width: x2Px - x1Px, align: 'center',
        fontSize: 8 / scale, fontFamily: 'Courier New, monospace', fill: '#4A7FA5', listening: false,
      }));
    }
    const DIM_EPSILON_CM = 0.5;
    blocks.forEach(({ proj, item }) => {
      if (item.type !== 'door' && item.type !== 'window') return;
      const top = room.height - (item.heightFromFloor + item.objectHeight);
      const bottom = room.height - item.heightFromFloor;
      const xCol = cmToPx(proj.u1) + 8 / scale;
      if (item.distanceFromCeiling > DIM_EPSILON_CM) addVDim(xCol, 0, cmToPx(top), item.distanceFromCeiling);
      if (item.heightFromFloor > DIM_EPSILON_CM) addVDim(xCol, cmToPx(bottom), roomHPx, item.heightFromFloor);
      const yRow = roomHPx + 8 / scale;
      if (proj.u0 > DIM_EPSILON_CM) addHDim(0, cmToPx(proj.u0), yRow, proj.u0);
      if (wallLen - proj.u1 > DIM_EPSILON_CM) addHDim(cmToPx(proj.u1), wallLenPx, yRow, wallLen - proj.u1);
    });

    // sticky notes for this (room, view) context — drawn last, on top of
    // everything else. x = u along this wall, y = distance from ceiling
    // (0 = ceiling line, room.height = floor line) — the same coordinate
    // space addBlock() above already places furniture/fixture/socket
    // blocks in, so no conversion is needed here either.
    window.appState.stickyNotes.forEach((note) => {
      if (note.roomId !== room.id || note.view !== view) return;
      const nGroup = window.buildStickyNoteVisual(note);
      nGroup.on('click tap', (e) => {
        if (window.consumeClickSuppression && window.consumeClickSuppression()) return;
        e.cancelBubble = true;
        UI().selectedIds = [note.id];
      });
      layer.add(nGroup);
    });

    layer.batchDraw();
  }
  window.renderElevation = render;

  // manual re-fit (e.g. the canvas's "Fit" button) — forces the next render()
  // to re-run its shouldFit camera logic even though room/view haven't changed
  window.refitElevation = function refitElevation() {
    lastFitKey = null;
    render();
  };

  Vue.watch(
    () => [
      UI().mode, UI().currentRoomId, UI().currentElevation, UI().zoomFactor, UI().selectedIds.join(','),
      window.appState.furniture.map((f) => `${f.id}:${f.x}:${f.y}:${f.w}:${f.h}:${f.rotation}:${f.heightFromFloor}:${f.objectHeight}:${f.distanceFromCeiling}:${f.color}:${f.name}`).join(','),
      window.appState.fixtures.map((f) => `${f.id}:${f.roomId}:${f.wallId}:${f.posOnWall}:${f.width}:${f.heightFromFloor}:${f.objectHeight}:${f.type}:${f.name}`).join(','),
      window.appState.electricals.map((e) => `${e.id}:${e.x}:${e.y}:${e.heightFromFloor}:${e.objectHeight}:${e.name}`).join(','),
      window.appState.rooms.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}:${r.height}:${r.shape}`).join(','),
      window.appState.stickyNotes.map((n) => `${n.id}:${n.roomId}:${n.view}:${n.x}:${n.y}:${n.text}`).join(','),
    ],
    render,
    { immediate: true }
  );
})();
