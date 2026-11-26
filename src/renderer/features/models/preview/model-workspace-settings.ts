import { astrBotSpeechPreset, astrBotSpeechBinding } from '../../../../shared/astrbot-speech-presets'
import { actions, stores, updateSettings } from '@/store'
import { TRANSLATION_PRESETS } from '../../../../shared/provider-presets'
import { customCredentialSlot, customModelPatch, customModelsOf, customModelSchema, providerGroupOf } from '../../../../shared/custom-models'
import { LANGUAGE_CODES } from '../../../../shared/languages'
import { isCloudModelDisabled, isModelEnabled, modelPolicyKey, modelPolicyOf } from '../../../../shared/model-policy'
import { modelWorkspaceSchema, type ModelWorkspace, type WorkspaceConnection } from '../../../../shared/model-workspace'
import { ALIYUN_ASR_MODELS, DEFAULT_SETTINGS, MINIMAX_RECOGNITION_MODELS, MIMO_TTS_BINDING, REALTIME_S2S_MODELS, SOURCE_LANGUAGE_OPTIONS, defaultRealtimeS2s, type AppSettings, type AppSettingsPatch, type CredentialProvider } from '../../../../shared/settings'
import { newConnection, templates, type CloudModel, type Connection, type Service } from './cloud-preview-data'
import { CHATGPT_PLAN_SERVICE } from '../../../../shared/chatgpt-plan'
import { synthesisVoiceRef } from '../../../../shared/tts/settings-migration'

export const emptyWorkspace: ModelWorkspace = { connections: [], localSources: {} }

let pendingSave = Promise.resolve()

export function enqueueModelWorkspaceSave(save: () => Promise<void>) {
  const next = pendingSave.then(save)
  pendingSave = next.catch(() => undefined)
  return next
}

function randomId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 24)
}

export function createWorkspaceConnection(service: Service, capability: Connection['capability']) {
  return newConnection(service, capability, capability === 'LLM' ? `provider_${randomId()}` : `${capability}-${service}`)
}

export function credentialSlot(connection: Connection): CredentialProvider | undefined {
  if (connection.service === CHATGPT_PLAN_SERVICE) return undefined
  if (connection.capability === 'LLM') return customCredentialSlot(connection.id)
  if (connection.service === 'mimo') return 'mimo-tts'
  const speech = astrBotSpeechPreset(connection.service)
  if (speech) return speech.keyless ? undefined : customCredentialSlot(connection.id)
  if (connection.service === 'aliyun') return 'aliyun-asr'
  if (connection.service === 'minimax') return 'minimax-asr'
  return undefined
}

const fixedSources = [
  ['aliyun', 'ASR'], ['minimax', 'ASR'], ['aliyun', 'S2S'], ['mimo', 'TTS'],
  ['index', 'MT'], ['mymemory', 'MT'], ['microsoft', 'MT'], ['google', 'MT'],
] as const

function fixedBinding(connection: Connection) {
  return connection.service === 'mimo' ? MIMO_TTS_BINDING
    : `cloud:${connection.service === 'index' ? 'index-translate' : connection.service}`
}

function fixedModel(settings: AppSettings, connection: Connection, saved: WorkspaceConnection | undefined) {
  switch (connection.capability) {
    case 'ASR':
      return connection.service === 'aliyun' ? settings.recognition.aliyunModel ?? ALIYUN_ASR_MODELS[0]
        : settings.recognition.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0]
    case 'S2S': return settings.realtime?.s2sModel ?? defaultRealtimeS2s(settings) ?? saved?.models[0]?.id ?? REALTIME_S2S_MODELS[0]
    default: return connection.service === 'index' ? settings.translation.providerOverrides?.['index-translate']?.model
      ?? templates.index.models.MT?.[0] : templates[connection.service].models[connection.capability]?.[0]
  }
}

function fixedEnabled(settings: AppSettings, connection: Connection) {
  if (connection.capability === 'S2S') return Boolean(defaultRealtimeS2s(settings))
  const kind = fixedKind(connection)
  const binding = fixedBinding(connection)
  return kind === 'tts' ? isModelEnabled(settings, kind, binding) : !isCloudModelDisabled(settings, kind, binding)
}

