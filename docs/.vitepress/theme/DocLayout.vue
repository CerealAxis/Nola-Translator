<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { computed, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import Giscus from '@giscus/vue'
import { copy } from './content'
import { localeOfPath } from './siteLocale'
import type { Locale } from './content'

const { page, lang, isDark, frontmatter } = useData()
const backToTop = computed(() => copy[localeOfPath(`/${page.value.relativePath}`, '/')].documentation.backToTop)
const pageViewsLabel = computed(() => ({
  'zh-CN': '本页浏览量', 'zh-TW': '本頁瀏覽量', 'zh-HK': '本頁瀏覽量',
  en: 'Page views', ja: 'ページビュー', ko: '페이지 조회수',
} satisfies Record<Locale, string>)[lang.value as Locale])
const showPageViews = ref(false)
onMounted(() => {
  showPageViews.value = location.hostname === 'nola.xaviermc.top'
  if (showPageViews.value && page.value.relativePath !== 'index.md') void import('busuanzi.pure.js')
})
watch(() => page.value.relativePath, (path, previousPath) => {
  if (path === 'index.md' || !showPageViews.value) return
  void import('busuanzi.pure.js').then(({ fetch: refreshViews }) => {
    if (previousPath) refreshViews()
  })
}, { immediate: true })
// Public identifiers supplied by the repository's Giscus setup.
const repo = 'CerealAxis/Nola-Translator'
const repoId = 'R_kgDOUvoCYg'
const categoryId = 'DIC_kwDOUvoCYs4DIc6Z'
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <div class="nola-doc-meta">
        <time v-if="page.lastUpdated" :datetime="new Date(page.lastUpdated).toISOString()">{{ new Date(page.lastUpdated).toLocaleDateString(lang) }}</time>
        <span v-if="showPageViews" id="busuanzi_container_page_pv" class="nola-doc-views"><span>{{ pageViewsLabel }}</span> <span id="busuanzi_value_page_pv">--</span></span>
      </div>
    </template>
    <template #doc-after>
      <div class="nola-doc-discussion" v-if="frontmatter.comments !== false">
        <Giscus :key="page.relativePath" :repo="repo" :repo-id="repoId" category="Ideas" :category-id="categoryId" mapping="pathname" strict="0" reactions-enabled="1" emit-metadata="1" input-position="bottom" :theme="isDark ? 'dark' : 'light'" :lang="lang" loading="lazy" />
      </div>
    </template>
    <template #aside-bottom>
      <a class="nola-doc-top" href="#VPContent">↑ {{ backToTop }}</a>
    </template>
  </DefaultTheme.Layout>
</template>
