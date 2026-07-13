// localStorage autosave. Persists every entity array — rooms, furniture,
// fixtures (openings), electricals (sockets), sticky notes — plus
// settings/layers.
(function initStorage() {
  const STORAGE_KEY = 'floorPlanEditor.autosave.v1';
  let saveTimer = null;

  // Single source of truth for "what is a project" — reused by autosave
  // below, by history.js (undo/redo snapshots), and by Export JSON/Open
  // (Phase 6) so all of them never drift into different shapes.
  function snapshotState() {
    return {
      settings: window.appState.settings,
      rooms: window.appState.rooms,
      furniture: window.appState.furniture,
      fixtures: window.appState.fixtures,
      electricals: window.appState.electricals,
      stickyNotes: window.appState.stickyNotes,
      layers: window.appState.layers,
    };
  }
  window.snapshotState = snapshotState;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState()));
      window.appState.lastSavedAt = new Date();
    } catch (e) {
      console.warn('Autosave failed:', e);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1000);
  }
  window.scheduleSave = scheduleSave;

  // Heal any duplicate/missing ids left by older saves (a stale counter
  // scheme could collide restored entities with newly created ones).
  function healIds(list, createId) {
    const seen = new Set();
    list.forEach((item) => {
      if (!item.id || seen.has(item.id)) item.id = createId();
      seen.add(item.id);
    });
  }

  // Phase 4 added room.height and the heightFromFloor/objectHeight/
  // distanceFromCeiling/heightOrder vertical-dimension fields — saves from
  // before that (Phase 1-3 testing) won't have them. Backfill sensible
  // defaults so restored data doesn't render as NaN in elevation mode.
  function backfillHeights() {
    const defRoomHeight = window.appState.settings.defaultRoomHeight;
    const defWallThickness = window.appState.settings.wallThickness;
    window.appState.rooms.forEach((r) => {
      if (!r.height) r.height = defRoomHeight;
      if (!r.wallThickness) r.wallThickness = defWallThickness;
      if (!r.wallSides) r.wallSides = { top: null, right: null, bottom: null, left: null };
    });

    function ensureTriple(item, fallback) {
      const room = window.appState.rooms.find((r) => r.id === item.roomId);
      if (item.heightFromFloor == null) item.heightFromFloor = fallback.heightFromFloor;
      if (item.objectHeight == null) item.objectHeight = fallback.objectHeight;
      window.recomputeTriple(item, 'heightOrder', ['heightFromFloor', 'objectHeight', 'distanceFromCeiling'], room ? room.height : defRoomHeight, null);
    }
    window.appState.furniture.forEach((f) => ensureTriple(f, { heightFromFloor: 0, objectHeight: 75 }));
    window.appState.fixtures.forEach((f) => ensureTriple(f, { heightFromFloor: 0, objectHeight: 200 }));
    window.appState.electricals.forEach((e) => ensureTriple(e, { heightFromFloor: 30, objectHeight: 10 }));
  }

  // Writes a snapshot (same shape snapshotState() returns) into the live
  // appState. Shared by restoreAutosave (below), history.js's undo/redo, and
  // the Open-file flow — one place that knows how to go from "a snapshot
  // object" to "the app actually shows that project," so those three
  // call sites can't drift into three different partial-restore behaviors.
  window.applySnapshot = function applySnapshot(snapshot) {
    if (snapshot.settings) Object.assign(window.appState.settings, snapshot.settings);
    if (snapshot.rooms) {
      window.appState.rooms.splice(0, window.appState.rooms.length, ...snapshot.rooms);
      healIds(window.appState.rooms, window.appState.createRoomId);
    }
    if (snapshot.furniture) {
      window.appState.furniture.splice(0, window.appState.furniture.length, ...snapshot.furniture);
      healIds(window.appState.furniture, window.appState.createFurnitureId);
    }
    if (snapshot.fixtures) {
      window.appState.fixtures.splice(0, window.appState.fixtures.length, ...snapshot.fixtures);
      healIds(window.appState.fixtures, window.appState.createFixtureId);
    }
    if (snapshot.electricals) {
      window.appState.electricals.splice(0, window.appState.electricals.length, ...snapshot.electricals);
      healIds(window.appState.electricals, window.appState.createElectricalId);
    }
    if (snapshot.stickyNotes) {
      window.appState.stickyNotes.splice(0, window.appState.stickyNotes.length, ...snapshot.stickyNotes);
      healIds(window.appState.stickyNotes, window.appState.createStickyNoteId);
    }
    if (snapshot.layers) {
      snapshot.layers.forEach((saved) => {
        const layer = window.appState.layers.find((l) => l.id === saved.id);
        if (layer) Object.assign(layer, saved);
      });
    }
    backfillHeights();
  };

  window.restoreAutosave = function restoreAutosave() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return false;
    }
    if (!raw) return false;
    try {
      window.applySnapshot(JSON.parse(raw));
      return true;
    } catch (e) {
      console.warn('Autosave restore failed:', e);
      return false;
    }
  };

  // Shared by Export JSON/PNG/PDF (Phase 6) — accepts either a data URL
  // string (PNG/PDF) or a Blob (JSON), so all three export paths trigger
  // their download through the same "create <a>, click, remove" dance
  // instead of each re-implementing it.
  window.triggerDownload = function triggerDownload(dataUrlOrBlob, filename) {
    const url = dataUrlOrBlob instanceof Blob ? URL.createObjectURL(dataUrlOrBlob) : dataUrlOrBlob;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (dataUrlOrBlob instanceof Blob) URL.revokeObjectURL(url);
  };

  window.appState.lastSavedAt = null;

  Vue.watch(() => JSON.stringify(snapshotState()), scheduleSave);
})();
