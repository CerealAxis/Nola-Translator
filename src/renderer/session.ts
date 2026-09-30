import type { NolaTranslatorApi } from '../shared/bridge'
import type { AudioSource, ResourceSnapshot, SessionConfig } from '../shared/contracts'
import { HYMT2_MODEL_LABELS, type AppSettings, type TranslationSettings } from '../shared/settings'

type Provider = TranslationSettings['provider']

const PROVIDER_LABELS: Record<Provider, string> = {
  hymt2: 'Hy-MT2', m2m100: 'M2M100', microsoft: 'Microsoft', openai: 'OpenAI', ollama: 'Ollama',
}

/** One-glyph language tags for the compact overlay chip. */
const SHORT_LANGUAGE_LABELS: Record<string, string> = {
  zh: '中', yue: '粤', en: '英', ja: '日', ko: '韩', fr: '法', de: '德', es: '西',
  pt: '葡', it: '意', ru: '俄', ar: '阿', th: '泰', vi: '越', tr: '土', id: '印', ms: '马',
}

export function shortLanguageLabel(code: string): string {
  if (!code || code === 'auto') return '自动'
  return SHORT_LANGUAGE_LABELS[code] ?? code.toUpperCase()
}

/** The family name shown on the console pill, where horizontal space is tight. */
export function translationProviderLabel(provider: Provider): string {
  return PROVIDER_LABELS[provider]
}

/** The full model identity, used as the pill tooltip. */
export function translationModelDetail(translation: TranslationSettings): string {
  if (translation.provider === 'hymt2') {
    return `Hy-MT2 · ${HYMT2_MODEL_LABELS[translation.hymt2ModelId].split(' · ')[0]}`
  }
  const model = translation.provider === 'openai' ? translation.openaiModel
    : translation.provider === 'ollama' ? translation.ollamaModel : ''
  return model ? `${PROVIDER_LABELS[translation.provider]} · ${model}` : PROVIDER_LABELS[translation.provider]
}

/** Translate the persisted audio source id; an unknown device falls back to the system default output. */
export async function resolveAudioSource(api: NolaTranslatorApi, audioSourceId: string): Promise<AudioSource> {
  if (!audioSourceId || audioSourceId === 'defaultOutput') return { kind: 'defaultOutput' }
  const device = (await api.listDevices()).find((item) => item.deviceId === audioSourceId)
  return device ? { kind: device.kind, deviceId: device.deviceId } : { kind: 'defaultOutput' }
}

/** The single source of truth for how a session is configured, shared by the live page and the overlay. */
export function buildSessionConfig(settings: AppSettings, audioSource: AudioSource): SessionConfig {
  const { recognition, translation, overlay } = settings
  return {
    audioSource,
    recognitionMode: 'realtime',
    recognitionModelId: recognition.modelId,
    sourceLanguage: recognition.sourceLanguage,
    targetLanguages: overlay.showTranslation ? [translation.targetLanguage] : [],
    allowIntermediateTranslation: translation.translateIntermediate,
    translationProvider: translation.provider,
    translationModelId: translation.hymt2ModelId,
    translationOptions: translation.provider === 'microsoft'
      ? { endpoint: translation.microsoftEndpoint, region: translation.microsoftRegion }
      : translation.provider === 'openai'
        ? { endpoint: translation.openaiEndpoint, model: translation.openaiModel }
        : translation.provider === 'ollama'
          ? { endpoint: translation.ollamaEndpoint, model: translation.ollamaModel }
          : undefined,
  }
}

/** Returns the first required model that is not installed, so the caller can point the user at the resource page. */
export function findMissingResource(snapshot: ResourceSnapshot, config: SessionConfig): { name: string } | null {
  const translationResourceId = config.targetLanguages.length === 0 || !config.translationProvider
    ? null
    : config.translationProvider === 'hymt2'
      ? config.translationModelId ?? null
      : config.translationProvider === 'm2m100' ? 'm2m100-418m' : null
  const requiredIds = [config.recognitionModelId, ...(translationResourceId ? [translationResourceId] : [])]
  for (const id of requiredIds) {
    const record = id ? snapshot.resources.find((item) => item.resourceId === id) : undefined
    if (!record?.installed) return { name: record?.name ?? '所选识别' }
  }
  return null
}
