import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { computeSettingsSchema, DEFAULT_COMPUTE_SETTINGS } from '../shared/compute'

import { DEFAULT_SETTINGS, RECOGNITION_MODEL_IDS, SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS, TRANSLATION_PROVIDERS, type AppSettings, type AppSettingsPatch } from '../shared/settings'
import { findGithubProxyNode, GITHUB_PROXY_AUTO } from '../shared/github-proxies'

// Store-internal patches may also touch fields the IPC schema exposes only through their own channels.
export type StorePatch = AppSettingsPatch & { modelStoragePath?: string; version?: 1; browserConnection?: { enabled: boolean } }

/** Must be a dropdown entry; anything else falls back to auto-detect. */
function sanitizeSourceLanguage(value: unknown): string {
  return typeof value === 'string' && (SOURCE_LANGUAGE_OPTIONS as readonly string[]).includes(value)
    ? value
    : DEFAULT_SETTINGS.recognition.sourceLanguage
}

/** Any non-empty id up to 256 characters is accepted; the installed local models are not a fixed set. */
function sanitizeLocalModelId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    ? value
    : DEFAULT_SETTINGS.translation.localModelId
}

/**
 * A closed two-value union, so an unknown value cannot survive: the extension branches on it to
 * decide between a tab capture and a desktop capture. Falls back the same way on both the load and
 * the write path, so a hand-edited file cannot leave the dropdown showing a source that no longer exists.
 */
function sanitizeVideoCaptionAudioSource(value: unknown): 'tab' | 'system' {
  return value === 'system' ? 'system' : 'tab'
}

/** A device id is a display-device string from `listDevices()`; anything else means "no device chosen". */
function sanitizeVideoCaptionDeviceId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : undefined
}

/** A pre-migration `settings.json` `translation` block: old key names, every value unknown. */
type LegacyTranslation = Record<string, unknown>

const LEGACY_TRANSLATION_KEYS = ['hymt2ModelId', 'openaiEndpoint', 'openaiModel', 'ollamaEndpoint', 'ollamaModel'] as const

/**
 * Fallbacks for the retired `ollama` provider, used only when its legacy keys are missing.
 */
const LEGACY_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'
const LEGACY_OLLAMA_MODEL = 'qwen3:4b'

/**
 * Rewrites a legacy-shaped `translation` block into the current provider shape.
 *
 * Only the old provider's own fields are touched, and they are read from that provider, so
 * running it twice on one file is idempotent. The other four legacy pairs still hold defaults
 * nobody edited — an unused `ollamaEndpoint` is still `http://127.0.0.1:11434` — so moving all
 * five at once would overwrite the migrated values with those defaults.
 */