function fixedKind(connection: Connection) {
  return connection.capability === 'ASR' ? 'asr' : connection.capability === 'TTS' ? 'tts' : 'mt'
}

export function configuredConnections(settings: AppSettings, credentials: Readonly<Record<CredentialProvider, boolean>>): Connection[] {
  const saved = settings.modelWorkspace?.connections ?? []
  const profiles = customModelsOf(settings.translation)
  const connections = new Map<string, Connection>()
  for (const entry of saved) {
    if (entry.capability === 'LLM') connections.set(entry.id, { ...entry, key: '', models: [] })
    else if (astrBotSpeechPreset(entry.service)) connections.set(entry.id, { ...entry, key: '' })
  }
  const legacyNames: Partial<Record<Service, string>> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini' }
  for (const profile of profiles) {
    const group = saved.find(entry => entry.capability === 'LLM' && entry.models.some(model => model.profileId === profile.id))?.id
      ?? providerGroupOf(profile.id) ?? profile.id
    const metadata = saved.find(entry => entry.id === group)
    const oldModel = metadata?.models.find(model => model.profileId === profile.id)
    const known = TRANSLATION_PRESETS.find(preset => preset.id in legacyNames
      && [preset.name, legacyNames[preset.id as Service]].includes(profile.name)
      && preset.endpoint.replace(/\/+$/, '') === profile.endpoint.replace(/\/+$/, '') && preset.apiFormat === profile.apiFormat)
    const connection = connections.get(group) ?? newConnection(known ? known.id as Service : 'compatible', 'LLM', group)
    if (!connection.models.length) {
      const storedName = metadata?.name ?? profile.name
      connection.name = !metadata && storedName === legacyNames[connection.service] ? templates[connection.service].name : storedName
      connection.endpoint = profile.endpoint
      connection.protocol = metadata?.protocol ?? profile.apiFormat
    }
    connection.models.push({
      id: profile.model, name: profile.name, profileId: profile.id,
      enabled: !isCloudModelDisabled(settings, 'llm', `custom:${profile.id}`),
      llm: { ...oldModel?.llm, id: profile.model, name: profile.name, images: !!profile.images,
        contextWindow: profile.contextWindow, maxOutputTokens: profile.maxOutputTokens },
    })
    connections.set(group, connection)
  }
  for (const [service, capability] of fixedSources) {
    const template = createWorkspaceConnection(service, capability)
    const metadata = saved.find(entry => entry.id === template.id)
    if (service === 'mimo' && !metadata && saved.some(entry => entry.service === 'mimo')) continue
    const slot = credentialSlot(template)
    const enabled = fixedEnabled(settings, template)
    const binding = fixedBinding(template)
    const kind = fixedKind(template)
    const registered = capability === 'S2S' ? enabled : isModelEnabled(settings, kind, binding)
    const hasLegacyCredential = slot && capability !== 'S2S' && credentials[slot] && !isCloudModelDisabled(settings, kind, binding)
    if (!metadata && !registered && !hasLegacyCredential) continue
    const connection = { ...template, ...metadata, key: '' }
    if (service === 'aliyun') {
      connection.endpoint = (capability === 'S2S' ? settings.recognition.aliyunS2sEndpoint : settings.recognition.aliyunAsrEndpoint) ?? connection.endpoint
      connection.workspace = settings.recognition.aliyunWorkspaceId ?? ''
      connection.region = settings.recognition.aliyunRegion ?? 'cn-beijing'
    } else if (service === 'minimax') {
      connection.endpoint = settings.recognition.minimaxEndpoint ?? template.endpoint
    } else if (service === 'mymemory') {
      connection.endpoint = settings.translation.mymemoryEndpoint ?? template.endpoint
    }
    if (service === 'mimo') {
      if (metadata?.models.length) {
        connection.models = metadata.models.map(model => model.profileId ? model : { ...model, enabled })
        connections.set(connection.id, connection)
        continue
      }
    }
    const id = fixedModel(settings, connection, metadata)
    connection.models = metadata ? metadata.models.map(model => ({
      ...model, enabled, ...(capability === 'ASR' || capability === 'S2S' || service === 'index' ? { id: id ?? model.id, name: id ?? model.name } : {}),
    })) : id ? [{ id, name: id, enabled, ...(capability === 'TTS' ? { tts: { defaultVoiceRef: synthesisVoiceRef(settings) } } : {}) }] : []
    connections.set(connection.id, connection)
  }
  return [...connections.values()]
}

