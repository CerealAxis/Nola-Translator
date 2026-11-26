import { z } from 'zod'
import { astrBotSpeechBinding, astrBotSpeechPreset, astrBotSpeechPresetForBinding, astrBotSpeechPresets } from './astrbot-speech-presets'
import { astrBotChatPresets } from './astrbot-chat-presets'
import { localChatSettingsSchema } from './language-model'
import { CHATGPT_PLAN_ENDPOINT, CHATGPT_PLAN_SERVICE } from './chatgpt-plan'
import { ttsVoiceRefSchema } from './tts/voice-ref'
import { ttsModelCapabilitiesSchema } from './tts/capabilities'

export const workspaceCapabilities = ['LLM', 'ASR', 'MT', 'TTS', 'S2S'] as const
const workspaceServices = [
  ...astrBotSpeechPresets.map(preset => preset.id),
  ...astrBotChatPresets.map(preset => preset.id), 'ollama',
  CHATGPT_PLAN_SERVICE, 'compatible', 'aliyun', 'minimax', 'index', 'mymemory', 'microsoft', 'google',
] as const
export type WorkspaceService = typeof workspaceServices[number]

const modelId = z.string().min(1).max(256)
const profileId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)
const model = z.object({
  id: modelId,
  name: modelId,
  enabled: z.boolean(),
  tts: z.object({ defaultVoiceRef: ttsVoiceRefSchema.optional(),
    presetVoiceIds: z.array(z.string().min(1).max(512)).max(10000).optional(),
    capabilityOverride: ttsModelCapabilitiesSchema.partial().optional(),
  }).strict().optional(),
  profileId: profileId.optional(),
  llm: z.object({
    id: modelId,
    name: modelId,
    contextWindow: z.number().int().min(256).max(10_000_000),
    maxOutputTokens: z.number().int().min(1).max(10_000_000),
    images: z.boolean(),
    video: z.boolean().optional(),
    pdf: z.boolean().optional(),
    reasoningLevels: z.array(z.string().max(64)).optional(),
    reasoningLevelsDefault: z.boolean().optional(),
  }).strict().optional(),
}).strict()

const connection = z.object({
  id: profileId,
  service: z.enum(workspaceServices),
  capability: z.enum(workspaceCapabilities),
  name: z.string().min(1).max(64),
  endpoint: z.string().max(2048),
  protocol: z.string().max(32),
  workspace: z.string().max(256),
  region: z.string().max(32),
  options: z.record(z.string().max(32), z.string().max(2048)).optional(),
  icon: z.string().max(128).optional(),
  models: z.array(model).max(100),
}).strict()

export const modelWorkspaceSchema = z.object({
  connections: z.array(connection.refine(item => {
    if (item.service === CHATGPT_PLAN_SERVICE) {
      return item.capability === 'LLM' && item.endpoint === CHATGPT_PLAN_ENDPOINT && item.protocol === 'chat-responses'
        && /^provider_[a-f0-9]{24}$/.test(item.id)
    }
    const speech = astrBotSpeechPreset(item.service)
    return !speech || (speech.capability === item.capability && (!speech.voiceOnly || item.models.length <= 1))
  })).max(100),
  localSources: z.record(z.string().min(1).max(512), z.boolean()),
  localChat: z.record(modelId, localChatSettingsSchema).optional(),
  localTts: z.record(modelId, model.shape.tts.unwrap()).optional(),
  managedBindings: z.array(z.string().max(520)).optional(),
}).strict()

export type ModelWorkspace = z.infer<typeof modelWorkspaceSchema>
export type WorkspaceConnection = ModelWorkspace['connections'][number]

export function workspaceChatConnection(workspace: ModelWorkspace | undefined, profileId: string) {
  return workspace?.connections.find(connection => connection.capability === 'LLM'
    && connection.models.some(model => model.profileId === profileId))
}

export function isNativeChatProfile(workspace: ModelWorkspace | undefined, profileId: string) {
  const source = workspaceChatConnection(workspace, profileId)
  return source?.protocol === 'google-native' || source?.protocol === 'azure-openai' || source?.service === CHATGPT_PLAN_SERVICE
}

export function workspaceSpeechConnection(workspace: ModelWorkspace | undefined, kind: string, binding: string) {
  const service = astrBotSpeechPresetForBinding(binding)
  if (!service || service.capability.toLowerCase() !== kind) return undefined
  return workspace?.connections.find(connection => connection.service === service.id
    && connection.capability === service.capability && !!workspaceSpeechModel(connection, binding))
}

export function workspaceSpeechModel(connection: WorkspaceConnection, binding: string) {
  const preset = astrBotSpeechPreset(connection.service)
  if (!preset) return undefined
  return connection.models.find(model => binding === astrBotSpeechBinding(preset.id, model.profileId))
}
