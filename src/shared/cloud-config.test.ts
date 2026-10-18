import { expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { recognitionFieldsOf, recognitionLabel, remoteSourceLanguages, supportsRecognitionNativeTranslation, translationOptionsOf } from './cloud-config'
import { sessionConfigSchema } from './schemas'
import { INDEX_TRANSLATE_ENDPOINT, INDEX_TRANSLATE_PUBLIC_MODEL } from './index-translate'
import { GOOGLE_TRANSLATE_ENDPOINT } from './google-translate'

it('builds credential-free Aliyun configuration without replacing the saved local model', () => {
  const recognition = { ...DEFAULT_SETTINGS.recognition, provider: 'aliyun' as const, aliyunWorkspaceId: 'workspace-123', aliyunRegion: 'ap-southeast-1' as const }
  expect(recognitionFieldsOf(recognition)).toEqual({ recognitionProvider: 'aliyun', recognitionOptions: { workspaceId: 'workspace-123', region: 'ap-southeast-1', model: 'qwen3.8-livetranslate-flash-realtime' } })
  expect(remoteSourceLanguages(recognition)).toEqual(['auto'])
  expect(remoteSourceLanguages({ ...recognition, aliyunModel: 'qwen3.5-livetranslate-flash-realtime' })).toContain('ja')
  expect(recognitionFieldsOf(DEFAULT_SETTINGS.recognition)).toEqual({ recognitionProvider: 'local' })
})

it('passes MyMemory public settings while native translation has no separate connection', () => {
  expect(translationOptionsOf({ ...DEFAULT_SETTINGS.translation, provider: 'mymemory', mymemoryEmail: 'test@example.com' })).toEqual({ endpoint: 'https://api.mymemory.translated.net/get', email: 'test@example.com' })
  expect(translationOptionsOf({ ...DEFAULT_SETTINGS.translation, provider: 'recognition' })).toBeUndefined()
})

it('builds the official Google Translation endpoint without putting the API key in settings', () => {
  expect(translationOptionsOf({ ...DEFAULT_SETTINGS.translation, provider: 'google' })).toEqual({ endpoint: GOOGLE_TRANSLATE_ENDPOINT })
})

it('fixes the public Index-Translate connection independently of saved cloud settings', () => {
  const options = translationOptionsOf({ ...DEFAULT_SETTINGS.translation, provider: 'index-translate', cloudEndpoint: 'https://other.example/v1', cloudModel: 'other-model' })
  expect(options).toEqual({ endpoint: INDEX_TRANSLATE_ENDPOINT, model: INDEX_TRANSLATE_PUBLIC_MODEL, apiFormat: 'chat-completions', contextWindow: 32768, maxOutputTokens: 1024 })
  expect(sessionConfigSchema.parse({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: ['zh'], translationProvider: 'index-translate', translationOptions: options }).translationProvider).toBe('index-translate')
})

it('preserves remote fields across the session IPC boundary and rejects deferred providers', () => {
  const config = { audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: ['zh'],
    ...recognitionFieldsOf({ ...DEFAULT_SETTINGS.recognition, provider: 'aliyun', aliyunWorkspaceId: 'workspace' }), translationProvider: 'mymemory', translationOptions: { email: 'test@example.com' } }
  expect(sessionConfigSchema.parse(config)).toEqual(config)
  expect(sessionConfigSchema.safeParse({ ...config, recognitionProvider: 'openai' }).success).toBe(false)
})

it('builds a MiniMax file-upload configuration and narrows its source languages to the 20 it accepts', () => {
  const recognition = { ...DEFAULT_SETTINGS.recognition, provider: 'minimax' as const, minimaxEndpoint: 'https://api.minimax.io/v1/speech_to_text' }
  expect(recognitionFieldsOf(recognition)).toEqual({ recognitionProvider: 'minimax', recognitionOptions: { endpoint: 'https://api.minimax.io/v1/speech_to_text', model: 'asr-1.0' } })
  expect(recognitionLabel(recognition)).toBe('asr-1.0')
  // A language outside MiniMax's list must not stay selectable just because Aliyun accepts it.
  expect(remoteSourceLanguages(recognition)).toContain('yue')
  expect(remoteSourceLanguages(recognition)).toContain('tl')
  expect(remoteSourceLanguages(recognition)).not.toContain('hi')
  expect(remoteSourceLanguages(recognition)).not.toContain('no')
  expect(supportsRecognitionNativeTranslation('minimax')).toBe(false)
  expect(supportsRecognitionNativeTranslation('aliyun')).toBe(true)
})