function llmPatch(settings: AppSettings, connection: Connection, previous: Connection, models: CloudModel[]): AppSettingsPatch {
  const current = customModelsOf(settings.translation)
  const removed = new Set(previous.models.map(model => model.profileId))
  const profiles = models.map(model => {
    const existing = current.find(profile => profile.id === model.profileId)
    return customModelSchema.parse({
      id: model.profileId, name: model.name.slice(0, 64), model: model.id,
      endpoint: existing && connection.endpoint === previous.endpoint ? existing.endpoint : connection.endpoint,
      apiFormat: existing && connection.protocol === previous.protocol ? existing.apiFormat : ['google-native', 'azure-openai'].includes(connection.protocol) ? 'chat-completions' : connection.protocol,
      contextWindow: model.llm?.contextWindow, maxOutputTokens: model.llm?.maxOutputTokens, images: model.llm?.images,
      languages: [...LANGUAGE_CODES],
      sourceLanguages: [...SOURCE_LANGUAGE_OPTIONS],
    })
  })
  const ids = new Set(profiles.map(profile => profile.id))
  const customModels = [
    ...current.flatMap(profile => profiles.find(next => next.id === profile.id) ?? (removed.has(profile.id) ? [] : profile)),
    ...profiles.filter(profile => !current.some(existing => existing.id === profile.id)),
  ]
  const active = settings.translation.customModelId || (settings.translation.provider === 'cloud' ? 'legacy' : '')
  const replacement = profiles.find(profile => profile.id === active)
  const policy = settings.modelPolicy ? { enabled: {}, defaults: {}, selections: {} } : modelPolicyOf(settings)
  const enabled = { ...policy.enabled }
  for (const id of removed) {
    if (!id || ids.has(id)) continue
    enabled[modelPolicyKey('llm', `custom:${id}`)] = false
    enabled[modelPolicyKey('mt', `mt-custom:${id}`)] = false
  }
  for (const model of models) enabled[modelPolicyKey('llm', `custom:${model.profileId}`)] = model.enabled
  return {
    translation: {
      customModels,
      ...(replacement ? { ...customModelPatch(settings.translation, replacement), provider: settings.translation.provider,
        targetLanguage: settings.translation.targetLanguage } : {}),
      ...(!replacement && removed.has(active) ? { customModelId: '', cloudName: '', cloudEndpoint: DEFAULT_SETTINGS.translation.cloudEndpoint,
        ...(settings.translation.provider === 'cloud' ? { provider: 'mymemory' as const } : {}) } : {}),
    },
    modelPolicy: { ...policy, enabled },
  }
}

