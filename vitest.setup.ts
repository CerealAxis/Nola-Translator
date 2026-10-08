import '@testing-library/jest-dom/vitest'

import { DEFAULT_SETTINGS, type AppSettings, type AppSettingsPatch } from './src/shared/settings'

/**
 * The bridge mock derives from DEFAULT_SETTINGS on purpose: a hand-written literal here silently
 * drifted from the real defaults in nine overlay fields, which made every renderer test assert
 * against settings the app could never produce.
 */
function settingsWith(patch: AppSettingsPatch = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...patch,
    modelStoragePath: 'C:\\Nola Translator\\models',
    recognition: { ...DEFAULT_SETTINGS.recognition, ...(patch.recognition ?? {}) },
    recording: { ...DEFAULT_SETTINGS.recording, ...(patch.recording ?? {}) },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...(patch.appearance ?? {}) },
    overlay: { ...DEFAULT_SETTINGS.overlay, ...(patch.overlay ?? {}) },
    translation: { ...DEFAULT_SETTINGS.translation, ...(patch.translation ?? {}) },
    compute: { ...DEFAULT_SETTINGS.compute, ...(patch.compute ?? {}) },
    videoCaptions: { ...DEFAULT_SETTINGS.videoCaptions, ...(patch.videoCaptions ?? {}) },
  }
}

const meetings = [
  { meetingId: '20260929-225000-aaaaaaaa', title: '', titleIsCustom: false, startedAtMs: Date.UTC(2026, 8, 29, 14, 50), endedAtMs: Date.UTC(2026, 8, 29, 14, 51), durationMs: 60_000, daySequence: 0, segmentCount: 2, sourceLanguage: 'auto', targetLanguage: 'zh' },
  { meetingId: '20260929-225500-bbbbbbbb', title: '周会', titleIsCustom: true, startedAtMs: Date.UTC(2026, 8, 29, 14, 55), endedAtMs: Date.UTC(2026, 8, 29, 14, 56, 30), durationMs: 90_000, daySequence: 1, segmentCount: 1, sourceLanguage: 'auto', targetLanguage: 'zh' },
]

Object.defineProperty(window, 'nolaTranslator', {
  configurable: true,
  writable: true,
  value: {
    listDevices: async () => [],
    listResources: async () => ({ storagePath: 'C:\\Nola Translator\\models', resources: [
      { resourceId: 'qwen3-asr-1.7b-hf', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Qwen3-ASR 1.7B', description: '测试模型', languages: ['zh', 'en'], installed: true, installedBytes: 1, state: 'idle', cancellable: false },
      { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hy-mt2', name: 'Hy-MT2 1.8B Q4_K_M', description: '测试翻译模型', languages: ['zh', 'en'], installed: true, installedBytes: 1, state: 'idle', cancellable: false },
      { resourceId: 'hy-mt2-1.8b-q3-k-m', kind: 'translationModel', provider: 'hy-mt2', name: 'Hy-MT2 1.8B Q3_K_M', description: '测试翻译模型', languages: ['zh', 'en'], installed: true, installedBytes: 1, state: 'idle', cancellable: false },
    ] }),
    manageResource: async () => { throw new Error('测试未配置资源操作') },
    startSession: async () => ({ sessionId: 'test-session', meetingId: 'test-meeting' }),
    stopSession: async () => undefined,
    setSessionPaused: async () => undefined,
    onEngineEvent: () => () => undefined,
    showOverlay: async () => undefined,
    hideOverlay: async () => undefined,
    closeOverlay: async () => undefined,
    minimizeOverlay: async () => undefined,
    resizeOverlay: async () => undefined,
    openAppearance: async () => undefined,
    onOpenAppearance: () => () => undefined,
    getSettings: async () => settingsWith(),
    getModelStorage: async () => ({ activePath: 'C:\\Nola Translator\\models', configuredPath: 'C:\\Nola Translator\\models', restartRequired: false }),
    chooseModelStorageDirectory: async () => null,
    restartApp: async () => undefined,
    updateSettings: async (patch: AppSettingsPatch) => settingsWith(patch),
    onSettingsChanged: () => () => undefined,
    listMeetings: async () => meetings,
    getMeeting: async (meetingId: string) => meetings.find((item) => item.meetingId === meetingId) ?? null,
    readMeeting: async () => [
      { segmentId: 's1', revision: 1, startedAtMs: 0, endedAtMs: 2000, sourceText: 'Good morning everyone.', isFinal: true, translations: [{ targetLanguage: 'zh', text: '大家早上好。', state: 'complete', provider: 'hymt2' }] },
      { segmentId: 's2', revision: 1, startedAtMs: 2200, sourceText: 'Let us get started.', isFinal: true, translations: [{ targetLanguage: 'zh', text: '我们开始吧。', state: 'complete', provider: 'hymt2' }] },
    ],
    renameMeeting: async (meetingId: string, title: string) => ({ meetingId, title, titleIsCustom: true, startedAtMs: Date.UTC(2026, 8, 29, 14, 50), endedAtMs: Date.UTC(2026, 8, 29, 14, 51), durationMs: 60_000, daySequence: 0, segmentCount: 2, sourceLanguage: 'auto', targetLanguage: 'zh' }),
    setMeetingNotes: async (meetingId: string, notes: string) => {
      const meeting = meetings.find((item) => item.meetingId === meetingId)
      if (!meeting) throw new Error('测试未配置会议')
      // 复制而非改写共享 fixture, 否则笔记会漏给后面的用例.
      return { ...meeting, notes }
    },
    deleteMeeting: async () => true,
    exportMeeting: async () => null,
    getMeetingAudioUrl: async () => null,
    getDiagnostics: async () => ({ 引擎状态: 'ready', 应用版本: '0.0.0-test', 语音识别: 'Qwen3-ASR 1.7B（nf4）', 本地翻译: 'Hy-MT2 · llama.cpp（cuda）' }),
    copyDiagnostics: async () => undefined,
    hasTranslationCredential: async () => false,
    setTranslationCredential: async () => undefined,
  },
})
