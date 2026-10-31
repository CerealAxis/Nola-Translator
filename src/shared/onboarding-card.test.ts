import { expect, it } from 'vitest'
import { parseOnboardingCardAction } from './onboarding-card'

it('requires a bounded step ID for every supported card action', () => {
  expect(parseOnboardingCardAction({ step: 'M1', action: 'next' })).toEqual({ step: 'M1', action: 'next' })
  for (const value of ['next', null, { action: 'next' }, { step: '', action: 'next' }, { step: 'x'.repeat(65), action: 'next' }, { step: 'M1', action: 'skip-step' }]) {
    expect(parseOnboardingCardAction(value)).toBeNull()
  }
})
