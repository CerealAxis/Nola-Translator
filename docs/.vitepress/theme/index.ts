import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Landing from './Landing.vue'
import DocLayout from './DocLayout.vue'
import Linkcard from './Linkcard.vue'
import ShadcnInstall from './ShadcnInstall.vue'
import { NProgress } from 'nprogress-v2'
import { VitepressDemoBox, VitepressDemoPlaceholder } from 'vitepress-demo-plugin/client'
import 'nprogress-v2/dist/index.css'
import 'vitepress-demo-plugin/style.css'
import 'vitepress-markdown-timeline/dist/theme/index.css'
import { isHomePath, localeOfPath, saveLocalePreference } from './siteLocale'
import './style.css'
import '../../media-src/vis/design-demo.css'
import './style/index.css'
import 'virtual:group-icons.css'

export default {
  extends: DefaultTheme,
  Layout: DocLayout,
  enhanceApp({ app, router, siteData }) {
    app.component('NolaLanding', Landing)
    app.component('Linkcard', Linkcard)
    app.component('ShadcnInstall', ShadcnInstall)
    app.component('VitepressDemoBox', VitepressDemoBox)
    app.component('VitepressDemoPlaceholder', VitepressDemoPlaceholder)
    if (typeof window === 'undefined') return
    const base = siteData.value.base
    NProgress.configure({ showSpinner: false })
    router.onAfterRouteChanged = () => { NProgress.done() }
    // VitePress's document-language links should persist the same preference as the homepage menu.
    router.onBeforeRouteChange = href => {
      const pathname = new URL(href, location.href).pathname
      const currentPath = location.pathname
      const currentLocale = localeOfPath(currentPath, base)
      const nextLocale = localeOfPath(pathname, base)
      if (nextLocale !== currentLocale && !pathname.startsWith(`${base}vis/`)) saveLocalePreference(nextLocale)

      // The homepage and docs use global stylesheets that should not survive SPA transitions between them.
      const currentIsHome = isHomePath(currentPath, base)
      const nextIsHome = isHomePath(pathname, base)
      if (currentIsHome !== nextIsHome) {
        location.assign(href)
        return false
      }
      if (!currentIsHome && !nextIsHome) NProgress.start()
    }
  },
} satisfies Theme
