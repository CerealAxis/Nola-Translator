<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import { siteUrl } from './content'
import { cookieConsentTranslations } from './cookieConsent'
import { localeOfPath } from './siteLocale'
import 'vanilla-cookieconsent/dist/cookieconsent.css'

const emit = defineEmits<{ analyticsChange: [enabled: boolean]; languageNoticeReady: [ready: boolean] }>()
const { page } = useData()
const locale = computed(() => localeOfPath(`/${page.value.relativePath}`, '/'))
let initialized = false
let consent: typeof import('vanilla-cookieconsent') | undefined
let clarityStarted = false
let disposed = false
const openModals = new Set<string>()
let modalChange = 0

const syncLanguageNotice = () => {
  if (!disposed) emit('languageNoticeReady', Boolean(consent?.validConsent() && !openModals.size))
}

type ClarityConsentCall = ['consentv2', { analytics_Storage: 'granted' | 'denied'; ad_Storage: 'denied' }]

function syncClarity(enabled: boolean) {
  if (location.hostname !== new URL(siteUrl).hostname || enabled === clarityStarted) return
  const browser = window as Window & { clarity?: ((...args: ClarityConsentCall) => void) & { q?: ClarityConsentCall[] } }
  if (!enabled) {
    clarityStarted = false
    browser.clarity?.('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' })
    // Clarity can still collect cookieless events after denial. Reload with the tag disabled.
    location.reload()
    return
  }
  const queue: ClarityConsentCall[] = []
  browser.clarity ??= Object.assign((...args: ClarityConsentCall) => { queue.push(args) }, { q: queue })
  browser.clarity('consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' })
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://www.clarity.ms/tag/zfzhpkwd6y?ref=bwt'
  clarityStarted = true
  document.head.append(script)
}

onMounted(async () => {
  consent = await import('vanilla-cookieconsent')
  if (disposed) return
  const syncAnalytics = () => {
    const enabled = Boolean(consent?.validConsent() && consent.acceptedCategory('analytics'))
    emit('analyticsChange', enabled)
    syncClarity(enabled)
  }
  await consent.run({
    mode: 'opt-in',
    revision: 1,
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
