import { describe, expect, it } from 'vitest'
import { buildAvailableModels, modelBindingPatch, resolveModelBinding, savedBindingOf, type AvailableModel } from './available-models'
import { DEFAULT_SETTINGS, type AppSettings, type CredentialProvider } from '../shared/settings'
import type { ModelGatewaySnapshot } from '../shared/model-gateway'
import type { ResourceRecord } from '../shared/contracts'

/** The catalog only reads which slots hold a key, so a sparse record is enough for a fixture. */
const credentials = (stored: CredentialProvider[]): Readonly<Record<CredentialProvider, boolean>> =>
  Object.fromEntries(stored.map(slot => [slot, true])) as Record<CredentialProvider, boolean>

const snapshotWith = (kind: keyof ModelGatewaySnapshot['services'], model: string, name: string): ModelGatewaySnapshot => ({
  state: 'running', address: 'http://127.0.0.1:17860/v1', port: 17860, connections: 0, activeRequests: 0, requests: [],
  services: {
    ...({ asr: { state: 'stopped', model: '', name: '' }, mt: { state: 'stopped', model: '', name: '' },
      tts: { state: 'stopped', model: '', name: '' }, llm: { state: 'stopped', model: '', name: '' } } as ModelGatewaySnapshot['services']),
    [kind]: { state: 'ready', model, name },
  },
})

const asrRecord = { resourceId: 'sense-voice-small', name: 'SenseVoice', kind: 'recognitionModel', installed: true } as ResourceRecord
const settings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS, ...overrides,
  recognition: { ...DEFAULT_SETTINGS.recognition, aliyunWorkspaceId: 'workspace', ...overrides.recognition },
  modelPolicy: overrides.modelPolicy ?? { enabled: { 'asr:resource:sense-voice-small': true, 'asr:cloud:aliyun': true, 'mt:resource:mt-test': true }, defaults: {}, selections: {} },
})

it('lists the model the gateway loaded and every configured cloud interface', () => {
  const catalog = buildAvailableModels({ settings: settings(), resources: [asrRecord],
    credentials: credentials(['aliyun-asr']), snapshot: snapshotWith('asr', 'resource:sense-voice-small', 'SenseVoice'),
    names: { 'cloud:aliyun': '阿里云ASR' } })
  expect(catalog.asr.map(model => model.binding)).toEqual(['resource:sense-voice-small', 'cloud:aliyun'])
  expect(catalog.asr[0]).toMatchObject({ origin: 'gateway', free: true, name: 'SenseVoice' })
  expect(catalog.asr[1]).toMatchObject({ origin: 'cloud', free: false, name: '阿里云ASR' })
})

it('leaves an installed but unloaded local model out of the catalog', () => {
  const catalog = buildAvailableModels({ settings: settings(), resources: [asrRecord], credentials: credentials([]), snapshot: null })
  expect(catalog.asr).toEqual([])
})

describe('resolveModelBinding', () => {
  const loaded: AvailableModel = { binding: 'resource:qwen-asr', name: 'Qwen ASR', kind: 'asr', origin: 'gateway', free: true }
  const paid: AvailableModel = { binding: 'cloud:aliyun', name: 'Aliyun', kind: 'asr', origin: 'cloud', free: false }

  it('keeps a selection that is still callable', () => {
    expect(resolveModelBinding('asr', 'cloud:aliyun', [loaded, paid])).toEqual({ binding: 'cloud:aliyun', replaced: null, unavailable: false })
  })

  it('moves a stale selection to the model the gateway loaded', () => {
    expect(resolveModelBinding('asr', 'resource:sense-voice-small', [loaded, paid]).replaced).toBe(loaded)
  })

  it('does not cross to cloud interfaces when a local selection becomes unavailable', () => {
    const free: AvailableModel = { binding: 'cloud:mymemory', name: 'MyMemory', kind: 'mt', origin: 'cloud', free: true }
    expect(resolveModelBinding('mt', 'resource:translator', [paid, free])).toMatchObject({ replaced: null, unavailable: true })
    expect(resolveModelBinding('asr', 'resource:sense-voice-small', [paid])).toMatchObject({ replaced: null, unavailable: true })
  })

  it('reports nothing callable rather than inventing a binding', () => {
    expect(resolveModelBinding('asr', 'resource:sense-voice-small', [])).toMatchObject({ binding: 'resource:sense-voice-small', unavailable: true })
  })
})

const legacySettings = (overrides: Partial<AppSettings>) => ({ ...settings(overrides), modelPolicy: undefined })

it('reads the saved selection of each capability in binding form', () => {
  expect(savedBindingOf('asr', legacySettings({ recognition: { ...DEFAULT_SETTINGS.recognition, provider: 'aliyun' } }))).toBe('cloud:aliyun')
  expect(savedBindingOf('tts', legacySettings({ synthesis: { ...DEFAULT_SETTINGS.synthesis, modelId: 'cosyvoice' } }))).toBe('resource:cosyvoice')
  expect(savedBindingOf('mt', legacySettings({ translation: { ...DEFAULT_SETTINGS.translation, provider: 'mymemory' } }))).toBe('cloud:mymemory')
  expect(savedBindingOf('mt', legacySettings({ translation: { ...DEFAULT_SETTINGS.translation, targetLanguage: 'none', provider: 'local', localModelId: '' } }))).toBe('')
})

