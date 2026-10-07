import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SettingsStore } from '../../../src/main/settings-store'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

describe('设置存储', () => {
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
      expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('旧配置缺少新字段时回填默认值并归一化非法存储路径', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({ version: 1, theme: 'system', overlay: { mode: 'top' } }), 'utf8')
      const legacy = await new SettingsStore(path).load()
      expect(legacy.uiLanguage).toBe('zh-CN')
      expect(legacy.modelStoragePath).toBe('')
      expect(legacy.overlay.mode).toBe('top')

      await writeFile(path, JSON.stringify({ version: 1, uiLanguage: 'fr', modelStoragePath: 'relative/models' }), 'utf8')
      const garbage = await new SettingsStore(path).load()
      expect(garbage.uiLanguage).toBe('zh-CN')
      expect(garbage.modelStoragePath).toBe('')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('迁移旧版字幕默认配色但保留用户自定义颜色', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({
        version: 1,
        overlay: { backgroundColor: '#202020', translationColor: '#E6F2FF', fontSize: 30 },
      }), 'utf8')
      const migrated = await new SettingsStore(path).load()
      expect(migrated.overlay.backgroundColor).toBe(DEFAULT_SETTINGS.overlay.backgroundColor)
      expect(migrated.overlay.translationColor).toBe(DEFAULT_SETTINGS.overlay.translationColor)
      expect(migrated.overlay.fontSize).toBe(30)

      await writeFile(path, JSON.stringify({
        version: 1,
        overlay: { backgroundColor: '#111111', backgroundOpacity: 0.84, fontSize: 26, translationFontSize: 22, locked: true },
      }), 'utf8')
      const oldDefault = await new SettingsStore(path).load()
      expect(oldDefault.overlay.backgroundColor).toBe(DEFAULT_SETTINGS.overlay.backgroundColor)
      expect(oldDefault.overlay.fontSize).toBe(DEFAULT_SETTINGS.overlay.fontSize)
      expect(oldDefault.overlay.locked).toBe(false)

      await writeFile(path, JSON.stringify({
        version: 1,
        overlay: { backgroundColor: '#30343A', backgroundOpacity: 0.62, fontSize: 20, sourceColor: '#FFFFFF', translationColor: '#FFFFFF' },
      }), 'utf8')
      const previousBar = await new SettingsStore(path).load()
      expect(previousBar.overlay.backgroundColor).toBe(DEFAULT_SETTINGS.overlay.backgroundColor)
      expect(previousBar.overlay.backgroundOpacity).toBe(DEFAULT_SETTINGS.overlay.backgroundOpacity)
      expect(previousBar.overlay.fontSize).toBe(DEFAULT_SETTINGS.overlay.fontSize)

      await writeFile(path, JSON.stringify({
        version: 1,
        overlay: { backgroundColor: '#202020', translationColor: '#123456' },
      }), 'utf8')
      const customized = await new SettingsStore(path).load()
      expect(customized.overlay.backgroundColor).toBe('#202020')
      expect(customized.overlay.translationColor).toBe('#123456')

      await writeFile(path, JSON.stringify({ version: 1, overlay: { translationColor: '#BFC2C8' } }), 'utf8')
      const priorDefault = await new SettingsStore(path).load()
      expect(priorDefault.overlay.translationColor).toBe(DEFAULT_SETTINGS.overlay.translationColor)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('迁移旧识别模型 ID 与翻译 provider，并丢弃旧中转开关', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      for (const legacyModelId of ['sherpa-zh-en-small', 'faster-whisper-small', 'totally-unknown-model']) {
        await writeFile(path, JSON.stringify({
          version: 1,
          recognition: { modelId: legacyModelId },
          translation: { provider: 'argos', allowIntermediate: true, translateIntermediate: true },
        }), 'utf8')
        const migrated = await new SettingsStore(path).load()
        expect(migrated.recognition.modelId).toBe('qwen3-asr-1.7b-hf')
        expect(migrated.translation.provider).toBe('local')
        expect(migrated.translation).not.toHaveProperty('allowIntermediate')
        expect(migrated.translation.translateIntermediate).toBe(true)
      }

      // 'microsoft' keeps its name; 'openai' and 'ollama' collapse into 'cloud' as an apiFormat.
      for (const [legacy, expected] of [
        ['microsoft', 'microsoft'],
        ['openai', 'cloud'],
        ['ollama', 'cloud'],
      ] as const) {
        await writeFile(path, JSON.stringify({ version: 1, translation: { provider: legacy } }), 'utf8')
        const preserved = await new SettingsStore(path).load()
        expect(preserved.translation.provider).toBe(expected)
      }

      await writeFile(path, JSON.stringify({ version: 1, translation: { provider: 'unknown-provider' } }), 'utf8')
      const unknown = await new SettingsStore(path).load()
      expect(unknown.translation.provider).toBe('local')

      await writeFile(path, JSON.stringify({ version: 1, translation: { allowIntermediate: true } }), 'utf8')
      const pivotDropped = await new SettingsStore(path).load()
      expect(pivotDropped.translation).not.toHaveProperty('allowIntermediate')
      expect(pivotDropped.translation.translateIntermediate).toBe(false)

      await writeFile(path, JSON.stringify({ version: 1 }), 'utf8')
      const defaults = await new SettingsStore(path).load()
      expect(defaults.recognition.modelId).toBe('qwen3-asr-1.7b-hf')
      expect(defaults.recognition.sourceLanguage).toBe('auto')
      expect(defaults.translation.provider).toBe('local')
      expect(defaults.translation.localModelId).toBe('hy-mt2-1.8b-q3-k-m')
      expect(defaults.translation.targetLanguage).toBe('zh')
      expect(defaults.translation.translateIntermediate).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
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
        version: 1,
        recognition: { sourceLanguage: 'klingon' },
        translation: { targetLanguage: 'klingon' },
      }), 'utf8')
      const read = await new SettingsStore(path).load()
      expect(read.recognition.sourceLanguage).toBe('auto')
      expect(read.translation.targetLanguage).toBe('zh')

      // Old files hold an array from when target languages were multi-select: take the first entry still in the allowlist.
      for (const [stored, expected] of [
        [['fr', 'en'], 'fr'],
        [['xx', 'fr'], 'fr'],
        [['xx', 'yy'], 'zh'],
        [[], 'zh'],
      ] as const) {
        await writeFile(path, JSON.stringify({ version: 1, translation: { targetLanguages: stored } }), 'utf8')
        expect((await new SettingsStore(path).load()).translation.targetLanguage).toBe(expected)
      }

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

      await writeFile(path, JSON.stringify({ version: 1, translation: { provider: 'hymt2' } }), 'utf8')
      expect((await new SettingsStore(path).load()).translation.localModelId).toBe('hy-mt2-1.8b-q3-k-m')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('迁移旧识别模型 ID 时保留同级的源语言', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-translator-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({
        version: 1,
        recognition: { modelId: 'sherpa-zh-en-small', sourceLanguage: 'ko' },
      }), 'utf8')

      const migrated = await new SettingsStore(path).load()

      expect(migrated.recognition.modelId).toBe('qwen3-asr-1.7b-hf')
      expect(migrated.recognition.sourceLanguage).toBe('ko')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
