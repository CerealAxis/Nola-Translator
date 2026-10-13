import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Landing from './Landing.vue'
import { localePath } from './content'
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
      const currentPath = location.pathname
      const currentLocale = localeOfPath(currentPath, base)
      const nextLocale = localeOfPath(pathname, base)
      if (nextLocale !== currentLocale) saveLocalePreference(nextLocale)

      const isHomePath = (path: string) => {
        const normalized = path.endsWith('/') ? path : `${path}/`
        return normalized === `${base}${localePath(localeOfPath(path, base)).slice(1)}`
      }

      // The homepage loads its React/Tailwind stylesheet on demand. A VitePress
      // SPA transition keeps that global reset on the document page, where it
      // conflicts with the default theme's navigation layout; a document load
      // starts with only the VitePress stylesheet and restores the expected layout.
      if (isHomePath(currentPath) && !isHomePath(pathname)) {
        location.assign(href)
        return false
      }
    }
  },
} satisfies Theme
