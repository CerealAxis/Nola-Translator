export function normalizeEmptyIsCss() {
  return {
    postcssPlugin: 'nola-normalize-empty-is-css',
    Rule(rule) {
      // HeroUI emits empty :is() predicates for reduced-motion selectors; esbuild warns on them.
      rule.selector = rule.selector.replace(/:not\(:is\(\)\)|:is\(\)/g, '')
    },
  }
}
