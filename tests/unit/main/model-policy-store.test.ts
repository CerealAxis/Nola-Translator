import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import { SettingsStore } from '../../../src/main/settings-store'
import { isModelEnabled, modelEnablePatch, sceneModelBinding, sceneModelPatch } from '../../../src/shared/model-policy'

it('persists migrated policy and keeps a disabled model disabled after reloading legacy fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-policy-'))
  try {
    const path = join(directory, 'settings.json')
    await writeFile(path, JSON.stringify({ recognition: { modelId: 'sensevoice-small' } }))
    const store = new SettingsStore(path)
    const loaded = await store.load()
    expect(sceneModelBinding(loaded, 'asr')).toBe('resource:sensevoice-small')
    await store.update(modelEnablePatch(loaded, 'asr', 'sensevoice-small', false))
    const restored = await new SettingsStore(path).load()
    expect(restored.recognition.modelId).toBe('sensevoice-small')
    expect(isModelEnabled(restored, 'asr', 'sensevoice-small')).toBe(false)
    expect(JSON.parse(await readFile(path, 'utf8')).modelPolicy.enabled['asr:resource:sensevoice-small']).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})


it('merges concurrent scene selection patches from one settings snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-policy-merge-'))
  try {
    const path = join(directory, 'settings.json')
    const initial = structuredClone(DEFAULT_SETTINGS)
    initial.modelPolicy = {
      enabled: { 'asr:resource:sensevoice-small': true, 'mt:cloud:mymemory': true },
      defaults: { asr: 'resource:sensevoice-small', mt: 'cloud:mymemory' },
      selections: { asr: 'resource:sensevoice-small', mt: 'cloud:mymemory' },
    }
    await writeFile(path, JSON.stringify(initial))
    const store = new SettingsStore(path)
    const snapshot = await store.load()
    const asrPatch = sceneModelPatch(snapshot, 'asr', 'cloud:aliyun')
    const mtPatch = sceneModelPatch(snapshot, 'mt', 'resource:index-translate')

    await store.update(asrPatch)
    await store.update(mtPatch)
    const persisted = await new SettingsStore(path).load()
    expect(persisted.modelPolicy?.selections).toEqual({ asr: 'cloud:aliyun', mt: 'resource:index-translate' })
    expect(persisted.modelPolicy?.defaults).toEqual({ asr: 'resource:sensevoice-small', mt: 'cloud:mymemory' })
    expect(persisted.modelPolicy?.enabled).toEqual({ 'asr:resource:sensevoice-small': true, 'mt:cloud:mymemory': true })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('keeps malformed explicit policy closed instead of enabling legacy selected models', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-policy-invalid-'))
  try {
    const path = join(directory, 'settings.json')
    await writeFile(path, JSON.stringify({ recognition: { modelId: 'sensevoice-small' }, modelPolicy: { enabled: 'invalid' } }))
    const settings = await new SettingsStore(path).load()
    expect(settings.recognition.modelId).toBe('sensevoice-small')
    expect(settings.modelPolicy).toEqual({ enabled: {}, defaults: {}, selections: {} })
    expect(isModelEnabled(settings, 'asr', 'sensevoice-small')).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
