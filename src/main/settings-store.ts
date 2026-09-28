import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'

import { DEFAULT_SETTINGS, MAX_TARGET_LANGUAGES, RECOGNITION_MODEL_IDS, SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS, TRANSLATION_PROVIDERS, type AppSettings, type AppSettingsPatch } from '../shared/settings'

// Store-internal patches may also touch fields the IPC schema exposes only through their own channels.
export type StorePatch = AppSettingsPatch & { modelStoragePath?: string; version?: 1 }

/** 源语言：必须是下拉里的项，否则回落到自动识别。 */
function sanitizeSourceLanguage(value: unknown): string {
  return typeof value === 'string' && (SOURCE_LANGUAGE_OPTIONS as readonly string[]).includes(value)
    ? value
    : DEFAULT_SETTINGS.recognition.sourceLanguage
}

/** 目标语言：去重、按下拉顺序排序、截到协议上限。空数组是用户主动不选，保留；
 *  非空却全被滤掉说明文件已损坏，才回落默认。 */
function sanitizeTargetLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.translation.targetLanguages]
  const requested = new Set(value.filter((item): item is string => typeof item === 'string'))
  const valid = TARGET_LANGUAGE_OPTIONS.filter((code) => requested.has(code))
  if (!valid.length && value.length) return [...DEFAULT_SETTINGS.translation.targetLanguages]
  return valid.slice(0, MAX_TARGET_LANGUAGES)
}

export class SettingsStore {
  private settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(private readonly path: string) {}

  current(): AppSettings {
    return structuredClone(this.settings)
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<AppSettings> & {
        translation?: Partial<AppSettings['translation']> & { allowIntermediate?: unknown }
      }
      // 旧 Argos 中转开关语义不同，直接丢弃，不映射到 translateIntermediate。
      const rawTranslation = { ...(raw.translation ?? {}) }
      delete rawTranslation.allowIntermediate
      this.settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...raw,
        version: 1,
        uiLanguage: raw.uiLanguage === 'en' ? 'en' : 'zh-CN',
        modelStoragePath: typeof raw.modelStoragePath === 'string' && isAbsolute(raw.modelStoragePath) ? raw.modelStoragePath : '',
        recognition: { ...DEFAULT_SETTINGS.recognition, ...(raw.recognition ?? {}) },
        overlay: { ...DEFAULT_SETTINGS.overlay, ...(raw.overlay ?? {}) },
        translation: {
          ...DEFAULT_SETTINGS.translation,
          ...rawTranslation,
          translateIntermediate: typeof rawTranslation.translateIntermediate === 'boolean'
            ? rawTranslation.translateIntermediate
            : DEFAULT_SETTINGS.translation.translateIntermediate,
        },
      }
      // 三个旧识别模型 ID 与未知值统一迁移到 Qwen3-ASR（保留同级的语言设置）。
      if (!RECOGNITION_MODEL_IDS.includes(this.settings.recognition.modelId)) {
        this.settings.recognition = { ...this.settings.recognition, modelId: 'qwen3-asr-1.7b-hf' }
      }
      this.settings.recognition = {
        ...this.settings.recognition,
        sourceLanguage: sanitizeSourceLanguage(this.settings.recognition.sourceLanguage),
      }
      this.settings.translation.targetLanguages = sanitizeTargetLanguages(this.settings.translation.targetLanguages)
      // 翻译 provider：本地两个与三个网络 provider 保持原值，其余（含 argos）迁移到 hymt2。
      if (!TRANSLATION_PROVIDERS.includes(this.settings.translation.provider)) {
        this.settings.translation.provider = 'hymt2'
      }
      // 旧版字幕配色默认值升级为视频参考样式；仅当两项都未被自定义时才迁移。
      const overlay = this.settings.overlay
      if (overlay.backgroundColor === '#202020' && (overlay.translationColor === '#E6F2FF' || overlay.translationColor === '#D6E9FF')) {
        overlay.backgroundColor = DEFAULT_SETTINGS.overlay.backgroundColor
        overlay.translationColor = DEFAULT_SETTINGS.overlay.translationColor
      }
      // Upgrade the previous default floating bar without overriding custom colors or sizes.
      if (raw.overlay?.backgroundColor === '#111111' && raw.overlay.backgroundOpacity === 0.84) {
        overlay.backgroundColor = DEFAULT_SETTINGS.overlay.backgroundColor
        overlay.backgroundOpacity = DEFAULT_SETTINGS.overlay.backgroundOpacity
        if (raw.overlay.fontSize === 26) overlay.fontSize = DEFAULT_SETTINGS.overlay.fontSize
        if (raw.overlay.translationFontSize === 22) overlay.translationFontSize = DEFAULT_SETTINGS.overlay.translationFontSize
        if (raw.overlay.sourceColor === '#FFFFFF') overlay.sourceColor = DEFAULT_SETTINGS.overlay.sourceColor
        if (raw.overlay.translationColor === '#FFFFFF') overlay.translationColor = DEFAULT_SETTINGS.overlay.translationColor
        overlay.locked = false
      }
      if (raw.overlay?.backgroundColor === '#30343A' && raw.overlay.backgroundOpacity === 0.62) {
        overlay.backgroundColor = DEFAULT_SETTINGS.overlay.backgroundColor
        overlay.backgroundOpacity = DEFAULT_SETTINGS.overlay.backgroundOpacity
        if (raw.overlay.fontSize === 20) overlay.fontSize = DEFAULT_SETTINGS.overlay.fontSize
        if (raw.overlay.sourceColor === '#FFFFFF') overlay.sourceColor = DEFAULT_SETTINGS.overlay.sourceColor
        if (raw.overlay.translationColor === '#FFFFFF') overlay.translationColor = DEFAULT_SETTINGS.overlay.translationColor
      }
    } catch {
      this.settings = structuredClone(DEFAULT_SETTINGS)
    }
    return structuredClone(this.settings)
  }

  update(patch: StorePatch): Promise<AppSettings> {
    const copy = structuredClone(patch)
    const result = this.writeQueue.then(() => this.persist(copy))
    this.writeQueue = result.catch(() => undefined)
    return result
  }

  private async persist(patch: StorePatch): Promise<AppSettings> {
    const next: AppSettings = {
      ...this.settings,
      ...patch,
      version: 1,
      recognition: { ...this.settings.recognition, ...(patch.recognition ?? {}) },
      overlay: { ...this.settings.overlay, ...(patch.overlay ?? {}) },
      translation: { ...this.settings.translation, ...(patch.translation ?? {}) },
    }
    // 写档与读档共用同一套白名单校验，任何写入路径都不能留下非法语言码。
    next.recognition.sourceLanguage = sanitizeSourceLanguage(next.recognition.sourceLanguage)
    next.translation.targetLanguages = sanitizeTargetLanguages(next.translation.targetLanguages)
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8')
    await rename(temporary, this.path)
    this.settings = next
    return structuredClone(this.settings)
  }
}
