// Sockets on electricalsLayer. Free x,y position (cm) within a room, like
// furniture — NOT wall-snapped like fixtures.js's doors/windows, because a
// socket's exact position (wall vs floor mount) is fully captured by its
// heightFromFloor field, not by which wall it's embedded in (it isn't
// embedded in one — it's mounted ON a surface). Simpler than furniture.js:
// no rotation, no shape variants, fixed small size.
(function initElectricals() {
  const UI = () => window.appState.ui;
  const cmToPx = (cm) => cm * window.BASE_SCALE;
  const pxToCm = (px) => px / window.BASE_SCALE;
  const SIZE_CM = 12; // fixed footprint for placement/containment purposes
  const DEFAULT_HEIGHT_CM = 30; // typical wall outlet height
  const DEFAULT_OBJECT_HEIGHT_CM = 10; // outlet plate thickness, for the vertical dimension triple

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
  // small marker, so just its 4 corners + centre need to fall in a room
  function isFullyInRooms(item, roomsList) {
    const pts = [
      { x: item.x, y: item.y }, { x: item.x + item.w, y: item.y },
      { x: item.x, y: item.y + item.h }, { x: item.x + item.w, y: item.y + item.h },
      { x: item.x + item.w / 2, y: item.y + item.h / 2 },
    ];
    return pts.every((p) => window.pointInAnyRoom(p.x, p.y, roomsList));
  }

  function makeShapeNode(item) {
    const wPx = cmToPx(item.w), hPx = cmToPx(item.h);
    return new Konva.Shape({
      width: wPx,
      height: hPx,
      fill: '#FAF7F0',
      stroke: '#5C4A2A',
      strokeWidth: 1.3,
      name: 'socketShape',
      sceneFunc(ctx, shape) {
        const w = shape.width(), h = shape.height();
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
        // two short parallel prong marks — universal "outlet" glyph
        const cx = w / 2, cy = h / 2, m = Math.min(w, h) * 0.22;
        ctx.strokeStyle = '#5C4A2A';
        ctx.lineWidth = Math.max(0.8, Math.min(w, h) * 0.08);
        ctx.beginPath();
        ctx.moveTo(cx - m, cy - m); ctx.lineTo(cx - m, cy + m);
        ctx.moveTo(cx + m, cy - m); ctx.lineTo(cx + m, cy + m);
        ctx.stroke();
      },
      hitFunc(ctx, shape) {
        const w = shape.width(), h = shape.height();
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });
  }
  // exposed so elevation.js's Floor/Ceiling views can draw the exact same
  // outlet glyph, at a room-relative offset instead of world coordinates
  window.buildElectricalVisual = function buildElectricalVisual(item, offXCm, offYCm) {
    offXCm = offXCm || 0; offYCm = offYCm || 0;
    const group = new Konva.Group({ x: cmToPx(item.x - offXCm), y: cmToPx(item.y - offYCm) });
    const shape = makeShapeNode(item);
    if (UI().selectedIds.includes(item.id)) { shape.stroke('#C17F3B'); shape.strokeWidth(2.2); }
    group.add(shape);
    return group;
  };

  const groupById = {};

  function render() {
    const layer = window.electricalsLayer;
    layer.destroyChildren();
    Object.keys(groupById).forEach((k) => delete groupById[k]);

    window.appState.electricals.forEach((item) => {
      const selectMode = UI().activeTool === 'select';
      const group = new Konva.Group({ x: cmToPx(item.x), y: cmToPx(item.y), draggable: selectMode });
      groupById[item.id] = group;
      const shape = makeShapeNode(item);
      group.add(shape);

      const isSelected = UI().selectedIds.includes(item.id);
      if (isSelected) {
        shape.stroke('#C17F3B');
        shape.strokeWidth(2.2);
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
        window.showTooltip(`${item.name}\n${item.heightFromFloor} cm ${window.t('electricals.fromFloor')}`);
        window.stage.container().style.cursor = 'move';
      });
      group.on('mouseout', () => {
        window.hideTooltip();
        window.stage.container().style.cursor = 'default';
      });

      group.on('dragmove', () => {
        window.hideTooltip();
        const wPx = cmToPx(item.w), hPx = cmToPx(item.h);
        const centerXCm = pxToCm(group.x() + wPx / 2);
        const centerYCm = pxToCm(group.y() + hPx / 2);
        const flush = wallFlushCenterCm(centerXCm, centerYCm);
        const box = { x: cmToPx(flush.x) - wPx / 2, y: cmToPx(flush.y) - hPx / 2, w: wPx, h: hPx };
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
          const r = primaryRoomFor(item);
          if (r) item.roomId = r.id;
        } else {
          group.x(cmToPx(item.x));
          group.y(cmToPx(item.y));
        }
        if (!UI().selectedIds.includes(item.id)) UI().selectedIds = [item.id];
      });

      layer.add(group);
    });

    layer.batchDraw();
  }
  window.renderElectricals = render;
  // exposed so room.js can translate a room's contained sockets live during a
  // room drag (Konva node manipulation, not Vue state — same reasoning as the
  // room's own drag not touching Vue state until dragend)
  window.getElectricalNode = (id) => groupById[id];

  const electricalById = (id) => window.appState.electricals.find((e) => e.id === id);

  function commitSocket(xCm, yCm) {
    const candidate = { x: Math.round(xCm), y: Math.round(yCm), w: SIZE_CM, h: SIZE_CM };
    if (!isFullyInRooms(candidate)) return null;
    const room = primaryRoomFor(candidate);
    const id = window.appState.createElectricalId();
    const item = {
      id,
      name: window.t('electricals.socket') + ' ' + (window.appState.electricals.length + 1),
      type: 'socket',
      roomId: room.id,
      x: candidate.x, y: candidate.y, w: SIZE_CM, h: SIZE_CM,
      heightFromFloor: DEFAULT_HEIGHT_CM,
      objectHeight: DEFAULT_OBJECT_HEIGHT_CM,
    };
    window.recomputeTriple(item, 'heightOrder', ['heightFromFloor', 'objectHeight', 'distanceFromCeiling'], room.height, null);
    window.appState.electricals.push(item);
    UI().selectedIds = [id];
    UI().activeTool = 'select';
    return id;
  }

  window.deleteElectrical = function deleteElectrical(id) {
    const idx = window.appState.electricals.findIndex((e) => e.id === id);
    if (idx >= 0) window.appState.electricals.splice(idx, 1);
    UI().selectedIds = UI().selectedIds.filter((s) => s !== id);
  };

  window.registerInteractionProvider({
    idPrefix: 'sock',
    stops(skipSet) {
      const V = [], H = [];
      window.appState.electricals.forEach((e) => {
        if (skipSet && skipSet.has(e.id)) return;
        const x = cmToPx(e.x), y = cmToPx(e.y), w = cmToPx(e.w), h = cmToPx(e.h);
        V.push(x, x + w / 2, x + w);
        H.push(y, y + h / 2, y + h);
      });
      return { V, H };
    },
    boxes() {
      return window.appState.electricals.map((e) => ({ id: e.id, x: cmToPx(e.x), y: cmToPx(e.y), w: cmToPx(e.w), h: cmToPx(e.h) }));
    },
    entity: electricalById,
    deleteMany(ids) {
      const set = new Set(ids);
      window.appState.electricals.splice(0, window.appState.electricals.length, ...window.appState.electricals.filter((e) => !set.has(e.id)));
    },
  });

  // room resize validation (room.js) needs to check electricals too — expose
  // the same shape isFullyInRooms accepts (has x/y/w/h)
  window.isElectricalFullyInRooms = isFullyInRooms;

  // A socket is a wall-mounted device — if the user aims for the wall itself
  // (very natural, e.g. clicking the middle of the wall stroke), centring the
  // socket exactly there leaves half its footprint outside the room, which
  // fails containment. Within range of a wall, nudge the CENTRE inward by
  // half the socket's own size so it sits flush against the wall's inner
  // face instead — fully inside, but visually right on the wall.
  const WALL_SNAP_THRESHOLD_CM = 30;
  function wallFlushCenterCm(xCm, yCm) {
    if (!window.nearestWallGeometry) return { x: xCm, y: yCm };
    const nearest = window.nearestWallGeometry(xCm, yCm);
    if (!nearest || nearest.proj.dist > WALL_SNAP_THRESHOLD_CM) return { x: xCm, y: yCm };
    const inward = window.inwardNormalFor(nearest.wall, nearest.room);
    return {
      x: nearest.proj.x + inward.x * (SIZE_CM / 2),
      y: nearest.proj.y + inward.y * (SIZE_CM / 2),
    };
  }

  // ── drag-to-position ─────────────────────────────────────────────────────
  let placing = null;

  window.stage.on('mousedown touchstart', () => {
    if (window.isSpaceHeld()) return;
    if (UI().activeTool !== 'socket') return;
    const p = window.worldPointer();
    if (!p) return;
    const wPx = cmToPx(SIZE_CM);
    const scale = window.stage.scaleX();
    const node = new Konva.Rect({
      name: 'preview', x: p.x - wPx / 2, y: p.y - wPx / 2, width: wPx, height: wPx,
      stroke: '#C17F3B', dash: [5 / scale, 5 / scale], strokeWidth: 1.5 / scale,
      fill: 'rgba(193,127,59,0.15)', cornerRadius: wPx / 2, listening: false,
    });
    window.guideLayer.add(node);
    placing = node;
  });

  window.stage.on('mousemove touchmove', () => {
    if (!placing) return;
    const p = window.worldPointer();
    if (!p) return;
    const wPx = placing.width();
    const flush = wallFlushCenterCm(pxToCm(p.x), pxToCm(p.y));
    const box = { x: cmToPx(flush.x) - wPx / 2, y: cmToPx(flush.y) - wPx / 2, w: wPx, h: wPx };
    const snapped = window.snapBox(box, null);
    placing.setAttrs({ x: snapped.x, y: snapped.y });
    window.drawGuides(snapped.vLine, snapped.hLine);
  });

  window.stage.on('mouseup touchend', () => {
    if (!placing) return;
    const xCm = pxToCm(placing.x());
    const yCm = pxToCm(placing.y());
    placing.destroy();
    window.clearGuides();
    placing = null;
    const id = commitSocket(xCm, yCm);
    if (id) {
      window.suppressNextCanvasClick();
    } else {
      window.showTooltip(window.t('furniture.mustFitInRoom'));
      setTimeout(window.hideTooltip, 1000);
    }
  });

  Vue.watch(
    () => [
      window.appState.electricals.map((e) => `${e.id}:${e.x}:${e.y}:${e.heightFromFloor}:${e.name}`).join(','),
      window.appState.ui.selectedIds.join(','),
      window.appState.ui.activeTool,
      window.appState.ui.zoomFactor,
    ],
    render,
    { immediate: true }
  );

  Vue.watch(
    () => window.appState.layers.find((l) => l.id === 'fixtures').visible,
    (visible) => { window.electricalsLayer.visible(visible); window.electricalsLayer.batchDraw(); }
  );
})();
