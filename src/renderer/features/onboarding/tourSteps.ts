import type { DictionaryKey } from '@/i18n/zh-CN'

export interface TourStep {
  id: string
  chapter: number
  path: string
  target: string
  include?: string
  title: DictionaryKey
  body: DictionaryKey
  action?: 'press' | 'inspect' | 'audio'
  destination?: string
  result?: string
  control?: string
  model?: 'recognition' | 'translation'
  runtime?: 'engine' | 'llama' | 'crisp'
}

export const tourTarget = (name: string): string => `[data-onboarding="${name}"]`
const target = tourTarget
const modelDetail = target('model-detail')

export const TOUR_CHAPTERS = ['onboarding.chapterRuntime', 'onboarding.chapterModels', 'onboarding.chapterServices', 'onboarding.chapterUse'] as const

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'settings', chapter: 0, path: '#/', target: target('nav-settings'), title: 'nav.settings', body: 'onboarding.openSettings', action: 'press', destination: '#/settings/appearance' },
  { id: 'compute', chapter: 0, path: '#/settings/appearance', target: target('settings-compute'), title: 'compute.devices', body: 'onboarding.openCompute', action: 'press', destination: '#/settings/compute' },
  { id: 'torch', chapter: 0, path: '#/settings/compute', target: target('runtime-version-engine'), title: 'runtime.pytorch', body: 'onboarding.torchChoice', action: 'inspect', runtime: 'engine' },
  { id: 'llama-tab', chapter: 0, path: '#/settings/compute', target: target('runtime-llama'), title: 'runtime.llama', body: 'onboarding.llamaSwitch', action: 'press', result: '#runtime-llama:not([hidden])' },
  { id: 'llama', chapter: 0, path: '#/settings/compute', target: target('runtime-version-llama'), title: 'runtime.llama', body: 'onboarding.llamaChoice', action: 'inspect', runtime: 'llama' },
  { id: 'crisp-tab', chapter: 0, path: '#/settings/compute', target: target('runtime-crisp'), title: 'runtime.crisp', body: 'onboarding.crispSwitch', action: 'press', result: '#runtime-crisp:not([hidden])' },
  { id: 'crisp', chapter: 0, path: '#/settings/compute', target: target('runtime-version-crisp'), title: 'runtime.crisp', body: 'onboarding.crispChoice', action: 'inspect', runtime: 'crisp' },

  { id: 'models', chapter: 1, path: '#/settings/compute', target: target('nav-models'), title: 'nav.models', body: 'onboarding.openModels', action: 'press', destination: '#/models' },
  { id: 'recognition-model', chapter: 1, path: '#/models', target: target('model-family-recognitionModel'), title: 'settings.recognitionModel', body: 'onboarding.openRecognitionModel', action: 'press', result: `${modelDetail}[data-model-kind="recognitionModel"]` },
  { id: 'model-engine', chapter: 1, path: '#/models', target: target('model-engine'), title: 'modelConfig.engine', body: 'onboarding.modelEngine', action: 'press', control: 'button', model: 'recognition' },
  { id: 'model-scale', chapter: 1, path: '#/models', target: target('model-scale'), title: 'models.parameterScale', body: 'onboarding.modelScale', action: 'press', control: 'button', model: 'recognition' },
  { id: 'model-version', chapter: 1, path: '#/models', target: target('model-version'), title: 'offline.modelChoice', body: 'onboarding.modelVersion', action: 'inspect', model: 'recognition' },
  { id: 'recognition-source', chapter: 1, path: '#/models', target: target('model-sources'), title: 'models.downloadSources.title', body: 'onboarding.modelDownload', action: 'press', control: target('model-download-source'), model: 'recognition' },
  { id: 'translation-model', chapter: 1, path: '#/models', target: target('model-family-translationModel'), title: 'settings.model', body: 'onboarding.openTranslationModel', action: 'press', result: `${modelDetail}[data-model-kind="translationModel"]` },
  { id: 'translation-version', chapter: 1, path: '#/models', target: target('model-version'), title: 'offline.modelChoice', body: 'onboarding.translationVersion', action: 'inspect', model: 'translation' },
  { id: 'service-settings', chapter: 2, path: '#/models', target: target('nav-settings'), title: 'nav.settings', body: 'onboarding.servicesSettings', action: 'press', destination: '#/settings/appearance' },
  { id: 'audio-tab', chapter: 2, path: '#/settings/appearance', target: target('settings-audio'), title: 'modelsSettingsUi.audio', body: 'onboarding.openAudio', action: 'press', destination: '#/settings/audio' },
  { id: 'recognition-provider', chapter: 2, path: '#/settings/audio', target: target('recognition-provider'), title: 'settings.provider', body: 'onboarding.recognitionProvider', action: 'inspect' },
  { id: 'recognition-config', chapter: 2, path: '#/settings/audio', target: `${target('recognition-model')}, ${target('recognition-provider')}`, title: 'onboarding.recognitionTitle', body: 'onboarding.recognitionConfig' },
  { id: 'audio-source', chapter: 2, path: '#/settings/audio', target: target('audio-source'), title: 'settings.audioSource', body: 'onboarding.audioSource', action: 'inspect' },
  { id: 'translation-tab', chapter: 2, path: '#/settings/audio', target: target('settings-translation'), title: 'modelsSettingsUi.translation', body: 'onboarding.openTranslation', action: 'press', destination: '#/settings/translation' },
  { id: 'translation-provider', chapter: 2, path: '#/settings/translation', target: target('translation-provider'), title: 'settings.provider', body: 'onboarding.translationProvider', action: 'inspect' },
  { id: 'translation-config', chapter: 2, path: '#/settings/translation', target: `${target('translation-model')}, ${target('translation-provider')}`, title: 'onboarding.translationTitle', body: 'onboarding.translationConfig' },

  { id: 'quick-nav', chapter: 3, path: '#/settings/translation', target: target('nav-workspace'), title: 'home.quickStart', body: 'onboarding.openQuick', action: 'press', destination: '#/workspace' },
  { id: 'quick', chapter: 3, path: '#/workspace', target: target('quick-settings'), title: 'home.quickStart', body: 'onboarding.useQuick' },
  { id: 'overlay-nav', chapter: 3, path: '#/workspace', target: target('nav-overlay'), title: 'shellUi.overlay', body: 'onboarding.openOverlay', action: 'press', destination: '#/overlay' },
  { id: 'overlay', chapter: 3, path: '#/overlay', target: '.nola-overlay-page .nola-page-heading', title: 'shellUi.overlay', body: 'onboarding.useOverlay' },
  { id: 'browser-nav', chapter: 3, path: '#/overlay', target: target('nav-video-captions'), title: 'videoCaptions.title', body: 'onboarding.openBrowser', action: 'press', destination: '#/video-captions' },
  { id: 'browser', chapter: 3, path: '#/video-captions', target: '.nola-video-service', title: 'videoCaptions.title', body: 'onboarding.useBrowser' },
]
