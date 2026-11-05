import { requestId } from './id'
import { z } from 'zod'

export const CAPABILITIES = ['asr', 'mt', 'tts', 's2s', 'llm'] as const
export type Capability = typeof CAPABILITIES[number]
export type ProviderProtocol = 'native' | 'google-free' | 'microsoft-free' | 'deepl' | 'deeplx' | 'openai' | 'responses' | 'anthropic' | 'gemini' | 'ollama' | 'edge-tts' | 'aliyun' | 'minimax' | 'cohere' | 'bedrock' | 'replicate'
export interface ProviderPreset { id: string; name: string; baseUrl: string; protocol: ProviderProtocol; capabilities: Capability[]; model?: string; requiresKey: boolean }
const text: Capability[] = ['mt', 'llm']
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'nola', name: 'Nola Translator', baseUrl: '', protocol: 'native', capabilities: [...CAPABILITIES], requiresKey: false },
  { id: 'google-translate', name: 'Google Translate', baseUrl: 'https://translate.googleapis.com', protocol: 'google-free', capabilities: ['mt'], requiresKey: false },
  { id: 'microsoft-translate', name: 'Microsoft Translator', baseUrl: 'https://edge.microsoft.com', protocol: 'microsoft-free', capabilities: ['mt'], requiresKey: false },
  { id: 'edge-tts', name: 'Microsoft Edge TTS', baseUrl: 'https://speech.platform.bing.com', protocol: 'edge-tts', capabilities: ['tts'], requiresKey: false },
  { id: 'deepl', name: 'DeepL', baseUrl: 'https://api-free.deepl.com', protocol: 'deepl', capabilities: ['mt'], requiresKey: true },
  { id: 'deeplx', name: 'DeepLX', baseUrl: 'http://localhost:1188', protocol: 'deeplx', capabilities: ['mt'], requiresKey: false },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai', capabilities: [...text, 'asr', 'tts'], requiresKey: true },
  { id: 'openai-compatible', name: 'OpenAI Compatible', baseUrl: '', protocol: 'openai', capabilities: [...text, 'asr', 'tts'], requiresKey: false },
  { id: 'open-responses', name: 'Responses API', baseUrl: '', protocol: 'responses', capabilities: text, requiresKey: false },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', protocol: 'anthropic', capabilities: text, requiresKey: true },
  { id: 'google', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', protocol: 'gemini', capabilities: text, requiresKey: true },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', protocol: 'ollama', capabilities: text, requiresKey: false },
  { id: 'alibaba', name: 'Alibaba Cloud', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', protocol: 'aliyun', capabilities: [...text, 'asr', 's2s'], requiresKey: true },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.io/v1', protocol: 'minimax', capabilities: [...text, 'asr', 'tts'], requiresKey: true },
  { id: 'cohere', name: 'Cohere', baseUrl: 'https://api.cohere.com/v2', protocol: 'cohere', capabilities: text, requiresKey: true },
  { id: 'bedrock', name: 'Amazon Bedrock', baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com', protocol: 'bedrock', capabilities: text, requiresKey: true },
  { id: 'replicate', name: 'Replicate', baseUrl: 'https://api.replicate.com/v1', protocol: 'replicate', capabilities: text, requiresKey: true },
  ...([
    ['deepseek', 'DeepSeek', 'https://api.deepseek.com/v1'],
    ['xai', 'xAI', 'https://api.x.ai/v1'],
    ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1'],
    ['siliconflow', 'SiliconFlow', 'https://api.siliconflow.cn/v1'],
    ['volcengine', 'Volcengine', 'https://ark.cn-beijing.volces.com/api/v3'],
    ['moonshotai', 'Moonshot AI', 'https://api.moonshot.cn/v1'],
    ['groq', 'Groq', 'https://api.groq.com/openai/v1'],
    ['deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai'],
    ['mistral', 'Mistral', 'https://api.mistral.ai/v1'],
    ['togetherai', 'Together AI', 'https://api.together.xyz/v1'],
    ['fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1'],
    ['cerebras', 'Cerebras', 'https://api.cerebras.ai/v1'],
    ['perplexity', 'Perplexity', 'https://api.perplexity.ai'],
    ['huggingface', 'Hugging Face', 'https://router.huggingface.co/v1'],
    ['atlascloud', 'Atlas Cloud', 'https://api.atlascloud.ai/v1'],
    ['jalapenocloud', 'Jalapeño Cloud', ''],
    ['tensdaq', 'Tensdaq', ''],
    ['azure', 'Azure OpenAI', ''],
  ] as const).map(([id, name, baseUrl]): ProviderPreset => ({ id, name, baseUrl, protocol: 'openai', capabilities: text, requiresKey: true })),
]
const scalar = z.union([z.string().max(16000), z.number().finite(), z.boolean()])
export const providerSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().trim().min(1).max(120),
  preset: z.string().refine(id => PROVIDER_PRESETS.some(p => p.id === id)),
  baseUrl: z.string().trim().max(2048).refine(value => {
    if (!value) return true
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.hash && !url.search } catch { return false }
  }),
  apiKey: z.string().max(16000), model: z.string().trim().max(256),
  capabilities: z.array(z.enum(CAPABILITIES)).min(1).max(5),
  headers: z.record(z.string().regex(/^[A-Za-z0-9-]+$/), z.string().max(16000)).default({}),
  options: z.record(z.string().max(80), scalar).default({}),
}).superRefine((value, ctx) => {
  const preset = PROVIDER_PRESETS.find(p => p.id === value.preset)!
  if (value.capabilities.some(capability => !preset.capabilities.includes(capability))) ctx.addIssue({ code: 'custom', path: ['capabilities'], message: 'Unsupported capability' })
  if ((value.id === 'desktop') !== (value.preset === 'nola')) ctx.addIssue({ code: 'custom', path: ['id'], message: 'Reserved provider' })
})
export type ProviderConnection = z.infer<typeof providerSchema>
export function createProvider(presetId: string): ProviderConnection {
  const preset = PROVIDER_PRESETS.find(item => item.id === presetId)
  if (!preset) throw new Error('providerInvalid')
  return { id: presetId === 'nola' ? 'desktop' : requestId(), name: preset.name, preset: preset.id, baseUrl: preset.baseUrl, apiKey: '', model: preset.model ?? '', capabilities: [...preset.capabilities], headers: {}, options: {} }
}
export const DEFAULT_PROVIDERS = ['nola', 'google-translate', 'microsoft-translate', 'edge-tts'].map(id => ({ ...createProvider(id), id: id === 'nola' ? 'desktop' : id }))

