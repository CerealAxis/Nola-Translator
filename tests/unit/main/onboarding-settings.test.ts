import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore } from '../../../src/main/settings-store'
import { settingsPatchSchema } from '../../../src/main/settings-schema'
import { mergeSettings } from '../../../src/renderer/store/settingsStore'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

it('offers onboarding to new and legacy profiles and remembers presentation across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-onboarding-'))
  const path = join(directory, 'settings.json')
  try {
    expect(await new SettingsStore(path).load()).toHaveProperty('onboardingSeen', false)
    await writeFile(path, JSON.stringify({ version: 1, uiLanguage: 'en', overlay: { fontSize: 32 } }))
    const store = new SettingsStore(path)
    expect(await store.load()).toHaveProperty('onboardingSeen', false)
    const patch = settingsPatchSchema.parse({ onboardingSeen: true })
    expect(mergeSettings(DEFAULT_SETTINGS, patch)).toHaveProperty('onboardingSeen', true)
    await store.update(patch)
    await store.update({ theme: 'dark' })
    expect(await new SettingsStore(path).load()).toMatchObject({ onboardingSeen: true, uiLanguage: 'en', theme: 'dark', overlay: { fontSize: 32 } })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('rejects non-boolean onboarding markers', () => {
  expect(settingsPatchSchema.safeParse({ onboardingSeen: 'true' }).success).toBe(false)
})


it('persists V2 progress and completion separately and rejects corrupt step IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-tour-v2-'))
  const path = join(directory, 'settings.json')
  try {
    const store = new SettingsStore(path)
    await store.load()
    await store.update({ onboardingSeen: true, onboardingVersion: 2, onboardingStep: 'M2' })
    expect(await new SettingsStore(path).load()).toMatchObject({ onboardingVersion: 2, onboardingStep: 'M2', onboardingCompletedVersion: 0 })
    await store.update({ onboardingStep: 'Z0', onboardingCompletedVersion: 2 })
    expect(await new SettingsStore(path).load()).toMatchObject({ onboardingStep: 'Z0', onboardingCompletedVersion: 2 })
    expect(settingsPatchSchema.safeParse({ onboardingStep: 'unknown-step' }).success).toBe(false)
    await writeFile(path, JSON.stringify({ onboardingSeen: true, onboardingVersion: 2, onboardingStep: 'unknown-step' }))
    expect(await new SettingsStore(path).load()).toMatchObject({ onboardingVersion: 2, onboardingStep: 'W0', onboardingCompletedVersion: 0 })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
