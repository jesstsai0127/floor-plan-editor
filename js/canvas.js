// Konva stage setup: infinite pannable/zoomable canvas with a dynamically
// redrawn grid. 1 cm = BASE_SCALE px in stage-local (unscaled) coordinates;
// stage.scale() handles zoom uniformly for grid + every shape drawn on top.
window.BASE_SCALE = 0.4;

(function initCanvas() {
  const container = document.getElementById('konva-container');

  const stage = new Konva.Stage({
    container: 'konva-container',
    width: container.clientWidth,
    height: container.clientHeight,
    // Not draggable by default: an empty-canvas drag is now rubber-band select
    // (room.js). Panning is Space+drag, which room.js toggles on/off.
    draggable: false,
  });
  window.stage = stage;

  const gridLayer = new Konva.Layer({ listening: false });
  const roomsLayer = new Konva.Layer();
  const furnitureLayer = new Konva.Layer();
  const fixturesLayer = new Konva.Layer(); // openings (doors/windows)
  const electricalsLayer = new Konva.Layer(); // sockets
  stage.add(gridLayer);
  stage.add(roomsLayer);
  stage.add(furnitureLayer);
  stage.add(fixturesLayer);
  stage.add(electricalsLayer);
  window.gridLayer = gridLayer;
  window.roomsLayer = roomsLayer;
  window.furnitureLayer = furnitureLayer;
  window.fixturesLayer = fixturesLayer;
  window.electricalsLayer = electricalsLayer;

  // live cursor position, in cm — written here (not in the Vue app) so it
  // works regardless of when/whether the Vue app has mounted
  stage.on('mousemove', () => {
    const p = stage.getPointerPosition();
    if (!p) return;
    const scale = stage.scaleX();
    window.appState.ui.pointerX = Math.round((p.x - stage.x()) / scale / window.BASE_SCALE);
    window.appState.ui.pointerY = Math.round((p.y - stage.y()) / scale / window.BASE_SCALE);
  });

  function redrawGrid() {
    gridLayer.destroyChildren();
    if (!window.appState.settings.gridVisible) {
      gridLayer.batchDraw();
      return;
    }
    const scale = stage.scaleX();
    const spacing = window.appState.settings.gridSizeCm * window.BASE_SCALE;
    if (spacing * scale < 4) { gridLayer.batchDraw(); return; } // avoid a wall of lines when zoomed way out

    const viewX0 = -stage.x() / scale;
    const viewY0 = -stage.y() / scale;
    const viewX1 = viewX0 + stage.width() / scale;
    const viewY1 = viewY0 + stage.height() / scale;
    const startX = Math.floor(viewX0 / spacing) * spacing;
    const startY = Math.floor(viewY0 / spacing) * spacing;

    for (let x = startX; x <= viewX1; x += spacing) {
      gridLayer.add(new Konva.Line({
        points: [x, viewY0, x, viewY1],
        stroke: window.appState.settings.gridColor,
        strokeWidth: 1 / scale,
      }));
    }
    for (let y = startY; y <= viewY1; y += spacing) {
      gridLayer.add(new Konva.Line({
        points: [viewX0, y, viewX1, y],
        stroke: window.appState.settings.gridColor,
        strokeWidth: 1 / scale,
      }));
    }
    gridLayer.batchDraw();
  }
  window.redrawGrid = redrawGrid;

  function redrawRulers() {
    const scale = stage.scaleX();
    const spacing = window.appState.settings.gridSizeCm * window.BASE_SCALE;
    const hEl = document.querySelector('.ruler-h');
    const vEl = document.querySelector('.ruler-v');
    hEl.innerHTML = '';
    vEl.innerHTML = '';
    if (spacing * scale < 20) return; // labels would collide, skip

    const viewX0 = -stage.x() / scale;
    const viewX1 = viewX0 + stage.width() / scale;
    const viewY0 = -stage.y() / scale;
    const viewY1 = viewY0 + stage.height() / scale;
    const startX = Math.floor(viewX0 / spacing) * spacing;
    const startY = Math.floor(viewY0 / spacing) * spacing;

    for (let x = startX; x <= viewX1; x += spacing) {
      const screenX = x * scale + stage.x();
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;left:${screenX}px;bottom:1px`;
      span.textContent = Math.round(x / window.BASE_SCALE);
      hEl.appendChild(span);
    }
    for (let y = startY; y <= viewY1; y += spacing) {
      const screenY = y * scale + stage.y();
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;right:2px;top:${screenY}px`;
      span.textContent = Math.round(y / window.BASE_SCALE);
      vEl.appendChild(span);
    }
  }
  window.redrawRulers = redrawRulers;

  function redrawAll() {
    redrawGrid();
    redrawRulers();
    if (window.redrawMinimap) window.redrawMinimap();
  }
  window.redrawCanvas = redrawAll;

  // recentre the viewport on a world-px point (used by the minimap)
  window.centerOn = function centerOn(worldX, worldY) {
    const scale = stage.scaleX();
    stage.position({ x: stage.width() / 2 - worldX * scale, y: stage.height() / 2 - worldY * scale });
    redrawAll();
  };

  stage.on('dragmove', redrawAll);

  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    let newScale = direction > 0 ? oldScale * 1.08 : oldScale / 1.08;
    newScale = Math.max(0.1, Math.min(5, newScale));
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
    window.appState.ui.zoomFactor = newScale;
    redrawAll();
  });

  window.setZoom = function setZoom(newScale) {
    newScale = Math.max(0.1, Math.min(5, newScale));
    const center = { x: stage.width() / 2, y: stage.height() / 2 };
    const oldScale = stage.scaleX();
    const worldCenter = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - worldCenter.x * newScale,
      y: center.y - worldCenter.y * newScale,
    });
    window.appState.ui.zoomFactor = newScale;
    redrawAll();
  };

  window.addEventListener('resize', () => {
    stage.width(container.clientWidth);
    stage.height(container.clientHeight);
    redrawAll();
  });

  // grid settings are edited from the Settings modal, not by panning/zooming —
  // redrawGrid() above is only invoked from stage events, so it needs its own watch.
  Vue.watch(
    () => [window.appState.settings.gridSizeCm, window.appState.settings.gridColor, window.appState.settings.gridVisible],
    redrawAll
  );

  // Fit all rooms into view (with a margin). Empty canvas → centre the world
  // origin at 100%. Called on load and reusable as a "reset / fit to content"
  // action.
  window.fitToContent = function fitToContent() {
    const rooms = window.appState.rooms;
    if (!rooms.length) {
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: stage.width() / 2, y: stage.height() / 2 });
      window.appState.ui.zoomFactor = 1;
      redrawAll();
      return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rooms.forEach((r) => {
      const rx = r.x * window.BASE_SCALE, ry = r.y * window.BASE_SCALE;
      x0 = Math.min(x0, rx); y0 = Math.min(y0, ry);
      x1 = Math.max(x1, rx + r.w * window.BASE_SCALE);
      y1 = Math.max(y1, ry + r.h * window.BASE_SCALE);
    });
    const PAD = 0.12; // 12% margin around content
    const bw = (x1 - x0) * (1 + 2 * PAD);
    const bh = (y1 - y0) * (1 + 2 * PAD);
    let scale = Math.min(stage.width() / bw, stage.height() / bh);
    scale = Math.max(0.1, Math.min(5, scale));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    stage.scale({ x: scale, y: scale });
    stage.position({ x: stage.width() / 2 - cx * scale, y: stage.height() / 2 - cy * scale });
    window.appState.ui.zoomFactor = scale;
    redrawAll();
  };

  window.fitToContent();
})();
