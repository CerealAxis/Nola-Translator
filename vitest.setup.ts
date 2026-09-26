import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'fluentCaptions', {
  configurable: true,
  writable: true,
  value: {
    listDevices: async () => [],
    listResources: async () => ({ storagePath: 'C:\\FluentCaptions\\models', resources: [{ resourceId: 'sherpa-zh-en-small', kind: 'recognitionModel', provider: 'sherpa-onnx', name: '实时识别', description: '测试模型', languages: ['zh', 'en'], installed: true, installedBytes: 1, state: 'idle', cancellable: false }] }),
    manageResource: async () => { throw new Error('测试未配置资源操作') },
    startSession: async () => ({ sessionId: 'test-session' }),
    stopSession: async () => undefined,
    onEngineEvent: () => () => undefined,
    showOverlay: async () => undefined,
    hideOverlay: async () => undefined,
    getSettings: async () => ({ version: 1, theme: 'system', historyEnabled: false, recognition: { modelId: 'sherpa-zh-en-small' }, overlay: { mode: 'bottom', colorScheme: 'dark', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 28, fontWeight: 600, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#E6F2FF', backgroundColor: '#202020', backgroundOpacity: 0.84, maxLines: 3, lineHeight: 1.3, translationMaxLines: 3, translationLineHeight: 1.35, showSource: true, showTranslation: true }, translation: { provider: 'argos', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', allowIntermediate: false } }),
    updateSettings: async (patch: any) => ({ version: 1, theme: 'system', historyEnabled: false, recognition: { modelId: 'sherpa-zh-en-small', ...(patch.recognition ?? {}) }, overlay: { mode: 'bottom', colorScheme: 'dark', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 28, fontWeight: 600, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#E6F2FF', backgroundColor: '#202020', backgroundOpacity: 0.84, maxLines: 3, lineHeight: 1.3, translationMaxLines: 3, translationLineHeight: 1.35, showSource: true, showTranslation: true, ...(patch.overlay ?? {}) }, translation: { provider: 'argos', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', allowIntermediate: false, ...(patch.translation ?? {}) } }),
    onSettingsChanged: () => () => undefined,
    listHistory: async () => [], clearHistory: async () => undefined,
    exportHistory: async () => null, getDiagnostics: async () => ({ 引擎状态: 'ready', 语音识别: 'sherpa-onnx / faster-whisper', 本地翻译: 'Argos Translate' }), copyDiagnostics: async () => undefined,
    hasTranslationCredential: async () => false, setTranslationCredential: async () => undefined,
  },
})
