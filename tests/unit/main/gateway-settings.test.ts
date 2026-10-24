import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { SettingsStore } from '../../../src/main/settings-store'
import { settingsPatchSchema } from '../../../src/main/settings-schema'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

it('migrates existing profiles to tray close and independent gateway defaults', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-gateway-settings-'))
  const path = join(directory, 'settings.json')
  await writeFile(path, JSON.stringify({ version: 2, translation: { targetLanguage: 'ja' } }))
  const restored = await new SettingsStore(path).load()
  expect(restored.closeBehavior).toBe('tray')
  expect(restored.synthesis).toEqual({ modelId: '', voice: '' })
  expect(restored.modelGateway).toEqual(DEFAULT_SETTINGS.modelGateway)
  expect(restored.translation.targetLanguage).toBe('ja')
})

it('persists independent capability switches, TTS selection and close preference across partial writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-gateway-settings-'))
  const path = join(directory, 'settings.json')
  const store = new SettingsStore(path)
  await store.update({ synthesis: { modelId: 'tts-qwen3-tts-crisp-0.6b-base-q4-k', voice: 'test-voice' }, modelGateway: { asr: true, tts: true, port: 17861 }, closeBehavior: 'quit' })
  await store.update({ modelGateway: { mt: false }, synthesis: { voice: 'other-voice' } })
  const restored = await new SettingsStore(path).load()
  expect(restored.synthesis).toEqual({ modelId: 'tts-qwen3-tts-crisp-0.6b-base-q4-k', voice: 'other-voice' })
  expect(restored.modelGateway).toMatchObject({ asr: true, mt: false, tts: true, port: 17861 })
  expect(restored.closeBehavior).toBe('quit')
  expect(await readFile(path, 'utf8')).not.toMatch(/apiKey|secret|Bearer/)
})

it('rejects invalid listener configuration while allowing independent settings patches', () => {
  expect(settingsPatchSchema.parse({ modelGateway: { asr: true } })).toEqual({ modelGateway: { asr: true } })
  for (const modelGateway of [{ port: 0 }, { port: 65536 }, { port: 17860.5 }, { host: 'example.com' }, { tts: 'true' }]) {
    expect(settingsPatchSchema.safeParse({ modelGateway }).success).toBe(false)
  }
  expect(settingsPatchSchema.safeParse({ closeBehavior: 'hide-everything' }).success).toBe(false)
})

it('sanitizes corrupt persisted gateway and synthesis groups on load', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-gateway-settings-'))
  const path = join(directory, 'settings.json')
  await writeFile(path, JSON.stringify({ version: 2, closeBehavior: 'bad', modelGateway: { host: 'evil.example', port: -1 }, synthesis: { modelId: 7 } }))
  const restored = await new SettingsStore(path).load()
  expect(restored.closeBehavior).toBe('tray')
  expect(restored.modelGateway).toEqual(DEFAULT_SETTINGS.modelGateway)
  expect(restored.synthesis).toEqual(DEFAULT_SETTINGS.synthesis)
})
