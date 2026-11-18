<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import { cookieConsentTranslations } from './cookieConsent'
import { localeOfPath } from './siteLocale'
import 'vanilla-cookieconsent/dist/cookieconsent.css'

const emit = defineEmits<{ analyticsChange: [enabled: boolean]; languageNoticeReady: [ready: boolean] }>()
const { page } = useData()
const locale = computed(() => localeOfPath(`/${page.value.relativePath}`, '/'))
let initialized = false
let consent: typeof import('vanilla-cookieconsent') | undefined
let disposed = false
const openModals = new Set<string>()
let modalChange = 0

const syncLanguageNotice = () => {
  if (!disposed) emit('languageNoticeReady', Boolean(consent?.validConsent() && !openModals.size))
}

onMounted(async () => {
  consent = await import('vanilla-cookieconsent')
  if (disposed) return
  const syncAnalytics = () => emit('analyticsChange', consent!.acceptedCategory('analytics'))
  await consent.run({
    mode: 'opt-in',
    cookie: { name: 'nola_cookie_consent', path: withBase('/'), sameSite: 'Lax' },
    guiOptions: {
      consentModal: { layout: 'box', position: 'bottom right', equalWeightButtons: true },
      preferencesModal: { layout: 'box', equalWeightButtons: true },
    },
    categories: { necessary: { enabled: true, readOnly: true }, analytics: { enabled: false } },
    language: { default: locale.value, translations: cookieConsentTranslations(withBase('/')) },
    onConsent: syncAnalytics,
    onChange: syncAnalytics,
    onModalShow: ({ modalName }) => {
      modalChange++
      openModals.add(modalName)
      syncLanguageNotice()
    },
    onModalHide: ({ modalName }) => {
      openModals.delete(modalName)
      const change = ++modalChange
      requestAnimationFrame(async () => {
        const animations = document.querySelector('#cc-main')?.getAnimations({ subtree: true }) ?? []
        await Promise.allSettled(animations.map(animation => animation.finished))
        if (change === modalChange) syncLanguageNotice()
      })
    },
  })
  if (disposed) return
  await consent.setLanguage(locale.value)
  syncAnalytics()
  syncLanguageNotice()
  initialized = true
})

watch(locale, value => { if (initialized) void consent?.setLanguage(value) })
onBeforeUnmount(() => { disposed = true; consent?.reset(false) })
</script>

<template>
  <!-- The library mounts its dialogs on the document body. -->
  <span hidden />
</template>
