import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Landing from './Landing.vue'
import { detectSiteLocale, localizedSitePath, localeOfPath, readLocalePreference, saveLocalePreference } from './siteLocale'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router, siteData }) {
    app.component('NolaLanding', Landing)
    if (typeof window === 'undefined') return
    const base = siteData.value.base
    const preference = readLocalePreference()
    const locale = preference === 'auto' ? detectSiteLocale(navigator.languages.length ? navigator.languages : [navigator.language]) : preference
    const target = localizedSitePath(location.pathname, locale, base)
    if (target !== location.pathname) location.replace(`${target}${location.search}${location.hash}`)
    // VitePress's document-language links should persist the same preference as the homepage menu.
    router.onBeforeRouteChange = href => {
      const pathname = new URL(href, location.href).pathname
      const nextLocale = localeOfPath(pathname, base)
      if (nextLocale !== localeOfPath(location.pathname, base)) saveLocalePreference(nextLocale)
    }
  },
} satisfies Theme
