export const ttsModelCatalog: Record<string, { models: string[]; source: string }> = {
  mimo: { models: ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign', 'mimo-v2.5-tts-voiceclone'], source: 'https://mimo.mi.com/docs/en-US/api/audio/tts-post' },
  'openai-tts-api': { models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-03-20', 'gpt-4o-mini-tts-2025-12-15'], source: 'https://developers.openai.com/api/docs/guides/text-to-speech' },
  'minimax-tts': { models: ['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo', 'speech-02-hd', 'speech-02-turbo', 'speech-01-hd', 'speech-01-turbo'], source: 'https://platform.minimax.cn/docs/api-reference/speech-t2a-http' },
  'dashscope-tts': { models: ['qwen3-tts-flash', 'qwen3-tts-flash-2025-11-27', 'qwen3-tts-vc-2026-01-22', 'qwen3-tts-vd-2026-01-26', 'qwen-tts', 'qwen-tts-latest', 'qwen-audio-3.1-tts-plus', 'qwen-audio-3.1-tts-flash', 'qwen-audio-3.0-tts-plus', 'qwen-audio-3.0-tts-flash', 'cosyvoice-v3.5-plus', 'cosyvoice-v3.5-flash', 'cosyvoice-v3-plus', 'cosyvoice-v3-flash', 'cosyvoice-v2', 'cosyvoice-v1'], source: 'https://help.aliyun.com/zh/model-studio/tts-model/' },
  'gemini-tts': { models: ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'], source: 'https://aistudio.google.com/docs/speech-generation#supported-models' },
  'fishaudio-tts': { models: ['s2.1-pro', 's2.1-pro-free', 's2-pro', 's1'], source: 'https://docs.fish.audio/developer-guide/models-pricing/models-overview.md' },
  'elevenlabs-tts': { models: ['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_flash_v2', 'eleven_turbo_v2_5', 'eleven_turbo_v2'], source: 'https://elevenlabs.io/docs/overview/models' },
  'edge-tts': { models: ['edge-tts'], source: 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list' },
  'azure-tts': { models: ['azure-tts'], source: 'https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech' },
  'volcengine-tts': { models: ['volcengine-tts'], source: 'https://docs.volcengine.com/docs/doubao-voice/tone-list?lang=zh' },
}
