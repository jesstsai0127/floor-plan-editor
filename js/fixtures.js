// Openings (doors/windows, merged into one "Openings" tool per the approved
// mockup — type is switched in the property panel) on fixturesLayer.
// Unlike furniture/electricals (free x,y position), an opening MUST be
// embedded in a wall — physically it's a hole in the wall structure — so its
// position is (roomId, wallId, posOnWall) along that wall's length, not x,y.
// Walls are derived from each room's own shape (4 edges for a rect, 3 for a
// right-triangle) rather than being separate stored objects.
(function initFixtures() {
  const UI = () => window.appState.ui;
  const cmToPx = (cm) => cm * window.BASE_SCALE;
  const pxToCm = (px) => px / window.BASE_SCALE;

  const PRESETS = {
    door: { width: 90, heightFromFloor: 0, objectHeight: 210 },
    window: { width: 100, heightFromFloor: 90, objectHeight: 120 },
  };

  // ── wall geometry (derived from room shape, not stored) ─────────────────
  function roomWalls(room) {
    if (room.shape === 'triangle') {
      return [
        { id: 'top', x1: room.x, y1: room.y, x2: room.x + room.w, y2: room.y },
        { id: 'hyp', x1: room.x + room.w, y1: room.y, x2: room.x, y2: room.y + room.h },
        { id: 'left', x1: room.x, y1: room.y + room.h, x2: room.x, y2: room.y },
      ];
    }
    return [
      { id: 'top', x1: room.x, y1: room.y, x2: room.x + room.w, y2: room.y },
      { id: 'right', x1: room.x + room.w, y1: room.y, x2: room.x + room.w, y2: room.y + room.h },
      { id: 'bottom', x1: room.x + room.w, y1: room.y + room.h, x2: room.x, y2: room.y + room.h },
      { id: 'left', x1: room.x, y1: room.y + room.h, x2: room.x, y2: room.y },
    ];
  }
  function wallLength(wall) { return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1); }
  function wallOf(roomId, wallId) {
    const room = window.appState.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    return roomWalls(room).find((w) => w.id === wallId) || null;
  }
  // perpendicular pointing INTO the room, found generically (works for any
  // room shape) by picking whichever of the two perpendiculars points toward
  // the room's own centroid, rather than hardcoding per wall.
  function inwardNormal(wall, room) {
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const midX = (wall.x1 + wall.x2) / 2, midY = (wall.y1 + wall.y2) / 2;
    const cx = room.shape === 'triangle' ? room.x + room.w / 3 : room.x + room.w / 2;
    const cy = room.shape === 'triangle' ? room.y + room.h / 3 : room.y + room.h / 2;
    const dot = nx * (cx - midX) + ny * (cy - midY);
    return dot >= 0 ? { x: nx, y: ny } : { x: -nx, y: -ny };
  }
  // nearest point on a segment to (px,py), plus how far along it (0..len, cm)
  function projectOnWall(px, py, wall) {
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - wall.x1) * dx + (py - wall.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const len = Math.sqrt(len2);
    return { x: wall.x1 + t * dx, y: wall.y1 + t * dy, distAlong: t * len, dist: Math.hypot(px - (wall.x1 + t * dx), py - (wall.y1 + t * dy)) };
  }
  // nearest wall (across every room) to a world point
  function nearestWall(px, py) {
    let best = null;
    window.appState.rooms.forEach((room) => {
      roomWalls(room).forEach((wall) => {
        const proj = projectOnWall(px, py, wall);
        // bug fixed: was comparing against best.dist, which doesn't exist on
        // this object (the real value is nested at best.proj.dist) — any
        // comparison against undefined is always false, so `best` silently
        // locked onto the very first room/wall checked and never updated
        // again regardless of actual distance.
        if (!best || proj.dist < best.proj.dist) best = { room, wall, proj };
      });
    });
    return best;
  }
  // exposed so electricals.js can snap sockets flush against a nearby wall
  // (a wall-mounted device shouldn't sit centred on the wall line — half its
  // footprint would then fall outside the room and fail containment)
  window.nearestWallGeometry = nearestWall;
  window.inwardNormalFor = inwardNormal;

  // Shared reposition logic — used by both canvas drag and direct panel edits
  // of "distance from wall start", so both paths get the same clamping +
  // overlap validation (a door/window can jump to a different wall, same as
  // dragging it there; width never changes).
  function repositionFixture(f, xCm, yCm) {
    const nearest = nearestWall(xCm, yCm);
    if (!nearest) return false;
    const len = wallLength(nearest.wall);
    if (len < f.width) return false;
    const pos = clampPosOnWall(len, f.width, nearest.proj.distAlong - f.width / 2);
    if (overlapsExisting(nearest.room.id, nearest.wall.id, pos, f.width, f.id)) return false;
    f.roomId = nearest.room.id;
    f.wallId = nearest.wall.id;
    f.posOnWall = Math.round(pos);
    return true;
  }
  // panel's "distance from wall start" field calls this directly — clamps to
  // the CURRENT wall's valid range and rejects overlaps, instead of accepting
  // any number the user types.
  window.setFixturePosOnWall = function setFixturePosOnWall(id, desiredPos) {
    const f = fixtureById(id);
    if (!f) return;
    const wall = wallOf(f.roomId, f.wallId);
    if (!wall) return;
    const len = wallLength(wall);
    const pos = clampPosOnWall(len, f.width, desiredPos);
    if (overlapsExisting(f.roomId, f.wallId, pos, f.width, f.id)) return; // silently ignore — stay at last valid position
    f.posOnWall = Math.round(pos);
  };

  function clampPosOnWall(len, width, pos) { return Math.max(0, Math.min(len - width, pos)); }
  function overlapsExisting(roomId, wallId, posOnWall, width, skipId) {
    return window.appState.fixtures.some((f) => {
      if (f.id === skipId) return false;
      if (f.roomId !== roomId || f.wallId !== wallId) return false;
      return !(posOnWall + width <= f.posOnWall || posOnWall >= f.posOnWall + f.width);
    });
  }

  // used by room.js when validating a candidate room resize: do this room's
  // existing openings still fit on their (possibly now-shorter) walls?
  window.isFixturesStillValidForRoom = function isFixturesStillValidForRoom(roomId, candidateRoom) {
    const mine = window.appState.fixtures.filter((f) => f.roomId === roomId);
    if (!mine.length) return true;
    return mine.every((f) => {
      const wall = roomWalls(candidateRoom).find((w) => w.id === f.wallId);
      if (!wall) return false;
      const len = wallLength(wall);
      return f.posOnWall >= 0 && f.posOnWall + f.width <= len + 0.02;
    });
  };

  // ── rendering ────────────────────────────────────────────────────────────
  const groupById = {};

  function render() {
    const layer = window.fixturesLayer;
    layer.destroyChildren();
    Object.keys(groupById).forEach((k) => delete groupById[k]);

    window.appState.fixtures.forEach((f) => {
      const wall = wallOf(f.roomId, f.wallId);
      if (!wall) return; // room/wall vanished (room deleted) — nothing to draw
      const room = window.appState.rooms.find((r) => r.id === f.roomId);
      const len = wallLength(wall);
      const ux = (wall.x2 - wall.x1) / len, uy = (wall.y2 - wall.y1) / len; // unit vector along wall
      const p0 = { x: wall.x1 + ux * f.posOnWall, y: wall.y1 + uy * f.posOnWall };
      const p1 = { x: wall.x1 + ux * (f.posOnWall + f.width), y: wall.y1 + uy * (f.posOnWall + f.width) };
      const inward = inwardNormal(wall, room);

      const group = new Konva.Group({ listening: true });
      groupById[f.id] = group;
      const isSelected = UI().selectedIds.includes(f.id);
      const strokeW = isSelected ? 3 : 2;

      if (f.type === 'window') {
        // drawn thicker than the wall itself (wallThickness + 5cm) so it
        // visibly protrudes on both faces instead of blending into the wall
        // stroke and becoming hard to click
        const windowThicknessPx = cmToPx(window.appState.settings.wallThickness + 5);
        group.add(new Konva.Line({
          points: [cmToPx(p0.x), cmToPx(p0.y), cmToPx(p1.x), cmToPx(p1.y)],
          stroke: isSelected ? '#C17F3B' : '#4A7FA5', strokeWidth: windowThicknessPx,
          hitStrokeWidth: 14, name: 'fixtureShape',
        }));
      } else {
        // door: a light gap segment + swing-arc opening into the room
        // (reuses the leaf-line + dashed-arc convention from the approved mockup)
        group.add(new Konva.Line({
          points: [cmToPx(p0.x), cmToPx(p0.y), cmToPx(p1.x), cmToPx(p1.y)],
          stroke: '#F5F0E8', strokeWidth: strokeW * 2.4, name: 'fixtureShape', hitStrokeWidth: 14,
        }));
        const hingeX = cmToPx(p0.x), hingeY = cmToPx(p0.y);
        const leafX = hingeX + inward.x * cmToPx(f.width), leafY = hingeY + inward.y * cmToPx(f.width);
        group.add(new Konva.Line({
          points: [hingeX, hingeY, leafX, leafY],
          stroke: isSelected ? '#C17F3B' : '#2C2416', strokeWidth: 1.5, listening: false,
        }));
        const scale = window.stage.scaleX();
        const radiusPx = cmToPx(f.width);
        // dashed quarter-circle from the open leaf end to the far jamb, swept
        // around the hinge — sweep direction picked so it curves through the
        // inward side rather than through the wall.
        const cross = ux * inward.y - uy * inward.x;
        const sweep = cross >= 0 ? 1 : 0;
        group.add(new Konva.Path({
          data: `M${leafX},${leafY} A${radiusPx},${radiusPx} 0 0 ${sweep} ${cmToPx(p1.x)},${cmToPx(p1.y)}`,
          stroke: isSelected ? '#C17F3B' : '#4A7FA5', strokeWidth: 1 / scale, dash: [4 / scale, 3 / scale], listening: false,
        }));
      }

      group.on('click tap', (e) => {
        if (window.consumeClickSuppression()) return;
        if (UI().activeTool !== 'select') return;
        e.cancelBubble = true;
        const additive = e.evt && (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey);
        if (additive) {
          const set = new Set(UI().selectedIds);
          if (set.has(f.id)) set.delete(f.id); else set.add(f.id);
          UI().selectedIds = Array.from(set);
        } else {
          UI().selectedIds = [f.id];
        }
      });
      // press-drag to slide along the wall (or jump to a different wall
      // entirely) — matches how SmartDraw/RoomSketcher/Visio/Lucidchart all
      // let you drag a door/window and have it glue to whichever wall you
      // drag it onto. Width never changes, only roomId/wallId/posOnWall.
      group.on('mousedown touchstart', (e) => {
        if (UI().activeTool !== 'select') return;
        if (window.isSpaceHeld()) return;
        e.cancelBubble = true;
        UI().selectedIds = [f.id];
        draggingFixtureId = f.id;
      });
      group.on('mouseover', () => {
        if (UI().activeTool !== 'select') return;
        window.showTooltip(`${f.name}\n${f.width} cm`);
        window.stage.container().style.cursor = 'pointer';
      });
      group.on('mouseout', () => {
        window.hideTooltip();
        window.stage.container().style.cursor = 'default';
      });

      layer.add(group);
    });

    layer.batchDraw();
  }
  window.renderFixtures = render;

  const fixtureById = (id) => window.appState.fixtures.find((f) => f.id === id);

  function commitFixture(px, py, type) {
    const nearest = nearestWall(px, py);
    if (!nearest) return null; // no rooms exist yet
    const preset = PRESETS[type];
    const len = wallLength(nearest.wall);
    if (len < preset.width) return null; // wall too short for this opening
    const pos = clampPosOnWall(len, preset.width, nearest.proj.distAlong - preset.width / 2);
    if (overlapsExisting(nearest.room.id, nearest.wall.id, pos, preset.width, null)) return null;

    const id = window.appState.createFixtureId();
    window.appState.fixtures.push({
      id,
      name: window.t('fixtures.' + type) + ' ' + (window.appState.fixtures.length + 1),
      type,
      roomId: nearest.room.id,
      wallId: nearest.wall.id,
      posOnWall: Math.round(pos),
      width: preset.width,
      heightFromFloor: preset.heightFromFloor,
      objectHeight: preset.objectHeight,
    });
    UI().selectedIds = [id];
    UI().activeTool = 'select';
    return id;
  }

  window.deleteFixture = function deleteFixture(id) {
    const idx = window.appState.fixtures.findIndex((f) => f.id === id);
    if (idx >= 0) window.appState.fixtures.splice(idx, 1);
    UI().selectedIds = UI().selectedIds.filter((s) => s !== id);
  };

  window.registerInteractionProvider({
    idPrefix: 'fix',
    stops() { return { V: [], H: [] }; }, // openings don't contribute free-drag snap targets (they're wall-locked)
    boxes() {
      // rough AABB per opening, for rubber-band hit-testing
      return window.appState.fixtures.map((f) => {
        const wall = wallOf(f.roomId, f.wallId);
        if (!wall) return { id: f.id, x: 0, y: 0, w: 0, h: 0 };
        const len = wallLength(wall) || 1;
        const ux = (wall.x2 - wall.x1) / len, uy = (wall.y2 - wall.y1) / len;
        const p0 = { x: wall.x1 + ux * f.posOnWall, y: wall.y1 + uy * f.posOnWall };
        const p1 = { x: wall.x1 + ux * (f.posOnWall + f.width), y: wall.y1 + uy * (f.posOnWall + f.width) };
        return {
          id: f.id,
          x: cmToPx(Math.min(p0.x, p1.x)) - 4, y: cmToPx(Math.min(p0.y, p1.y)) - 4,
          w: cmToPx(Math.abs(p1.x - p0.x)) + 8, h: cmToPx(Math.abs(p1.y - p0.y)) + 8,
        };
      });
    },
    entity: fixtureById,
    deleteMany(ids) {
      const set = new Set(ids);
      window.appState.fixtures.splice(0, window.appState.fixtures.length, ...window.appState.fixtures.filter((f) => !set.has(f.id)));
    },
  });

  // ── placement: click/drag near a wall, continuously re-snapping to
  // whichever wall is nearest the current pointer ────────────────────────
  let placingType = null;
  // ── dragging an EXISTING fixture: set by the per-fixture mousedown above.
  // No separate "revert" state needed — repositionFixture() only ever writes
  // a valid position (no-op otherwise), so the fixture is never in an invalid
  // state to revert from.
  let draggingFixtureId = null;

  window.stage.on('mousedown touchstart', () => {
    if (window.isSpaceHeld()) return;
    const tool = UI().activeTool;
    if (tool !== 'fixture-door' && tool !== 'fixture-window') return;
    placingType = tool === 'fixture-door' ? 'door' : 'window';
  });

  window.stage.on('mousemove touchmove', () => {
    if (!placingType && !draggingFixtureId) return;
    const p = window.worldPointer(); // world PX — nearestWall()/commitFixture() work in cm, same units as room.x/y
    if (!p) return;
    const xCm = pxToCm(p.x), yCm = pxToCm(p.y);

    if (draggingFixtureId) {
      window.hideTooltip();
      const f = fixtureById(draggingFixtureId);
      if (f) repositionFixture(f, xCm, yCm); // no-op (stays put) if the candidate spot is invalid
      return;
    }

    const nearest = nearestWall(xCm, yCm);
    window.clearGuides();
    if (!nearest) return;
    const preset = PRESETS[placingType];
    const len = wallLength(nearest.wall);
    const pos = clampPosOnWall(len, preset.width, nearest.proj.distAlong - preset.width / 2);
    const ux = (nearest.wall.x2 - nearest.wall.x1) / len, uy = (nearest.wall.y2 - nearest.wall.y1) / len;
    const gx = nearest.wall.x1 + ux * pos, gy = nearest.wall.y1 + uy * pos;
    window.drawGuides(cmToPx(gx), cmToPx(gy)); // reuse guide lines as a crosshair at the snapped point
  });

  window.stage.on('mouseup touchend', () => {
    if (draggingFixtureId) {
      draggingFixtureId = null;
      window.suppressNextCanvasClick();
      return;
    }
    if (!placingType) return;
    const p = window.worldPointer(); // world PX — convert to cm before geometry math
    const type = placingType;
    placingType = null;
    window.clearGuides();
    if (!p) return;
    const id = commitFixture(pxToCm(p.x), pxToCm(p.y), type);
    if (id) {
      window.suppressNextCanvasClick();
    } else {
      window.showTooltip(window.t('fixtures.noWall'));
      setTimeout(window.hideTooltip, 1000);
    }
  });

  Vue.watch(
    () => [
      window.appState.fixtures.map((f) => `${f.id}:${f.roomId}:${f.wallId}:${f.posOnWall}:${f.width}:${f.type}:${f.name}`).join(','),
      window.appState.rooms.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}:${r.shape}`).join(','), // walls move with the room
      window.appState.ui.selectedIds.join(','),
      window.appState.ui.zoomFactor,
    ],
    render,
    { immediate: true }
  );

  Vue.watch(
    () => window.appState.layers.find((l) => l.id === 'fixtures').visible,
    (visible) => { window.fixturesLayer.visible(visible); window.fixturesLayer.batchDraw(); }
  );
})();
