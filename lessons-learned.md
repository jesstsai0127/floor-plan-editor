# lessons-learned.md — 踩坑教訓累積

> 只 append，不修改。開發中發現「這裡下次可以做更好」就立刻記一條，不用等真的踩雷。
> 累積到一定量或一個開發階段結束時，由 Claude Code 主動評估是否精簡進本專案（或全域）的 CLAUDE.md。

---

## 格式

```
## YYYY-MM-DD — {問題簡述}
**類型**：技術 / 架構 / 協作 / 溝通
**情境**：
**錯誤做法**：
**正確做法**：
**預防方式**：
```

---

## 2026-07-13 — Vue 3 CDN 版 `v-for` 內直接寫 `window.X` 會噴錯，同一個坑踩了第二次
**類型**：技術
**情境**：把語言下拉選單從寫死兩個 `<option>` 改成動態產生時，圖快直接在 template 寫
`<option v-for="code in Object.keys(window.LOCALES)">`，語法上完全合理，但瀏覽器實測
Vue app 整個沒掛載（`#app` 0 個子節點），console 噴 `TypeError: Cannot read properties
of undefined (reading 'LOCALES')`。Phase 4 立面圖頁籤按鈕（`v-for` 迴圈內 `@click=
"window.enterElevationMode(...)"`) 已經踩過同一個問題並記在 plan 文件裡，這次寫新功能
時完全忘了查閱，等於重新踩了一次已知的坑。
**錯誤做法**：`v-for` 迴圈作用域內，template 表達式直接寫 `window.X`（無論是当 iterable
還是呼叫函式）。Vue 3 compile 出來的 render 函式在 `v-for` 迴圈內對識別字的解析會被
`with(_ctx)` 沙盒攔截，`window` 被誤判成 `_ctx.window`（不存在)，而不是全域 `window`。
**正確做法**：任何要在 `v-for` 裡用到的 `window.*` 資料或函式，一律先在 `setup()` 裡
存成一個變數／computed／包裝函式，`return` 出去給 template 用純變數名稱引用，不要在
`v-for` 範圍內的 template 表達式裡出現裸的 `window.` 字樣。
**預防方式**：每次要在 `v-for` 內寫 template 表達式前，主動檢查有沒有 `window.`
字樣；如果有，先搬到 `setup()`。這條已經是第二次犯，值得考慮直接寫進本專案
`CLAUDE.md` 的硬規則，不要只留在這份文件等第三次。
