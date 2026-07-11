// Bottom-right minimap for the infinite canvas.
//
// The canvas has no fixed bounds, so the minimap can't show "everything".
// Following Miro / tldraw: the area it represents is the UNION of the bounding
// box of all rooms and the current viewport, plus a small margin. So it always
// shows your content and a rectangle marking where you're looking; pan far into
// empty space and the represented area grows to keep your viewport in view.
// Click or drag inside the minimap to recentre the main canvas.
(function initMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const CSS_W = 180, CSS_H = 130, PAD = 0.08;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CSS_W * dpr;
  canvas.height = CSS_H * dpr;
  canvas.style.width = CSS_W + 'px';
  canvas.style.height = CSS_H + 'px';
  ctx.scale(dpr, dpr);

  const cmToPx = (cm) => cm * window.BASE_SCALE;

  // last-used mapping (represented bounds → minimap px), for hit-testing clicks
  let map = null;

  function viewportWorld() {
    const s = window.stage.scaleX();
    return {
      x0: -window.stage.x() / s,
      y0: -window.stage.y() / s,
      x1: (-window.stage.x() + window.stage.width()) / s,
      y1: (-window.stage.y() + window.stage.height()) / s,
    };
  }

  function draw() {
    const rooms = window.appState.rooms;
    const mode = window.appState.ui.mode;
    // In elevation mode window.stage is a completely different coordinate
    // frame (wall-local u/height, or room-relative x/y) — it doesn't
    // correspond to a floor-plan viewport at all, so don't fold it into the
    // represented bounds or draw it as a rectangle; just fit all rooms.
    const vp = mode === 'floorplan' ? viewportWorld() : null;

    let x0, y0, x1, y1;
    if (vp) {
      x0 = vp.x0; y0 = vp.y0; x1 = vp.x1; y1 = vp.y1;
    } else if (rooms.length) {
      x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
    } else {
      x0 = 0; y0 = 0; x1 = 1; y1 = 1;
    }
    // union of content bounds + viewport (all in world px)
    rooms.forEach((r) => {
      x0 = Math.min(x0, cmToPx(r.x));
      y0 = Math.min(y0, cmToPx(r.y));
      x1 = Math.max(x1, cmToPx(r.x + r.w));
      y1 = Math.max(y1, cmToPx(r.y + r.h));
    });
    let repW = Math.max(x1 - x0, 1);
    let repH = Math.max(y1 - y0, 1);
    // margin
    x0 -= repW * PAD; x1 += repW * PAD; y0 -= repH * PAD; y1 += repH * PAD;
    repW = x1 - x0; repH = y1 - y0;

    // fit represented area into the minimap, preserving aspect ratio
    const scale = Math.min(CSS_W / repW, CSS_H / repH);
    const drawW = repW * scale, drawH = repH * scale;
    const ox = (CSS_W - drawW) / 2, oy = (CSS_H - drawH) / 2;
    map = { x0, y0, scale, ox, oy };

    const wx = (px) => ox + (px - x0) * scale;
    const wy = (py) => oy + (py - y0) * scale;

    ctx.clearRect(0, 0, CSS_W, CSS_H);
    ctx.fillStyle = '#F5F0E8';
    ctx.fillRect(0, 0, CSS_W, CSS_H);

    // rooms
    rooms.forEach((r) => {
      const rx = wx(cmToPx(r.x)), ry = wy(cmToPx(r.y));
      const rw = cmToPx(r.w) * scale, rh = cmToPx(r.h) * scale;
      ctx.fillStyle = r.color;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#2C2416';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(rx, ry, rw, rh);
    });

    if (mode === 'floorplan') {
      // viewport rectangle
      const vx = wx(vp.x0), vy = wy(vp.y0);
      const vw = (vp.x1 - vp.x0) * scale, vh = (vp.y1 - vp.y0) * scale;
      ctx.fillStyle = 'rgba(193,127,59,0.12)';
      ctx.fillRect(vx, vy, vw, vh);
      ctx.strokeStyle = '#C17F3B';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx, vy, vw, vh);
    } else {
      drawElevationOverlay(wx, wy, scale);
    }
  }

  // Elevation mode: keep the SAME minimap (all rooms in their real relative
  // positions) rather than swapping in an isolated diagram — per architectural
  // drawing convention (an "elevation marker": an arrow on the floor plan
  // itself pointing at the wall being elevated), so the user can still see
  // which neighbouring room lies beyond that wall. Current room highlighted;
  // a wall view additionally gets an arrow at the wall's midpoint pointing
  // inward. Ceiling/Floor have no single wall to point at, so just the room
  // highlight, per the shape of the view (whole-room top-down).
  function drawElevationOverlay(wx, wy, scale) {
    const room = window.appState.rooms.find((r) => r.id === window.appState.ui.currentRoomId);
    if (!room) return;
    const rx = wx(cmToPx(room.x)), ry = wy(cmToPx(room.y));
    const rw = cmToPx(room.w) * scale, rh = cmToPx(room.h) * scale;
    ctx.fillStyle = 'rgba(193,127,59,0.28)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#C17F3B';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    const view = window.appState.ui.currentElevation;
    if (!view || view === 'ceiling' || view === 'floor') return;
    if (!window.roomWallsFor || !window.inwardNormalFor) return;
    const wall = window.roomWallsFor(room).find((w) => w.id === view);
    if (!wall) return;
    const inward = window.inwardNormalFor(wall, room);
    const midX = wx(cmToPx((wall.x1 + wall.x2) / 2)), midY = wy(cmToPx((wall.y1 + wall.y2) / 2));
    const baseX = midX - inward.x * 3, baseY = midY - inward.y * 3;
    const tipX = midX + inward.x * 13, tipY = midY + inward.y * 13;
    ctx.strokeStyle = '#C17F3B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    const angle = Math.atan2(inward.y, inward.x);
    const headLen = 5.5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = '#C17F3B';
    ctx.fill();
  }
  window.redrawMinimap = draw;

  // minimap px → world px, then recentre the main canvas there
  function navigateTo(mmX, mmY) {
    if (!map) return;
    const worldX = map.x0 + (mmX - map.ox) / map.scale;
    const worldY = map.y0 + (mmY - map.oy) / map.scale;
    window.centerOn(worldX, worldY);
  }

  let dragging = false;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    navigateTo(e.offsetX, e.offsetY);
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    navigateTo(e.clientX - rect.left, e.clientY - rect.top);
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  // redraw when rooms change (pan/zoom redraws come via canvas.js redrawAll),
  // or when the elevation-mode overlay's own inputs change
  Vue.watch(
    () => [
      window.appState.rooms.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}:${r.color}`).join(','),
      window.appState.ui.mode,
      window.appState.ui.currentRoomId,
      window.appState.ui.currentElevation,
    ],
    draw,
    { immediate: true }
  );

  draw();
})();
