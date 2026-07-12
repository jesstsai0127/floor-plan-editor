// Shared canvas interaction engine used by both room.js and furniture.js:
// snapping (Konva official "Objects Snapping" pattern), rubber-band select,
// hover tooltips, Space-to-pan, and Delete-key handling.
//
// Selection is ONE array (appState.ui.selectedIds) holding ids of EITHER
// rooms or furniture — ids are prefixed ('room-...' / 'furn-...') so any
// module can tell which entity type an id belongs to. room.js and
// furniture.js each register themselves as a "provider" so a single
// rubber-band drag, snap pass, or Delete key press covers both entity types
// at once instead of each module owning its own competing copy.
(function initInteraction() {
  const SNAP_SCREEN_PX = 7;
  const UI = () => window.appState.ui;

  // ── provider registry ───────────────────────────────────────────────────
  // Each provider (room.js, furniture.js) registers:
  //   idPrefix: 'room' | 'furn'
  //   stops(skipSet): { V:[], H:[] } — vertical/horizontal snap stops in world px
  //   boxes(): [{ id, x, y, w, h }] — world px bounding boxes, for rubber-band hit-testing
  //   entity(id): the raw state object (cm-based x/y/w/h) for that id, or undefined
  //   deleteMany(ids)
  const providers = [];
  window.registerInteractionProvider = function registerInteractionProvider(p) { providers.push(p); };

  function providerFor(id) { return providers.find((p) => id.startsWith(p.idPrefix + '-')); }
  window.entityFor = function entityFor(id) {
    const p = providerFor(id);
    return p ? p.entity(id) : undefined;
  };

  // ── shared point-in-room geometry (standard point-in-polygon testing) ──
  // Used by furniture.js (containment), electricals.js (containment), and
  // fixtures.js (finding which room/wall a click is near). roomsList lets
  // callers test hypothetical room sizes (e.g. room.js validating a resize)
  // without mutating real state.
  const EPS = 0.02; // cm tolerance for floating-point snap-to-wall edges
  window.pointInRoom = function pointInRoom(px, py, room) {
    return px >= room.x - EPS && px <= room.x + room.w + EPS && py >= room.y - EPS && py <= room.y + room.h + EPS;
  };
  window.pointInAnyRoom = function pointInAnyRoom(px, py, roomsList) {
    return (roomsList || window.appState.rooms).some((r) => window.pointInRoom(px, py, r));
  };

  // ── shared top layer: guides, drawing/rubber-band preview, tooltip ─────
  const guideLayer = new Konva.Layer({ listening: false });
  window.stage.add(guideLayer);
  window.guideLayer = guideLayer;

  const tooltip = new Konva.Label({ visible: false, listening: false });
  tooltip.add(new Konva.Tag({ fill: '#2C2416', cornerRadius: 3, opacity: 0.92 }));
  const tooltipText = new Konva.Text({
    text: '', fontFamily: 'Courier New, monospace', fontSize: 12, padding: 5, fill: '#F5F0E8',
  });
  tooltip.add(tooltipText);
  guideLayer.add(tooltip);

  window.showTooltip = function showTooltip(text) {
    const p = worldPointer();
    if (!p) return;
    const scale = window.stage.scaleX();
    tooltipText.text(text);
    tooltip.scale({ x: 1 / scale, y: 1 / scale });
    tooltip.position({ x: p.x + 14 / scale, y: p.y + 14 / scale });
    tooltip.visible(true);
    tooltip.moveToTop();
    guideLayer.batchDraw();
  };
  window.hideTooltip = function hideTooltip() {
    if (!tooltip.visible()) return;
    tooltip.visible(false);
    guideLayer.batchDraw();
  };

  function worldThreshold() { return SNAP_SCREEN_PX / window.stage.scaleX(); }
  window.worldThreshold = worldThreshold;

  function worldPointer() {
    const p = window.stage.getPointerPosition();
    if (!p) return null;
    const scale = window.stage.scaleX();
    return { x: (p.x - window.stage.x()) / scale, y: (p.y - window.stage.y()) / scale };
  }
  window.worldPointer = worldPointer;

  // ── snapping: stops pooled from every registered provider ──────────────
  function allStops(skipSet) {
    const V = [], H = [];
    providers.forEach((p) => {
      const s = p.stops(skipSet);
      V.push(...s.V); H.push(...s.H);
    });
    return { V, H };
  }
  window.snapValue = function snapValue(val, stops) {
    const S = window.appState.settings;
    const thr = worldThreshold();
    let best = null, bestDiff = thr;
    stops.forEach((s) => {
      const d = Math.abs(s - val);
      if (d < bestDiff) { bestDiff = d; best = s; }
    });
    if (S.gridVisible) {
      const gridPx = S.gridSizeCm * window.BASE_SCALE;
      const g = Math.round(val / gridPx) * gridPx;
      const d = Math.abs(g - val);
      if (d < bestDiff) { bestDiff = d; best = g; }
    }
    return best == null ? { val, line: null } : { val: best, line: best };
  };
  window.allStops = allStops;

  // snap a moving box (top-left x,y with w,h) by its left/centre/right and
  // top/middle/bottom edges against pooled stops from every provider.
  window.snapBox = function snapBox(box, skipSet) {
    const { V, H } = allStops(skipSet);
    const S = window.appState.settings;
    const gridPx = S.gridSizeCm * window.BASE_SCALE;
    const thr = worldThreshold();

    function bestEdge(edges, stops) {
      let best = null;
      edges.forEach((e) => {
        const cands = stops.slice();
        if (S.gridVisible) cands.push(Math.round(e.pos / gridPx) * gridPx);
        cands.forEach((s) => {
          const d = Math.abs(s - e.pos);
          if (d < thr && (!best || d < best.diff)) best = { line: s, newStart: s - e.off, diff: d };
        });
      });
      return best;
    }

    const vBest = bestEdge([
      { pos: box.x, off: 0 }, { pos: box.x + box.w / 2, off: box.w / 2 }, { pos: box.x + box.w, off: box.w },
    ], V);
    const hBest = bestEdge([
      { pos: box.y, off: 0 }, { pos: box.y + box.h / 2, off: box.h / 2 }, { pos: box.y + box.h, off: box.h },
    ], H);

    return {
      x: vBest ? vBest.newStart : box.x,
      y: hBest ? hBest.newStart : box.y,
      vLine: vBest ? vBest.line : null,
      hLine: hBest ? hBest.line : null,
    };
  };

  window.drawGuides = function drawGuides(vLine, hLine) {
    guideLayer.find('.guide').forEach((n) => n.destroy());
    const scale = window.stage.scaleX();
    const vx0 = -window.stage.x() / scale, vx1 = vx0 + window.stage.width() / scale;
    const vy0 = -window.stage.y() / scale, vy1 = vy0 + window.stage.height() / scale;
    if (vLine != null) guideLayer.add(new Konva.Line({ name: 'guide', points: [vLine, vy0, vLine, vy1], stroke: '#C17F3B', strokeWidth: 1 / scale, dash: [4 / scale, 4 / scale] }));
    if (hLine != null) guideLayer.add(new Konva.Line({ name: 'guide', points: [vx0, hLine, vx1, hLine], stroke: '#C17F3B', strokeWidth: 1 / scale, dash: [4 / scale, 4 / scale] }));
    guideLayer.batchDraw();
  };
  window.clearGuides = function clearGuides() {
    guideLayer.find('.guide').forEach((n) => n.destroy());
    guideLayer.batchDraw();
  };

  // ── keyboard: Space = temporary pan, Delete = delete selection ─────────
  let spaceHeld = false;
  window.isSpaceHeld = () => spaceHeld;
  const isTypingTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey; // metaKey = Cmd on macOS
    if (e.code === 'Space' && !spaceHeld && !isTypingTarget(e.target)) {
      spaceHeld = true;
      window.stage.draggable(true);
      window.stage.container().style.cursor = 'grab';
      e.preventDefault();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isTypingTarget(e.target) && UI().selectedIds.length) {
      e.preventDefault();
      window.deleteSelected();
    } else if (mod && e.key.toLowerCase() === 's') {
      // Save should work even from inside a text field — it's not a text-
      // editing shortcut, and without preventDefault the browser's own
      // "Save Page As" dialog pops up instead.
      e.preventDefault();
      window.scheduleSave();
    } else if (mod && !isTypingTarget(e.target) && e.key.toLowerCase() === 'z') {
      // Inside a text field, leave Ctrl/Cmd+Z to the browser's native
      // per-field undo instead of hijacking it for the canvas history.
      e.preventDefault();
      if (e.shiftKey) window.redo(); else window.undo();
    } else if (mod && !isTypingTarget(e.target) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      window.redo();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceHeld = false;
      window.stage.draggable(false);
      window.stage.container().style.cursor = 'default';
    }
  });

  // delete whatever's currently selected, routed to the right provider per id
  window.deleteSelected = function deleteSelected() {
    const byPrefix = {};
    UI().selectedIds.forEach((id) => {
      const p = providerFor(id);
      if (!p) return;
      (byPrefix[p.idPrefix] = byPrefix[p.idPrefix] || []).push(id);
    });
    providers.forEach((p) => {
      if (byPrefix[p.idPrefix]) p.deleteMany(byPrefix[p.idPrefix]);
    });
    UI().selectedIds = [];
  };

  // ── rubber-band selection (Select tool, empty-canvas drag) ─────────────
  let band = null;
  let suppressNextClick = false;
  window.suppressNextCanvasClick = () => { suppressNextClick = true; };
  // Konva fires mousedown → mouseup → click in sequence. A placement gesture
  // (room/furniture/fixture/electrical) commits on mouseup and may change
  // activeTool to 'select' right there — but the click event that follows
  // right after still fires, and if it lands on an existing shape (e.g. a
  // door placed right on a room's wall), that shape's OWN click handler now
  // sees activeTool === 'select' and "helpfully" re-selects itself, stomping
  // the selection the mouseup handler just set. Every entity's click handler
  // must consume this flag FIRST — checking only here (the stage-level
  // handler) is too late, since Konva fires the target's own listener before
  // bubbling reaches the stage.
  window.consumeClickSuppression = () => {
    if (suppressNextClick) { suppressNextClick = false; return true; }
    return false;
  };

  window.stage.on('mousedown touchstart', (e) => {
    if (spaceHeld) return;
    if (UI().activeTool !== 'select') return;
    if (e.target !== window.stage) return; // started on a shape → its own click/drag handles it
    const p = worldPointer();
    if (!p) return;
    const scale = window.stage.scaleX();
    const node = new Konva.Rect({
      name: 'preview', x: p.x, y: p.y, width: 0, height: 0,
      fill: 'rgba(74,127,165,0.08)', stroke: '#4A7FA5', strokeWidth: 1 / scale, dash: [4 / scale, 4 / scale], listening: false,
    });
    guideLayer.add(node);
    band = { x0: p.x, y0: p.y, node };
  });

  window.stage.on('mousemove touchmove', () => {
    if (!band) return;
    const p = worldPointer();
    if (!p) return;
    band.node.setAttrs({
      x: Math.min(band.x0, p.x), y: Math.min(band.y0, p.y),
      width: Math.abs(p.x - band.x0), height: Math.abs(p.y - band.y0),
    });
    guideLayer.batchDraw();
  });

  window.stage.on('mouseup touchend', (e) => {
    if (!band) return;
    const r = { x: band.node.x(), y: band.node.y(), w: band.node.width(), h: band.node.height() };
    band.node.destroy();
    guideLayer.batchDraw();
    band = null;
    if (r.w < 3 && r.h < 3) return; // basically a click → let the click-to-deselect handler run
    const hits = [];
    providers.forEach((p) => {
      p.boxes().forEach((b) => {
        const overlap = !(b.x > r.x + r.w || b.x + b.w < r.x || b.y > r.y + r.h || b.y + b.h < r.y);
        if (overlap) hits.push(b.id);
      });
    });
    const additive = e.evt && (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey);
    if (additive) {
      const set = new Set(UI().selectedIds);
      hits.forEach((id) => set.add(id));
      UI().selectedIds = Array.from(set);
    } else {
      UI().selectedIds = hits;
    }
    suppressNextClick = true;
  });

  window.stage.on('click tap', (e) => {
    if (window.consumeClickSuppression()) return;
    if (UI().activeTool === 'select' && e.target === window.stage) {
      UI().selectedIds = [];
    }
  });
})();