function fixedPatch(settings: AppSettings, connection: Connection): AppSettingsPatch {
  const model = connection.models[0]
  if (connection.capability === 'S2S') {
    const s2sModel = REALTIME_S2S_MODELS.find(id => id === model?.id)
    const disabledModel = !model?.enabled ? (s2sModel ?? settings.realtime?.s2sModel ?? defaultRealtimeS2s(settings)) : null
    const overrides: NonNullable<AppSettingsPatch['realtime']> = {}
    for (const field of ['quickS2sModel', 'workspaceS2sModel', 'browserS2sModel'] as const) {
      if (disabledModel && settings.realtime?.[field] === disabledModel) overrides[field] = null
    }
    return { recognition: { aliyunS2sEndpoint: connection.endpoint, aliyunWorkspaceId: connection.workspace, aliyunRegion: connection.region === 'ap-southeast-1' ? connection.region : 'cn-beijing' },
      realtime: { s2sModel: model?.enabled && s2sModel ? s2sModel : null, defaultPipeline: model?.enabled ? 's2s' : 'cascade',
        ...overrides } }
  }
  const kind = fixedKind(connection)
  const policy = settings.modelPolicy ? { enabled: {}, defaults: {}, selections: {} } : modelPolicyOf(settings)
  const patch: AppSettingsPatch = { modelPolicy: { ...policy, enabled: {
    ...policy.enabled, [modelPolicyKey(kind, fixedBinding(connection))]: !!model?.enabled,
  } } }
  if (connection.service === 'aliyun') patch.recognition = { aliyunAsrEndpoint: connection.endpoint, aliyunWorkspaceId: connection.workspace,
    aliyunRegion: connection.region === 'ap-southeast-1' ? connection.region : 'cn-beijing',
    aliyunModel: ALIYUN_ASR_MODELS.find(id => id === model?.id) }
  if (connection.service === 'minimax') patch.recognition = { minimaxEndpoint: connection.endpoint,
    minimaxModel: MINIMAX_RECOGNITION_MODELS.find(id => id === model?.id) }
  const provider = connection.service === 'index' ? 'index-translate' : connection.service
  if (provider === 'google' || provider === 'microsoft' || provider === 'index-translate') {
    patch.translation = { providerOverrides: { ...settings.translation.providerOverrides,
      [provider]: { endpoint: connection.endpoint, ...(provider === 'index-translate' && model ? { model: model.id } : {}) },
    } }
  }
  if (connection.service === 'mymemory') patch.translation = { mymemoryEndpoint: connection.endpoint }
  return patch
}

export async function saveWorkspaceConnection(connection: Connection, previous?: Connection, removing = false, keepCredential = false): Promise<void> {
  const settings = stores.settings.getState().settings
  if (!settings) throw new Error('Model settings are unavailable')
  let models = connection.capability === 'LLM' ? connection.models.map(model => ({
    ...model, profileId: model.profileId ?? (connection.id.startsWith('provider_') ? `${connection.id}_${randomId()}` : randomId()),
  })) : astrBotSpeechPreset(connection.service)
    ? connection.models.map((model, index) => index > 0 && !model.profileId ? { ...model, profileId: randomId() } : model)
    : connection.models
  const speech = astrBotSpeechPreset(connection.service)
  if (connection.capability === 'TTS' && speech) models = models.map(model => {
    const binding = astrBotSpeechBinding(speech.id, model.profileId)
    const selected = model.tts?.defaultVoiceRef
    return { ...model, tts: { ...model.tts,
      defaultVoiceRef: selected?.kind === 'preset' ? { ...selected, modelBinding: binding } : selected ?? { kind: 'engine-default' } } }
  })
  const { key, ...saved } = { ...connection, models }
  const slot = credentialSlot(previous ?? connection)
  const patch = connection.capability === 'LLM' ? llmPatch(settings, connection, previous ?? connection, models) : connection.service !== 'mimo' && astrBotSpeechPreset(connection.service) ? {} : fixedPatch(settings, { ...saved, key })
  const workspace = settings.modelWorkspace ?? emptyWorkspace
  const existing = workspace.connections.some(entry => entry.id === saved.id)
  const connections = removing ? workspace.connections.filter(entry => entry.id !== saved.id)
    : existing ? workspace.connections.map(entry => entry.id === saved.id ? saved : entry)
      : [...workspace.connections, saved]
  const managedBindings = new Set(workspace.managedBindings)
  if (connection.capability === 'LLM') {
    for (const model of previous?.models ?? []) if (model.profileId) managedBindings.delete(modelPolicyKey('llm', `custom:${model.profileId}`))
    for (const model of models) if (model.profileId) managedBindings.add(modelPolicyKey('llm', `custom:${model.profileId}`))
  } else if (connection.capability !== 'S2S' && (connection.service === 'mimo' || !astrBotSpeechPreset(connection.service))) {
    managedBindings.add(modelPolicyKey(fixedKind(connection), fixedBinding(connection)))
  }
  const modelWorkspace = modelWorkspaceSchema.parse({ ...workspace, connections, managedBindings: [...managedBindings] })
  if (slot && key.trim()) await actions.models.setTranslationCredential(slot, key.trim())
  await updateSettings({ ...patch, modelWorkspace })
  if (removing && slot && !keepCredential) await actions.models.setTranslationCredential(slot, '')
}
