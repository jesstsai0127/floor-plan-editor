window.LOCALES = window.LOCALES || {};
window.LOCALES['zh-TW'] = {
  // top bar
  'mode.floorplan': '平面圖',
  'mode.elevation': '立面圖',
  'topbar.new': '新增',
  'topbar.open': '開啟',
  'topbar.save': '儲存',
  'topbar.undo': '復原',
  'topbar.redo': '重做',
  'topbar.clear': '清空畫布',
  'topbar.aiExport': 'AI 匯出',
  'topbar.export': '匯出',
  'topbar.autosaved': '已自動儲存',

  // left toolbar
  'toolbar.select': '選取',
  'toolbar.room': '房間',
  'toolbar.roomRect': '矩形',
  'toolbar.roomTriangle': '三角形',
  'toolbar.furniture': '家具',
  'toolbar.catFurniture': '家具',
  'toolbar.furnRect': '矩形',
  'toolbar.furnCircle': '圓形',
  'toolbar.furnTriangle': '三角形',
  'toolbar.catStructural': '結構',
  'toolbar.furnBeam': '樑',
  'toolbar.catLighting': '燈具',
  'toolbar.furnCeilingLight': '吸頂燈',
  'toolbar.furnFloorLamp': '立燈',
  'toolbar.furnTableLamp': '檯燈',
  'toolbar.openings': '開口',
  'toolbar.openingDoor': '門',
  'toolbar.openingWindow': '窗',
  'toolbar.socket': '插座',
  'toolbar.note': '便條',

  // right panel — properties
  'panel.properties': '屬性',
  'panel.name': '名稱',
  'panel.width': '寬度 (cm)',
  'panel.depth': '深度 (cm)',
  'panel.height': '高度 (cm)',
  'panel.fillColor': '填色',
  'panel.position': '位置',
  'panel.nudgeHint': '方向鍵：微調 1 cm',
  'panel.rotation': '旋轉',
  'panel.emptyHint': '選擇「房間」工具，在畫布上拖曳即可畫出房間。邊緣會自動吸附其他房間與格線。Shift 點選或拖曳框選可多選；按住空白鍵可平移畫布。',
  'panel.roomsSelected': '個房間已選取',
  'panel.align': '對齊',
  'panel.alignLeft': '靠左',
  'panel.alignRight': '靠右',
  'panel.alignTop': '靠上',
  'panel.alignBottom': '靠下',
  'panel.alignCenterX': '水平置中',
  'panel.alignCenterY': '垂直置中',
  'panel.deleteAll': '全部刪除',

  // layers
  'layers.title': '圖層',
  'layers.bg': '底圖',
  'layers.rooms': '房間',
  'layers.furniture': '家具',
  'layers.fixtures': '水電',
  'layers.notes': '便條紙',

  // room list
  'rooms.title': '房間',
  'rooms.add': '新增房間',

  // actions
  'actions.title': '動作',
  'actions.elevationView': '立面視角',
  'actions.duplicate': '複製',
  'actions.delete': '刪除',

  // bottom bar
  'bottombar.zoom': '縮放',
  'bottombar.unit': '單位',
  'bottombar.layer': '圖層',
  'bottombar.grid': '格線',
  'bottombar.saved': '已儲存',

  // settings modal
  'settings.title': '設定',
  'settings.unit': '單位',
  'settings.unitMetric': '公制 (cm)',
  'settings.unitImperial': '英制 (in/ft)',
  'settings.wallThickness': '牆厚 (cm)',
  'settings.language': '語言',
  'settings.langEnUS': 'English (en-US)',
  'settings.langZhTW': '繁體中文 (zh-TW)',
  'settings.grid': '格線',
  'settings.showGrid': '顯示格線',
  'settings.gridSize': '格線間距 (cm)',
  'settings.gridSizeHint': '例如 100、50、25 cm',
  'settings.gridColor': '格線顏色',
  'settings.apply': '套用',
  'settings.cancel': '取消',

  // room defaults
  'room.defaultName': '房間',

  // furniture
  'furniture.title': '家具',
  'furniture.mustFitInRoom': '必須完全落在房間範圍內',
  'furniture.generic': '家具',
  'furniture.beam': '樑',
  'furniture.ceiling-light': '吸頂燈',
  'furniture.floor-lamp': '立燈',
  'furniture.table-lamp': '檯燈',

  // fixtures（開口）
  'fixtures.title': '開口',
  'fixtures.type': '類型',
  'fixtures.door': '門',
  'fixtures.window': '窗',
  'fixtures.wallPosition': '牆面位置',
  'fixtures.posOnWall': '距牆起點 (cm)',
  'fixtures.heightFromFloor': '距地板 (cm)',
  'fixtures.objectHeight': '物件高度 (cm)',
  'fixtures.noWall': '附近沒有牆——拖曳靠近房間邊緣',

  // electricals（插座）
  'electricals.title': '插座',
  'electricals.socket': '插座',
  'electricals.fromFloor': '離地',

  // vertical dimensions（家具/開口/插座，兩種模式都顯示）
  'panel.verticalDimensions': '垂直位置',
  'panel.distanceFromCeiling': '距天花板 (cm)',

  // horizontal dimensions（僅立面模式，隨視角改變意義）
  'panel.horizontalDimensions': '水平位置（此視角）',
  'panel.fromLeft': '距左側 (cm)',
  'panel.fromRight': '距右側 (cm)',
  'panel.rotatedHint': '旋轉過的物件請回平面圖調整位置/尺寸',

  // elevation mode
  'mode.needRoom': '請先建立房間',
  'elevation.room': '房間',
  'elevation.wallTop': '上牆',
  'elevation.wallRight': '右牆',
  'elevation.wallBottom': '下牆',
  'elevation.wallLeft': '左牆',
  'elevation.wallHyp': '斜邊牆',
  'elevation.ceiling': '天花板',
  'elevation.floor': '地板',
};
