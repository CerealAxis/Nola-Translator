import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

/*
 * jsdom does not cascade external stylesheets, so no component test can see these rules
 * and this file is the only guard on them. The real-browser check opens an Electron
 * window instead (`scripts/check-packaged-ui.mjs`), which lives outside the renderer.
 */
const css = readFileSync(resolve(process.cwd(), 'src/renderer/theme/caption-card.css'), 'utf8')

const rulesFor = (attribute: string): { selector: string; body: string }[] =>
  [...css.matchAll(new RegExp(`\\.nola-caption-card\\[${attribute}='[^']*'\\]([^{]*)\\{([^}]*)\\}`, 'g'))]
    .map((match) => ({ selector: match[1].trim(), body: match[2] }))

it('抓得到浅色配色那两条规则 —— 下面两条断言才不是空跑', () => {
  // Pins that `rulesFor` really matches, so the two assertions below cannot pass vacuously
  // on a selector that no longer exists.
  expect(rulesFor('data-scheme').length).toBeGreaterThanOrEqual(2)
})

it('透明卡片上不画发丝边也不画投影，浅色配色也一样', () => {
  // The `:not([data-transparent='true'])` guard is load-bearing: without it the light
  // scheme's `border` and `box-shadow` also apply to a zero-fill card, drawing a dark
  // outline around nothing.
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
