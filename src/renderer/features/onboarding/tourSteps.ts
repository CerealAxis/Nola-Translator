import type { DictionaryKey } from '@/i18n/zh-CN'
import type { OnboardingStepId } from '../../../shared/onboarding-tour'

export interface TourStep {
  id: OnboardingStepId
  path: string
  target: string
  include?: string
  scene?: 'sensevoice' | 'hymt2'
  list?: boolean
  via?: string
  title: DictionaryKey
  body: DictionaryKey
}

export const tourTarget = (name: string): string => `[data-onboarding="${name}"]`
const step = (id: OnboardingStepId, path: string, target: string, title: DictionaryKey, body: DictionaryKey, options: Partial<TourStep> = {}): TourStep => ({
  id, path, target: tourTarget(target), title, body, ...options,
})

export const TOUR_STEPS: readonly TourStep[] = [
  step('H1', '#/', 'home-models', 'onboarding.H1Title', 'onboarding.H1Body'),
  step('M1', '#/models', 'models-page-heading', 'onboarding.M1Title', 'onboarding.M1Body', { via: `${tourTarget('home-models')} button` }),
  step('U6', '#/models', 'models-recognition-catalog', 'onboarding.U6Title', 'onboarding.U6Body'),
  step('H2', '#/models', 'model-family-card-sensevoice', 'onboarding.H2Title', 'onboarding.H2Body'),
  step('T1', '#/models', 'model-engine', 'onboarding.T1Title', 'onboarding.T1Body', { scene: 'sensevoice' }),
  step('T2', '#/models', 'model-scale', 'onboarding.T2Title', 'onboarding.T2Body', { scene: 'sensevoice' }),
  step('T3', '#/models', 'model-version', 'onboarding.T3Title', 'onboarding.T3Body', { scene: 'sensevoice', list: true, include: tourTarget('model-file-options') }),
  step('T4', '#/models', 'model-sources', 'onboarding.T4Title', 'onboarding.T4Body', { scene: 'sensevoice' }),
  step('T5', '#/models', 'model-download-actions', 'onboarding.T5Title', 'onboarding.T5Body', { scene: 'sensevoice' }),
  step('M2', '#/models', 'models-translation-catalog', 'onboarding.M2Title', 'onboarding.M2Body'),
  step('M3', '#/models', 'model-family-card-hymt2', 'onboarding.M3Title', 'onboarding.M3Body'),
  step('R1', '#/models', 'model-engine', 'onboarding.R1Title', 'onboarding.R1Body', { scene: 'hymt2' }),
  step('G1', '#/models', 'model-scale', 'onboarding.G1Title', 'onboarding.G1Body', { scene: 'hymt2' }),
  step('G3', '#/models', 'model-version', 'onboarding.G3Title', 'onboarding.G3Body', { scene: 'hymt2', list: true, include: tourTarget('model-file-options') }),
  step('G4', '#/models', 'model-sources', 'onboarding.G4Title', 'onboarding.G4Body', { scene: 'hymt2' }),
  step('U7', '#/model-gateway', 'gateway-asr', 'onboarding.U7Title', 'onboarding.U7Body', { via: tourTarget('nav-model-gateway') }),
  step('U8', '#/model-gateway', 'gateway-mt', 'onboarding.U8Title', 'onboarding.U8Body'),
  step('G2', '#/model-gateway', 'gateway-start', 'onboarding.G2Title', 'onboarding.G2Body'),
  step('U1', '#/workspace', 'quick-settings', 'onboarding.U1Title', 'onboarding.U1Body', { via: tourTarget('nav-workspace') }),
  step('U2', '#/workspace', 'open-workspace', 'onboarding.U2Title', 'onboarding.U2Body'),
  step('U4', '#/video-captions', 'browser-settings', 'onboarding.U4Title', 'onboarding.U4Body', { via: tourTarget('nav-video-captions') }),
  step('B1', '#/video-captions', 'browser-model-settings', 'onboarding.B1Title', 'onboarding.B1Body'),
  step('B2', '#/video-captions', 'video-caption-service', 'onboarding.B2Title', 'onboarding.B2Body'),
]
