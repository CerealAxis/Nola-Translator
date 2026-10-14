import { DEFAULT_SETTINGS } from '@/bridge'
import type { AppSettings, CaptionSegment, ResourceRecord } from '@/bridge'
import type { UiLanguage } from '@/i18n'
import { RECOMMENDED_CONFIGURATIONS } from '../../src/shared/model-capabilities'
import { stores } from '@/store'

export const demoCopy: Record<UiLanguage, { label: string; title: string; notes: string; translations: string[] }> = {
  'zh-CN': {
    label: '请使用PC端访问 · 演示数据', title: '演示：跨语言产品会议',
    notes: '演示笔记\n\n今天的讨论\n• 让不同语言的参与者理解同一段对话\n• 将重要想法整理为会议笔记\n• 会后回顾原文与译文\n\n所有字幕和笔记均为虚构演示内容。',
    translations: ['欢迎大家。今天我们来讨论如何让跨语言协作变得更轻松。', '先从一个简单的目标开始：每个人都能用自己熟悉的语言参与讨论。', '我们可以并排阅读原文和译文，同时记录值得跟进的想法。', '这样一来，团队可以把注意力放在讨论内容上，而不必担心遗漏重点。', '会议结束后，我们再一起回顾笔记，确认下一步的安排。'],
  },
  'zh-TW': {
    label: '請使用PC端存取 · 示範資料', title: '示範：跨語言產品會議',
    notes: '示範筆記\n\n今天的討論\n• 讓不同語言的參與者理解同一段對話\n• 將重要想法整理為會議筆記\n• 會後回顧原文與譯文\n\n所有字幕和筆記皆為虛構示範內容。',
    translations: ['歡迎大家。今天我們來討論如何讓跨語言協作變得更輕鬆。', '先從一個簡單的目標開始：每個人都能用自己熟悉的語言參與討論。', '我們可以並排閱讀原文和譯文，同時記錄值得跟進的想法。', '如此一來，團隊可以把注意力放在討論內容上，而不必擔心遺漏重點。', '會議結束後，我們再一起回顧筆記，確認下一步的安排。'],
  },
  'zh-HK': {
    label: '請使用PC端瀏覽 · 示範資料', title: '示範：跨語言產品會議',
    notes: '示範筆記\n\n今日的討論\n• 讓不同語言的參與者理解同一段對話\n• 將重要想法整理成會議筆記\n• 會後重溫原文與譯文\n\n所有字幕和筆記均為虛構示範內容。',
    translations: ['歡迎大家。今日我們討論如何令跨語言協作更輕鬆。', '先從一個簡單的目標開始：每個人都能用自己熟悉的語言參與討論。', '我們可以並排閱讀原文和譯文，同時記錄值得跟進的想法。', '這樣團隊就可以專注於討論內容，不用擔心遺漏重點。', '會議結束後，我們再一起重溫筆記，確認下一步的安排。'],
  },
  en: {
    label: 'Please visit on a PC · Demo data', title: 'Demo: multilingual product meeting',
    notes: 'Demo notes\n\nToday’s discussion\n• Help everyone follow the conversation\n• Keep useful ideas in meeting notes\n• Review both languages afterwards\n\nAll captions and notes are fictional demo content.',
    translations: ['Welcome, everyone. Today we will discuss how to make collaboration across languages easier.', 'Let’s start with a simple goal: everyone should be able to join the discussion in a language they know.', 'We can read the original and translation side by side while noting ideas worth following up.', 'This lets the team focus on the conversation without worrying about missing the important details.', 'After the meeting, we will review our notes together and agree on the next steps.'],
  },
  ja: {
    label: 'PCでご覧ください · デモデータ', title: 'デモ：多言語の製品会議',
    notes: 'デモのメモ\n\n今日の議題\n• 言語の異なる参加者が会話を理解できるようにする\n• 大切なアイデアを会議メモにまとめる\n• 会議後に原文と訳文を振り返る\n\n字幕とメモはすべて架空のデモ内容です。',
    translations: ['皆さん、ようこそ。今日は、言語を超えた共同作業をもっと簡単にする方法について話し合います。', 'まずはシンプルな目標から始めましょう。誰もが慣れた言語で議論に参加できることです。', '原文と訳文を並べて読みながら、後で検討したいアイデアをメモできます。', 'これにより、チームは大切な点を聞き逃す心配をせず、議論に集中できます。', '会議の後でメモを一緒に振り返り、次の行動を確認しましょう。'],
  },
  ko: {
    label: 'PC에서 접속해 주세요 · 데모 데이터', title: '데모: 다국어 제품 회의',
    notes: '데모 메모\n\n오늘의 논의\n• 서로 다른 언어를 사용하는 참가자가 대화를 이해하도록 돕기\n• 중요한 아이디어를 회의 메모로 정리하기\n• 회의 후 원문과 번역문 돌아보기\n\n모든 자막과 메모는 가상의 데모 콘텐츠입니다.',
    translations: ['여러분, 환영합니다. 오늘은 언어가 다른 사람들과 더 쉽게 협업하는 방법을 이야기하겠습니다.', '간단한 목표부터 시작하겠습니다. 누구나 익숙한 언어로 논의에 참여할 수 있어야 합니다.', '원문과 번역문을 나란히 읽으면서 후속 논의가 필요한 아이디어를 메모할 수 있습니다.', '그러면 팀은 중요한 내용을 놓칠 걱정 없이 대화에 집중할 수 있습니다.', '회의가 끝나면 함께 메모를 돌아보고 다음 단계를 정하겠습니다.'],
  },
}

