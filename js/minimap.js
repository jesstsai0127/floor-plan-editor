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
    const vp = viewportWorld();

    // union of content bounds + viewport (all in world px)
    let x0 = vp.x0, y0 = vp.y0, x1 = vp.x1, y1 = vp.y1;
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

    // viewport rectangle
    const vx = wx(vp.x0), vy = wy(vp.y0);
    const vw = (vp.x1 - vp.x0) * scale, vh = (vp.y1 - vp.y0) * scale;
    ctx.fillStyle = 'rgba(193,127,59,0.12)';
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = '#C17F3B';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);
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

  // redraw when rooms change (pan/zoom redraws come via canvas.js redrawAll)
  Vue.watch(
    () => window.appState.rooms.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}:${r.color}`).join(','),
    draw,
    { immediate: true }
  );

  draw();
})();
