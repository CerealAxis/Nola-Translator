import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

/*
 * 被测文件从 `src/renderer/styles/app.css` 换成 `src/renderer/theme/caption-card.css`。
 * 旧 UI 的 44KB app.css 随整份旧前端删除了；这些规则搬到了新 UI 的 caption-card.css，
 * 选择器也从 `.caption-console[data-color-scheme=…]` 换成了 `.nola-caption-card[data-scheme=…]`。
 *
 * **守卫的 bug 本身是真实发生过的，这里要继续守它。** jsdom 不层联外链样式表，
 * 所以没有任何组件测试能看到这些规则；真实浏览器里的检查要开一个 Electron 窗口
 * （`scripts/check-packaged-ui.mjs`，那部分不在渲染层里）。
 */
const css = readFileSync(resolve(process.cwd(), 'src/renderer/theme/caption-card.css'), 'utf8')

const rulesFor = (attribute: string): { selector: string; body: string }[] =>
  [...css.matchAll(new RegExp(`\\.nola-caption-card\\[${attribute}='[^']*'\\]([^{]*)\\{([^}]*)\\}`, 'g'))]
    .map((match) => ({ selector: match[1].trim(), body: match[2] }))

it('抓得到浅色配色那两条规则 —— 下面两条断言才不是空跑', () => {
  // 防「正则写错导致下面两条断言永远通过」这种假绿：
  // 第一版把属性名写成了 `scheme`（实际是 `data-scheme`），于是 `rulesFor` 一条都没抓到，
  // 「透明卡片不画边」那条**空跑通过**，而该绿的没绿。这里先钉住「确实抓到了」。
  expect(rulesFor('data-scheme').length).toBeGreaterThanOrEqual(2)
})

it('透明卡片上不画发丝边也不画投影，浅色配色也一样', () => {
  // 回归背景：浅色卡片的 `border` 简写写在 `[data-transparent]` 那条规则之后、
  // 特异性相同，于是把它的透明 `border-color` 重置掉并把投影放回来 ——
  // 一张没有底色的卡片外面却画着一圈深色轮廓，肉眼可见但任何截图对比都说不清。
  const unguarded = rulesFor('data-scheme')
    .filter(({ selector }) => !selector.includes(':not('))
    .filter(({ body }) => /(^|[\s;])(border|border-color|box-shadow)\s*:/.test(body))

  expect(unguarded).toEqual([])
})

it('普通不透明卡片保留发丝边', () => {
  const guarded = rulesFor('data-scheme')
    .filter(({ selector }) => selector.includes(":not([data-transparent='true'])"))
  expect(guarded.some(({ body }) => /\bborder\s*:/.test(body))).toBe(true)
})
