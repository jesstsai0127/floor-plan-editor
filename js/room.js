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

  // The room's true footprint (fill only, no stroke) — this is the node
  // Transformer/hit-testing/selection-highlight all operate on, so resize
  // math (commitTransform below) never has to account for wall thickness.
  function makeShapeNode(room) {
    return new Konva.Rect({
      width: cmToPx(room.w),
      height: cmToPx(room.h),
      fill: room.color,
      name: 'roomShape',
    });
  }

  // A room's overall wallThickness is just the default for sides that
  // haven't been individually overridden — room.wallSides holds a per-side
  // (top/right/bottom/left) override, null meaning "inherit". A side set to
  // 0 is an explicitly open (wall-free) boundary — see setRoomWallSide.
  const WALL_SIDES = ['top', 'right', 'bottom', 'left'];
  function sideThickness(room, side) {
    const override = room.wallSides && room.wallSides[side];
    return override != null ? override : room.wallThickness;
  }
  window.roomSideThickness = sideThickness;

  // The wall is drawn as 4 independent side segments (not one stroked rect)
  // so each side can have its own thickness, including 0 = no wall at all
  // (an open boundary to a neighboring room). Each segment is drawn OUTSIDE
  // the room's true footprint only — a plain centered Konva stroke would
  // bleed half its width inward too, silently eating into the room's own
  // floor area and (when two rooms are snapped one wall-thickness apart,
  // see stops()/neighborEdgesCm() below) doubling up with the neighbor's
  // inward bleed into a wall that reads as 2x the configured thickness.
  // Offsetting each line by half its own thickness, then centering that
  // same stroke width on it, makes the whole band land in [true edge, true
  // edge + thickness] — purely outward, so two rooms placed thickness-apart
  // combine into one correctly sized wall instead of each other's fill.
  // Each side is a segment along the room's own true edge, offset outward
  // by half its own thickness, and extended at BOTH ends by the adjacent
  // sides' own thickness (e.g. the left wall's length also reaches into
  // the top and bottom walls' outward bands). Without this, a side is only
  // as long as the room's own w/h — fine when two rooms sit exactly flush,
  // but two rooms placed a gap apart (the normal case now, see
  // stops()/neighborEdgesCm() below) would each stop their perpendicular
  // walls short of the gap, leaving a visible unfilled notch at the corner
  // instead of the gap reading as one solid wall. Extending by the room's
  // OWN adjacent-side thickness (not the neighbor's) is enough: gap =
  // max(mine, theirs), so whichever side actually owns that max reaches
  // all the way across on its own.
  function makeWallSideNodes(room) {
    const wPx = cmToPx(room.w), hPx = cmToPx(room.h);
    const tTop = cmToPx(sideThickness(room, 'top'));
    const tRight = cmToPx(sideThickness(room, 'right'));
    const tBottom = cmToPx(sideThickness(room, 'bottom'));
    const tLeft = cmToPx(sideThickness(room, 'left'));
    const nodes = [];
    WALL_SIDES.forEach((side) => {
      const cm = sideThickness(room, side);
      if (!cm) return; // 0 — open, nothing to draw
      const t = Math.max(1, cmToPx(cm));
      const half = t / 2;
      let attrs;
      if (side === 'top') attrs = { x: -tLeft, y: -half, points: [0, 0, wPx + tLeft + tRight, 0] };
      else if (side === 'bottom') attrs = { x: -tLeft, y: hPx + half, points: [0, 0, wPx + tLeft + tRight, 0] };
      else if (side === 'left') attrs = { x: -half, y: -tTop, points: [0, 0, 0, hPx + tTop + tBottom] };
      else attrs = { x: wPx + half, y: -tTop, points: [0, 0, 0, hPx + tTop + tBottom] };
      nodes.push(new Konva.Line({
        ...attrs,
        stroke: '#2C2416',
        strokeWidth: t,
        name: 'roomWallSide',
        wallSide: side,
      }));
    });
    return nodes;
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
      const scale = window.stage.scaleX();
      const shape = makeShapeNode(room);
      group.add(shape);
      const wallSideSel = UI().selectedWallSide;
      makeWallSideNodes(room).forEach((line) => {
        if (selectMode) {
          if (wallSideSel && wallSideSel.roomId === room.id && wallSideSel.side === line.getAttr('wallSide')) {
            line.stroke('#C17F3B');
          }
          line.listening(true);
          // Forgiving click target, but capped in WORLD terms (not just
          // screen terms): a pure screen-px forgiveness (8/scale) grows
          // *larger* in real-world cm the further you zoom out, which is
          // backwards — that's exactly when rooms are small on screen and
          // packed close together, so a big world-reach is most likely to
          // swallow a click meant for a nearby room's own fill (or, once
          // corner-extended, another wall entirely), silently
          // selecting/editing the wrong room. Capping at 10cm of world
          // reach keeps that risk bounded regardless of zoom, while still
          // being comfortably clickable at normal-to-high zoom.
          line.hitStrokeWidth(Math.max(line.strokeWidth(), Math.min(cmToPx(10), 8 / scale)));
          line.on('click tap', (e) => {
            if (window.consumeClickSuppression()) return;
            if (UI().activeTool !== 'select') return;
            e.cancelBubble = true;
            UI().selectedIds = [room.id];
            UI().selectedWallSide = { roomId: room.id, side: line.getAttr('wallSide') };
          });
        }
        group.add(line);
      });

      // Labels are sized in screen pixels (fontSize / scale) so they stay
      // legible at any zoom. Room name sits centred and single-line (no
      // word-wrap, no ellipsis truncation — hidden entirely if it doesn't
      // fit); the width/height dimensions move out to the top/left walls,
      // architectural-drawing style. Hover tooltip is the safety net.
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
        UI().selectedWallSide = null; // clicking the room body (not a wall side) drops any wall-side focus
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
      wallSides: { top: null, right: null, bottom: null, left: null },
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
    // Only offer the wall-thickness-apart candidate here, not a flush (0
    // gap) one — walls are drawn OUTSIDE each room's own footprint now
    // (see makeWallSideNodes), so flush would overlap the two rooms' walls
    // into each other's floor area instead of forming one clean wall. Each
    // side of each room can have its own thickness (including 0 — an open
    // boundary), so the reserved gap for a given facing pair of sides is
    // whichever of the two demands more (the wall has to be thick enough
    // for both). The moving room here is known exactly (skipId), so unlike
    // stops() below this can use its real per-side thickness, not an
    // approximation.
    const moving = roomById(skipId);
    const movingSide = (side) => (moving ? sideThickness(moving, side) : S().wallThickness);
    window.appState.rooms.forEach((r) => {
      if (r.id === skipId) return;
      if (axis === 'x') {
        edges.push(r.x - Math.max(movingSide('right'), sideThickness(r, 'left')));
        edges.push(r.x + r.w + Math.max(movingSide('left'), sideThickness(r, 'right')));
      } else {
        edges.push(r.y - Math.max(movingSide('bottom'), sideThickness(r, 'top')));
        edges.push(r.y + r.h + Math.max(movingSide('top'), sideThickness(r, 'bottom')));
      }
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

  // Per-side wall thickness override. val === 0 makes that side an open
  // boundary (no wall drawn, furniture/electricals can cross it once the
  // neighboring room sits flush there — see stops()/neighborEdgesCm()).
  // val === null resets the side back to inheriting room.wallThickness.
  // Opening a side that still has doors/windows on it would leave them
  // floating in mid-air, so that's confirmed (and those fixtures removed)
  // rather than silently blocked or silently deleted.
  window.setRoomWallSide = function setRoomWallSide(id, side, val) {
    const r = roomById(id);
    if (!r || !WALL_SIDES.includes(side)) return;
    if (!r.wallSides) r.wallSides = { top: null, right: null, bottom: null, left: null };
    if (val === 0) {
      const onThisWall = window.appState.fixtures.filter((f) => f.roomId === id && f.wallId === side);
      if (onThisWall.length) {
        const msg = window.t('fixtures.removeForOpenWallConfirm').replace('{n}', onThisWall.length);
        if (!window.confirm(msg)) return;
        const removeIds = new Set(onThisWall.map((f) => f.id));
        window.appState.fixtures.splice(0, window.appState.fixtures.length, ...window.appState.fixtures.filter((f) => !removeIds.has(f.id)));
      }
      r.wallSides[side] = 0;
    } else if (val == null || !Number.isFinite(val)) {
      r.wallSides[side] = null;
    } else {
      r.wallSides[side] = Math.max(0, val);
    }
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
      // Centre-alignment stops, plus one wall-thickness off each room's
      // edges (not a flush 0-gap stop — walls are drawn OUTSIDE each
      // room's own footprint, see makeWallSideNodes, so a flush neighbor
      // would overlap two walls into each other's floor area instead of
      // forming one clean wall — unless a side's thickness is 0, an
      // intentionally open boundary, in which case there's nothing to
      // reserve there). Each side of each room can have its own
      // thickness, so the gap for a given facing pair is whichever side
      // demands more. The room(s) being dragged are excluded from the
      // candidate pool (skipSet) but their own per-side thickness is still
      // looked up (whichever of their sides ends up facing this neighbor
      // isn't known yet, so both possibilities are offered as separate
      // stops — snapValue/snapBox just pick whichever ends up closest).
      // Drawing a brand-new room has no "own" thickness yet (skipSet is
      // null), so fall back to what it'll actually be created with.
      function movingSide(side) {
        if (!skipSet || !skipSet.size) return S().wallThickness;
        let max = 0;
        window.appState.rooms.forEach((r) => { if (skipSet.has(r.id)) max = Math.max(max, sideThickness(r, side)); });
        return max;
      }
      const mLeft = cmToPx(movingSide('left')), mRight = cmToPx(movingSide('right'));
      const mTop = cmToPx(movingSide('top')), mBottom = cmToPx(movingSide('bottom'));
      window.appState.rooms.forEach((r) => {
        if (skipSet && skipSet.has(r.id)) return;
        const x = cmToPx(r.x), y = cmToPx(r.y), w = cmToPx(r.w), h = cmToPx(r.h);
        const rLeft = cmToPx(sideThickness(r, 'left')), rRight = cmToPx(sideThickness(r, 'right'));
        const rTop = cmToPx(sideThickness(r, 'top')), rBottom = cmToPx(sideThickness(r, 'bottom'));
        V.push(x + w / 2, x - Math.max(mRight, rLeft), x + w + Math.max(mLeft, rRight));
        H.push(y + h / 2, y - Math.max(mBottom, rTop), y + h + Math.max(mTop, rBottom));
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
      window.appState.rooms.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}:${r.color}:${r.shape}:${r.name}:${r.wallThickness}:${JSON.stringify(r.wallSides)}`).join(','),
      window.appState.ui.selectedIds.join(','),
      window.appState.ui.activeTool,
      window.appState.ui.zoomFactor,
      window.appState.ui.selectedWallSide ? `${window.appState.ui.selectedWallSide.roomId}:${window.appState.ui.selectedWallSide.side}` : null,
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
