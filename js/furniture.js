// Furniture shapes on furnitureLayer. Furniture is stored in cm (appState.furniture)
// and must overlap at least one room — doesn't have to fit inside a single one
// (a table spanning two rooms in an open floor plan is valid). roomId tracks
// whichever room has the largest overlap, for list/organizational purposes only.
// Unlike rooms (drag-to-size), furniture is drag-to-POSITION at a type-appropriate
// default size, then resized/rotated afterward via the Transformer (matches
// "拖曳放置 → 旋轉/微調" in the plan). Rotation (0–359°) and the front-facing
// arrow are baked into a single Konva.Shape's sceneFunc, so the arrow always
// rotates together with the shape — no separate node/pivot bookkeeping needed.
(function initFurniture() {
  const UI = () => window.appState.ui;
  const cmToPx = (cm) => cm * window.BASE_SCALE;
  const pxToCm = (px) => px / window.BASE_SCALE;

  // tool id → { shape, furnitureType, w, h, color, label, heightFromFloor, objectHeight }
  // heightFromFloor/objectHeight are just starting points (a room's actual
  // height may differ from settings.defaultRoomHeight) — commitFurniture runs
  // them through recomputeTriple against the real room height, which derives
  // distanceFromCeiling as the third value.
  const PRESETS = {
    'furn-rect': { shape: 'rect', furnitureType: 'generic', w: 80, h: 80, color: 'rgba(200,180,150,0.45)', heightFromFloor: 0, objectHeight: 75 },
    'furn-circle': { shape: 'circle', furnitureType: 'generic', w: 80, h: 80, color: 'rgba(200,180,150,0.45)', heightFromFloor: 0, objectHeight: 75 },
    'furn-triangle': { shape: 'triangle', furnitureType: 'generic', w: 80, h: 80, color: 'rgba(200,180,150,0.45)', heightFromFloor: 0, objectHeight: 75 },
    'furn-beam': { shape: 'rect', furnitureType: 'beam', w: 200, h: 20, color: 'rgba(120,110,100,0.55)', heightFromFloor: 260, objectHeight: 20 },
    'furn-light-ceiling': { shape: 'circle', furnitureType: 'ceiling-light', w: 30, h: 30, color: 'rgba(255,220,120,0.55)', heightFromFloor: 265, objectHeight: 15 },
    'furn-light-floor': { shape: 'circle', furnitureType: 'floor-lamp', w: 25, h: 25, color: 'rgba(255,220,120,0.55)', heightFromFloor: 0, objectHeight: 150 },
    'furn-light-table': { shape: 'circle', furnitureType: 'table-lamp', w: 20, h: 20, color: 'rgba(255,220,120,0.55)', heightFromFloor: 75, objectHeight: 35 },
  };
  window.FURNITURE_PRESETS = PRESETS;

  // Furniture must overlap at least one room, but doesn't have to fit inside
  // a single one — a table spanning two rooms (open floor plan) is valid.
  // roomId is assigned to whichever room has the LARGEST overlap area, purely
  // for organizational purposes (room list, and later Phase 4 elevation will
  // instead test geometric overlap directly rather than relying on roomId,
  // so furniture spanning a boundary can appear in both rooms' views).
  function overlapArea(boxCm, room) {
    const ox = Math.max(0, Math.min(boxCm.x + boxCm.w, room.x + room.w) - Math.max(boxCm.x, room.x));
    const oy = Math.max(0, Math.min(boxCm.y + boxCm.h, room.y + room.h) - Math.max(boxCm.y, room.y));
    return ox * oy;
  }
  function primaryRoomFor(boxCm) {
    let best = null, bestArea = 0;
    window.appState.rooms.forEach((r) => {
      const a = overlapArea(boxCm, r);
      if (a > bestArea) { bestArea = a; best = r; }
    });
    return best;
  }

  // ── hard containment: furniture's full rotated footprint must be covered
  // by the union of the rooms it touches (standard point-in-polygon testing,
  // sampled around the shape's actual boundary — not its bounding box, so a
  // round table near a corner isn't wrongly rejected by its square bbox).
  // pointInRoom/pointInAnyRoom are shared from interaction.js (also used by
  // electricals.js and fixtures.js).

  // rotate a shape-local point (lx,ly) around the item's own centre, by its
  // rotation, into world cm coordinates (item.x/y is the un-rotated top-left)
  function rotatedWorldPoint(item, lx, ly) {
    const cx = item.w / 2, cy = item.h / 2;
    const rad = ((item.rotation || 0) * Math.PI) / 180;
    const dx = lx - cx, dy = ly - cy;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { x: item.x + cx + rx, y: item.y + cy + ry };
  }

  // sample points on the furniture's actual rotated boundary (+ centre),
  // shape-aware — rect/triangle use their real vertices, circle/ellipse
  // samples its perimeter (a bounding-box corner test would wrongly reject
  // valid placements near a room corner).
  function footprintSamples(item) {
    const local = [{ x: item.w / 2, y: item.h / 2 }]; // centre
    if (item.shape === 'circle') {
      const rx = item.w / 2, ry = item.h / 2;
      const N = 16;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        local.push({ x: item.w / 2 + rx * Math.cos(a), y: item.h / 2 + ry * Math.sin(a) });
      }
    } else if (item.shape === 'triangle') {
      local.push({ x: item.w / 2, y: 0 }, { x: item.w, y: item.h }, { x: 0, y: item.h });
    } else {
      local.push({ x: 0, y: 0 }, { x: item.w, y: 0 }, { x: item.w, y: item.h }, { x: 0, y: item.h });
    }
    return local.map((p) => rotatedWorldPoint(item, p.x, p.y));
  }

  function isFullyInRooms(item, roomsList) {
    return footprintSamples(item).every((p) => window.pointInAnyRoom(p.x, p.y, roomsList));
  }
  window.isFurnitureFullyInRooms = isFullyInRooms;
  // exposed so elevation.js can project a furniture item's actual (rotated,
  // shape-aware) footprint onto a wall's local coordinate frame, same sampling
  // used for room-containment testing above
  window.furnitureFootprintSamples = footprintSamples;

  // Rotation pivot: offsetX/offsetY are set to the shape's own centre, and
  // its local x/y are positioned to match (w/2, h/2) — this makes the node's
  // own rotation pivot (which Konva always rotates around) mathematically
  // guaranteed to be its visual centre, regardless of Konva.Transformer's
  // internal handling for a custom Shape (which — confirmed by testing —
  // otherwise pivots around the top-left corner instead of centre).
  function makeShapeNode(item) {
    const wPx = cmToPx(item.w), hPx = cmToPx(item.h);
    return new Konva.Shape({
      x: wPx / 2,
      y: hPx / 2,
      offsetX: wPx / 2,
      offsetY: hPx / 2,
      width: wPx,
      height: hPx,
      rotation: item.rotation || 0,
      fill: item.color,
      stroke: '#3D3525',
      strokeWidth: 1.5,
      name: 'furnitureShape',
      sceneFunc(ctx, shape) {
        const w = shape.width(), h = shape.height();
        ctx.beginPath();
        if (item.shape === 'circle') {
          ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        } else if (item.shape === 'triangle') {
          ctx.moveTo(w / 2, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        } else {
          ctx.rect(0, 0, w, h);
        }
        ctx.closePath();
        ctx.fillStrokeShape(shape);
        // front-facing arrow, baked into the same draw call so it always
        // rotates together with the shape (no separate node to keep in sync)
        const cx = w / 2, cy = h / 2;
        const len = Math.max(4, Math.min(w, h) * 0.28);
        ctx.beginPath();
        ctx.moveTo(cx, cy - len);
        ctx.lineTo(cx - len * 0.4, cy + len * 0.35);
        ctx.lineTo(cx + len * 0.4, cy + len * 0.35);
        ctx.closePath();
        ctx.fillStyle = '#4A7FA5';
        ctx.fill();
      },
      hitFunc(ctx, shape) {
        const w = shape.width(), h = shape.height();
        ctx.beginPath();
        if (item.shape === 'circle') ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        else if (item.shape === 'triangle') { ctx.moveTo(w / 2, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); }
        else ctx.rect(0, 0, w, h);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });
  }

  // resize/rotate via Transformer: compute the candidate new state, validate
  // full containment, and only apply it if valid — otherwise snap the node
  // back to the pre-gesture state (captured on transformstart).
  // Transformer is attached directly to `node` (the shape), not the group —
  // so a resize/rotate gesture changes the SHAPE's own x/y/offset/scale, not
  // the group's. We derive the un-rotated top-left (relative to the group) by
  // undoing the offset+scale (but deliberately NOT the rotation, since item.x/
  // item.y must stay meaningful regardless of rotation angle), then fold that
  // back into the group's world position and re-normalize the shape back to
  // its canonical form (local position = its own centre, offset matching) so
  // the next gesture starts from a clean state.
  function commitTransform(item, node) {
    const group = node.getParent();
    const scaleX = node.scaleX(), scaleY = node.scaleY();
    const localTopLeftX = node.x() - node.offsetX() * scaleX;
    const localTopLeftY = node.y() - node.offsetY() * scaleY;
    const worldTopLeftXpx = group.x() + localTopLeftX;
    const worldTopLeftYpx = group.y() + localTopLeftY;

    const newWidthPx = Math.max(cmToPx(10), node.width() * scaleX);
    const newHeightPx = Math.max(cmToPx(10), node.height() * scaleY);

    const candidate = {
      shape: item.shape,
      w: Math.round(pxToCm(newWidthPx)),
      h: Math.round(pxToCm(newHeightPx)),
      rotation: Math.round(node.rotation()),
      x: Math.round(pxToCm(worldTopLeftXpx)),
      y: Math.round(pxToCm(worldTopLeftYpx)),
    };

    if (isFullyInRooms(candidate)) {
      item.w = candidate.w; item.h = candidate.h; item.rotation = candidate.rotation;
      item.x = candidate.x; item.y = candidate.y;
      const r = primaryRoomFor(item);
      if (r) item.roomId = r.id;
      normalizeNode(group, node, item);
    } else if (node.__preTransform) {
      const prev = node.__preTransform;
      normalizeNode(group, node, prev);
      node.rotation(prev.rotation);
    }
    node.__preTransform = null;
  }

  // reset a shape to its canonical form: group = world top-left (cm), shape's
  // local position/offset = its own centre (so the next rotate/resize gesture
  // starts clean, matching what render() would produce)
  function normalizeNode(group, node, state) {
    const wPx = cmToPx(state.w), hPx = cmToPx(state.h);
    group.x(cmToPx(state.x));
    group.y(cmToPx(state.y));
    node.scaleX(1);
    node.scaleY(1);
    node.width(wPx);
    node.height(hPx);
    node.offsetX(wPx / 2);
    node.offsetY(hPx / 2);
    node.x(wPx / 2);
    node.y(hPx / 2);
  }

  const groupById = {};
  let transformer = null;

  function render() {
    const layer = window.furnitureLayer;
    layer.destroyChildren();
    transformer = null;
    Object.keys(groupById).forEach((k) => delete groupById[k]);

    window.appState.furniture.forEach((item) => {
      const selectMode = UI().activeTool === 'select';
      const group = new Konva.Group({ x: cmToPx(item.x), y: cmToPx(item.y), draggable: selectMode });
      groupById[item.id] = group;
      const shape = makeShapeNode(item);
      group.add(shape);

      const isSelected = UI().selectedIds.includes(item.id);
      if (isSelected) {
        shape.stroke('#C17F3B');
        shape.strokeWidth(2.5);
      }

      // two separate labels, same split as room.js: the NAME sits centred
      // inside the shape (single-line, hidden entirely if it doesn't fit —
      // no wrap/ellipsis), the SIZE sits above it outside the fill, same
      // convention as room.js's own w/h labels around the room's edges.
      // Both are siblings of the rotated shape, not children of it, so the
      // text itself always stays upright regardless of the item's rotation.
      const scale = window.stage.scaleX();
      const wPx = cmToPx(item.w), hPx = cmToPx(item.h);
      const dimFont = 9 / scale;
      const nameFont = 10 / scale;
      const nameNode = new Konva.Text({
        text: item.name, fontFamily: 'Courier New, monospace', fontSize: nameFont, fill: '#2C2416',
        wrap: 'none', listening: false,
      });
      if (nameNode.getTextWidth() <= wPx - 6 / scale && hPx * scale > 16) {
        nameNode.setAttrs({ width: wPx, height: hPx, align: 'center', verticalAlign: 'middle' });
        group.add(nameNode);
      }
      if (wPx * scale > 28 && hPx * scale > 14) {
        group.add(new Konva.Text({
          text: item.shape === 'circle' ? `⌀${item.w}` : `${item.w}×${item.h}`,
          fontFamily: 'Courier New, monospace', fontSize: dimFont, fill: '#4A7FA5',
          width: wPx, align: 'center', y: -dimFont * 1.6, listening: false,
        }));
      }

      group.on('click tap', (e) => {
        if (window.consumeClickSuppression()) return;
        if (UI().activeTool !== 'select') return;
        e.cancelBubble = true;
        const additive = e.evt && (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey);
        if (additive) {
          const set = new Set(UI().selectedIds);
          if (set.has(item.id)) set.delete(item.id); else set.add(item.id);
          UI().selectedIds = Array.from(set);
        } else {
          UI().selectedIds = [item.id];
        }
      });

      group.on('mouseover mousemove', () => {
        if (UI().activeTool !== 'select') return;
        window.showTooltip(`${item.name}\n${item.w} × ${item.h} cm`);
        window.stage.container().style.cursor = 'move';
      });
      group.on('mouseout', () => {
        window.hideTooltip();
        window.stage.container().style.cursor = 'default';
      });

      group.on('dragmove', () => {
        window.hideTooltip();
        const box = { x: group.x(), y: group.y(), w: cmToPx(item.w), h: cmToPx(item.h) };
        const snapped = window.snapBox(box, new Set([item.id]));
        group.x(snapped.x);
        group.y(snapped.y);
        window.drawGuides(snapped.vLine, snapped.hLine);
      });
      group.on('dragend', () => {
        window.clearGuides();
        const candX = Math.round(pxToCm(group.x()));
        const candY = Math.round(pxToCm(group.y()));
        const candidate = { ...item, x: candX, y: candY };
        if (isFullyInRooms(candidate)) {
          item.x = candX;
          item.y = candY;
          // re-associate with whichever room now has the largest overlap
          // (may span multiple; roomId just tracks the "primary" one)
          const r = primaryRoomFor(item);
          if (r) item.roomId = r.id;
        } else {
          // dropped somewhere that would leave part of it outside every
          // room — snap back to its last valid position
          group.x(cmToPx(item.x));
          group.y(cmToPx(item.y));
        }
        if (!UI().selectedIds.includes(item.id)) UI().selectedIds = [item.id];
      });

      shape.on('transformstart', () => {
        shape.__preTransform = { w: item.w, h: item.h, rotation: item.rotation, x: item.x, y: item.y };
      });
      shape.on('transformend', () => commitTransform(item, shape));

      layer.add(group);

      if (isSelected && selectMode && UI().selectedIds.length === 1) {
        transformer = new Konva.Transformer({
          nodes: [shape],
          rotateEnabled: true,
          borderStroke: '#C17F3B',
          anchorStroke: '#C17F3B',
          anchorFill: '#F5F0E8',
          anchorSize: 8,
        });
        layer.add(transformer);
      }
    });

    layer.batchDraw();
  }
  window.renderFurniture = render;
  // exposed so room.js can translate a room's contained furniture live during
  // a room drag (Konva node manipulation, not Vue state — same reasoning as
  // the room's own drag not touching Vue state until dragend)
  window.getFurnitureNode = (id) => groupById[id];

  const furnitureById = (id) => window.appState.furniture.find((f) => f.id === id);

  function commitFurniture(xCm, yCm, presetKey) {
    const preset = PRESETS[presetKey];
    const candidate = { x: Math.round(xCm), y: Math.round(yCm), w: preset.w, h: preset.h, rotation: 0, shape: preset.shape };
    // must be fully covered by the room(s) it touches — doesn't need to fit
    // inside a single one (e.g. a table spanning two rooms is valid), but no
    // part of its footprint can fall outside every room
    if (!isFullyInRooms(candidate)) return null;
    const room = primaryRoomFor(candidate);
    const id = window.appState.createFurnitureId();
    const item = {
      id,
      name: window.t('furniture.' + preset.furnitureType) + ' ' + (window.appState.furniture.length + 1),
      roomId: room.id,
      x: Math.round(xCm), y: Math.round(yCm), w: preset.w, h: preset.h,
      shape: preset.shape, furnitureType: preset.furnitureType, color: preset.color, rotation: 0,
      heightFromFloor: preset.heightFromFloor, objectHeight: preset.objectHeight,
    };
    window.recomputeTriple(item, 'heightOrder', ['heightFromFloor', 'objectHeight', 'distanceFromCeiling'], room.height, null);
    window.appState.furniture.push(item);
    UI().selectedIds = [id];
    UI().activeTool = 'select';
    return id;
  }

  window.deleteFurniture = function deleteFurniture(id) {
    const idx = window.appState.furniture.findIndex((f) => f.id === id);
    if (idx >= 0) window.appState.furniture.splice(idx, 1);
    UI().selectedIds = UI().selectedIds.filter((s) => s !== id);
  };

  window.registerInteractionProvider({
    idPrefix: 'furn',
    stops(skipSet) {
      const V = [], H = [];
      window.appState.furniture.forEach((f) => {
        if (skipSet && skipSet.has(f.id)) return;
        const x = cmToPx(f.x), y = cmToPx(f.y), w = cmToPx(f.w), h = cmToPx(f.h);
        V.push(x, x + w / 2, x + w);
        H.push(y, y + h / 2, y + h);
      });
      return { V, H };
    },
    boxes() {
      return window.appState.furniture.map((f) => ({ id: f.id, x: cmToPx(f.x), y: cmToPx(f.y), w: cmToPx(f.w), h: cmToPx(f.h) }));
    },
    entity: furnitureById,
    deleteMany(ids) {
      const set = new Set(ids);
      window.appState.furniture.splice(0, window.appState.furniture.length, ...window.appState.furniture.filter((f) => !set.has(f.id)));
    },
  });

  // ── quick rotate (the panel's "↻ 90°" button) ───────────────────────────
  window.rotateSelectedFurniture90 = function rotateSelectedFurniture90() {
    UI().selectedIds.forEach((id) => {
      if (!id.startsWith('furn-')) return;
      const f = furnitureById(id);
      if (f) f.rotation = (f.rotation + 90) % 360;
    });
  };

  // ── drag-to-position (default size, snapping while dragging the preview) ─
  let placing = null; // { presetKey, node }

  window.stage.on('mousedown touchstart', () => {
    if (window.isSpaceHeld()) return;
    const tool = UI().activeTool;
    if (!PRESETS[tool]) return;
    const p = window.worldPointer();
    if (!p) return;
    const preset = PRESETS[tool];
    const wPx = cmToPx(preset.w), hPx = cmToPx(preset.h);
    const scale = window.stage.scaleX();
    const node = new Konva.Rect({
      name: 'preview', x: p.x - wPx / 2, y: p.y - hPx / 2, width: wPx, height: hPx,
      stroke: '#C17F3B', dash: [6 / scale, 6 / scale], strokeWidth: 1.5 / scale,
      fill: 'rgba(193,127,59,0.12)', listening: false, cornerRadius: preset.shape === 'circle' ? wPx / 2 : 0,
    });
    window.guideLayer.add(node);
    placing = { presetKey: tool, node };
  });

  window.stage.on('mousemove touchmove', () => {
    if (!placing) return;
    const p = window.worldPointer();
    if (!p) return;
    const preset = PRESETS[placing.presetKey];
    const wPx = cmToPx(preset.w), hPx = cmToPx(preset.h);
    const box = { x: p.x - wPx / 2, y: p.y - hPx / 2, w: wPx, h: hPx };
    const snapped = window.snapBox(box, null);
    placing.node.setAttrs({ x: snapped.x, y: snapped.y });
    window.drawGuides(snapped.vLine, snapped.hLine);
  });

  window.stage.on('mouseup touchend', () => {
    if (!placing) return;
    const node = placing.node;
    const xCm = pxToCm(node.x());
    const yCm = pxToCm(node.y());
    const presetKey = placing.presetKey;
    node.destroy();
    window.clearGuides();
    placing = null;
    const id = commitFurniture(xCm, yCm, presetKey);
    if (id) {
      window.suppressNextCanvasClick();
    } else {
      // rejected — no room covers the whole footprint. Brief message so the
      // silent no-op doesn't look like a bug; tool stays active to retry.
      window.showTooltip(window.t('furniture.mustFitInRoom'));
      setTimeout(window.hideTooltip, 1000);
    }
  });

  Vue.watch(
    () => [
      window.appState.furniture.map((f) => `${f.id}:${f.x}:${f.y}:${f.w}:${f.h}:${f.rotation}:${f.color}:${f.shape}:${f.name}`).join(','),
      window.appState.ui.selectedIds.join(','),
      window.appState.ui.activeTool,
      window.appState.ui.zoomFactor,
    ],
    render,
    { immediate: true }
  );

  Vue.watch(
    () => window.appState.layers.find((l) => l.id === 'furniture').visible,
    (visible) => { window.furnitureLayer.visible(visible); window.furnitureLayer.batchDraw(); }
  );
})();
