import type { DictionaryKey } from '@/i18n/zh-CN'

export interface TourStep {
  id: string
  chapter: number
  path: string
  target: string
  include?: string
  title: DictionaryKey
  body: DictionaryKey
  action?: 'press'
  destination?: string
  result?: string
  model?: 'recognition'
}

export const tourTarget = (name: string): string => `[data-onboarding="${name}"]`
const target = tourTarget
const modelDetail = target('model-detail')

/*
 * Region-first spotlighting: tour lessons frame whole cards, groups and dialogs so the
 * copy can explain an area in one pass. Button-sized targets are reserved for guided
 * navigation (sidebar entries and the buttons that open the next area).
 */
export const TOUR_CHAPTERS = ['onboarding.chapterRuntime', 'onboarding.chapterModels', 'onboarding.chapterUse'] as const

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'models', chapter: 0, path: '#/', target: target('nav-models'), title: 'nav.models', body: 'onboarding.openModels', action: 'press', destination: '#/models' },
  { id: 'runtime-setup', chapter: 0, path: '#/models', target: target('models-runtime-setup'), title: 'modelsSettingsUi.runtimeSetup', body: 'onboarding.openRuntimeSetup', action: 'press', destination: '#/settings/compute' },
  { id: 'runtime-engines', chapter: 0, path: '#/settings/compute', target: '#runtime-engines-section', title: 'runtime.engines', body: 'onboarding.runtimeRegion' },
  { id: 'runtime-return', chapter: 0, path: '#/settings/compute', target: target('nav-models'), title: 'nav.models', body: 'onboarding.backToModels', action: 'press', destination: '#/models' },

  { id: 'models-active', chapter: 1, path: '#/models', target: target('models-active'), title: 'models.title', body: 'onboarding.activeModels' },
  { id: 'models-tabs', chapter: 1, path: '#/models', target: target('models-tabs'), title: 'modelsSettingsUi.catalogTabs', body: 'onboarding.catalogTabs' },
  { id: 'recognition-model', chapter: 1, path: '#/models', target: target('model-family-recognitionModel'), title: 'modelsSettingsUi.startConfiguration', body: 'onboarding.openFamily', action: 'press', result: modelDetail },
  { id: 'models-detail', chapter: 1, path: '#/models', target: modelDetail, title: 'modelConfig.configure', body: 'onboarding.familyDetail', model: 'recognition' },

  { id: 'quick-nav', chapter: 2, path: '#/models', target: target('nav-workspace'), title: 'home.quickStart', body: 'onboarding.openQuick', action: 'press', destination: '#/workspace' },
  { id: 'quick', chapter: 2, path: '#/workspace', target: target('quick-settings'), title: 'home.quickStart', body: 'onboarding.useQuick' },
  { id: 'overlay', chapter: 2, path: '#/workspace', target: target('caption-preview'), include: target('open-overlay'), title: 'shellUi.captionPreview', body: 'onboarding.useOverlay' },
  { id: 'browser-nav', chapter: 2, path: '#/workspace', target: target('nav-video-captions'), title: 'videoCaptions.title', body: 'onboarding.openBrowser', action: 'press', destination: '#/video-captions' },
  { id: 'browser', chapter: 2, path: '#/video-captions', target: '.nola-video-service', title: 'videoCaptions.title', body: 'onboarding.useBrowser' },
  { id: 'workbench', chapter: 2, path: '#/video-captions', target: target('nav-workbench'), title: 'workbench.title', body: 'onboarding.useWorkbench' },
  { id: 'gateway-nav', chapter: 2, path: '#/video-captions', target: target('nav-model-gateway'), title: 'nav.modelGateway', body: 'onboarding.openGateway', action: 'press', destination: '#/model-gateway' },
  { id: 'gateway-service', chapter: 2, path: '#/model-gateway', target: target('gateway-service'), title: 'gateway.service', body: 'onboarding.useGatewayService' },
  { id: 'gateway-capabilities', chapter: 2, path: '#/model-gateway', target: target('gateway-capabilities'), title: 'gateway.capabilities', body: 'onboarding.useGatewayCapabilities' },
]
