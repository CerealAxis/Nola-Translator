import { ttsModelCatalog } from '../../../../shared/tts/model-catalog'
import { ALIYUN_ASR_MODELS, DEFAULT_SETTINGS, MINIMAX_RECOGNITION_MODELS, REALTIME_S2S_MODELS } from '../../../../shared/settings'
import { GOOGLE_TRANSLATE_ENDPOINT } from '../../../../shared/google-translate'
import { INDEX_TRANSLATE_ENDPOINT, INDEX_TRANSLATE_PUBLIC_MODEL } from '../../../../shared/index-translate'
import { TRANSLATION_PRESETS } from '../../../../shared/provider-presets'
import { astrBotSpeechPreset, astrBotSpeechPresets, type AstrBotSpeechService } from '../../../../shared/astrbot-speech-presets'
import { astrBotChatPresets, type AstrBotChatService } from '../../../../shared/astrbot-chat-presets'
import { workspaceCapabilities, type WorkspaceConnection, type WorkspaceService } from '../../../../shared/model-workspace'
import type { ProviderIconId } from './ProviderIconPicker'
import { CHATGPT_PLAN_ENDPOINT, CHATGPT_PLAN_SERVICE } from '../../../../shared/chatgpt-plan'

export const capabilities = workspaceCapabilities
export type Capability = typeof capabilities[number]
export type Service = WorkspaceService
export type CloudModel = WorkspaceConnection['models'][number]
export interface Connection extends WorkspaceConnection {
  icon?: ProviderIconId
  key: string
}

interface Template {
  name: string
  endpoint: string
  models: Partial<Record<Capability, readonly string[]>>
  protocol?: string
  icon?: string
}

function llmTemplate(id: string): Template {
  const preset = TRANSLATION_PRESETS.find(preset => preset.id === id)!
  return { name: preset.name, endpoint: preset.endpoint, models: { LLM: [] } }
}

const chatTemplates = Object.fromEntries(astrBotChatPresets.map((preset): [AstrBotChatService, Template] => [
  preset.id, { ...preset, protocol: 'protocol' in preset ? preset.protocol : 'chat-completions', models: { LLM: [] } },
])) as Record<AstrBotChatService, Template>

const speechTemplates = Object.fromEntries(astrBotSpeechPresets.map((preset): [AstrBotSpeechService, Template] => [
  preset.id, { ...preset, endpoint: preset.endpoint || astrBotSpeechPreset(preset.id)?.fallback || '', models: { [preset.capability]: ttsModelCatalog[preset.id]?.models ?? [preset.model] } },
])) as Record<AstrBotSpeechService, Template>

export const templates: Record<Service, Template> = {
  [CHATGPT_PLAN_SERVICE]: { name: 'Continue with ChatGPT', icon: 'OpenAI', endpoint: CHATGPT_PLAN_ENDPOINT, protocol: 'chat-responses', models: { LLM: [] } },
  ...chatTemplates,
  ...speechTemplates,
  ollama: llmTemplate('ollama'),
  compatible: { name: '', endpoint: '', models: { LLM: [] } },
  aliyun: { name: 'Alibaba Cloud', endpoint: '', models: { ASR: ALIYUN_ASR_MODELS, S2S: REALTIME_S2S_MODELS } },
  minimax: { name: 'MiniMax', endpoint: DEFAULT_SETTINGS.recognition.minimaxEndpoint!, models: { ASR: MINIMAX_RECOGNITION_MODELS } },
  index: { name: 'Index Translate', endpoint: INDEX_TRANSLATE_ENDPOINT, models: { MT: [INDEX_TRANSLATE_PUBLIC_MODEL] } },
  mymemory: { name: 'MyMemory', endpoint: DEFAULT_SETTINGS.translation.mymemoryEndpoint!, models: { MT: ['MyMemory'] } },
  microsoft: { name: 'Microsoft Translator', endpoint: DEFAULT_SETTINGS.translation.microsoftEndpoint, models: { MT: ['Microsoft Translator'] } },
  google: { name: 'Google Translate', endpoint: GOOGLE_TRANSLATE_ENDPOINT, models: { MT: ['Google Translate'] } },
}

export function newConnection(service: Service, capability: Capability, id: string): Connection {
  const template = templates[service]
  const protocol = template.protocol ?? TRANSLATION_PRESETS.find(preset => preset.id === service)?.apiFormat ?? 'chat-completions'
  return { id, capability, service, name: template.name, endpoint: template.endpoint, protocol, key: '', workspace: service === 'azure-openai' ? '2024-05-01-preview' : '', region: 'cn-beijing', models: [] }
}
