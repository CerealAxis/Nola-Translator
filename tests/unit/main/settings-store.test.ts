import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SettingsStore } from '../../../src/main/settings-store'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

describe('设置存储', () => {
  it('serializes concurrent patches and restores language/storage choices', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluentcaptions-settings-'))
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
    const directory = await mkdtemp(join(tmpdir(), 'fluentcaptions-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, '{broken', 'utf8')
      const store = new SettingsStore(path)
      expect((await store.load()).overlay.mode).toBe('bottom')
      const updated = await store.update({ historyEnabled: true })
      expect(updated.historyEnabled).toBe(true)
      expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('旧配置缺少新字段时回填默认值并归一化非法存储路径', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluentcaptions-settings-'))
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
    const directory = await mkdtemp(join(tmpdir(), 'fluentcaptions-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, JSON.stringify({
        version: 1,
        overlay: { backgroundColor: '#202020', translationColor: '#E6F2FF', fontSize: 30 },
      }), 'utf8')
      const migrated = await new SettingsStore(path).load()
      expect(migrated.overlay.backgroundColor).toBe(DEFAULT_SETTINGS.overlay.backgroundColor)
      expect(migrated.overlay.translationColor).toBe('#FFFFFF')
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
        overlay: { backgroundColor: '#202020', translationColor: '#123456' },
      }), 'utf8')
      const customized = await new SettingsStore(path).load()
      expect(customized.overlay.backgroundColor).toBe('#202020')
      expect(customized.overlay.translationColor).toBe('#123456')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
