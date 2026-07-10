# Floor Plan Editor

輕量級 2D 室內平面與立面圖編輯器，附 AI 算圖素材生成。

## 特性

- 純前端 SPA，雙擊 `index.html` 即可在瀏覽器執行
- 無需安裝任何工具，離線可用
- 支援 Windows / macOS / Ubuntu

## 使用方式

1. Clone 或下載此專案
2. 雙擊 `index.html` 以瀏覽器開啟
3. 開始繪製你的平面圖

## 功能

- 2D 平面圖繪製（房間、家具、門窗、插座、燈具）
- 6 面立面圖（前/後/左/右/上/下）
- 三選二高度/位置自動計算
- AI 素材導出（提示詞 + 六宮格線稿 PNG）
- 自動存檔（localStorage）
- JSON 匯入/匯出、PNG/PDF 導出

## 技術棧

- [Konva.js](https://konvajs.org/) — 互動式 Canvas 引擎
- [Vue 3](https://vuejs.org/) — UI 狀態管理
- [html2canvas](https://html2canvas.hertzen.com/) + [jsPDF](https://github.com/parallax/jsPDF) — 導出

所有依賴皆為本地 `vendor/` 副本，無需網路。
