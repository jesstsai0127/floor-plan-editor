// Undo/redo. Per Konva's own recommended pattern (konvajs.org/docs/vue/
// Undo-Redo.html): don't serialize the Konva node tree, keep a plain
// app-state history stack + a step pointer, and only push a snapshot at
// "action complete" moments (their example: dragend), not continuously.
//
// This app already only writes to appState at commit points — every drag
// module (room.js/furniture.js/electricals.js/fixtures.js) moves the Konva
// node directly during dragmove and writes item.x/y back to Vue state only
// on dragend — so watching window.snapshotState() (storage.js) already
// fires exactly at those commit points. No extra debounce needed here.
(function initHistory() {
  const MAX_HISTORY = 100;
  let stack = [JSON.stringify(window.snapshotState())];
  let step = 0;
  let restoring = false;

  Vue.watch(
    () => JSON.stringify(window.snapshotState()),
    (snap) => {
      if (restoring) return;
      if (snap === stack[step]) return; // e.g. settings-only churn that round-trips to the same value
      stack = stack.slice(0, step + 1);
      stack.push(snap);
      if (stack.length > MAX_HISTORY) stack.shift();
      else step += 1;
      window.appState.ui.historyStep = step;
      window.appState.ui.historyLength = stack.length;
    }
  );

  window.appState.ui.historyStep = 0;
  window.appState.ui.historyLength = 1;

  function goTo(newStep) {
    if (newStep < 0 || newStep >= stack.length) return;
    restoring = true;
    window.applySnapshot(JSON.parse(stack[newStep]));
    step = newStep;
    window.appState.ui.historyStep = step;
    window.appState.ui.selectedIds = [];
    Vue.nextTick(() => { restoring = false; });
  }

  window.undo = function undo() { goTo(step - 1); };
  window.redo = function redo() { goTo(step + 1); };

  // Wipes every entity array (rooms/furniture/fixtures/electricals) back to
  // empty. Used by both the "Clear canvas" and "New" buttons — this app has
  // no multi-project concept, so those two are the same action under
  // different labels rather than two separately-maintained code paths.
  window.clearCanvas = function clearCanvas() {
    if (!window.confirm(window.t('topbar.clearConfirm'))) return;
    window.appState.rooms.splice(0);
    window.appState.furniture.splice(0);
    window.appState.fixtures.splice(0);
    window.appState.electricals.splice(0);
    window.appState.ui.selectedIds = [];
  };
})();
