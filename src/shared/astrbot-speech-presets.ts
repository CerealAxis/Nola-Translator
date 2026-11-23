export const astrBotSpeechPresets = [
  { id: 'whisper-api', name: 'Whisper(API)', capability: 'ASR', endpoint: '', fallback: 'https://api.openai.com/v1', model: 'whisper-1', icon: 'OpenAI' },
  { id: 'mimo-stt-api', name: 'MiMo STT(API)', capability: 'ASR', endpoint: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-asr', icon: 'XiaomiMiMo' },
  { id: 'openai-tts-api', name: 'OpenAI TTS(API)', capability: 'TTS', endpoint: '', fallback: 'https://api.openai.com/v1', model: 'tts-1', voice: 'alloy', icon: 'OpenAI' },
  { id: 'mimo', name: 'MiMo TTS(API)', capability: 'TTS', endpoint: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-tts', voice: 'mimo_default', icon: 'XiaomiMiMo',
    fields: { format: 'wav', style: '', dialect: '', seedText: 'Hello, MiMo, have you had lunch?' } },
  { id: 'edge-tts', name: 'Edge TTS', capability: 'TTS', endpoint: '', model: 'edge-tts', voice: 'zh-CN-XiaoxiaoNeural', icon: 'Microsoft', keyless: true, voiceOnly: true,
    fields: { rate: '+0%', volume: '+0%', pitch: '+0Hz' } },
  { id: 'fishaudio-tts', name: 'FishAudio TTS(API)', capability: 'TTS', endpoint: 'https://api.fish.audio/v1', model: 's2-pro', voice: '',
    fields: { character: '可莉' }, icon: 'FishAudio' },
  { id: 'dashscope-tts', name: '阿里云百炼 TTS(API)', capability: 'TTS', endpoint: '', model: 'cosyvoice-v1', voice: 'loongstella', icon: 'Bailian' },
  { id: 'azure-tts', name: 'Azure TTS', capability: 'TTS', endpoint: '', model: 'azure-tts', voice: 'zh-CN-YunxiaNeural', icon: 'Azure', voiceOnly: true,
    fields: { region: 'eastus', style: 'cheerful', role: 'Boy', rate: '1', volume: '100' } },
  { id: 'minimax-tts', name: 'MiniMax TTS(API)', capability: 'TTS', endpoint: 'https://api.minimax.chat/v1/t2a_v2', model: 'speech-02-turbo', voice: 'female-shaonv', icon: 'Minimax',
    fields: { groupId: '', languageBoost: 'auto', speed: '1', volume: '1', pitch: '0', emotion: 'auto', latexRead: 'false', englishNormalization: 'false', timbreWeights: '' } },
  { id: 'volcengine-tts', name: '火山引擎_TTS(API)', capability: 'TTS', endpoint: 'https://openspeech.bytedance.com/api/v1/tts', model: 'volcengine-tts', voice: '', icon: 'Volcengine', voiceOnly: true,
    fields: { appId: '', cluster: 'volcano_tts', speed: '1' } },
  { id: 'gemini-tts', name: 'Gemini TTS', capability: 'TTS', endpoint: '', fallback: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash-preview-tts', voice: 'Leda', icon: 'Gemini',
    fields: { prefix: '' } },
  { id: 'elevenlabs-tts', name: 'ElevenLabs TTS(API)', capability: 'TTS', endpoint: 'https://api.elevenlabs.io/v1', model: 'eleven_multilingual_v2', voice: 'JBFqnCBsd6RMkjVDRZzb', icon: 'ElevenLabs',
    fields: { outputFormat: 'mp3_44100_128', stability: '', similarityBoost: '', style: '', speakerBoost: 'true' } },
] as const

export type AstrBotSpeechService = typeof astrBotSpeechPresets[number]['id']
type SpeechPreset = {
  id: AstrBotSpeechService
  name: string
  capability: 'ASR' | 'TTS'
  endpoint: string
  fallback?: string
  model: string
  voice?: string
  voiceOnly?: boolean
  icon: string
  keyless?: boolean
  fields?: Readonly<Record<string, string>>
}

export function astrBotSpeechPreset(service: string): SpeechPreset | undefined {
  return astrBotSpeechPresets.find(preset => preset.id === service)
}

export function astrBotSpeechBinding(service: AstrBotSpeechService, profileId?: string) {
  const binding = `cloud:${service === 'mimo' ? 'mimo-v2.5-tts' : service}`
  return profileId ? `${binding}:${profileId}` : binding
}

export function astrBotSpeechPresetForBinding(binding: string) {
  const [origin, service] = binding.split(':', 2)
  return origin === 'cloud' ? astrBotSpeechPreset(service === 'mimo-v2.5-tts' ? 'mimo' : service) : undefined
}