// Extension-page IndexedDB is not shared with isolated content scripts on website origins.
export function providerDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nola-extension-providers', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('settings')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export function parseProviders(data: unknown): ProviderConnection[] {
  const entries = z.array(providerSchema).max(100).parse(data)
  if (new Set(entries.map(item => item.id)).size !== entries.length) throw new Error('providerInvalid')
  return [createProvider('nola'), ...entries.filter(item => item.id !== 'desktop')]
}
export async function loadProviders(): Promise<ProviderConnection[]> {
  const db = await providerDatabase()
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').get('connections')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return value === undefined ? structuredClone(DEFAULT_PROVIDERS) : parseProviders(value)
  } finally { db.close() }
}
export async function saveProviders(values: ProviderConnection[]): Promise<void> {
  const connections = parseProviders(values)
  const db = await providerDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite')
      tx.objectStore('settings').put(connections, 'connections')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    await chrome.storage.local.set({ providerRevision: requestId() })
  } finally { db.close() }
}
export async function exportProviderConfig(includeSecrets = false): Promise<ProviderConnection[]> {
  return (await loadProviders()).map(item => includeSecrets ? item : { ...item, apiKey: '', headers: {}, options: Object.fromEntries(Object.entries(item.options).filter(([key]) => ['voice', 'rate', 'pitch', 'volume', 'region', 'workspaceId', 'temperature'].includes(key))) })
}
export async function importProviderConfig(data: unknown): Promise<void> { await saveProviders(parseProviders(data)) }
export async function getProvider(id: string, capability: Capability): Promise<ProviderConnection> {
  const provider = (await loadProviders()).find(item => item.id === id)
  if (!provider) throw new Error('providerMissing')
  if (!provider.capabilities.includes(capability)) throw new Error('providerCapability')
  return provider
}
export function requestProviderAccess(provider: ProviderConnection): Promise<boolean> {
  if (!providerSchema.safeParse(provider).success) return Promise.reject(new Error('providerInvalid'))
  if (provider.preset === 'nola') return Promise.resolve(true)
  if (!provider.baseUrl) return Promise.resolve(false)
  const origins = [`${new URL(provider.baseUrl).origin}/*`]
  if (provider.preset === 'edge-tts') origins.push('https://dev.microsofttranslator.com/*', 'https://*.tts.speech.microsoft.com/*', 'https://speech.platform.bing.com/*')
  if (provider.preset === 'alibaba' && typeof provider.options.workspaceId === 'string' && /^[a-zA-Z0-9-]+$/.test(provider.options.workspaceId)) {
    const region = provider.options.region === 'ap-southeast-1' ? 'ap-southeast-1' : 'cn-beijing'
    origins.push(`https://${provider.options.workspaceId}.${region}.maas.aliyuncs.com/*`)
  }
  return chrome.permissions.request({ origins })
}
