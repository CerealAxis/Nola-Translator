<script setup lang="ts">
import { inject, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import { copy, downloadUrl, localeNames, localePath, type Locale } from './content'
import { landingContent } from './landing-content'
import { languageNoticeReadyKey } from './cookieConsent'
import { defaultLocale, homePath } from './siteLocale'

const props = withDefaults(defineProps<{ locale?: Locale }>(), { locale: defaultLocale })
const { isDark } = useData()
const base = withBase('/')
const languages = Object.keys(localeNames) as Locale[]
const host = ref<HTMLElement>()
const loadFailed = ref(false)
const languageNoticeReady = inject(languageNoticeReadyKey)
let root: import('react-dom/client').Root | undefined
let render: (() => void) | undefined
let disposed = false

onMounted(async () => {
  await nextTick()
  if (disposed) return
  // VitePress initializes the document language after mounting its theme.
  document.documentElement.lang = props.locale
  // React owns the product homepage; VitePress retains routing and Markdown documentation.
  const modules = await Promise.all([
    import('react-dom/client'), import('react'), import('./LandingPage'),
  ]).catch((error: unknown) => {
    if (disposed) return
    loadFailed.value = true
    console.error('Failed to load the Nola homepage', error)
  })
  if (!modules || disposed || !host.value) return
  const [{ createRoot }, { createElement }, { LandingPage }] = modules
  root = createRoot(host.value)
  render = () => root?.render(createElement(LandingPage, {
    locale: props.locale, base, dark: isDark.value, languageNoticeReady: languageNoticeReady?.value ?? false,
    onToggleTheme: () => {
      isDark.value = !isDark.value
      render?.()
    },
  }))
  render()
})
watch(() => props.locale, locale => {
  document.documentElement.lang = locale
  render?.()
}, { flush: 'post' })
watch(isDark, () => render?.())
if (languageNoticeReady) watch(languageNoticeReady, () => render?.())
onBeforeUnmount(() => { disposed = true; root?.unmount() })
</script>

<template>
  <div ref="host" :class="{ 'site-home-loading': !loadFailed }">
    <div class="site-loading" role="status" aria-label="Nola Translator">
      <div class="site-loader-symbol" aria-hidden="true">
        <span class="site-loader-orbit" />
        <span class="site-loader-orbit site-loader-orbit--second" />
        <img :src="withBase('/nola-logo.svg')" width="40" height="40" alt="" />
      </div>
      <p>Nola Translator</p>
      <div class="site-loader-wave" aria-hidden="true"><i v-for="bar in 5" :key="bar" /></div>
    </div>
    <main class="site-loading-fallback" :lang="locale">
      <img :src="withBase('/nola-logo.svg')" width="64" height="64" alt="" />
      <h1>Nola Translator</h1>
      <p>{{ landingContent[locale].heroSubtitle }}</p>
      <div class="site-loading-links">
        <a :href="withBase(`${localePath(locale)}docs`)">{{ copy[locale].nav.docs }}</a>
        <a :href="downloadUrl">{{ copy[locale].nav.download }}</a>
      </div>
      <nav class="site-loading-links" :aria-label="copy[locale].nav.language">
        <a
          v-for="language in languages"
          :key="language"
          :href="homePath(language, base)"
          :lang="language"
          :hreflang="language"
          :aria-current="language === locale ? 'page' : undefined"
        >{{ localeNames[language] }}</a>
      </nav>
    </main>
  </div>
</template>
