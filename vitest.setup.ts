import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'fluentCaptions', {
  configurable: true,
  writable: true,
  value: {
    listDevices: async () => [],
    startSession: async () => ({ sessionId: 'test-session' }),
    stopSession: async () => undefined,
    onEngineEvent: () => () => undefined,
    showOverlay: async () => undefined,
    hideOverlay: async () => undefined,
    getSettings: async () => ({ version: 1, theme: 'system', historyEnabled: false, overlay: { mode: 'bottom', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 28, fontWeight: 600, sourceColor: '#FFFFFF', translationColor: '#E6F2FF', backgroundOpacity: 0.84, maxLines: 3, lineHeight: 1.3, showSource: true, showTranslation: true }, translation: { provider: 'argos', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', allowIntermediate: false } }),
    updateSettings: async (patch: object) => ({ version: 1, theme: 'system', historyEnabled: false, overlay: { mode: 'bottom', locked: true, alwaysOnTop: true, fontFamily: 'Segoe UI Variable', fontSize: 28, fontWeight: 600, sourceColor: '#FFFFFF', translationColor: '#E6F2FF', backgroundOpacity: 0.84, maxLines: 3, lineHeight: 1.3, showSource: true, showTranslation: true }, translation: { provider: 'argos', microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com', microsoftRegion: '', openaiEndpoint: 'https://api.openai.com/v1', openaiModel: 'gpt-4.1-mini', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b', allowIntermediate: false }, ...patch }),
    onSettingsChanged: () => () => undefined,
    listHistory: async () => [], clearHistory: async () => undefined,
    exportHistory: async () => null, getDiagnostics: async () => ({ 引擎状态: 'ready', 语音识别: 'sherpa-onnx / faster-whisper', 本地翻译: 'Argos Translate' }), copyDiagnostics: async () => undefined,
    hasTranslationCredential: async () => false, setTranslationCredential: async () => undefined,
  },
})
