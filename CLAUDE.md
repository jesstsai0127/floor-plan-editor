# CLAUDE.md — floor-plan-editor 專案規則

## 專案性質
純前端 SPA，雙擊 index.html 執行。無後端、無 API、無機密。

## 技術棧
- Konva.js v9（canvas 引擎，local vendor/）
- Vue 3.4（UI 狀態，local vendor/）
- html2canvas + jsPDF（導出，local vendor/）
- Classic script tags，**不使用 ES modules**（file:// CORS 限制）

## 開發規則
- 所有 JS 掛在 `window` 全域（避免 import/export）
- 狀態統一在 `window.appState`（Vue reactive object）
- Konva stage 掛在 `window.stage`
- 不引入新依賴，現有 vendor/ 夠用

## 視覺風格
Warm Paper × SmartDraw 混合：米白底 `#F5F0E8`、棕色格線、深暖棕 UI

## 開發流程
每個功能 Phase：Mockup → 使用者確認 → 實作 → 驗收
UX/流程設計有需要時跑 `/antigravity-review`，程式碼 review 自行負責
