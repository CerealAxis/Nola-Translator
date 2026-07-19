import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { DEFAULT_SETTINGS, type AppSettings, type AppSettingsPatch } from '../shared/settings'

export class SettingsStore {
  private settings: AppSettings = structuredClone(DEFAULT_SETTINGS)

  constructor(private readonly path: string) {}

  current(): AppSettings {
    return structuredClone(this.settings)
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<AppSettings>
      this.settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...raw,
        version: 1,
        overlay: { ...DEFAULT_SETTINGS.overlay, ...(raw.overlay ?? {}) },
        translation: { ...DEFAULT_SETTINGS.translation, ...(raw.translation ?? {}) },
      }
    } catch {
      this.settings = structuredClone(DEFAULT_SETTINGS)
    }
    return structuredClone(this.settings)
  }

  async update(patch: AppSettingsPatch): Promise<AppSettings> {
    this.settings = {
      ...this.settings,
      ...patch,
      version: 1,
      overlay: { ...this.settings.overlay, ...(patch.overlay ?? {}) },
      translation: { ...this.settings.translation, ...(patch.translation ?? {}) },
    }
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(this.settings, null, 2), 'utf8')
    await rename(temporary, this.path)
    return structuredClone(this.settings)
  }
}
