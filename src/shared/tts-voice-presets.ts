import providerCatalog from './tts/provider-voice-catalog.json'
import type { AstrBotSpeechService } from './astrbot-speech-presets'

const openAiVoices = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
const byName = {
  'gemini-tts': [
    'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
    'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
    'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
    'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
  ],

} as const

const namedVoices = {
  'fishaudio-tts': {
    '9a9cf47702da476aa4629e2506d4a857': 'Hannah', bf322df2096a46f18c579d0baa36f41d: 'Adrian',
    '933563129e564b19a115bedd57b7406a': 'Sarah', '536d3a5e000945adb7038665781a4aca': 'Ethan',
    e3cd384158934cc9a01029cd7d278634: 'Laura', '79d0bd3e4e5444b18f7b6d89b5927bf1': 'Jordan',
    b347db033a6549378b48d00acb0d06cd: 'Selene',
  },

} as const

export function ttsVoicePresets(service: AstrBotSpeechService, model: string): { value: string; label: string }[] {
  if (service === 'mimo' && model !== 'mimo-v2.5-tts') return []
  const catalog = providerCatalog.voices as Record<string, Array<{ id: string; name: string }>>
  const entries = service === 'dashscope-tts' ? catalog[model] : catalog[service]
  if (entries) return entries.map(voice => ({ value: voice.id, label: voice.name }))
  if (service in namedVoices) {
    return Object.entries(namedVoices[service as keyof typeof namedVoices]).map(([value, name]) => ({ value, label: name }))
  }
  let voices: readonly string[] = byName[service as keyof typeof byName] ?? []
  if (service === 'openai-tts-api') {
    voices = /^tts-1(?:-hd)?$/.test(model) ? openAiVoices : [...openAiVoices, 'ballad', 'verse', 'marin', 'cedar']
  }
  if (service === 'dashscope-tts') {
    if (/^qwen.*tts/i.test(model) && !/-v[cd]-/.test(model)) voices = ['Cherry', 'Serena', 'Ethan', 'Chelsie']
    else if (model === 'cosyvoice-v1') voices = [
      'longwan', 'longcheng', 'longhua', 'longxiaochun', 'longxiaoxia', 'longxiaocheng', 'longxiaobai',
      'longlaotie', 'longshu', 'longshuo', 'longjing', 'longmiao', 'longyue', 'longyuan', 'longfei',
      'longjielidou', 'longtong', 'longxiang', 'loongstella', 'loongbella',
    ]
    else if (model === 'cosyvoice-v2') voices = ['longxiaochun_v2', 'longxiaobai_v2', 'longshu_v2', 'loongstella_v2']
    else if (model === 'cosyvoice-v3-flash' || model === 'cosyvoice-v3-plus') voices = ['longanyang', 'longanhuan_v3', 'longhua_v3']
  }
  return voices.map(value => ({ value, label: value }))
}
