<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import type { Locale } from './content'

const props = defineProps<{ locale?: Locale }>()
const { isDark } = useData()
const host = ref<HTMLElement>()
let root: import('react-dom/client').Root | undefined
let render: (() => void) | undefined
let disposed = false

onMounted(async () => {
  // React owns the product homepage; VitePress retains routing and Markdown documentation.
  const [{ createRoot }, { createElement }, { LandingPage }] = await Promise.all([
    import('react-dom/client'), import('react'), import('./LandingPage'),
  ])
  if (disposed || !host.value) return
  root = createRoot(host.value)
  render = () => root?.render(createElement(LandingPage, {
    locale: props.locale ?? 'zh-CN', base: withBase('/'), dark: isDark.value,
    onToggleTheme: () => { isDark.value = !isDark.value },
  }))
  render()
})
watch(() => props.locale, () => render?.())
watch(isDark, () => render?.())
onBeforeUnmount(() => { disposed = true; root?.unmount() })
</script>

<template>
  <div ref="host">
    <div class="site-loading" role="status" aria-label="Nola Translator">
      <div class="site-loader-symbol" aria-hidden="true">
        <span class="site-loader-orbit" />
        <span class="site-loader-orbit site-loader-orbit--second" />
        <img :src="withBase('/nola-logo.svg')" alt="" />
      </div>
      <p>Nola Translator</p>
      <div class="site-loader-wave" aria-hidden="true"><i v-for="bar in 5" :key="bar" /></div>
    </div>
  </div>
</template>
