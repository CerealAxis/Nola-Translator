/** Preserve the match-nothing behavior of empty selector lists in generated CSS. */
export function normalizeEmptyIsCss() {
  return {
    postcssPlugin: 'normalize-empty-is-css',
    Rule(rule) {
      if (rule.selector?.includes(':is(')) {
        rule.selector = rule.selector.replace(/:is\(\s*\)/g, ':not(*)')
      }
    },
  }
}
