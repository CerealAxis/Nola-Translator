import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Landing from './Landing.vue'
import DocLayout from './DocLayout.vue'
import Linkcard from './Linkcard.vue'
import mediumZoom from 'medium-zoom'
import { NProgress } from 'nprogress-v2'
import { nextTick } from 'vue'
import 'nprogress-v2/dist/index.css'
import 'vitepress-markdown-timeline/dist/theme/index.css'
import { localePath } from './content'
import { detectSiteLocale, localizedSitePath, localeOfPath, readLocalePreference, saveLocalePreference } from './siteLocale'
import './style.css'
import './style/index.css'
import 'virtual:group-icons.css'

export default {
  extends: DefaultTheme,
  Layout: DocLayout,
  enhanceApp({ app, router, siteData }) {
    app.component('NolaLanding', Landing)
    app.component('Linkcard', Linkcard)
    if (typeof window === 'undefined') return
    const base = siteData.value.base
    const zoom = mediumZoom({ background: 'var(--vp-c-bg)', margin: 24 })
    const refreshDocument = async () => {
      await nextTick()
      zoom.detach()
      zoom.attach('.vp-doc img:not([src*="shields.io"]):not([src$="badge.svg"]):not(.linkcard img)')
      NProgress.done()
    }
    NProgress.configure({ showSpinner: false })
    router.onAfterRouteChanged = refreshDocument
    void refreshDocument()
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
      if (!isHomePath(currentPath) && !isHomePath(pathname)) NProgress.start()
    }
  },
} satisfies Theme