const english = demoCopy.en.translations
const chinese = demoCopy['zh-CN'].translations
const models = [
  ['qwen3-asr-1.7b-hf', 'Qwen3-ASR 1.7B', 'qwen3-asr', 4087646324],
  ['qwen3-asr-0.6b-hf', 'Qwen3-ASR 0.6B', 'qwen3-asr', 1576381331],
  ['sensevoice-small', 'SenseVoiceSmall', 'sensevoice', 936694116],
  ['hy-mt2-1.8b-q4-k-m', 'Hy-MT2 1.8B Q4_K_M', 'hymt2', 1133080448],
  ['hy-mt2-1.8b-q3-k-m', 'Hy-MT2 1.8B Q3_K_M', 'hymt2', 951022560],
  ['hy-mt2-1.8b-iq2-m', 'Hy-MT2 1.8B UD-IQ2_M', 'hymt2', 722666176],
  ['hy-mt2-7b-q4-k-m', 'Hy-MT2 7B Q4_K_M', 'hymt2', 4624648896],
  ['m2m100-418m', 'M2M100 418M', 'm2m100', 1941936305],
  ['index-translate-2b-q4-k-m', 'Index-Translate 2B Q4_K_M', 'index-translate', 1312164352],
  ['index-translate-9b-q4-k-m', 'Index-Translate 9B Q4_K_M', 'index-translate', 5780090304],
  ['index-translate-35b-a3b-q4-k-m', 'Index-Translate 35B-A3B preview Q4_K_M', 'index-translate', 21713462400],
] as const

export function prepareDemo(locale: UiLanguage, page: string, snapshot = false): AppSettings {
  const copy = demoCopy[locale]
  const targetLanguage = locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : locale === 'ko' ? 'ko' : locale === 'zh-CN' ? 'zh' : 'zh-Hant'
  const sourceLanguage = locale === 'en' ? 'zh' : 'en'
  const settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
  settings.onboardingSeen = true
  settings.theme = page === 'dark-mode' ? 'dark' : 'light'
  settings.uiLanguage = locale
  settings.modelStoragePath = ''
  settings.recording.keepAudio = false
  settings.recognition = { ...settings.recognition, provider: 'local', sourceLanguage, modelId: 'qwen3-asr-1.7b-hf' }
  settings.translation = { ...settings.translation, provider: 'local', targetLanguage, localModelId: 'hy-mt2-1.8b-q4-k-m' }
  if (page === 'llm-configuration') {
    settings.translation = {
      ...settings.translation,
      provider: 'cloud',
      cloudName: 'DeepSeek',
      cloudEndpoint: 'https://api.deepseek.com',
      cloudApiFormat: 'chat-completions',
      cloudModel: 'deepseek-chat',
    }
  }
  stores.settings.setState({ settings, loaded: true, loading: false, captionService: 'ready' })
  const resources: ResourceRecord[] = models.map(([resourceId, name, provider, downloadBytes]) => {
    const configuration = RECOMMENDED_CONFIGURATIONS[resourceId]
    const installed = resourceId === settings.recognition.modelId || resourceId === settings.translation.localModelId
    return {
      resourceId, name, provider, downloadBytes, configuration,
      kind: configuration.slot === 'recognition' ? 'recognitionModel' : 'translationModel',
      description: '', languages: configuration.slot === 'recognition' ? configuration.languages : configuration.targetLanguages,
      installed, installedBytes: installed ? downloadBytes : 0, state: 'idle', cancellable: false,
    }
  })
  stores.models.setState({ resources, loaded: true, loading: false, devices: [
    { deviceId: 'demo-output', name: 'Speakers', kind: 'systemOutput', isDefault: true },
    { deviceId: 'demo-microphone', name: 'Microphone', kind: 'microphone', isDefault: true },
  ] })
  const startedAtMs = Date.UTC(2026, 8, 16, 9, 0)
  stores.meetings.setState({ loaded: true, meetings: [{
    meetingId: 'docs-demo', title: copy.title, titleIsCustom: true, notes: copy.notes,
    startedAtMs, endedAtMs: startedAtMs + 840000, durationMs: 840000,
    daySequence: 1, segmentCount: english.length, sourceLanguage, targetLanguage, state: 'completed',
  }] })
  const segments: CaptionSegment[] = english.map((text, index) => ({
    segmentId: `demo-${index}`, revision: 1, startedAtMs: index * 11000,
    endedAtMs: index * 11000 + 9000, sourceLanguage,
    sourceText: locale === 'en' ? chinese[index] : text, isFinal: true,
    translations: [{ targetLanguage, text: copy.translations[index], provider: 'demo', state: 'complete' }],
  }))
  const running = snapshot && ['home', 'workspace', 'overlay', 'browser-scene'].includes(page)
  stores.session.setState({
    engineStatus: 'ready', status: running ? 'running' : 'idle',
    sessionId: running ? 'docs-demo' : null, meetingId: running ? 'docs-demo' : null,
    elapsedMs: 62000, segments,
  })
  return settings
}
