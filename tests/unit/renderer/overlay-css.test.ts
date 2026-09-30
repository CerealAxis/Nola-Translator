import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

/**
 * `app.css` is imported only by `src/renderer/main.tsx`, and jsdom does not cascade an external
 * stylesheet, so no component test can see these rules. The light-palette card once regressed
 * silently here: its `border` shorthand sat later in the file than
 * `[data-transparent-background="true"]` at equal specificity, which reset that rule's transparent
 * `border-color` and restored the shadow — a dark outline drawn around a card with no background.
 * This asserts the structure directly, since a real-browser check needs a running Electron window.
 */
const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles/app.css'), 'utf8')

const rulesFor = (attribute: string): { selector: string; body: string }[] =>
  [...css.matchAll(new RegExp(`\\.caption-console\\[${attribute}="[^"]*"\\]([^{]*)\\{([^}]*)\\}`, 'g'))]
    .map((match) => ({ selector: match[1].trim(), body: match[2] }))

it('never lets the light palette paint a border or shadow on a fully transparent card', () => {
  const unguarded = rulesFor('data-color-scheme')
    .filter(({ selector, body }) => !selector.includes(':not('))
    .filter(({ body }) => /(^|[\s;])(border|border-color|box-shadow)\s*:/.test(body))

  expect(unguarded).toEqual([])
})

it('keeps the light palette hairline for the ordinary opaque card', () => {
  const guarded = rulesFor('data-color-scheme')
    .filter(({ selector }) => selector.includes(':not([data-transparent-background="true"])'))
  expect(guarded.some(({ body }) => /\bborder\s*:/.test(body))).toBe(true)
})