it('lists a loaded translation model when recognition is stopped', () => {
  const catalog = buildAvailableModels({ settings: settings(), resources: [{ resourceId: 'mt-test', installed: true, kind: 'translationModel' } as ResourceRecord], credentials: credentials([]),
    snapshot: snapshotWith('mt', 'resource:mt-test', 'Translator') })
  expect(catalog.mt[0]).toMatchObject({ binding: 'resource:mt-test', origin: 'gateway' })
})


it('requires enablement for local models while configured cloud services remain callable', () => {
  const configured = settings({ modelPolicy: { enabled: {}, defaults: {}, selections: {} } })
  const catalog = buildAvailableModels({ settings: configured, resources: [asrRecord], credentials: credentials(['aliyun-asr']),
    snapshot: snapshotWith('asr', 'resource:sense-voice-small', 'SenseVoice') })
  expect(catalog.asr.map(model => model.binding)).toEqual(['cloud:aliyun'])
  expect(catalog.mt.map(model => model.binding)).toEqual(['cloud:mymemory', 'cloud:index-translate'])
})

it('excludes a removed resource even if an old snapshot still reports it ready', () => {
  const catalog = buildAvailableModels({ settings: settings(), resources: [], credentials: credentials([]),
    snapshot: snapshotWith('asr', 'resource:sense-voice-small', 'SenseVoice') })
  expect(catalog.asr).toEqual([])
})

it('keeps scene selections separate from gateway loading configuration', () => {
  const configured = settings()
  for (const [kind, binding] of [['llm', 'custom:chat'], ['asr', 'resource:sense-voice-small'], ['mt', 'cloud:mymemory'], ['tts', 'resource:voice']] as const) {
    const patch = modelBindingPatch(kind, binding, configured)
    expect(patch.modelGateway).toBeUndefined()
    expect(patch.modelPolicy?.selections?.[kind]).toBe(binding)
  }
})


it('offers native cloud translation with enabled Aliyun ASR without a loaded gateway service', () => {
  const configured = settings({ modelPolicy: { enabled: { 'asr:cloud:aliyun': true, 'mt:cloud:recognition': true }, defaults: {}, selections: { asr: 'cloud:aliyun' } } })
  const catalog = buildAvailableModels({ settings: configured, resources: [], credentials: credentials(['aliyun-asr']), snapshot: null })
  expect(catalog.mt.map(model => model.binding)).toContain('cloud:recognition')
})

it('hides native translation when the selected recognition service cannot provide it', () => {
  const configured = settings({ modelPolicy: { enabled: { 'asr:cloud:aliyun': true, 'asr:cloud:minimax': true, 'mt:cloud:recognition': true }, defaults: {}, selections: { asr: 'cloud:minimax' } } })
  const catalog = buildAvailableModels({ settings: configured, resources: [], credentials: credentials(['aliyun-asr', 'minimax-asr']), snapshot: null })
  expect(catalog.mt.map(model => model.binding)).not.toContain('cloud:recognition')
})

it('excludes enabled cloud profiles whose required configuration is missing', () => {
  const profile = { id: 'invalid', name: 'Invalid profile', endpoint: '', model: '', apiFormat: 'anthropic' as const, contextWindow: 32768, maxOutputTokens: 1024, languages: ['en'] }
  const configured = settings({ translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] }, modelPolicy: { enabled: { 'llm:custom:invalid': true, 'mt:mt-custom:invalid': true }, defaults: {}, selections: {} } })
  const catalog = buildAvailableModels({ settings: configured, resources: [], credentials: credentials([]), snapshot: null })
  expect(catalog.llm).toEqual([])
  expect(catalog.mt.map(model => model.binding)).not.toContain('mt-custom:invalid')
  expect(catalog.mt.map(model => model.binding)).toEqual(['cloud:mymemory', 'cloud:index-translate'])
})


it.each(['stopped', 'starting', 'stopping', 'failed'] as const)('hides local models when the gateway is %s despite a stale ready service', state => {
  const snapshot = { ...snapshotWith('asr', 'resource:sense-voice-small', 'SenseVoice'), state }
  const catalog = buildAvailableModels({ settings: settings(), resources: [asrRecord], credentials: credentials([]), snapshot })
  expect(catalog.asr).toEqual([])
})

it.each(['stopped', 'loading', 'failed'] as const)('hides a local model whose service is %s while the gateway runs', state => {
  const snapshot = snapshotWith('asr', 'resource:sense-voice-small', 'SenseVoice')
  snapshot.services.asr.state = state
  expect(buildAvailableModels({ settings: settings(), resources: [asrRecord], credentials: credentials([]), snapshot }).asr).toEqual([])
})
