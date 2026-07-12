window.LOCALES = window.LOCALES || {};
window.LOCALES['en-US'] = {
  // top bar
  'mode.floorplan': 'Floor Plan',
  'mode.elevation': 'Elevation',
  'topbar.new': 'New',
  'topbar.open': 'Open',
  'topbar.save': 'Save',
  'topbar.undo': 'Undo',
  'topbar.redo': 'Redo',
  'topbar.clear': 'Clear canvas',
  'topbar.aiExport': 'AI Export',
  'topbar.export': 'Export',
  'topbar.autosaved': 'Auto-saved',
  'zoom.fit': 'Fit all rooms in view',

  // left toolbar
  'toolbar.select': 'Select',
  'toolbar.room': 'Room',
  'toolbar.roomRect': 'Rectangle',
  'toolbar.furniture': 'Furn',
  'toolbar.catFurniture': 'Furniture',
  'toolbar.furnRect': 'Rectangle',
  'toolbar.furnCircle': 'Circle',
  'toolbar.furnTriangle': 'Triangle',
  'toolbar.catStructural': 'Structural',
  'toolbar.furnBeam': 'Beam',
  'toolbar.catLighting': 'Lighting',
  'toolbar.furnCeilingLight': 'Ceiling Light',
  'toolbar.furnFloorLamp': 'Floor Lamp',
  'toolbar.furnTableLamp': 'Table Lamp',
  'toolbar.openings': 'Open',
  'toolbar.openingDoor': 'Door',
  'toolbar.openingWindow': 'Window',
  'toolbar.socket': 'Socket',
  'toolbar.note': 'Note',

  // right panel — properties
  'panel.properties': 'Properties',
  'panel.name': 'Name',
  'panel.width': 'Width (cm)',
  'panel.depth': 'Depth (cm)',
  'panel.height': 'Height (cm)',
  'panel.fillColor': 'Fill color',
  'panel.position': 'Position',
  'panel.nudgeHint': 'Arrow keys: nudge 1 cm',
  'panel.rotation': 'Rotation',
  'panel.emptyHint': 'Pick the Room tool, then drag on the canvas to draw a room. Edges snap to other rooms and the grid. Shift-click or drag a box to select several; hold Space to pan.',
  'panel.roomsSelected': 'rooms selected',
  'panel.align': 'Align',
  'panel.alignLeft': 'Left',
  'panel.alignRight': 'Right',
  'panel.alignTop': 'Top',
  'panel.alignBottom': 'Bottom',
  'panel.alignCenterX': 'Center H',
  'panel.alignCenterY': 'Center V',
  'panel.deleteAll': 'Delete all',

  // layers
  'layers.title': 'Layers',
  'layers.bg': 'Background Image',
  'layers.rooms': 'Rooms',
  'layers.furniture': 'Furniture',
  'layers.fixtures': 'Fixtures',
  'layers.notes': 'Sticky Notes',

  // room list
  'rooms.title': 'Rooms',
  'rooms.add': 'Add Room',

  // actions
  'actions.title': 'Actions',
  'actions.elevationView': 'Elevation View',
  'actions.duplicate': 'Duplicate',
  'actions.delete': 'Delete',

  // bottom bar
  'bottombar.zoom': 'Zoom',
  'bottombar.unit': 'Unit',
  'bottombar.layer': 'Layer',
  'bottombar.grid': 'Grid',
  'bottombar.saved': 'Saved',

  // settings modal
  'settings.title': 'Settings',
  'settings.unit': 'Unit',
  'settings.unitMetric': 'Metric (cm)',
  'settings.unitImperial': 'Imperial (in/ft)',
  'settings.wallThickness': 'Wall thickness (cm)',
  'settings.language': 'Language',
  'settings.langEnUS': 'English (en-US)',
  'settings.langZhTW': '繁體中文 (zh-TW)',
  'settings.grid': 'Grid',
  'settings.showGrid': 'Show grid',
  'settings.gridSize': 'Grid size (cm)',
  'settings.gridSizeHint': 'e.g. 100, 50, 25 cm',
  'settings.gridColor': 'Grid color',
  'settings.apply': 'Apply',
  'settings.cancel': 'Cancel',

  // room defaults
  'room.defaultName': 'Room',

  // furniture
  'furniture.title': 'Furniture',
  'furniture.mustFitInRoom': 'Must fit fully inside a room',
  'furniture.generic': 'Furniture',
  'furniture.beam': 'Beam',
  'furniture.ceiling-light': 'Ceiling Light',
  'furniture.floor-lamp': 'Floor Lamp',
  'furniture.table-lamp': 'Table Lamp',

  // fixtures (openings)
  'fixtures.title': 'Openings',
  'fixtures.type': 'Type',
  'fixtures.door': 'Door',
  'fixtures.window': 'Window',
  'fixtures.wallPosition': 'Wall Position',
  'fixtures.posOnWall': 'From wall start (cm)',
  'fixtures.heightFromFloor': 'From floor (cm)',
  'fixtures.objectHeight': 'Object height (cm)',
  'fixtures.noWall': 'No wall nearby — drag closer to a room edge',
  'fixtures.overlaps': 'Overlaps another opening on this wall',

  // electricals
  'electricals.title': 'Sockets',
  'electricals.socket': 'Socket',
  'electricals.fromFloor': 'from floor',

  // vertical dimensions (furniture/openings/sockets — shown in both modes)
  'panel.verticalDimensions': 'Vertical Position',
  'panel.distanceFromCeiling': 'From ceiling (cm)',

  // horizontal dimensions (elevation mode only, view-dependent)
  'panel.horizontalDimensions': 'Horizontal Position (this view)',
  'panel.fromLeft': 'From left (cm)',
  'panel.fromRight': 'From right (cm)',
  'panel.rotatedHint': 'Rotated items: adjust position/size on the floor plan instead',

  // elevation mode
  'mode.needRoom': 'Create a room first',
  'elevation.room': 'Room',
  'elevation.viewHint': 'Each tab shows where you stand — "Top" means you’re standing at the top of the room looking toward the bottom wall.',
  'elevation.wallTop': 'Top',
  'elevation.wallRight': 'Right',
  'elevation.wallBottom': 'Bottom',
  'elevation.wallLeft': 'Left',
  'elevation.ceiling': 'Ceiling',
  'elevation.floor': 'Floor',

  // AI export modal
  'aiExport.title': 'AI Export',
  'aiExport.rooms': 'Rooms',
  'aiExport.style': 'Style',
  'aiExport.styleIndustrial': 'Industrial',
  'aiExport.styleScandinavian': 'Scandinavian',
  'aiExport.styleModernMinimalist': 'Modern Minimalist',
  'aiExport.styleCustom': 'Custom…',
  'aiExport.customStyle': 'Custom style',
  'aiExport.customStylePlaceholder': 'Describe your style… (English works best)',
  'aiExport.view': 'View',
  'aiExport.combined': 'Combined',
  'aiExport.tabPng': '6-Grid PNG',
  'aiExport.tabPrompt': 'Prompt',
  'aiExport.tabJson': 'JSON Prompt',
  'aiExport.noRooms': 'Select at least one room above.',
  'aiExport.generating': 'Generating…',
  'aiExport.download': 'Download PNG',
  'aiExport.copy': 'Copy',
  'aiExport.copied': 'Copied!',
  'aiExport.flowHint': 'Suggested flow: download the 6-grid PNG → upload it to Gemini as a reference image → paste the Prompt (or JSON Prompt, which already includes what to avoid) → generate.',
};
