/**
 * 词典出口。**只有数据**，provider 在 `@/i18n`（`src/renderer/i18n.tsx`）。
 *
 * 这里刻意不 re-export provider：`@/i18n` 解析到 `i18n.tsx`（文件优先于目录索引），
 * 万一哪天解析顺序变了，这个 `index.ts` 也没有 `useI18n`，会是一个编译错误而不是静默的
 * 「拿到 undefined 然后在渲染里炸」。
 */

export { zhCN } from './zh-CN'
export type { Dictionary } from './zh-CN'
export { en } from './en'
