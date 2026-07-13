// Sticky notes: a free-floating text annotation, not constrained to any
// room's bounds (unlike furniture) — but still tagged with a roomId+view so
// AI export can group a room's notes together. Each of a room's 7 contexts
// (the floor plan itself, plus the six elevation views) keeps a fully
// independent set of notes, because a note's (x,y) is only meaningful
// within the coordinate system of the view it was placed in — see
// state.js's stickyNotes comment.
(function initStickyNotes() {
  const UI = () => window.appState.ui;
  const cmToPx = (cm) => cm * window.BASE_SCALE;
  const pxToCm = (px) => px / window.BASE_SCALE;
  const NOTE_SIZE_CM = 40;

  // Organizational only (AI export grouping) — a note has no containment
  // requirement, so "nearest" (not "overlapping") room is the only sensible
  // definition; a note in the hallway between two rooms still needs SOME
  // primary room.
  function nearestRoomId(xCm, yCm) {
    let best = null, bestDist = Infinity;
    window.appState.rooms.forEach((r) => {
      const dx = Math.max(r.x - xCm, 0, xCm - (r.x + r.w));
      const dy = Math.max(r.y - yCm, 0, yCm - (r.y + r.h));
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) { bestDist = dist; best = r.id; }
    });
    return best;
  }

  // Shared visual, reused by this module's own floorplan render() below AND
  // by elevation.js's render() for the current (room, view) tab's notes —
  // same "shared builder, two render call sites" pattern as
  // buildFixtureVisual/buildElectricalVisual. No offset parameter: by the
  // time a note reaches this function its x/y are already in whichever
  // local cm space its own view uses (world cm for 'floorplan', wall-local
  // u/height-from-ceiling or room-relative x/y for the six elevation
  // views), so there's nothing left to subtract.
  window.buildStickyNoteVisual = function buildStickyNoteVisual(note) {
    const sizePx = cmToPx(NOTE_SIZE_CM);
    const group = new Konva.Group({ x: cmToPx(note.x), y: cmToPx(note.y), name: 'stickyNote' });
    const isSelected = UI().selectedIds.includes(note.id);
    group.add(new Konva.Rect({
      width: sizePx, height: sizePx, fill: '#FEF3C7',
      stroke: isSelected ? '#C17F3B' : '#B8A46A',
      strokeWidth: isSelected ? 2.2 : 1,
      shadowColor: 'rgba(0,0,0,.25)', shadowBlur: 3, shadowOffset: { x: 1, y: 1 },
    }));
    group.add(new Konva.Text({
      text: note.text, width: sizePx, height: sizePx, padding: 4,
      fontSize: 9, fontFamily: 'Courier New, monospace', fill: '#5C4A2A',
      wrap: 'word', ellipsis: true, listening: false,
    }));
    return group;
  };

  const groupById = {};

  // Floorplan notes only — elevation-view notes are drawn by elevation.js's
  // own render() pass onto elevationLayer (see that file), reusing
  // buildStickyNoteVisual above rather than a second copy of this logic.
  function render() {
    const layer = window.notesLayer;
    layer.destroyChildren();
    Object.keys(groupById).forEach((k) => delete groupById[k]);

    window.appState.stickyNotes.forEach((note) => {
      if (note.view !== 'floorplan') return;
      const selectMode = UI().activeTool === 'select';
      const group = window.buildStickyNoteVisual(note);
      group.draggable(selectMode);
      groupById[note.id] = group;

      group.on('click tap', (e) => {
        if (window.consumeClickSuppression()) return;
        if (UI().activeTool !== 'select') return;
        e.cancelBubble = true;
        const additive = e.evt && (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey);
        if (additive) {
          const set = new Set(UI().selectedIds);
          if (set.has(note.id)) set.delete(note.id); else set.add(note.id);
          UI().selectedIds = Array.from(set);
        } else {
          UI().selectedIds = [note.id];
        }
      });
      group.on('mouseover', () => { if (UI().activeTool === 'select') window.stage.container().style.cursor = 'move'; });
      group.on('mouseout', () => { window.stage.container().style.cursor = 'default'; });

      // No containment/snap check on drop — unlike furniture/electricals, a
      // note has nothing to validate against, so dragend just commits.
      group.on('dragend', () => {
        note.x = Math.round(pxToCm(group.x()));
        note.y = Math.round(pxToCm(group.y()));
        note.roomId = nearestRoomId(note.x, note.y);
        if (!UI().selectedIds.includes(note.id)) UI().selectedIds = [note.id];
      });

      layer.add(group);
    });
    layer.batchDraw();
  }
  window.renderStickyNotes = render;
  window.getStickyNoteNode = (id) => groupById[id];

  // room.js's alignSelected() is generic over window.entityFor(id) and reads/
  // writes r.x/r.y/r.w/r.h on whatever it gets back — a note has no stored
  // w/h (it's a fixed NOTE_SIZE_CM square, not a persisted field), so this
  // returns a live x/y write-through view onto the real note plus synthetic
  // w/h, rather than the raw note object (which would make batch-align
  // compute NaN the moment a note is mixed into the same selection as a
  // room/furniture item).
  function noteById(id) {
    const note = window.appState.stickyNotes.find((n) => n.id === id);
    if (!note) return undefined;
    return {
      get x() { return note.x; }, set x(v) { note.x = v; },
      get y() { return note.y; }, set y(v) { note.y = v; },
      w: NOTE_SIZE_CM, h: NOTE_SIZE_CM,
    };
  }

  function commitNote(view, roomId, xCm, yCm) {
    const id = window.appState.createStickyNoteId();
    window.appState.stickyNotes.push({
      id, roomId, view,
      x: Math.round(xCm), y: Math.round(yCm),
      text: '',
    });
    UI().selectedIds = [id];
    UI().activeTool = 'select';
    return id;
  }

  // ── click-to-place: fixed size, follows the cursor from mousedown to
  // mouseup (same interaction shape as electricals.js's socket placement,
  // minus the wall-flush nudge sockets get — a note has no wall affinity).
  // Fires regardless of appState.ui.mode; worldPointer() already returns
  // whatever local coordinate space the stage is currently showing
  // (floorplan world cm, or the current elevation view's local cm), so the
  // only thing that differs per mode is which view/roomId gets stamped on
  // the note once placed. ──────────────────────────────────────────────
  let placing = null;

  window.stage.on('mousedown touchstart', () => {
    if (window.isSpaceHeld()) return;
    if (UI().activeTool !== 'note') return;
    const p = window.worldPointer();
    if (!p) return;
    const sizePx = cmToPx(NOTE_SIZE_CM);
    const scale = window.stage.scaleX();
    const node = new Konva.Rect({
      name: 'preview', x: p.x - sizePx / 2, y: p.y - sizePx / 2, width: sizePx, height: sizePx,
      stroke: '#C17F3B', dash: [5 / scale, 5 / scale], strokeWidth: 1.5 / scale,
      fill: 'rgba(254,243,199,0.5)', listening: false,
    });
    window.guideLayer.add(node);
    placing = node;
  });

  window.stage.on('mousemove touchmove', () => {
    if (!placing) return;
    const p = window.worldPointer();
    if (!p) return;
    const sizePx = placing.width();
    placing.position({ x: p.x - sizePx / 2, y: p.y - sizePx / 2 });
    window.guideLayer.batchDraw();
  });

  window.stage.on('mouseup touchend', () => {
    if (!placing) return;
    const xPx = placing.x(), yPx = placing.y();
    placing.destroy();
    window.guideLayer.batchDraw();
    placing = null;

    const xCm = pxToCm(xPx), yCm = pxToCm(yPx);
    if (UI().mode === 'floorplan') {
      commitNote('floorplan', nearestRoomId(xCm, yCm), xCm, yCm);
    } else {
      const room = window.elevationCurrentRoom && window.elevationCurrentRoom();
      if (!room) return;
      commitNote(UI().currentElevation, room.id, xCm, yCm);
    }
    window.suppressNextCanvasClick();
  });

  Vue.watch(
    () => [
      window.appState.stickyNotes.map((n) => `${n.id}:${n.view}:${n.x}:${n.y}:${n.text}`).join(','),
      window.appState.ui.selectedIds.join(','),
      window.appState.ui.activeTool,
      window.appState.ui.zoomFactor,
    ],
    render,
    { immediate: true }
  );

  Vue.watch(
    () => window.appState.layers.find((l) => l.id === 'notes').visible,
    (visible) => { window.notesLayer.visible(visible); window.notesLayer.batchDraw(); }
  );

  window.registerInteractionProvider({
    idPrefix: 'note',
    stops() { return { V: [], H: [] }; }, // a floating note shouldn't act as a snap anchor for other items
    boxes() {
      const sizePx = cmToPx(NOTE_SIZE_CM);
      return window.appState.stickyNotes
        .filter((n) => n.view === 'floorplan') // elevation-view notes aren't in world-px space — must never leak into floorplan rubber-band/snap hit-testing
        .map((n) => ({ id: n.id, x: cmToPx(n.x), y: cmToPx(n.y), w: sizePx, h: sizePx }));
    },
    entity: noteById,
    deleteMany(ids) {
      const set = new Set(ids);
      window.appState.stickyNotes.splice(0, window.appState.stickyNotes.length, ...window.appState.stickyNotes.filter((n) => !set.has(n.id)));
    },
  });
})();
