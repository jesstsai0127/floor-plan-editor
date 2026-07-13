// Room shapes on roomsLayer. Rooms are stored in cm (appState.rooms); Konva
// nodes live in world px (cm * BASE_SCALE), same coordinate space as the grid,
// so stage.scale() zooms everything uniformly.
//
// Interaction model (like Figma / SmartDraw):
//   - Room tool active  → press-drag-release on canvas draws a rectangle.
//   - Select tool active → click a room to select; drag to move.
// Snapping, rubber-band select, tooltips, Space-pan and Delete-key are shared
// engine code in js/interaction.js (loaded before this file) — room.js
// registers itself as a provider so a single rubber-band drag / snap pass /
// Delete press covers rooms AND furniture together, not two competing copies.
(function initRooms() {
  const ROOM_COLORS = ['rgba(180,200,160,0.35)', 'rgba(180,160,200,0.35)', 'rgba(160,180,200,0.35)', 'rgba(210,180,140,0.35)'];
  const MIN_ROOM_CM = 20;
  let transformer = null;
  let dragSet = null; // during a group drag: [{room, group, x0, y0}]
  let dragAnchorX0 = 0, dragAnchorY0 = 0; // dragged group's start position

  function cmToPx(cm) { return cm * window.BASE_SCALE; }
  function pxToCm(px) { return px / window.BASE_SCALE; }
  const S = () => window.appState.settings;
  const UI = () => window.appState.ui;
  const roomIds = () => UI().selectedIds.filter((id) => id.startsWith('room-'));

  function makeShapeNode(room) {
    const strokeWidth = Math.max(1, cmToPx(room.wallThickness));
    const common = {
      width: cmToPx(room.w),
      height: cmToPx(room.h),
      fill: room.color,
      stroke: '#2C2416',
      strokeWidth,
      name: 'roomShape',
    };
    return new Konva.Rect(common);
  }

  // Resizing a room can leave contained furniture no longer fully covered
  // (furniture itself is validated on its own edits — see furniture.js — but
  // a room shrinking is an INDIRECT edit to that furniture, so it needs the
  // same guarantee here). Candidate size is checked against every furniture
  // item's containment before committing; reverted to the pre-transform state
  // (captured on transformstart) if it would break any of them.
  function commitTransform(room, node) {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const newWidthPx = Math.max(cmToPx(MIN_ROOM_CM), node.width() * scaleX);
    const newHeightPx = Math.max(cmToPx(MIN_ROOM_CM), node.height() * scaleY);
    const candidate = {
      ...room,
      w: Math.round(pxToCm(newWidthPx)),
      h: Math.round(pxToCm(newHeightPx)),
      x: Math.round(pxToCm(node.getParent().x())),
      y: Math.round(pxToCm(node.getParent().y())),
    };
    const hypotheticalRooms = window.appState.rooms.map((r) => (r.id === room.id ? candidate : r));
    const stillValid =
      window.appState.furniture.every((f) => window.isFurnitureFullyInRooms(f, hypotheticalRooms)) &&
      window.appState.electricals.every((e) => window.isElectricalFullyInRooms(e, hypotheticalRooms)) &&
      (window.isFixturesStillValidForRoom ? window.isFixturesStillValidForRoom(room.id, candidate) : true);

    if (stillValid) {
      node.width(newWidthPx);
      node.height(newHeightPx);
      room.w = candidate.w;
      room.h = candidate.h;
      room.x = candidate.x;
      room.y = candidate.y;
    } else if (node.__preTransform) {
      const prev = node.__preTransform;
      node.width(cmToPx(prev.w));
      node.height(cmToPx(prev.h));
      node.getParent().x(cmToPx(prev.x));
      node.getParent().y(cmToPx(prev.y));
    }
    node.__preTransform = null;
  }

  // Furniture/sockets fully contained within a single room (not spanning a
  // boundary) travel with it when the room is dragged — otherwise they'd be
  // left behind at their old absolute x/y while the room slides away, likely
  // ending up outside it. Items spanning multiple rooms are left in place
  // (ambiguous which room "owns" the move), same as doors/windows which
  // already move automatically since they're stored relative to the wall.
  function containedContents(room) {
    const items = [];
    window.appState.furniture.forEach((f) => {
      if (!window.isFurnitureFullyInRooms(f, [room])) return;
      const node = window.getFurnitureNode && window.getFurnitureNode(f.id);
      if (node) items.push({ item: f, node, x0: node.x(), y0: node.y() });
    });
    window.appState.electricals.forEach((e) => {
      if (!window.isElectricalFullyInRooms(e, [room])) return;
      const node = window.getElectricalNode && window.getElectricalNode(e.id);
      if (node) items.push({ item: e, node, x0: node.x(), y0: node.y() });
    });
    return items;
  }

  const groupById = {}; // room id → Konva.Group, rebuilt each render (for multi-drag)

  function render() {
    const layer = window.roomsLayer;
    layer.destroyChildren();
    transformer = null;
    Object.keys(groupById).forEach((k) => delete groupById[k]);

    window.appState.rooms.forEach((room) => {
      const selectMode = UI().activeTool === 'select';
      const group = new Konva.Group({
        x: cmToPx(room.x),
        y: cmToPx(room.y),
        draggable: selectMode,
      });
      groupById[room.id] = group;
      const shape = makeShapeNode(room);
      group.add(shape);

      // Labels are sized in screen pixels (fontSize / scale) so they stay
      // legible at any zoom. Room name sits centred and single-line (no
      // word-wrap, no ellipsis truncation — hidden entirely if it doesn't
      // fit); the width/height dimensions move out to the top/left walls,
      // architectural-drawing style. Hover tooltip is the safety net.
      const scale = window.stage.scaleX();
      const wPx = cmToPx(room.w);
      const hPx = cmToPx(room.h);
      const nameFont = 13 / scale;
      const dimFont = 10 / scale;

      const nameNode = new Konva.Text({
        text: room.name,
        fontFamily: 'Courier New, monospace',
        fontSize: nameFont,
        fill: '#2C2416',
        wrap: 'none',
        listening: false,
      });
      const fitsWidth = nameNode.getTextWidth() <= wPx - 8 / scale;
      const fitsHeight = hPx * scale > 16;
      if (fitsWidth && fitsHeight) {
        nameNode.setAttrs({ width: wPx, height: hPx, align: 'center', verticalAlign: 'middle' });
        group.add(nameNode);
      }

      if (wPx * scale > 26) {
        group.add(new Konva.Text({
          text: `${room.w}`, fontFamily: 'Courier New, monospace', fontSize: dimFont, fill: '#4A7FA5',
          width: wPx, align: 'center', y: -dimFont * 1.6, listening: false,
        }));
      }
      if (hPx * scale > 26) {
        group.add(new Konva.Text({
          text: `${room.h}`, fontFamily: 'Courier New, monospace', fontSize: dimFont, fill: '#4A7FA5',
          width: hPx, align: 'center', rotation: -90, x: -dimFont * 1.6, y: hPx, listening: false,
        }));
      }

      const isSelected = UI().selectedIds.includes(room.id);
      if (isSelected) {
        shape.stroke('#C17F3B');
        shape.dash([6, 4]);
      }

      group.on('click tap', (e) => {
        if (window.consumeClickSuppression()) return;
        if (UI().activeTool !== 'select') return;
        e.cancelBubble = true;
        const additive = e.evt && (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey);
        if (additive) {
          const set = new Set(UI().selectedIds);
          if (set.has(room.id)) set.delete(room.id); else set.add(room.id);
          UI().selectedIds = Array.from(set);
        } else {
          UI().selectedIds = [room.id];
        }
      });

      group.on('mouseover mousemove', () => {
        if (UI().activeTool !== 'select') return;
        window.showTooltip(`${room.name}\n${room.w} × ${room.h} cm`);
        window.stage.container().style.cursor = 'move';
      });
      group.on('mouseout', () => {
        window.hideTooltip();
        window.stage.container().style.cursor = 'default';
      });

      // dragging moves the whole room selection together, plus each room's
      // fully-contained furniture/sockets (see containedContents above).
      // Positions are captured at dragstart so the reactive re-render never
      // fires mid-drag.
      group.on('dragstart', () => {
        window.hideTooltip();
        const ids = (roomIds().includes(room.id) && roomIds().length > 1) ? roomIds() : [room.id];
        dragSet = ids.map((id) => ({ room: roomById(id), group: groupById[id] })).filter((i) => i.room && i.group);
        dragSet.forEach((i) => { i.x0 = i.group.x(); i.y0 = i.group.y(); i.contents = containedContents(i.room); });
        dragAnchorX0 = group.x();
        dragAnchorY0 = group.y();
      });

      group.on('dragmove', () => {
        window.hideTooltip();
        const skip = new Set((dragSet ? dragSet.map((i) => i.room.id) : [room.id]));
        const box = { x: group.x(), y: group.y(), w: cmToPx(room.w), h: cmToPx(room.h) };
        const snapped = window.snapBox(box, skip);
        group.x(snapped.x);
        group.y(snapped.y);
        window.drawGuides(snapped.vLine, snapped.hLine);
        const dx = group.x() - dragAnchorX0;
        const dy = group.y() - dragAnchorY0;
        if (dragSet) {
          dragSet.forEach((i) => {
            if (i.group !== group) {
              i.group.x(i.x0 + dx);
              i.group.y(i.y0 + dy);
            }
            (i.contents || []).forEach((c) => {
              c.node.x(c.x0 + dx);
              c.node.y(c.y0 + dy);
            });
          });
        }
      });

      group.on('dragend', () => {
        window.clearGuides();
        const dx = group.x() - dragAnchorX0;
        const dy = group.y() - dragAnchorY0;
        (dragSet || [{ room, group, x0: dragAnchorX0, y0: dragAnchorY0 }]).forEach((i) => {
          i.room.x = Math.round(pxToCm(i.x0 + dx));
          i.room.y = Math.round(pxToCm(i.y0 + dy));
          (i.contents || []).forEach((c) => {
            c.item.x = Math.round(pxToCm(c.x0 + dx));
            c.item.y = Math.round(pxToCm(c.y0 + dy));
            c.item.roomId = i.room.id;
          });
        });
        if (!UI().selectedIds.includes(room.id)) UI().selectedIds = [room.id];
        dragSet = null;
      });

      shape.on('transformstart', () => {
        shape.__preTransform = { w: room.w, h: room.h, x: room.x, y: room.y };
      });
      shape.on('transformend', () => commitTransform(room, shape));

      layer.add(group);

      // resize handles only when exactly one room is selected (and nothing
      // else) — resizing a multi-selection is out of scope.
      if (isSelected && selectMode && UI().selectedIds.length === 1) {
        transformer = new Konva.Transformer({
          nodes: [shape],
          rotateEnabled: false,
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
  window.renderRooms = render;

  const roomById = (id) => window.appState.rooms.find((r) => r.id === id);

  function commitRoom(xCm, yCm, wCm, hCm) {
    const id = window.appState.createRoomId();
    const color = ROOM_COLORS[window.appState.rooms.length % ROOM_COLORS.length];
    window.appState.rooms.push({
      id,
      name: window.t('room.defaultName') + ' ' + (window.appState.rooms.length + 1),
      x: Math.round(xCm), y: Math.round(yCm), w: Math.round(wCm), h: Math.round(hCm),
      height: window.appState.settings.defaultRoomHeight,
      wallThickness: window.appState.settings.wallThickness,
      color, shape: 'rect',
    });
    UI().selectedIds = [id];
    UI().activeTool = 'select';
  }

  // Panel edits (X/Y/width/depth typed directly, not dragged) bypass the
  // canvas drag/Transformer's snap-while-dragging engine entirely — typing an
  // exact number just writes it, so an edge that used to line up with a
  // neighbor can silently drift apart. These setters snap the edge the field
  // actually controls (left/top/right/bottom) to the nearest OTHER room's
  // edge within a small fixed threshold, on commit (blur/Enter), not on every
  // keystroke. Fixed cm threshold rather than the drag-snap's screen-px-based
  // one (interaction.js's worldThreshold()) — a typed value isn't tied to a
  // pointer position or the current zoom level, so a zoom-independent
  // tolerance is what a user actually expects here.
  const PANEL_SNAP_THRESHOLD_CM = 5;
  function nearestEdgeCm(cm, edgesCm) {
    let best = cm, bestDiff = PANEL_SNAP_THRESHOLD_CM;
    edgesCm.forEach((e) => {
      const d = Math.abs(e - cm);
      if (d < bestDiff) { bestDiff = d; best = e; }
    });
    return best;
  }
  function neighborEdgesCm(skipId, axis) {
    const edges = [];
    // Same wall-gap reasoning as stops() above — a typed X/Y/W/H should be
    // able to snap flush to a neighbor's edge (alignment) OR one wall
    // thickness off it (abutting with a real shared wall), not just flush.
    // Each room can have its own wallThickness now, so the reserved gap
    // for a given pair is whichever of the two demands more (a wall has
    // to be thick enough for both sides).
    const moving = roomById(skipId);
    const movingThickness = moving ? moving.wallThickness : S().wallThickness;
    window.appState.rooms.forEach((r) => {
      if (r.id === skipId) return;
      const wt = Math.max(movingThickness, r.wallThickness);
      if (axis === 'x') edges.push(r.x, r.x + r.w, r.x - wt, r.x + r.w + wt);
      else edges.push(r.y, r.y + r.h, r.y - wt, r.y + r.h + wt);
    });
    return edges;
  }
  window.setRoomX = function setRoomX(id, val) {
    const r = roomById(id);
    if (!r || !Number.isFinite(val)) return;
    r.x = Math.round(nearestEdgeCm(val, neighborEdgesCm(id, 'x')));
  };
  window.setRoomY = function setRoomY(id, val) {
    const r = roomById(id);
    if (!r || !Number.isFinite(val)) return;
    r.y = Math.round(nearestEdgeCm(val, neighborEdgesCm(id, 'y')));
  };
  window.setRoomW = function setRoomW(id, val) {
    const r = roomById(id);
    if (!r || !Number.isFinite(val) || val < 20) return;
    const snappedRight = nearestEdgeCm(r.x + val, neighborEdgesCm(id, 'x'));
    r.w = Math.round(Math.max(20, snappedRight - r.x));
  };
  window.setRoomH = function setRoomH(id, val) {
    const r = roomById(id);
    if (!r || !Number.isFinite(val) || val < 20) return;
    const snappedBottom = nearestEdgeCm(r.y + val, neighborEdgesCm(id, 'y'));
    r.h = Math.round(Math.max(20, snappedBottom - r.y));
  };

  window.deleteRoom = function deleteRoom(id) {
    const idx = window.appState.rooms.findIndex((r) => r.id === id);
    if (idx >= 0) window.appState.rooms.splice(idx, 1);
    UI().selectedIds = UI().selectedIds.filter((s) => s !== id);
  };

  // ── register with the shared interaction engine ─────────────────────────
  window.registerInteractionProvider({
    idPrefix: 'room',
    stops(skipSet) {
      const V = [], H = [];
      // Besides flush edge/centre alignment, offer stops one wall-thickness
      // off each room's edges too — so dragging a new room up against an
      // existing one snaps with a real gap for the shared wall instead of
      // sitting flush (which would make wallThickness pure decoration).
      // Each room can have its own wallThickness, so the gap for a given
      // pair is whichever side demands more — the room(s) being dragged
      // are excluded from the candidate pool (skipSet) but still need
      // their own thickness looked up to compute that max. Drawing a
      // brand-new room has no "own" thickness yet (skipSet is null), so
      // fall back to what it'll actually be created with.
      let movingThickness = S().wallThickness;
      if (skipSet && skipSet.size) {
        movingThickness = 0;
        window.appState.rooms.forEach((r) => { if (skipSet.has(r.id)) movingThickness = Math.max(movingThickness, r.wallThickness); });
      }
      window.appState.rooms.forEach((r) => {
        if (skipSet && skipSet.has(r.id)) return;
        const x = cmToPx(r.x), y = cmToPx(r.y), w = cmToPx(r.w), h = cmToPx(r.h);
        const wt = cmToPx(Math.max(movingThickness, r.wallThickness));
        V.push(x, x + w / 2, x + w, x - wt, x + w + wt);
        H.push(y, y + h / 2, y + h, y - wt, y + h + wt);
      });
      return { V, H };
    },
    boxes() {
      return window.appState.rooms.map((r) => ({ id: r.id, x: cmToPx(r.x), y: cmToPx(r.y), w: cmToPx(r.w), h: cmToPx(r.h) }));
    },
    entity: roomById,
    deleteMany(ids) {
      const set = new Set(ids);
      window.appState.rooms.splice(0, window.appState.rooms.length, ...window.appState.rooms.filter((r) => !set.has(r.id)));
    },
  });

  // batch-align the current selection to a shared edge (rooms + furniture,
  // via the shared entity() lookup each provider registers)
  // Fixtures (openings) use roomId/wallId/posOnWall, not x/y/w/h — they're
  // locked to a wall and can't be freely repositioned like rooms/furniture/
  // electricals, so they're excluded from batch alignment.
  window.alignSelected = function alignSelected(edge) {
    const sel = UI().selectedIds
      .filter((id) => !id.startsWith('fix-'))
      .map((id) => window.entityFor(id))
      .filter(Boolean);
    if (sel.length < 2) return;
    if (edge === 'left') {
      const x = Math.min(...sel.map((r) => r.x));
      sel.forEach((r) => { r.x = x; });
    } else if (edge === 'right') {
      const right = Math.max(...sel.map((r) => r.x + r.w));
      sel.forEach((r) => { r.x = right - r.w; });
    } else if (edge === 'top') {
      const y = Math.min(...sel.map((r) => r.y));
      sel.forEach((r) => { r.y = y; });
    } else if (edge === 'bottom') {
      const bottom = Math.max(...sel.map((r) => r.y + r.h));
      sel.forEach((r) => { r.y = bottom - r.h; });
    } else if (edge === 'centerX') {
      const c = (Math.min(...sel.map((r) => r.x)) + Math.max(...sel.map((r) => r.x + r.w))) / 2;
      sel.forEach((r) => { r.x = Math.round(c - r.w / 2); });
    } else if (edge === 'centerY') {
      const c = (Math.min(...sel.map((r) => r.y)) + Math.max(...sel.map((r) => r.y + r.h))) / 2;
      sel.forEach((r) => { r.y = Math.round(c - r.h / 2); });
    }
  };

  // ── draw-by-drag ──────────────────────────────────────────────────────────
  let draw = null; // { x0, y0, node }

  window.stage.on('mousedown touchstart', () => {
    if (window.isSpaceHeld()) return;
    const tool = UI().activeTool;
    if (tool !== 'room-rect') return;
    const p = window.worldPointer();
    if (!p) return;
    const stops = window.allStops(null);
    const x0 = window.snapValue(p.x, stops.V).val;
    const y0 = window.snapValue(p.y, stops.H).val;
    const scale = window.stage.scaleX();
    const node = new Konva.Rect({
      name: 'preview', x: x0, y: y0, width: 0, height: 0,
      stroke: '#C17F3B', dash: [6 / scale, 6 / scale], strokeWidth: 1.5 / scale,
      fill: 'rgba(193,127,59,0.08)', listening: false,
    });
    window.guideLayer.add(node);
    draw = { x0, y0, node };
  });

  window.stage.on('mousemove touchmove', () => {
    if (!draw) return;
    const p = window.worldPointer();
    if (!p) return;
    const stops = window.allStops(null);
    const sx = window.snapValue(p.x, stops.V);
    const sy = window.snapValue(p.y, stops.H);
    const x = Math.min(draw.x0, sx.val);
    const y = Math.min(draw.y0, sy.val);
    const w = Math.abs(sx.val - draw.x0);
    const h = Math.abs(sy.val - draw.y0);
    draw.node.setAttrs({ x, y, width: w, height: h });
    window.drawGuides(sx.line, sy.line);
  });

  window.stage.on('mouseup touchend', () => {
    if (!draw) return;
    const node = draw.node;
    const xCm = pxToCm(node.x());
    const yCm = pxToCm(node.y());
    const wCm = pxToCm(node.width());
    const hCm = pxToCm(node.height());
    node.destroy();
    window.clearGuides();
    draw = null;
    if (wCm < MIN_ROOM_CM || hCm < MIN_ROOM_CM) return; // treat a stray click as no-op
    commitRoom(xCm, yCm, wCm, hCm);
    window.suppressNextCanvasClick(); // don't let the trailing click deselect the new room
  });

  Vue.watch(
    () => [
      window.appState.rooms.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}:${r.color}:${r.shape}:${r.name}:${r.wallThickness}`).join(','),
      window.appState.ui.selectedIds.join(','),
      window.appState.ui.activeTool,
      window.appState.ui.zoomFactor,
    ],
    render,
    { immediate: true }
  );

  Vue.watch(
    () => window.appState.layers.find((l) => l.id === 'rooms').visible,
    (visible) => { window.roomsLayer.visible(visible); window.roomsLayer.batchDraw(); }
  );

  // A room's ceiling height is part of the vertical heightFromFloor/objectHeight/
  // distanceFromCeiling equation for everything placed in it — when it changes,
  // the items' stale (least-recently-edited) field needs re-deriving against the
  // new total. editedKey is null: this doesn't count as a user edit, so it
  // doesn't reorder which field is considered "stale".
  Vue.watch(
    () => window.appState.rooms.map((r) => `${r.id}:${r.height}`).join(','),
    () => {
      window.appState.rooms.forEach((room) => {
        window.appState.furniture.forEach((f) => { if (f.roomId === room.id) window.recomputeTriple(f, 'heightOrder', ['heightFromFloor', 'objectHeight', 'distanceFromCeiling'], room.height, null); });
        window.appState.fixtures.forEach((f) => { if (f.roomId === room.id) window.recomputeTriple(f, 'heightOrder', ['heightFromFloor', 'objectHeight', 'distanceFromCeiling'], room.height, null); });
        window.appState.electricals.forEach((e) => { if (e.roomId === room.id) window.recomputeTriple(e, 'heightOrder', ['heightFromFloor', 'objectHeight', 'distanceFromCeiling'], room.height, null); });
      });
    }
  );
})();
