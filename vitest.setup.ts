import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'nolaTranslator', {
  configurable: true,
  writable: true,
  value: {
    listDevices: async () => [],
    listResources: async () => ({ storagePath: 'C:\\Nola Translator\\models', resources: [
      { resourceId: 'qwen3-asr-1.7b-hf', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Qwen3-ASR 1.7B', description: '测试模型', languages: ['zh', 'en'], installed: true, installedBytes: 1, state: 'idle', cancellable: false },
      { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hy-mt2', name: 'Hy-MT2 1.8B Q4_K_M', description: '测试翻译模型', languages: ['zh', 'en'], installed: true, installedBytes: 1, state: 'idle', cancellable: false },
    ] }),
    manageResource: async () => { throw new Error('测试未配置资源操作') },
    startSession: async () => ({ sessionId: 'test-session' }),
    stopSession: async () => undefined,
    onEngineEvent: () => () => undefined,
    showOverlay: async () => undefined,
    hideOverlay: async () => undefined,
    resizeOverlay: async () => undefined,
    openAppearance: async () => undefined,
    onOpenAppearance: () => () => undefined,
    getSettings: async () => ({ version: 1, theme: 'system', uiLanguage: 'zh-CN', modelStoragePath: '', historyEnabled: false, recognition: { modelId: 'qwen3-asr-1.7b-hf', sourceLanguage: 'auto' }, overlay: { mode: 'bottom', colorScheme: 'dark', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 28, fontWeight: 600, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#FFFFFF', backgroundColor: '#111111', backgroundOpacity: 0.84, maxLines: 3, lineHeight: 1.3, translationMaxLines: 3, translationLineHeight: 1.35, showSource: true, showTranslation: true }, translation: { provider: 'hymt2', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', translateIntermediate: false, targetLanguages: ['zh'] } }),
    updateSettings: async (patch: any) => ({ version: 1, theme: 'system', uiLanguage: patch.uiLanguage ?? 'zh-CN', modelStoragePath: '', historyEnabled: false, recognition: { modelId: 'qwen3-asr-1.7b-hf', sourceLanguage: 'auto', ...(patch.recognition ?? {}) }, overlay: { mode: 'bottom', colorScheme: 'dark', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 28, fontWeight: 600, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#FFFFFF', backgroundColor: '#111111', backgroundOpacity: 0.84, maxLines: 3, lineHeight: 1.3, translationMaxLines: 3, translationLineHeight: 1.35, showSource: true, showTranslation: true, ...(patch.overlay ?? {}) }, translation: { provider: 'hymt2', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', translateIntermediate: false, targetLanguages: ['zh'], ...(patch.translation ?? {}) } }),
    onSettingsChanged: () => () => undefined,
    listHistory: async () => [], clearHistory: async () => undefined,
    exportHistory: async () => null, getDiagnostics: async () => ({ 引擎状态: 'ready', 语音识别: 'Qwen3-ASR 1.7B（nf4）', 本地翻译: 'Hy-MT2 · llama.cpp（cuda）' }), copyDiagnostics: async () => undefined,
    hasTranslationCredential: async () => false, setTranslationCredential: async () => undefined,
  },
})
