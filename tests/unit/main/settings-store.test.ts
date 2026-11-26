import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SettingsStore } from '../../../src/main/settings-store'
import { settingsPatchSchema } from '../../../src/main/settings-schema'
import { DEFAULT_SETTINGS, SOURCE_LANGUAGE_OPTIONS } from '../../../src/shared/settings'
import { LANGUAGE_CODES } from '../../../src/shared/languages'
import { GITHUB_PROXY_AUTO } from '../../../src/shared/github-proxies'
import { PYPI_MIRROR_AUTO, PYPI_MIRROR_OFF, PYTORCH_WHEEL_MIRROR_AUTO } from '../../../src/shared/pypi-mirrors'

describe('设置存储', () => {
  it.each(['', 'speaker_1', ' unknown:旧音色 '])('upgrades the v1.2.3 synthesis fields without dropping voice %j', async voice => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-tts-release-upgrade-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({ version: 3, synthesis: { modelId: 'local-tts', voice } }))
      const store = new SettingsStore(path)
      const loaded = await store.load()
      expect(loaded.synthesis.voiceRef).toEqual(voice ? { kind: 'preset', modelBinding: 'resource:local-tts', voiceId: voice } : { kind: 'engine-default' })
      await store.update({ theme: 'dark' })
      const persisted = JSON.parse(await readFile(path, 'utf8'))
      expect(persisted.synthesis.voice).toBeUndefined()
      expect(persisted.synthesis.voiceRef).toEqual(loaded.synthesis.voiceRef)
      expect((await new SettingsStore(path).load()).synthesis.voiceRef).toEqual(loaded.synthesis.voiceRef)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('restores the model workspace while rejecting credentials in its settings payload', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-model-management-'))
    const path = join(directory, 'settings.json')
    const connection = { id: 'provider_aabb00112233445566778899', service: 'openai', capability: 'LLM',
      name: 'Work', endpoint: 'https://example.test/v1', protocol: 'chat-completions', icon: 'OpenAI',
      workspace: '', region: 'cn-beijing', models: [] } as const
    const modelWorkspace = { connections: [{ ...connection, models: [] }], localSources: { qwen35: true } }
    try {
      const store = new SettingsStore(path)
      const patch = settingsPatchSchema.parse({ modelWorkspace })
      await store.update(patch)
      expect((await new SettingsStore(path).load()).modelWorkspace).toEqual(modelWorkspace)
      expect(settingsPatchSchema.safeParse({ modelWorkspace: {
        ...modelWorkspace, connections: [{ ...connection, key: 'secret' }],
      } }).success).toBe(false)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('persists desktop font and density, restores defaults, and rejects invalid saved preferences', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-typography-'))
    const path = join(directory, 'settings.json')
    try {
      const store = new SettingsStore(path)
      await store.load()
      await store.update({ appearance: { interfaceFont: 'Noto Sans JP', density: 'comfortable' } })
      const loaded = await new SettingsStore(path).load()
      expect(loaded.appearance).toMatchObject({ interfaceFont: 'Noto Sans JP', density: 'comfortable' })
      expect(loaded.overlay).toEqual(DEFAULT_SETTINGS.overlay)
      await store.update({ appearance: { interfaceFont: 'system', density: 'compact' } })
      expect((await new SettingsStore(path).load()).appearance).toMatchObject({ interfaceFont: 'system', density: 'compact' })
      await writeFile(path, JSON.stringify({ version: 3, appearance: { interfaceFont: 'unavailable', density: 'tiny' } }))
      expect((await new SettingsStore(path).load()).appearance).toMatchObject({ interfaceFont: 'system', density: 'compact' })
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('drops retired glass settings while preserving the other appearance preferences', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-appearance-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({
        version: 3,
        appearance: { reduceMotion: true, density: 'comfortable', liquidGlass: true, glassBlur: 23, glassOpacity: 77, glassSaturation: 110 },
      }))
      const store = new SettingsStore(path)
      const appearance = { ...DEFAULT_SETTINGS.appearance, reduceMotion: true, density: 'comfortable' }
      expect((await store.load()).appearance).toEqual(appearance)
      await store.update({ appearance: { interfaceFont: 'Noto Sans JP' } })
      expect(JSON.parse(await readFile(path, 'utf8')).appearance).toEqual({ ...appearance, interfaceFont: 'Noto Sans JP' })
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('persists multiple custom models and keeps the selected connection synchronized', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-custom-models-'))
    const path = join(directory, 'settings.json')
    const first = { id: 'first', name: 'First', endpoint: 'https://first.example/v1', model: 'first-model', apiFormat: 'chat-completions' as const, contextWindow: 32768, maxOutputTokens: 1024, languages: ['zh', 'en'] }
    const second = { ...first, id: 'second', name: 'Second', endpoint: 'https://second.example/v1', languages: ['ja', 'en'] }
    try {
      const store = new SettingsStore(path)
      await store.update({ translation: { customModels: [first, second], customModelId: 'second', provider: 'cloud' } })
      const restored = await new SettingsStore(path).load()
      const languages = { languages: LANGUAGE_CODES, sourceLanguages: SOURCE_LANGUAGE_OPTIONS }
      expect(restored.translation).toMatchObject({ customModels: [{ ...first, ...languages }, { ...second, ...languages }],
        customModelId: 'second', cloudName: 'Second', cloudEndpoint: second.endpoint, cloudLanguages: LANGUAGE_CODES, targetLanguage: 'zh' })
      await store.update({ translation: { cloudName: 'Renamed' } })
      expect(store.current().translation.customModels?.find(model => model.id === 'second')?.name).toBe('Renamed')
      expect(store.current().translation.customModels?.[0]).toEqual({ ...first, ...languages })
      expect(await readFile(path, 'utf8')).not.toContain('apiKey')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('restores VAD defaults for old settings and persists custom timing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-vad-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({ version: 3, recognition: { modelId: 'sensevoice-small' } }))
      const store = new SettingsStore(path)
      expect((await store.load()).recognition).toMatchObject({ max_segment_ms: 10000, silence_end_ms: 800 })
      await store.update({ recognition: { max_segment_ms: 15000, silence_end_ms: 1200 } })
      expect((await new SettingsStore(path).load()).recognition).toMatchObject({ max_segment_ms: 15000, silence_end_ms: 1200 })
      await writeFile(path, JSON.stringify({ version: 3, recognition: { max_segment_ms: -1, silence_end_ms: 'bad' } }))
      expect((await new SettingsStore(path).load()).recognition).toMatchObject({ max_segment_ms: 10000, silence_end_ms: 800 })
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('persists regional cloud configuration and keeps credentials outside settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-cloud-settings-'))
    const path = join(directory, 'settings.json')
    try {
      const store = new SettingsStore(path)
      await store.update({ recognition: { provider: 'aliyun', aliyunWorkspaceId: 'workspace-123', aliyunRegion: 'ap-southeast-1', aliyunModel: 'qwen3.5-livetranslate-flash-realtime', sourceLanguage: 'ja' },
        translation: { provider: 'mymemory', mymemoryEmail: 'test@example.com' } })
      const restored = await new SettingsStore(path).load()
      expect(restored.recognition).toMatchObject({ provider: 'aliyun', aliyunWorkspaceId: 'workspace-123', aliyunRegion: 'ap-southeast-1', aliyunModel: 'qwen3.5-livetranslate-flash-realtime', sourceLanguage: 'ja', modelId: DEFAULT_SETTINGS.recognition.modelId })
      expect(restored.translation).toMatchObject({ provider: 'mymemory', mymemoryEmail: 'test@example.com' })
      expect(await readFile(path, 'utf8')).not.toContain('apiKey')
      await store.update({ recognition: { aliyunModel: 'qwen3.8-livetranslate-flash-realtime' } })
      expect(store.current().recognition.sourceLanguage).toBe('auto')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('serializes concurrent patches and restores language/storage choices', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      const store = new SettingsStore(path)
      await Promise.all([
        store.update({ uiLanguage: 'en' }),
        store.update({ modelStoragePath: directory }),
        store.update({ overlay: { fontSize: 32 } }),
        store.update({ overlay: { translationFontSize: 26 } }),
      ])
      const restored = await new SettingsStore(path).load()
      expect(restored.uiLanguage).toBe('en')
      expect(restored.modelStoragePath).toBe(directory)
      expect(restored.overlay.fontSize).toBe(32)
      expect(restored.overlay.translationFontSize).toBe(26)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('损坏文件恢复默认值并原子保存更新', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, '{broken', 'utf8')
      const store = new SettingsStore(path)
      expect((await store.load()).overlay.mode).toBe('bottom')
      const updated = await store.update({ uiLanguage: 'en' })
      expect(updated.uiLanguage).toBe('en')
      expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(3)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('旧配置缺少新字段时回填默认值并归一化非法存储路径', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({ version: 3, theme: 'system', overlay: { mode: 'top' } }), 'utf8')
      const legacy = await new SettingsStore(path).load()
      expect(legacy.uiLanguage).toBe('auto')
      expect(legacy.modelStoragePath).toBe('')
      expect(legacy.overlay.mode).toBe('top')

      await writeFile(path, JSON.stringify({ version: 3, uiLanguage: 'fr', modelStoragePath: 'relative/models' }), 'utf8')
      const garbage = await new SettingsStore(path).load()
      expect(garbage.uiLanguage).toBe('auto')
      expect(garbage.modelStoragePath).toBe('')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })







  it('preserves implicit LiveTranslate selection and a later explicit cascade choice', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-realtime-selection-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({
        version: 3,
        recognition: { provider: 'aliyun', aliyunModel: 'qwen3.5-livetranslate-flash-realtime' },
        realtime: { outputMode: 'speech' },
      }))
      const store = new SettingsStore(path)
      expect((await store.load()).realtime?.s2sModel).toBe('qwen3.5-livetranslate-flash-realtime')
      await store.update({ realtime: { s2sModel: null } })
      expect((await new SettingsStore(path).load()).realtime?.s2sModel).toBeNull()
    } finally { await rm(directory, { recursive: true, force: true }) }
  })


  it.each(['fr', 'none'])('preserves the saved source and %s target language after reloading', async targetLanguage => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      const store = new SettingsStore(path)
      await store.update({
        recognition: { sourceLanguage: 'ja' },
        translation: { targetLanguage },
      })

      const reloaded = await new SettingsStore(path).load()

      expect(reloaded.recognition.sourceLanguage).toBe('ja')
      expect(reloaded.translation.targetLanguage).toBe(targetLanguage)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('语言白名单同时约束读档与写档，非法码不落盘', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({
        version: 3,
        recognition: { sourceLanguage: 'klingon' },
        translation: { targetLanguage: 'klingon' },
      }), 'utf8')
      const read = await new SettingsStore(path).load()
      expect(read.recognition.sourceLanguage).toBe('auto')
      expect(read.translation.targetLanguage).toBe('zh')

      const store = new SettingsStore(path)
      const written = await store.update({ translation: { targetLanguage: 'klingon' } })
      expect(written.translation.targetLanguage).toBe('zh')
      expect(JSON.parse(await readFile(path, 'utf8')).translation.targetLanguage).toBe('zh')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('本地模型 id 写入后可重载，空值与非法类型回落默认档', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      const store = new SettingsStore(path)
      await store.update({ translation: { localModelId: 'hy-mt2-1.8b-iq2-m' } })
      expect((await new SettingsStore(path).load()).translation.localModelId).toBe('hy-mt2-1.8b-iq2-m')

      // A free string, because M2M100 and hub models share this field. The tier enum is
      // settings-schema's job; filtering by the three Hy-MT2 tiers here would bounce a
      // freshly installed hub model back to the default.
      const custom = await store.update({ translation: { localModelId: 'hub:someone/my-mt-model' } })
      expect(custom.translation.localModelId).toBe('hub:someone/my-mt-model')

      for (const bad of ['', null]) {
        const written = await store.update({ translation: { localModelId: bad as never } })
        expect(written.translation.localModelId).toBe('hy-mt2-1.8b-q3-k-m')
        expect(JSON.parse(await readFile(path, 'utf8')).translation.localModelId).toBe('hy-mt2-1.8b-q3-k-m')
      }

    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

})
