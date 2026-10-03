import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'

import { DEFAULT_SETTINGS, HYMT2_MODEL_IDS, RECOGNITION_MODEL_IDS, SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS, TRANSLATION_PROVIDERS, type AppSettings, type AppSettingsPatch, type Hymt2ModelId } from '../shared/settings'

// Store-internal patches may also touch fields the IPC schema exposes only through their own channels.
export type StorePatch = AppSettingsPatch & { modelStoragePath?: string; version?: 1 }

/** Must be a dropdown entry; anything else falls back to auto-detect. */
function sanitizeSourceLanguage(value: unknown): string {
  return typeof value === 'string' && (SOURCE_LANGUAGE_OPTIONS as readonly string[]).includes(value)
    ? value
    : DEFAULT_SETTINGS.recognition.sourceLanguage
}

/** Must be one of the three tiers; files written before the field existed fall back to the default. */
function sanitizeHymt2ModelId(value: unknown): Hymt2ModelId {
  return (HYMT2_MODEL_IDS as readonly string[]).includes(value as string)
    ? (value as Hymt2ModelId)
    : DEFAULT_SETTINGS.translation.hymt2ModelId
}

/** Must be in the dropdown allowlist. Files predating single-select store the former multi-select array, so its first allowed entry wins. */
function sanitizeTargetLanguage(value: unknown): string {
  const candidates = Array.isArray(value) ? value : [value]
  const match = candidates.find(
    (item): item is string =>
      typeof item === 'string' && (TARGET_LANGUAGE_OPTIONS as readonly string[]).includes(item),
  )
  return match ?? DEFAULT_SETTINGS.translation.targetLanguage
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
        translation?: Partial<AppSettings['translation']> & {
          allowIntermediate?: unknown
          /** The pre-single-select multi-select field; migrated to targetLanguage on load. */
          targetLanguages?: unknown
        }
        overlay?: Partial<AppSettings['overlay']> & {
          /** Retired when the rolling overlay began deriving its own budget from the stage height. */
          maxLines?: unknown
          translationMaxLines?: unknown
        }
      }
      // The legacy Argos relay toggle meant something else, so drop it rather than mapping it onto translateIntermediate.
      const rawTranslation = { ...(raw.translation ?? {}) }
      delete rawTranslation.allowIntermediate
      const legacyTargets = rawTranslation.targetLanguages
      delete rawTranslation.targetLanguages
      // The rolling overlay derives its own line budget from the stage height, so the two retired
      // line-count settings are dropped rather than merged and re-serialised on every write.
      const rawOverlay = { ...(raw.overlay ?? {}) }
      delete rawOverlay.maxLines
      delete rawOverlay.translationMaxLines
      this.settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...raw,
        version: 1,
        uiLanguage: raw.uiLanguage === 'en' ? 'en' : 'zh-CN',
        modelStoragePath: typeof raw.modelStoragePath === 'string' && isAbsolute(raw.modelStoragePath) ? raw.modelStoragePath : '',
        recognition: { ...DEFAULT_SETTINGS.recognition, ...(raw.recognition ?? {}) },
        recording: { ...DEFAULT_SETTINGS.recording, ...(raw.recording ?? {}) },
        appearance: { ...DEFAULT_SETTINGS.appearance, ...(raw.appearance ?? {}) },
        overlay: { ...DEFAULT_SETTINGS.overlay, ...rawOverlay },
        translation: {
          ...DEFAULT_SETTINGS.translation,
          ...rawTranslation,
          translateIntermediate: typeof rawTranslation.translateIntermediate === 'boolean'
            ? rawTranslation.translateIntermediate
            : DEFAULT_SETTINGS.translation.translateIntermediate,
        },
      }
      // The three retired recognition model IDs, and any unknown value, all migrate to Qwen3-ASR; the sibling sourceLanguage survives.
      if (!RECOGNITION_MODEL_IDS.includes(this.settings.recognition.modelId)) {
        this.settings.recognition = { ...this.settings.recognition, modelId: 'qwen3-asr-1.7b-hf' }
      }
      this.settings.recognition = {
        ...this.settings.recognition,
        sourceLanguage: sanitizeSourceLanguage(this.settings.recognition.sourceLanguage),
      }
      // The legacy array takes priority; the current single value still goes through the allowlist.
      this.settings.translation.targetLanguage = sanitizeTargetLanguage(
        legacyTargets ?? this.settings.translation.targetLanguage,
      )
      // The five known providers pass through; anything else, including the legacy argos provider, migrates to hymt2.
      if (!TRANSLATION_PROVIDERS.includes(this.settings.translation.provider)) {
        this.settings.translation.provider = 'hymt2'
      }
      this.settings.translation.hymt2ModelId = sanitizeHymt2ModelId(
        this.settings.translation.hymt2ModelId,
      )
      // Old default caption colors are upgraded to the video-reference style, but only while the user has customized neither.
      const overlay = this.settings.overlay
      if (rawOverlay.translationColor?.toUpperCase() === '#BFC2C8') {
        overlay.translationColor = DEFAULT_SETTINGS.overlay.translationColor
      }
      if (overlay.backgroundColor === '#202020' && (overlay.translationColor === '#E6F2FF' || overlay.translationColor === '#D6E9FF')) {
        overlay.backgroundColor = DEFAULT_SETTINGS.overlay.backgroundColor
        overlay.translationColor = DEFAULT_SETTINGS.overlay.translationColor
      }
      // Upgrade the previous default floating bar without overriding custom colors or sizes.
      if (rawOverlay.backgroundColor === '#111111' && rawOverlay.backgroundOpacity === 0.84) {
        overlay.backgroundColor = DEFAULT_SETTINGS.overlay.backgroundColor
        overlay.backgroundOpacity = DEFAULT_SETTINGS.overlay.backgroundOpacity
        if (rawOverlay.fontSize === 26) overlay.fontSize = DEFAULT_SETTINGS.overlay.fontSize
        if (rawOverlay.translationFontSize === 22) overlay.translationFontSize = DEFAULT_SETTINGS.overlay.translationFontSize
        if (rawOverlay.sourceColor === '#FFFFFF') overlay.sourceColor = DEFAULT_SETTINGS.overlay.sourceColor
        if (rawOverlay.translationColor === '#FFFFFF') overlay.translationColor = DEFAULT_SETTINGS.overlay.translationColor
        overlay.locked = false
      }
      if (rawOverlay.backgroundColor === '#30343A' && rawOverlay.backgroundOpacity === 0.62) {
        overlay.backgroundColor = DEFAULT_SETTINGS.overlay.backgroundColor
        overlay.backgroundOpacity = DEFAULT_SETTINGS.overlay.backgroundOpacity
        if (rawOverlay.fontSize === 20) overlay.fontSize = DEFAULT_SETTINGS.overlay.fontSize
        if (rawOverlay.sourceColor === '#FFFFFF') overlay.sourceColor = DEFAULT_SETTINGS.overlay.sourceColor
        if (rawOverlay.translationColor === '#FFFFFF') overlay.translationColor = DEFAULT_SETTINGS.overlay.translationColor
      }
      // The earliest bar was a #202020 slab left translucent, which over any bright window reads as a
      // washed-out grey card with white text barely separating from it. Only the untouched legacy
      // colours move; a card the user actually re-tinted keeps its background and its opacity.
      if (rawOverlay.backgroundColor === '#202020' && (rawOverlay.sourceColor ?? '').toUpperCase() === '#FFFFFF') {
        overlay.backgroundColor = DEFAULT_SETTINGS.overlay.backgroundColor
        overlay.backgroundOpacity = DEFAULT_SETTINGS.overlay.backgroundOpacity
        if ((rawOverlay.translationColor ?? '').toUpperCase() === '#FFFFFF') {
          overlay.translationColor = DEFAULT_SETTINGS.overlay.translationColor
        }
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
      recording: { ...this.settings.recording, ...(patch.recording ?? {}) },
      appearance: { ...this.settings.appearance, ...(patch.appearance ?? {}) },
      overlay: { ...this.settings.overlay, ...(patch.overlay ?? {}) },
      translation: { ...this.settings.translation, ...(patch.translation ?? {}) },
    }
    // Writes share the load-time allowlist so no write path can persist an invalid language code.
    next.recognition.sourceLanguage = sanitizeSourceLanguage(next.recognition.sourceLanguage)
    next.translation.targetLanguage = sanitizeTargetLanguage(next.translation.targetLanguage)
    next.translation.hymt2ModelId = sanitizeHymt2ModelId(next.translation.hymt2ModelId)
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8')
    await rename(temporary, this.path)
    this.settings = next
    return structuredClone(this.settings)
  }
}
