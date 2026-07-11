// Generic "any two of three" solver, shared by:
//  - vertical height (heightFromFloor / objectHeight / distanceFromCeiling),
//    persisted per item via the `heightOrder` field (furniture/fixtures/electricals)
//  - horizontal position in elevation mode (left / right / width along the
//    current wall), kept transient in the panel component instead of on the
//    item, since its meaning depends on which wall/view is active
//
// No lock icon: the two most recently EDITED keys are treated as the user's
// intent, and the key that hasn't been touched in the longest time is the one
// recomputed. `orderState` is the array of the 3 keys, most-recently-edited
// first — callers own where it lives (an item field for vertical, a Vue ref
// for horizontal) and pass it in/read it back rather than this function
// managing storage itself.
window.recomputeTriple = function recomputeTriple(target, orderField, keys, total, editedKey) {
  if (!Array.isArray(target[orderField]) || target[orderField].length !== 3) {
    target[orderField] = [...keys];
  }
  if (editedKey) {
    target[orderField] = [editedKey, ...target[orderField].filter((k) => k !== editedKey)];
  }
  const [a, b, staleKey] = target[orderField];
  target[staleKey] = Math.max(0, Math.round(total - target[a] - target[b]));
};
