<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch, watchEffect } from 'vue'
import { useData, withBase } from 'vitepress'
import Giscus from '@giscus/vue'
import CookieConsent from './CookieConsent.vue'
import { languageNoticeReadyKey } from './cookieConsent'
import { copy } from './content'
import { localeOfPath } from './siteLocale'
import type { Locale } from './content'

const { page, lang, isDark, frontmatter, theme } = useData()
const locale = computed(() => localeOfPath(`/${page.value.relativePath}`, '/'))
const backToTop = computed(() => copy[locale.value].documentation.backToTop)
const breadcrumbs = computed<{ text: string; path: string }[]>(() => frontmatter.value.breadcrumbs ?? [])
const breadcrumbLabels: Record<Locale, string> = {
  'zh-CN': '面包屑导航', 'zh-TW': '導覽路徑', 'zh-HK': '導覽路徑',
  en: 'Breadcrumb', ja: 'パンくずリスト', ko: '탐색 경로',
}
watchEffect(() => {
  // The design system has one language, so its switcher should link to localized homepages.
  theme.value.i18nRouting = !page.value.relativePath.startsWith('vis/')
}, { flush: 'sync' })
const pageViewsLabel = computed(() => ({
  'zh-CN': '本页浏览量', 'zh-TW': '本頁瀏覽量', 'zh-HK': '本頁瀏覽量',
  en: 'Page views', ja: 'ページビュー', ko: '페이지 조회수',
} satisfies Record<Locale, string>)[lang.value as Locale])
const showPageViews = ref(false)
const analyticsAllowed = ref(false)
const languageNoticeReady = ref(false)
provide(languageNoticeReadyKey, languageNoticeReady)
const pageViews = ref<number>()
const nearbyScrollbars = new Set<HTMLElement>()
function hideScrollbars() {
  nearbyScrollbars.forEach(element => element.classList.remove('nola-scrollbar-near'))
  nearbyScrollbars.clear()
}
function revealNearbyScrollbars(event: PointerEvent) {
  hideScrollbars()
  if (event.pointerType !== 'mouse' || !document.querySelector('.VPDoc')) return
  const root = document.documentElement
  const candidates = new Set([...event.composedPath(), root])
  for (const element of candidates) {
    if (!(element instanceof HTMLElement)) continue
    const isRoot = element === root
    const style = getComputedStyle(element)
    const rect = isRoot ? { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight } : element.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) continue
    const vertical = element.scrollHeight > element.clientHeight && (isRoot || /auto|scroll/.test(style.overflowY))
    const horizontal = element.scrollWidth > element.clientWidth && (isRoot || /auto|scroll/.test(style.overflowX))
    const inlineEdge = style.direction === 'rtl' ? event.clientX - rect.left : rect.right - event.clientX
    if ((vertical && inlineEdge <= 24) || (horizontal && rect.bottom - event.clientY <= 24)) {
      element.classList.add('nola-scrollbar-near')
      nearbyScrollbars.add(element)
    }
  }
}
onMounted(() => {
  document.addEventListener('pointermove', revealNearbyScrollbars, { passive: true })
  document.addEventListener('pointerleave', hideScrollbars)
})
onUnmounted(() => {
  document.removeEventListener('pointermove', revealNearbyScrollbars)
  document.removeEventListener('pointerleave', hideScrollbars)
  hideScrollbars()
})
let zoom: ReturnType<typeof import('medium-zoom').default> | undefined
const refreshImageZoom = async () => {
  await nextTick()
  const { default: mediumZoom } = await import('medium-zoom')
  zoom ??= mediumZoom({ background: 'var(--vp-c-bg)', margin: 24 })
  zoom.detach()
  zoom.attach('.vp-doc img:not([src*="shields.io"]):not([src$="badge.svg"]):not(.linkcard img)')
}
onMounted(() => { void refreshImageZoom() })
watch(() => page.value.relativePath, () => { void refreshImageZoom() }, { flush: 'post' })
onMounted(() => {
  showPageViews.value = location.hostname === 'nola.xaviermc.top'
})
watch([() => page.value.relativePath, analyticsAllowed, showPageViews], ([path, choice, enabled], _previous, onCleanup) => {
  pageViews.value = undefined
  if (!enabled || !choice || path === 'index.md' || /^(?:zh-CN|zh-TW|zh-HK|en|ja|ko)\/index\.md$/.test(path)) return
  const callback = `NolaPageViews_${crypto.randomUUID().replaceAll('-', '')}`
  const script = document.createElement('script')
  // shortcut: WebKit can still strip third-party referrers, switch to explicit page IDs when a reachable API is available.
  script.referrerPolicy = 'no-referrer-when-downgrade'
  script.src = `https://busuanzi.ibruce.info/busuanzi?jsonpCallback=${callback}`
  const cleanup = () => {
    script.remove()
    Reflect.deleteProperty(window, callback)
  }
  Object.assign(window, {
    [callback]: (data: { page_pv?: unknown } | null) => {
      const value = data?.page_pv
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) pageViews.value = value
    },
  })
  script.onload = script.onerror = cleanup
  onCleanup(cleanup)
  document.head.append(script)
}, { flush: 'post' })
// Public identifiers supplied by the repository's Giscus setup.
const repo = 'CerealAxis/Nola-Translator'
const repoId = 'R_kgDOUvoCYg'
const categoryId = 'DIC_kwDOUvoCYs4DIc6Z'
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <nav v-if="breadcrumbs.length" class="nola-doc-breadcrumb" :aria-label="breadcrumbLabels[locale]">
        <ol>
          <li v-for="(item, index) in breadcrumbs" :key="item.path">
            <span v-if="index > 0" aria-hidden="true">›</span>
            <a v-if="index < breadcrumbs.length - 1" :href="withBase(item.path)">{{ item.text }}</a>
            <span v-else aria-current="page">{{ item.text }}</span>
          </li>
        </ol>
      </nav>
    </template>
    <template #doc-footer-before>
      <div v-if="pageViews !== undefined" class="nola-doc-views">{{ pageViewsLabel }}: {{ pageViews }}</div>
    </template>
    <template #doc-after>
      <div class="nola-doc-discussion" v-if="frontmatter.comments !== false" data-nosnippet>
        <Giscus :key="page.relativePath" :repo="repo" :repo-id="repoId" category="Ideas" :category-id="categoryId" mapping="pathname" strict="0" reactions-enabled="1" emit-metadata="1" input-position="bottom" :theme="isDark ? 'dark' : 'light'" :lang="lang" loading="lazy" />
      </div>
    </template>
    <template #aside-bottom>
      <a class="nola-doc-top" href="#VPContent">↑ {{ backToTop }}</a>
    </template>
  </DefaultTheme.Layout>
  <CookieConsent
    @analytics-change="analyticsAllowed = $event"
    @language-notice-ready="languageNoticeReady = $event"
  />
</template>

<style scoped>
.nola-doc-breadcrumb {
  margin-block-end: var(--section-gap, 1.5rem);
  color: var(--vp-c-text-2);
}
.nola-doc-breadcrumb ol,
.nola-doc-breadcrumb li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--label-gap, .5rem);
}
.nola-doc-breadcrumb li { max-width: 100%; overflow-wrap: anywhere; }
.nola-doc-breadcrumb a:hover { text-decoration: underline; }
.nola-doc-breadcrumb [aria-current="page"] { color: var(--vp-c-text-1); }
</style>
