/**
 * 全局类型声明。
 *
 * `window.nolaTranslator` 是 preload 通过 `contextBridge` 注入的那个对象。
 * 声明成**可选**是有意的：浏览器里直接开 `index.html`（不经过 Electron）时它不存在，
 * `ipcBridge` 的 `call()` / `subscribe()` 靠这一点给出「缺桥接」的错误而不是崩在
 * 属性访问上。
 *
 * 这份声明取代了旧前端的两份：`global.d.ts`（本文件的内容）与 `assets.d.ts`。
 * 后者在这里重建 —— 新 UI 用内联 SVG 而不是资源文件，所以只有 `*.css` 那条还有用
 * （`index.css` 与 `theme/*.css` 都是 `import './x.css'` 形式，TS 需要一条模块声明）。
 */
import type { NolaTranslatorApi } from '../shared/bridge'

declare global {
  interface Window {
    nolaTranslator?: NolaTranslatorApi
  }
}

export {}
