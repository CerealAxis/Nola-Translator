import type { DictionaryKey } from '@/i18n/zh-CN'
import type { OnboardingStepId } from '../../../shared/onboarding-tour'

export interface TourStep {
  id: OnboardingStepId
  path: string
  target: string
  sourceCategory?: 'ASR' | 'MT'
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
  step('M1', '#/models', 'models-tabs', 'onboarding.M1Title', 'onboarding.M1Body', { via: `${tourTarget('home-models')} button` }),
  step('U6', '#/models', 'models-category', 'onboarding.U6Title', 'onboarding.U6Body'),
  step('H2', '#/models', 'models-source-picker', 'onboarding.H2Title', 'onboarding.H2Body', { sourceCategory: 'ASR' }),
  step('M2', '#/models', 'models-source-picker', 'onboarding.M2Title', 'onboarding.M2Body', { sourceCategory: 'MT' }),
  step('M4', '#/models', 'models-tools', 'onboarding.M4Title', 'onboarding.M4Body'),
  step('M5', '#/models', 'models-search-tab', 'onboarding.M5Title', 'onboarding.M5Body'),
  step('M6', '#/models/downloads', 'models-downloads-tab', 'onboarding.M6Title', 'onboarding.M6Body', { via: tourTarget('models-downloads-tab') }),
  step('U7', '#/model-gateway', 'gateway-asr', 'onboarding.U7Title', 'onboarding.U7Body', { via: tourTarget('nav-model-gateway') }),
  step('U8', '#/model-gateway', 'gateway-mt', 'onboarding.U8Title', 'onboarding.U8Body'),
  step('G2', '#/model-gateway', 'gateway-start', 'onboarding.G2Title', 'onboarding.G2Body'),
  step('U1', '#/workspace', 'quick-settings', 'onboarding.U1Title', 'onboarding.U1Body', { via: tourTarget('nav-workspace') }),
  step('U2', '#/workspace', 'open-workspace', 'onboarding.U2Title', 'onboarding.U2Body'),
]

const replacedLessons: Readonly<Partial<Record<string, OnboardingStepId>>> = {
  T1: 'H2', T2: 'H2', T3: 'H2', T4: 'H2', T5: 'H2',
  M3: 'M2', R1: 'M2', G1: 'M2', G3: 'M2', G4: 'M2',
}

export function resumeTourIndex(saved: string | undefined): number {
  if (saved === 'Z0') return TOUR_STEPS.length
  const current = replacedLessons[saved ?? ''] ?? saved
  return Math.max(0, TOUR_STEPS.findIndex(item => item.id === current))
}
