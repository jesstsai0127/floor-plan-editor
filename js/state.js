// window.appState — single reactive source of truth (Vue 3 reactive object)
// Phase 1: settings / rooms / layers / ui are live. Other arrays exist but stay
// empty until their respective phases (furniture, fixtures, electricals, notes).
window.appState = Vue.reactive({
  settings: {
    unit: 'cm',
    wallThickness: 15, // cm — new rooms' wall thickness; each room can override its own
    defaultRoomHeight: 280, // cm — new rooms' ceiling height; each room can override its own
    language: 'en-US', // 'en-US' | 'zh-TW'
    gridVisible: true,
    gridSizeCm: 100,
    gridColor: '#DDD5C0',
  },

  rooms: [],
  furniture: [],
  fixtures: [],
  electricals: [],
  // { id, roomId, view, x, y, text }. `view` is 'floorplan' or one of
  // elevation.js's six view ids ('top'|'right'|'bottom'|'left'|'ceiling'|
  // 'floor') — a note's (x,y) is only meaningful within its own view's
  // coordinate system, so each of a room's 7 contexts keeps a fully
  // independent set of notes rather than one shared pool.
  stickyNotes: [],
  backgroundImage: { src: null, x: 0, y: 0, scaleRatio: 1 },

  layers: [
    { id: 'bg', name: 'layers.bg', visible: true, locked: false },
    { id: 'rooms', name: 'layers.rooms', visible: true, locked: false },
    { id: 'furniture', name: 'layers.furniture', visible: true, locked: false },
    { id: 'fixtures', name: 'layers.fixtures', visible: true, locked: false },
    { id: 'notes', name: 'layers.notes', visible: true, locked: false },
  ],

  ui: {
    mode: 'floorplan', // 'floorplan' | 'elevation'
    activeTool: 'select', // 'select' | 'room-rect' | 'furn-*' | 'fixture-*' | 'socket' | 'note'
    currentRoomId: null,
    currentElevation: 'front',
    selectedIds: [], // ids of selected rooms/furniture/fixtures/electricals, prefixed 'room-'/'furn-'/'fix-'/'sock-'
    selectedWallSide: null, // { roomId, side } | null — a specific wall segment clicked in the room properties panel, for per-side thickness editing
    activeLayerId: 'rooms',
    zoomFactor: 1, // 1 = 100%
    pointerX: 0, // cm — live cursor position over the canvas, written by canvas.js
    pointerY: 0,
    aiExportOpen: false, // AI Export modal visibility
    aiExportRoomIds: [], // room ids selected for AI export (multi-select)
    aiExportStylePreset: 'Modern Minimalist', // 'Industrial' | 'Scandinavian' | 'Modern Minimalist' | 'Custom'
    aiExportCustomStyle: '', // free-text style, used when aiExportStylePreset === 'Custom'
    aiExportViewRoomId: null, // which room's individual tab is showing when 2+ rooms selected (null = Combined)
    aiExportTab: 'png', // 'png' | 'prompt' | 'json'
  },
});

// Seed from the wall clock so IDs never collide across sessions: rooms restored
// from a previous session always carry smaller (earlier-timestamp) IDs than any
// room created now. The uniqueness guard is a belt-and-braces check against the
// current in-memory rooms.
let nextRoomId = Date.now();
window.appState.createRoomId = () => {
  let id;
  do { id = `room-${nextRoomId++}`; } while (window.appState.rooms.some((r) => r.id === id));
  return id;
};

let nextFurnitureId = Date.now();
window.appState.createFurnitureId = () => {
  let id;
  do { id = `furn-${nextFurnitureId++}`; } while (window.appState.furniture.some((f) => f.id === id));
  return id;
};

let nextFixtureId = Date.now();
window.appState.createFixtureId = () => {
  let id;
  do { id = `fix-${nextFixtureId++}`; } while (window.appState.fixtures.some((f) => f.id === id));
  return id;
};

let nextElectricalId = Date.now();
window.appState.createElectricalId = () => {
  let id;
  do { id = `sock-${nextElectricalId++}`; } while (window.appState.electricals.some((e) => e.id === id));
  return id;
};

let nextStickyNoteId = Date.now();
window.appState.createStickyNoteId = () => {
  let id;
  do { id = `note-${nextStickyNoteId++}`; } while (window.appState.stickyNotes.some((n) => n.id === id));
  return id;
};
