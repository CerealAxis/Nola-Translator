import providerCatalog from './provider-voice-catalog.json'
import { astrBotSpeechPreset, type AstrBotSpeechService } from '../astrbot-speech-presets'
import { ttsVoicePresets } from '../tts-voice-presets'
import type { TtsModelCapabilities, TtsPresetVoiceDescriptor } from './capabilities'
import { ttsVoiceLanguages } from './compatibility'

const qwenLanguages = 'zh en ja ko de fr ru pt es it'.split(' ')
const speechLanguages = 'af ar hy az be bs bg ca zh hr cs da nl en et fi fr gl de el he hi hu is id it ja kn kk ko lv lt mk ms mr mi ne no fa pl pt ro ru sr sk sl es sw sv tl ta th tr uk ur vi cy'.split(' ')
const minimaxLanguages = 'zh yue en ar ru es fr pt de tr nl uk vi id ja it ko th pl ro el cs fi hi bg da he ms sk sv hr hu no sl ca nn af'.split(' ')

export function ttsCatalogCapabilities(providerId: string, modelId: string, modelBinding: string): TtsModelCapabilities {
  const preset = astrBotSpeechPreset(providerId)
  let voices: TtsPresetVoiceDescriptor[] = preset ? ttsVoicePresets(providerId as AstrBotSpeechService, modelId)
    .map(item => ({ id: item.value, name: item.label })) : []
  const detailed = (providerCatalog.voices as Record<string, TtsPresetVoiceDescriptor[]>)[providerId === 'dashscope-tts' ? modelId : providerId]
  if (detailed) voices = detailed.map(voice => ({ ...voice }))
  const supports: TtsModelCapabilities['supports'] = { cloning: false, voiceDesign: false, voiceConversion: false,
    emotion: false, styleInstruction: false, seed: false, speed: false, pitch: false, volume: false,
    pronunciation: false, ssml: false, streamingInput: false, streamingOutput: false }
  let languages: TtsModelCapabilities['languages'] = { mode: 'unknown' }
  let languageInputMode: TtsModelCapabilities['languageInputMode'] = 'auto-detect'
  let conditioning: NonNullable<TtsModelCapabilities['conditioning']> = ['engine-default', 'preset']
  let reference: TtsModelCapabilities['reference']
  let streaming: TtsModelCapabilities['streaming'] = { transport: 'none', audio: 'completed', formats: [] }
  let outputFormats = ['wav']
  let sampleRates: number[] | undefined
  let controlLimits: TtsModelCapabilities['controlLimits']
  if (providerId === 'mimo') {
    outputFormats = ['wav', 'mp3', 'pcm']
    languages = { mode: 'finite', values: ['zh', 'en'] }
    supports.emotion = supports.styleInstruction = true
    if (modelId === 'mimo-v2.5-tts-voiceclone') {
      voices = []; supports.cloning = true; conditioning = ['reference-audio']
      reference = { mimeTypes: ['audio/wav', 'audio/mpeg'], maxEncodedBytes: 10_000_000,
        transcriptRequired: false, acceptsSynthetic: true }
    } else if (modelId === 'mimo-v2.5-tts-voicedesign') {
      voices = []; supports.voiceDesign = true; conditioning = ['design']
    } else if (modelId === 'mimo-v2.5-tts') {
      supports.streamingOutput = true
      streaming = { transport: 'sse', audio: 'incremental', formats: ['pcm'] }
    } else { voices = []; languages = { mode: 'unknown' }; conditioning = [] }
  } else if (providerId === 'edge-tts' || providerId === 'azure-tts') {
    outputFormats = providerId === 'edge-tts' ? ['mp3'] : ['wav', 'mp3', 'pcm']
    sampleRates = providerId === 'edge-tts' ? [24000] : [48000]
    languageInputMode = 'voice-derived'
    voices = voices.map(voice => ({ ...voice, languages: voice.languages ?? ttsVoiceLanguages(providerId, voice.id.split('-').slice(0, 2).join('-')), locale: voice.locale ?? voice.id.split('-').slice(0, 2).join('-') }))
    languages = { mode: 'finite', values: [...new Set(voices.flatMap(voice => voice.languages ?? []))] }
    supports.speed = supports.volume = supports.pitch = supports.streamingOutput = true
    supports.ssml = providerId === 'azure-tts'
    controlLimits = { speed: { min: 0.5, max: 2 }, pitch: { min: -12, max: 12 }, volume: { min: 0, max: 1 } }
    streaming = { transport: providerId === 'edge-tts' ? 'websocket' : 'http', audio: 'incremental', formats: ['mp3', 'pcm'] }
  } else if (providerId === 'openai-tts-api' && ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-03-20', 'gpt-4o-mini-tts-2025-12-15'].includes(modelId)) {
    outputFormats = ['wav', 'mp3', 'pcm']
    languages = { mode: 'finite', values: speechLanguages }
    supports.speed = supports.streamingOutput = true
    controlLimits = { speed: { min: 0.25, max: 4 } }
    supports.styleInstruction = !['tts-1', 'tts-1-hd'].includes(modelId)
    conditioning.push('provider-voice')
    streaming = { transport: 'http', audio: 'incremental', formats: ['wav', 'mp3', 'pcm'] }
  } else if (providerId === 'minimax-tts' && /^speech-(?:0[12]|2\.[68])-(?:hd|turbo)$/.test(modelId)) {
    outputFormats = ['wav', 'mp3', 'pcm']; sampleRates = [16000, 24000, 32000, 44100]
    supports.cloning = supports.voiceDesign = true
    languages = { mode: 'finite', values: /speech-2\.[68]-/.test(modelId) ? [...minimaxLanguages, 'fa', 'fil', 'ta'] : minimaxLanguages }
    supports.speed = supports.pitch = supports.volume = supports.emotion = supports.streamingOutput = true
    controlLimits = { speed: { min: 0.5, max: 2 }, pitch: { min: -12, max: 12, integer: true }, volume: { min: 0, max: 10 } }
    conditioning.push('provider-voice')
    streaming = { transport: 'sse', audio: 'incremental', formats: ['mp3', 'pcm'] }
  } else if (providerId === 'gemini-tts' && ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'].includes(modelId)) {
    languages = { mode: 'multi', verifiedValues: 'ar bn nl en fr de hi id it ja ko mr pl pt ro ru es ta te th tr uk vi zh'.split(' ') }
    supports.styleInstruction = true
  } else if (providerId === 'fishaudio-tts' && ['s1', 's2-pro', 's2.1-pro', 's2.1-pro-free', 'drama-3'].includes(modelId)) {
    outputFormats = ['wav', 'mp3', 'pcm']; sampleRates = [44100]
    supports.voiceDesign = true
    languages = { mode: 'multi', verifiedValues: 'ja en zh ko es pt ar ru fr de sv it tr nl hi th vi'.split(' ') }
    supports.cloning = supports.emotion = supports.speed = supports.volume = supports.streamingOutput = true
    controlLimits = { speed: { min: 0.5, max: 2 }, volume: { min: 0.0001 } }
    voices = []
    conditioning = ['reference-audio', 'provider-voice']
    reference = { mimeTypes: ['audio/wav', 'audio/mpeg'], transcriptRequired: true, acceptsSynthetic: true }
    streaming = { transport: 'http', audio: 'incremental', formats: ['wav', 'mp3', 'pcm'] }
  } else if (providerId === 'qwen3-tts') {
    supports.seed = true
    languages = { mode: 'finite', values: qwenLanguages }; languageInputMode = 'explicit'
    if (/base/i.test(modelId)) {
      supports.cloning = true; conditioning = ['reference-audio']; voices = []
      reference = { mimeTypes: ['audio/wav', 'audio/mpeg'], transcriptRequired: true, acceptsSynthetic: true }
    } else if (/voicedesign/i.test(modelId)) {
      supports.voiceDesign = true; conditioning = ['design']; voices = []
    } else if (/customvoice/i.test(modelId)) {
      supports.styleInstruction = /1[._-]?7b/i.test(modelId)
      voices = ['vivian', 'serena', 'uncle_fu', 'dylan', 'eric', 'ryan', 'aiden', 'ono_anna', 'sohee']
        .map(id => ({ id, name: id, languages: qwenLanguages }))
    }
  } else if (providerId === 'dashscope-tts' && ['qwen-tts', 'qwen-tts-latest', 'qwen3-tts-flash', 'qwen3-tts-flash-2025-11-27', 'qwen3-tts-vc-2026-01-22', 'qwen3-tts-vd-2026-01-26'].includes(modelId)) {
    languages = { mode: 'finite', values: /^qwen-tts/.test(modelId) ? ['zh', 'en'] : [...new Set([...qwenLanguages, ...voices.flatMap(voice => voice.languages ?? [])])] }
    conditioning = /-v[cd]-/.test(modelId) ? ['provider-voice'] : ['preset', 'provider-voice']
    if (/-v[cd]-/.test(modelId)) voices = []
    supports.cloning = /-vc-/.test(modelId); supports.voiceDesign = /-vd-/.test(modelId)
  } else if (providerId === 'dashscope-tts' && /^qwen-audio-3\.[01]-tts-(?:plus|flash)$/.test(modelId)) {
    languages = { mode: 'multi', verifiedValues: [...new Set([...qwenLanguages, 'th', 'id', 'vi', 'ms', 'tl', 'ar', 'yue', ...voices.flatMap(voice => voice.languages ?? [])])] }
    conditioning = ['preset', 'provider-voice']
    supports.cloning = supports.voiceDesign = true
  } else if (providerId === 'dashscope-tts' && ['cosyvoice-v1', 'cosyvoice-v2', 'cosyvoice-v3-flash', 'cosyvoice-v3-plus', 'cosyvoice-v3.5-flash', 'cosyvoice-v3.5-plus'].includes(modelId)) {
    languages = { mode: 'finite', values: /v1$/.test(modelId) ? ['zh', 'en', 'ja', 'ko', 'yue'] : ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'it', 'yue'] }
    conditioning = modelId.startsWith('cosyvoice-v3.5') ? ['provider-voice'] : ['preset', 'provider-voice']
    supports.cloning = modelId !== 'cosyvoice-v1'; supports.voiceDesign = modelId.startsWith('cosyvoice-v3')
  } else if (providerId === 'elevenlabs-tts' && modelId in providerCatalog.modelLanguages) {
    supports.cloning = supports.voiceDesign = true
    languages = { mode: 'finite', values: (providerCatalog.modelLanguages as Record<string, string[]>)[modelId] }
    conditioning.push('provider-voice')
  } else if (providerId === 'volcengine-tts') {
    conditioning = ['preset']
    outputFormats = ['mp3']
    voices = voices.map(voice => ({ ...voice, languages: voice.languages ?? ['zh'] }))
    languages = { mode: 'finite', values: [...new Set(voices.flatMap(voice => voice.languages ?? []))] }
  }
  if (providerId === 'elevenlabs-tts') { outputFormats = ['wav', 'mp3', 'pcm']; sampleRates = [24000, 44100] }
  if (providerId === 'elevenlabs-tts') {
    conditioning = ['preset', 'provider-voice']
    if (preset?.voice && !voices.some(item => item.id === preset.voice)) voices.push({ id: preset.voice, name: preset.voice })
  }
  const modelDefaults: Record<string, string> = { 'cosyvoice-v2': 'longxiaochun_v2', 'cosyvoice-v3-plus': 'longanyang', 'cosyvoice-v3-flash': 'longanyang' }
  const defaultId = modelDefaults[modelId] ?? (providerId === 'dashscope-tts' && conditioning.includes('preset') && modelId.startsWith('qwen') ? 'Cherry' : preset?.voice)
  const defaultPresetVoiceId = defaultId && voices.some(voice => voice.id === defaultId) ? defaultId : undefined
  const registered = ['minimax-tts', 'elevenlabs-tts', 'dashscope-tts', 'fishaudio-tts'].includes(providerId)
  return { schemaVersion: 1, modelBinding, providerId, modelId, languages, languageInputMode, presetVoices: voices,
    defaultPresetVoiceId, supports, instructVocabulary: supports.styleInstruction ? 'freeform' : 'none',
    outputFormats, sampleRates, controlLimits, reference, conditioning, streaming,
    voiceRegistration: { create: registered, inspect: registered, delete: registered }, source: 'static-catalog', revision: 'catalog-v1' }
}
