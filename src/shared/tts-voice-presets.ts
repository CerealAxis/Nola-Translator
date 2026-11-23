import type { AstrBotSpeechService } from './astrbot-speech-presets'

const openAiVoices = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
const edgeVoices = [
  'zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunyangNeural',
  'zh-HK-HiuGaaiNeural', 'zh-TW-HsiaoChenNeural', 'en-US-JennyNeural', 'en-US-GuyNeural',
  'ja-JP-NanamiNeural', 'ja-JP-KeitaNeural', 'ko-KR-SunHiNeural', 'ko-KR-InJoonNeural',
]
const byName = {
  mimo: ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'],
  'edge-tts': edgeVoices,
  'azure-tts': ['zh-CN-YunxiaNeural', ...edgeVoices],
  'gemini-tts': [
    'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
    'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
    'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
    'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
  ],
  'minimax-tts': ['female-shaonv', 'female-yujie', 'female-chengshu', 'female-tianmei',
    'male-qn-qingse', 'male-qn-jingying', 'male-qn-badao', 'male-qn-daxuesheng'],
} as const

const namedVoices = {
  'elevenlabs-tts': {
    'gOupLcAkjEnguROwi4oS': 'Darian', '7QN34D2r3hCNwbOYIeK0': 'Warren', g7LVvkPWALzPxOQbF6OE: 'Jade',
    l7kNoIfnJKPg7779LI2t: 'Eddie', AaOhDHYJ1XLZk74lXhdE: 'Caleb', '8dEUmyPMdDdK91vboYih': 'Sawyer',
    fnYMz3F5gMEDGMWcH1ex: 'Finley', '22N9cF8z0o7y23njdyaY': 'Florence', FrS6cKLB1wg4WYgPa9GW: 'Wyatt',
  },
  'fishaudio-tts': {
    '9a9cf47702da476aa4629e2506d4a857': 'Hannah', bf322df2096a46f18c579d0baa36f41d: 'Adrian',
    '933563129e564b19a115bedd57b7406a': 'Sarah', '536d3a5e000945adb7038665781a4aca': 'Ethan',
    e3cd384158934cc9a01029cd7d278634: 'Laura', '79d0bd3e4e5444b18f7b6d89b5927bf1': 'Jordan',
    b347db033a6549378b48d00acb0d06cd: 'Selene',
  },
  'volcengine-tts': {
    BV700_streaming: '灿灿', BV001_streaming: '通用女声', BV002_streaming: '通用男声',
    BV701_streaming: '擎苍', BV705_streaming: '炀炀', BV406_streaming: '梓梓', BV407_streaming: '燃燃',
  },
} as const

export function ttsVoicePresets(service: AstrBotSpeechService, model: string): { value: string; label: string }[] {
  if (service === 'mimo' && model !== 'mimo-v2.5-tts') return []
  if (service in namedVoices) {
    return Object.entries(namedVoices[service as keyof typeof namedVoices]).map(([value, name]) => ({ value, label: name }))
  }
  let voices: readonly string[] = byName[service as keyof typeof byName] ?? []
  if (service === 'openai-tts-api') {
    voices = /^tts-1(?:-hd)?$/.test(model) ? openAiVoices : [...openAiVoices, 'ballad', 'verse', 'marin', 'cedar']
  }
  if (service === 'dashscope-tts') {
    if (/^qwen.*tts/i.test(model)) voices = ['Cherry', 'Serena', 'Ethan', 'Chelsie']
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
