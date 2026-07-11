// localStorage autosave. Persists every entity array — rooms, furniture,
// fixtures (openings), electricals (sockets) — plus settings/layers.
(function initStorage() {
  const STORAGE_KEY = 'floorPlanEditor.autosave.v1';
  let saveTimer = null;

  function snapshotState() {
    return {
      settings: window.appState.settings,
      rooms: window.appState.rooms,
      furniture: window.appState.furniture,
      fixtures: window.appState.fixtures,
      electricals: window.appState.electricals,
      layers: window.appState.layers,
    };
  }

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

  window.restoreAutosave = function restoreAutosave() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return false;
    }
    if (!raw) return false;
    try {
      const snapshot = JSON.parse(raw);
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
      if (snapshot.layers) {
        snapshot.layers.forEach((saved) => {
          const layer = window.appState.layers.find((l) => l.id === saved.id);
          if (layer) Object.assign(layer, saved);
        });
      }
      return true;
    } catch (e) {
      console.warn('Autosave restore failed:', e);
      return false;
    }
  };

  window.appState.lastSavedAt = null;

  Vue.watch(() => JSON.stringify(snapshotState()), scheduleSave);
})();