function migrateTranslation(raw: LegacyTranslation): LegacyTranslation {
  const next: LegacyTranslation = { ...raw }
  const legacy = typeof next.provider === 'string' ? next.provider : ''

  if (!TRANSLATION_PROVIDERS.includes(legacy as (typeof TRANSLATION_PROVIDERS)[number])) {
    switch (legacy) {
      case 'hymt2':
        next.provider = 'local'
        if (typeof raw.hymt2ModelId === 'string') next.localModelId = raw.hymt2ModelId
        break
      case 'm2m100':
        // `localModelId` is the only field left that distinguishes an M2M100 user; their
        // `hymt2ModelId` is an untouched default, so it is written rather than carried over.
        next.provider = 'local'
        next.localModelId = 'm2m100-418m'
        break
      case 'openai':
        next.provider = 'cloud'
        next.cloudApiFormat = 'chat-completions'
        if (typeof raw.openaiEndpoint === 'string') next.cloudEndpoint = raw.openaiEndpoint
        if (typeof raw.openaiModel === 'string') next.cloudModel = raw.openaiModel
        break
      case 'ollama':
        // Ollama is an API format under `cloud` now, not a provider of its own.
        next.provider = 'cloud'
        next.cloudApiFormat = 'ollama'
        // A missing legacy key gets the engine's own default; `DEFAULT_SETTINGS.translation`
        // would supply the OpenAI pair instead (see the two constants above).
        next.cloudEndpoint = typeof raw.ollamaEndpoint === 'string' ? raw.ollamaEndpoint : LEGACY_OLLAMA_ENDPOINT
        next.cloudModel = typeof raw.ollamaModel === 'string' ? raw.ollamaModel : LEGACY_OLLAMA_MODEL
        break
      default:
        // An unknown provider (the retired `argos` among them) falls back to the default local
        // model rather than persisting a value no dropdown offers.
        next.provider = 'local'
        next.localModelId = DEFAULT_SETTINGS.translation.localModelId
        break
    }
  }
  for (const key of LEGACY_TRANSLATION_KEYS) delete next[key]
  return next
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

/**
 * Moves the GitHub accelerator off the old free-text box, where a filled address meant acceleration
 * was on and an empty one meant it was off, onto a node picker that has no room for a custom address.
 * A value outside the catalog therefore has no entry to land on and becomes `auto`, which measures the
 * catalog instead.
 *
 * An empty value stays the empty string rather than being rewritten to `auto`, because the next load
 * reads an empty field as "off" again: filling it in would switch a user's disabled accelerator back
 * on one launch later, so the migration has to leave it exactly as it found it.
 *
 * A file that already carries the toggle is not one of these older files, and its boolean is the
 * newer answer: deriving the switch from the address alone would turn a user back on who had turned
 * acceleration off while leaving a node selected.
 */
function migrateGithubAccelerate(raw: Partial<AppSettings['network']> | undefined): Partial<Pick<AppSettings['network'], 'useGithubAccelerate' | 'githubAccelerateUrl'>> {
  const value = raw?.githubAccelerateUrl
  if (typeof value !== 'string') return {}
  const trimmed = value.trim()
  // Normalizing here as well as in the older branch below keeps the stored address and the node the
  // picker highlights the same one: the picker resolves anything outside the catalog to `auto`, so a
  // value left unnormalized would sit behind a row that is not the address actually in use.
  const node = trimmed ? findGithubProxyNode(trimmed) ?? GITHUB_PROXY_AUTO : ''
  if (typeof raw?.useGithubAccelerate === 'boolean') return { githubAccelerateUrl: node }
  if (!trimmed) return { useGithubAccelerate: false, githubAccelerateUrl: '' }
  return { useGithubAccelerate: true, githubAccelerateUrl: node }
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
          /** Retired; the rolling overlay derives its own budget from the stage height. */
          maxLines?: unknown
          translationMaxLines?: unknown
        }
        /** The pre-`network` top-level mirror toggle; migrated into `network` on load. */
        useHuggingFaceMirror?: unknown
      }
      // The legacy Argos relay toggle meant something else, so drop it rather than mapping it onto translateIntermediate.
      const rawTranslation = migrateTranslation({ ...(raw.translation ?? {}) })
      delete rawTranslation.allowIntermediate
      const legacyTargets = rawTranslation.targetLanguages
      delete rawTranslation.targetLanguages
      // The two retired line-count settings; the rolling overlay derives its budget from the stage height.
      const rawOverlay = { ...(raw.overlay ?? {}) }
      delete rawOverlay.maxLines
      delete rawOverlay.translationMaxLines
      this.settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...raw,
        version: 1,
        uiLanguage: raw.uiLanguage === 'en' ? 'en' : 'zh-CN',
        modelStoragePath: typeof raw.modelStoragePath === 'string' && isAbsolute(raw.modelStoragePath) ? raw.modelStoragePath : '',
        network: {
          ...DEFAULT_SETTINGS.network,
          ...(raw.network ?? {}),
          // A build from before the group kept the mirror toggle at the top level; reading it here
          // is the one place that value is honoured, so a user who turned it off does not get it
          // back from the default above.
          ...(typeof raw.useHuggingFaceMirror === 'boolean' && typeof raw.network?.useHuggingFaceMirror !== 'boolean'
            ? { useHuggingFaceMirror: raw.useHuggingFaceMirror }
            : {}),
          // A file that never carried the field leaves the spread above to the current default,
          // which is on with `auto`; only a stored value decides the outcome for one that did.
          ...migrateGithubAccelerate(raw.network),
        },
        recognition: { ...DEFAULT_SETTINGS.recognition, ...(raw.recognition ?? {}) },
        recording: { ...DEFAULT_SETTINGS.recording, ...(raw.recording ?? {}) },
        appearance: { ...DEFAULT_SETTINGS.appearance, ...(raw.appearance ?? {}) },
        browserConnection: { enabled: raw.browserConnection?.enabled === true },
        compute: computeSettingsSchema.safeParse(raw.compute ?? {}).data ?? { ...DEFAULT_COMPUTE_SETTINGS },
        overlay: { ...DEFAULT_SETTINGS.overlay, ...rawOverlay },
        // Video caption settings are run-scoped, so a block an older build left here is ignored and
        // every launch starts from the defaults. The write side keeps the same block in memory only.
        videoCaptions: structuredClone(DEFAULT_SETTINGS.videoCaptions),
        translation: {
          ...DEFAULT_SETTINGS.translation,
          ...rawTranslation,
          translateIntermediate: typeof rawTranslation.translateIntermediate === 'boolean'
            ? rawTranslation.translateIntermediate
            : DEFAULT_SETTINGS.translation.translateIntermediate,
        },
      }
      // The three retired recognition ids all migrate to Qwen3-ASR 1.7B; `sourceLanguage` is sanitized separately.
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
      // `migrateTranslation` already lands on a valid provider; this catches a hand-edited file.
      if (!TRANSLATION_PROVIDERS.includes(this.settings.translation.provider)) {
        this.settings.translation.provider = 'local'
      }
      this.settings.translation.localModelId = sanitizeLocalModelId(
        this.settings.translation.localModelId,
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
      // Legacy floating-bar defaults, upgraded field by field and only where the stored value is
      // still the untouched legacy one, so custom colours and sizes survive.
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
      // The earliest bar was a #202020 slab left translucent, which over a bright window reads as a
      // washed-out grey card; only untouched legacy values move, a re-tinted card keeps its own.
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
      videoCaptions: { ...this.settings.videoCaptions, ...(patch.videoCaptions ?? {}) },
      translation: { ...this.settings.translation, ...(patch.translation ?? {}) },
      compute: { ...this.settings.compute, ...(patch.compute ?? {}) },
      network: { ...this.settings.network, ...(patch.network ?? {}) },
    }
    // Writes share the load-time allowlist so no write path can persist an invalid language code.
    next.recognition.sourceLanguage = sanitizeSourceLanguage(next.recognition.sourceLanguage)
    next.translation.targetLanguage = sanitizeTargetLanguage(next.translation.targetLanguage)
    next.translation.localModelId = sanitizeLocalModelId(next.translation.localModelId)
    next.videoCaptions.audioSource = sanitizeVideoCaptionAudioSource(next.videoCaptions.audioSource)
    next.videoCaptions.audioDeviceId = next.videoCaptions.audioSource === 'system'
      ? sanitizeVideoCaptionDeviceId(next.videoCaptions.audioDeviceId)
      : undefined
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    /*
     * A browser caption session creates no meeting and writes no file, so `videoCaptions` has no
     * result to outlive and stays in memory for the running app only. The block is left out of the
     * file rather than written with the defaults: an absent block can only read as "never
     * persisted", while a defaulted block reads back as a remembered setting. `this.settings`
     * still holds the live values, which is what `browserCaptionConfig()` reads.
     */
    const { videoCaptions: _runScoped, ...persisted } = next
    await writeFile(temporary, JSON.stringify(persisted, null, 2), 'utf8')
    await rename(temporary, this.path)
    this.settings = next
    return structuredClone(this.settings)
  }
}
