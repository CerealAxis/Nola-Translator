<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import { cookieConsentCopy, cookieConsentTranslations } from './cookieConsent'
import { localeOfPath } from './siteLocale'
import 'vanilla-cookieconsent/dist/cookieconsent.css'

const emit = defineEmits<{ analyticsChange: [enabled: boolean] }>()
const { page } = useData()
const locale = computed(() => localeOfPath(`/${page.value.relativePath}`, '/'))
const ready = ref(false)
let consent: typeof import('vanilla-cookieconsent') | undefined
let disposed = false

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
  })
  if (disposed) return
  await consent.setLanguage(locale.value)
  syncAnalytics()
  ready.value = true
})

watch(locale, value => { if (ready.value) void consent?.setLanguage(value) })
onBeforeUnmount(() => { disposed = true; consent?.reset(false) })
</script>

<template>
  <button v-if="ready" type="button" class="nola-cookie-settings z-dropdown" @click="consent?.showPreferences()">
    {{ cookieConsentCopy[locale].preferences }}
  </button>
</template>
