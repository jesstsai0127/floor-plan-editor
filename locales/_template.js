// TEMPLATE — not loaded by index.html, not a real locale.
// Copy this file to locales/<BCP47-code>.js (e.g. locales/ja-JP.js) and
// replace every 'TRANSLATE_ME: ...' value. Full procedure: locales/AGENTS.md
//
// Every value below is 'TRANSLATE_ME: <English source text>' so a partial
// translation is grep-able: `grep -c TRANSLATE_ME locales/<code>.js` must
// return 0 before the file is done.
window.LOCALES = window.LOCALES || {};
window.LOCALES['REPLACE-WITH-BCP47-CODE'] = {
  // Reserved key: this language's own native name, shown in the language
  // dropdown regardless of which language is currently active. Not read by
  // t() anywhere else. E.g. Japanese -> '日本語', German -> 'Deutsch'.
  '_langName': 'TRANSLATE_ME: <native name of this language, not the English name>',

  // top bar
  'mode.floorplan': 'TRANSLATE_ME: Floor Plan',
  'mode.elevation': 'TRANSLATE_ME: Elevation',
  'topbar.new': 'TRANSLATE_ME: New',
  'topbar.open': 'TRANSLATE_ME: Open',
  'topbar.save': 'TRANSLATE_ME: Save',
  'topbar.undo': 'TRANSLATE_ME: Undo',
  'topbar.redo': 'TRANSLATE_ME: Redo',
  'topbar.clear': 'TRANSLATE_ME: Clear canvas',
  'topbar.clearConfirm': 'TRANSLATE_ME: Clear the whole canvas? You can undo this afterward.',
  'topbar.openConfirm': 'TRANSLATE_ME: Load this file? It will replace everything currently on the canvas.',
  'topbar.openInvalidFile': 'TRANSLATE_ME: That file doesn’t look like a Floor Plan Editor project (invalid or corrupted JSON).',
  'topbar.aiExport': 'TRANSLATE_ME: AI Export',
  'topbar.export': 'TRANSLATE_ME: Export',
  'topbar.exportJson': 'TRANSLATE_ME: Export JSON (Project File)',
  'topbar.exportPng': 'TRANSLATE_ME: Export PNG (Current View)',
  'topbar.exportPdf': 'TRANSLATE_ME: Export PDF (Current View)',
  'topbar.autosaved': 'TRANSLATE_ME: Auto-saved',
  'zoom.fit': 'TRANSLATE_ME: Fit all rooms in view',

  // left toolbar
  'toolbar.select': 'TRANSLATE_ME: Select',
  'toolbar.room': 'TRANSLATE_ME: Room',
  'toolbar.roomRect': 'TRANSLATE_ME: Rectangle',
  'toolbar.furniture': 'TRANSLATE_ME: Furn',
  'toolbar.catFurniture': 'TRANSLATE_ME: Furniture',
  'toolbar.furnRect': 'TRANSLATE_ME: Rectangle',
  'toolbar.furnCircle': 'TRANSLATE_ME: Circle',
  'toolbar.furnTriangle': 'TRANSLATE_ME: Triangle',
  'toolbar.catStructural': 'TRANSLATE_ME: Structural',
  'toolbar.furnBeam': 'TRANSLATE_ME: Beam',
  'toolbar.catLighting': 'TRANSLATE_ME: Lighting',
  'toolbar.furnCeilingLight': 'TRANSLATE_ME: Ceiling Light',
  'toolbar.furnFloorLamp': 'TRANSLATE_ME: Floor Lamp',
  'toolbar.furnTableLamp': 'TRANSLATE_ME: Table Lamp',
  'toolbar.openings': 'TRANSLATE_ME: Open',
  'toolbar.openingDoor': 'TRANSLATE_ME: Door',
  'toolbar.openingWindow': 'TRANSLATE_ME: Window',
  'toolbar.socket': 'TRANSLATE_ME: Socket',
  'toolbar.note': 'TRANSLATE_ME: Note',

  // right panel — properties
  'panel.properties': 'TRANSLATE_ME: Properties',
  'panel.name': 'TRANSLATE_ME: Name',
  'panel.width': 'TRANSLATE_ME: Width (cm)',
  'panel.depth': 'TRANSLATE_ME: Depth (cm)',
  'panel.height': 'TRANSLATE_ME: Height (cm)',
  'panel.wallThickness': 'TRANSLATE_ME: Wall thickness (cm)',
  'panel.fillColor': 'TRANSLATE_ME: Fill color',
  'panel.position': 'TRANSLATE_ME: Position',
  'panel.nudgeHint': 'TRANSLATE_ME: Arrow keys: nudge 1 cm',
  'panel.rotation': 'TRANSLATE_ME: Rotation',
  'panel.emptyHint': 'TRANSLATE_ME: Pick the Room tool, then drag on the canvas to draw a room. Edges snap to other rooms and the grid. Shift-click or drag a box to select several; hold Space to pan.',
  'panel.roomsSelected': 'TRANSLATE_ME: rooms selected',
  'panel.align': 'TRANSLATE_ME: Align',
  'panel.alignLeft': 'TRANSLATE_ME: Left',
  'panel.alignRight': 'TRANSLATE_ME: Right',
  'panel.alignTop': 'TRANSLATE_ME: Top',
  'panel.alignBottom': 'TRANSLATE_ME: Bottom',
  'panel.alignCenterX': 'TRANSLATE_ME: Center H',
  'panel.alignCenterY': 'TRANSLATE_ME: Center V',
  'panel.deleteAll': 'TRANSLATE_ME: Delete all',

  // layers
  'layers.title': 'TRANSLATE_ME: Layers',
  'layers.bg': 'TRANSLATE_ME: Background Image',
  'layers.rooms': 'TRANSLATE_ME: Rooms',
  'layers.furniture': 'TRANSLATE_ME: Furniture',
  'layers.fixtures': 'TRANSLATE_ME: Fixtures',
  'layers.notes': 'TRANSLATE_ME: Sticky Notes',

  // room list
  'rooms.title': 'TRANSLATE_ME: Rooms',
  'rooms.add': 'TRANSLATE_ME: Add Room',

  // actions
  'actions.title': 'TRANSLATE_ME: Actions',
  'actions.elevationView': 'TRANSLATE_ME: Elevation View',
  'actions.duplicate': 'TRANSLATE_ME: Duplicate',
  'actions.delete': 'TRANSLATE_ME: Delete',

  // bottom bar
  'bottombar.zoom': 'TRANSLATE_ME: Zoom',
  'bottombar.unit': 'TRANSLATE_ME: Unit',
  'bottombar.layer': 'TRANSLATE_ME: Layer',
  'bottombar.grid': 'TRANSLATE_ME: Grid',
  'bottombar.saved': 'TRANSLATE_ME: Saved',

  // settings modal
  'settings.title': 'TRANSLATE_ME: Settings',
  'settings.unit': 'TRANSLATE_ME: Unit',
  'settings.unitMetric': 'TRANSLATE_ME: Metric (cm)',
  'settings.unitImperial': 'TRANSLATE_ME: Imperial (in/ft)',
  'settings.wallThickness': 'TRANSLATE_ME: Default wall thickness (cm)',
  'settings.language': 'TRANSLATE_ME: Language',
  'settings.grid': 'TRANSLATE_ME: Grid',
  'settings.showGrid': 'TRANSLATE_ME: Show grid',
  'settings.gridSize': 'TRANSLATE_ME: Grid size (cm)',
  'settings.gridSizeHint': 'TRANSLATE_ME: e.g. 100, 50, 25 cm',
  'settings.gridColor': 'TRANSLATE_ME: Grid color',
  'settings.apply': 'TRANSLATE_ME: Apply',
  'settings.cancel': 'TRANSLATE_ME: Cancel',

  // room defaults
  'room.defaultName': 'TRANSLATE_ME: Room',

  // furniture
  'furniture.title': 'TRANSLATE_ME: Furniture',
  'furniture.mustFitInRoom': 'TRANSLATE_ME: Must fit fully inside a room',
  'furniture.generic': 'TRANSLATE_ME: Furniture',
  'furniture.beam': 'TRANSLATE_ME: Beam',
  'furniture.ceiling-light': 'TRANSLATE_ME: Ceiling Light',
  'furniture.floor-lamp': 'TRANSLATE_ME: Floor Lamp',
  'furniture.table-lamp': 'TRANSLATE_ME: Table Lamp',

  // fixtures (openings)
  'fixtures.title': 'TRANSLATE_ME: Openings',
  'fixtures.type': 'TRANSLATE_ME: Type',
  'fixtures.door': 'TRANSLATE_ME: Door',
  'fixtures.window': 'TRANSLATE_ME: Window',
  'fixtures.wallPosition': 'TRANSLATE_ME: Wall Position',
  'fixtures.posOnWall': 'TRANSLATE_ME: From wall start (cm)',
  'fixtures.heightFromFloor': 'TRANSLATE_ME: From floor (cm)',
  'fixtures.objectHeight': 'TRANSLATE_ME: Object height (cm)',
  'fixtures.noWall': 'TRANSLATE_ME: No wall nearby — drag closer to a room edge',
  'fixtures.overlaps': 'TRANSLATE_ME: Overlaps another opening on this wall',

  // electricals
  'electricals.title': 'TRANSLATE_ME: Sockets',
  'electricals.socket': 'TRANSLATE_ME: Socket',
  'electricals.fromFloor': 'TRANSLATE_ME: from floor',

  // vertical dimensions (furniture/openings/sockets — shown in both modes)
  'panel.verticalDimensions': 'TRANSLATE_ME: Vertical Position',
  'panel.distanceFromCeiling': 'TRANSLATE_ME: From ceiling (cm)',

  // horizontal dimensions (elevation mode only, view-dependent)
  'panel.horizontalDimensions': 'TRANSLATE_ME: Horizontal Position (this view)',
  'panel.fromLeft': 'TRANSLATE_ME: From left (cm)',
  'panel.fromRight': 'TRANSLATE_ME: From right (cm)',
  'panel.rotatedHint': 'TRANSLATE_ME: Rotated items: adjust position/size on the floor plan instead',

  // elevation mode
  'mode.needRoom': 'TRANSLATE_ME: Create a room first',
  'elevation.room': 'TRANSLATE_ME: Room',
  'elevation.viewHint': 'TRANSLATE_ME: Each tab shows where you stand — "Top" means you’re standing at the top of the room looking toward the bottom wall.',
  'elevation.wallTop': 'TRANSLATE_ME: Top',
  'elevation.wallRight': 'TRANSLATE_ME: Right',
  'elevation.wallBottom': 'TRANSLATE_ME: Bottom',
  'elevation.wallLeft': 'TRANSLATE_ME: Left',
  'elevation.ceiling': 'TRANSLATE_ME: Ceiling',
  'elevation.floor': 'TRANSLATE_ME: Floor',

  // AI export modal
  'aiExport.title': 'TRANSLATE_ME: AI Export',
  'aiExport.rooms': 'TRANSLATE_ME: Rooms',
  'aiExport.style': 'TRANSLATE_ME: Style',
  'aiExport.styleIndustrial': 'TRANSLATE_ME: Industrial',
  'aiExport.styleScandinavian': 'TRANSLATE_ME: Scandinavian',
  'aiExport.styleModernMinimalist': 'TRANSLATE_ME: Modern Minimalist',
  'aiExport.styleCustom': 'TRANSLATE_ME: Custom…',
  'aiExport.customStyle': 'TRANSLATE_ME: Custom style',
  'aiExport.customStylePlaceholder': 'TRANSLATE_ME: Describe your style… (English works best)',
  'aiExport.view': 'TRANSLATE_ME: View',
  'aiExport.combined': 'TRANSLATE_ME: Combined',
  'aiExport.tabPng': 'TRANSLATE_ME: 6-Grid PNG',
  'aiExport.tabPrompt': 'TRANSLATE_ME: Prompt',
  'aiExport.tabJson': 'TRANSLATE_ME: JSON Prompt',
  'aiExport.noRooms': 'TRANSLATE_ME: Select at least one room above.',
  'aiExport.generating': 'TRANSLATE_ME: Generating…',
  'aiExport.download': 'TRANSLATE_ME: Download PNG',
  'aiExport.copy': 'TRANSLATE_ME: Copy',
  'aiExport.copied': 'TRANSLATE_ME: Copied!',
  'aiExport.flowHint': 'TRANSLATE_ME: Suggested flow: download the 6-grid PNG → upload it to Gemini as a reference image → paste the Prompt (or JSON Prompt, which already includes what to avoid) → generate.',

  // sticky notes
  'stickyNotes.text': 'TRANSLATE_ME: Note text',
};
