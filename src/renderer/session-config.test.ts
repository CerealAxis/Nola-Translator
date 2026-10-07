import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import { swappedLanguagesOf, targetLanguagePatch, translationFieldsOf, translationModelPatch } from './session-config'
import type { ResourceRecord } from '@/bridge'

describe('translation language choices', () => {
  const translator: ResourceRecord = {
    resourceId: 'hub:test/english-japanese', kind: 'translationModel', provider: 'llama.cpp',
    name: 'English/Japanese', description: '', installed: true, installedBytes: 1, state: 'idle', cancellable: false, languages: ['en', 'ja'],
    configuration: { slot: 'translation', engine: 'llama', languages: [], supportsAutoDetection: false, sourceLanguages: ['en', 'ja'], targetLanguages: ['en', 'ja'] },
  }

  it('restores a supported target when choosing a model after disabling translation', () => {
    const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, sourceLanguage: 'en' }, translation: { ...DEFAULT_SETTINGS.translation, targetLanguage: NO_TRANSLATION_LANGUAGE } }
    const patch = translationModelPatch(settings, translator)
    expect(patch).toMatchObject({ translation: { provider: 'local', localModelId: translator.resourceId, targetLanguage: 'ja' }, overlay: { showTranslation: true } })
    const translation = { ...settings.translation, ...patch?.translation }
    expect(translationFieldsOf(translation, { enabled: true })).toMatchObject({ targetLanguages: ['ja'], translationModelId: translator.resourceId })
  })

  it('keeps a compatible target when changing the translation model', () => {
    const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, sourceLanguage: 'en' }, translation: { ...DEFAULT_SETTINGS.translation, targetLanguage: 'ja' } }
    expect(translationModelPatch(settings, translator)?.translation?.targetLanguage).toBe('ja')
  })

  it('refuses pending models and translators that cannot translate the recognition language', () => {
    expect(translationModelPatch(DEFAULT_SETTINGS, { ...translator, configuration: undefined })).toBeNull()
    expect(translationModelPatch({ ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, sourceLanguage: 'zh' } }, translator)).toBeNull()
  })
  it.each(['local', 'cloud', 'microsoft'] as const)('omits the %s translation pipeline when no translation is selected', provider => {
    const translation = { ...DEFAULT_SETTINGS.translation, provider, targetLanguage: NO_TRANSLATION_LANGUAGE }
    expect(translationFieldsOf(translation, { enabled: true })).toEqual({ targetLanguages: [] })
    expect(translationFieldsOf(DEFAULT_SETTINGS.translation, { enabled: true, targetLanguage: NO_TRANSLATION_LANGUAGE })).toEqual({ targetLanguages: [] })
  })

  it('allows a session to explicitly re-enable translation with a concrete language', () => {
    const translation = { ...DEFAULT_SETTINGS.translation, targetLanguage: NO_TRANSLATION_LANGUAGE }
    expect(translationFieldsOf(translation, { enabled: true, targetLanguage: 'fr' })).toMatchObject({ targetLanguages: ['fr'], translationProvider: 'local' })
  })

  it('resolves auto detection to English on swap and rejects invalid reverse languages', () => {
    expect(swappedLanguagesOf('auto', 'zh')).toEqual({ sourceLanguage: 'zh', targetLanguage: 'en' })
    expect(swappedLanguagesOf('fr', 'de')).toEqual({ sourceLanguage: 'de', targetLanguage: 'fr' })
    expect(swappedLanguagesOf('auto', NO_TRANSLATION_LANGUAGE)).toBeNull()
    expect(swappedLanguagesOf('yue', 'zh', ['zh', 'yue'], ['zh'])).toBeNull()
    expect(swappedLanguagesOf('yue', 'zh')).toEqual({ sourceLanguage: 'zh', targetLanguage: 'yue' })
    expect(swappedLanguagesOf('zh', 'ms', ['zh', 'en'], ['zh', 'ms'])).toBeNull()
  })

  it('shows the source when translation is disabled and restores translation when a language is selected', () => {
    expect(targetLanguagePatch(NO_TRANSLATION_LANGUAGE, 'zh')).toEqual({ translation: { targetLanguage: NO_TRANSLATION_LANGUAGE }, overlay: { showSource: true, showTranslation: false } })
    expect(targetLanguagePatch('fr', NO_TRANSLATION_LANGUAGE)).toEqual({ translation: { targetLanguage: 'fr' }, overlay: { showTranslation: true } })
    expect(targetLanguagePatch('fr', 'zh')).toEqual({ translation: { targetLanguage: 'fr' } })
  })
})
