import type { TranslationSettings } from './settings'

export interface TranslationPreset {
  id: string
  name: string
  endpoint: string
  model: string
  apiFormat: TranslationSettings['cloudApiFormat']
  documentation: string
}

// Context budgets below are conservative application defaults, not claims about vendor limits.
export const TRANSLATION_PRESETS: readonly TranslationPreset[] = [
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', apiFormat: 'chat-completions', documentation: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini' },
  { id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com', model: 'claude-haiku-4-5', apiFormat: 'anthropic', documentation: 'https://platform.claude.com/docs/en/api/messages' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiFormat: 'chat-completions', documentation: 'https://api-docs.deepseek.com/api/create-chat-completion/' },
  { id: 'siliconflow', name: 'SiliconFlow', endpoint: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V4-Flash', apiFormat: 'chat-completions', documentation: 'https://docs.siliconflow.cn/docs/api/chat-completions-post' },
  { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', apiFormat: 'chat-completions', documentation: 'https://console.groq.com/docs/models' },
  { id: 'gemini', name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', apiFormat: 'chat-completions', documentation: 'https://ai.google.dev/gemini-api/docs/openai' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini', apiFormat: 'chat-completions', documentation: 'https://openrouter.ai/docs/quickstart' },
  { id: 'ollama', name: 'Ollama', endpoint: 'http://127.0.0.1:11434', model: 'qwen3:4b', apiFormat: 'ollama', documentation: 'https://docs.ollama.com/api/chat' },
]

export function translationPresetPatch(preset: TranslationPreset): Partial<TranslationSettings> {
  return { provider: 'cloud', cloudName: preset.name, cloudEndpoint: preset.endpoint, cloudModel: preset.model, cloudApiFormat: preset.apiFormat, cloudContextWindow: 32768, cloudMaxOutputTokens: 4096 }
}

export function matchingPreset<T extends { endpoint: string; model: string; apiFormat: string }>(presets: readonly T[], endpoint: string, model: string, apiFormat: string): T | undefined {
  return presets.find(preset => preset.endpoint === endpoint.trim().replace(/\/+$/, '') && preset.model === model && preset.apiFormat === apiFormat)
}

