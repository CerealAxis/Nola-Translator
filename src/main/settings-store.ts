import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { computeSettingsSchema, DEFAULT_COMPUTE_SETTINGS } from '../shared/compute'

import { DEFAULT_SETTINGS, RECOGNITION_MODEL_IDS, SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS, TRANSLATION_PROVIDERS, type AppSettings, type AppSettingsPatch } from '../shared/settings'

// Store-internal patches may also touch fields the IPC schema exposes only through their own channels.
export type StorePatch = AppSettingsPatch & { modelStoragePath?: string; version?: 1 }

/** Must be a dropdown entry; anything else falls back to auto-detect. */
function sanitizeSourceLanguage(value: unknown): string {
  return typeof value === 'string' && (SOURCE_LANGUAGE_OPTIONS as readonly string[]).includes(value)
    ? value
    : DEFAULT_SETTINGS.recognition.sourceLanguage
}

/**
 * 本地模型 id 不再做枚举 allowlist：这个位现在是「已安装的本地翻译模型」的指针，
 * 取值包含 Hy-MT2 三档、M2M100 以及 `hub:` 前缀的自装模型，按老列表过滤会把刚装好的
 * 自装模型挡回默认档位。落盘前只校验非空与长度。
 */
function sanitizeLocalModelId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    ? value
    : DEFAULT_SETTINGS.translation.localModelId
}

/** 一个旧 `settings.json` 的 `translation` 段：键全是旧名字，值一律当 unknown 处理。 */
type LegacyTranslation = Record<string, unknown>

/** 旧 provider 里的键，改名之后必须从落盘的对象上删掉，而不是留着被 zod 静默剥离。 */
const LEGACY_TRANSLATION_KEYS = ['hymt2ModelId', 'openaiEndpoint', 'openaiModel', 'ollamaEndpoint', 'ollamaModel'] as const

/**
 * 旧 `ollama` provider 的两个默认值，只在它那一支的旧键缺失时兜底。
 *
 * 值抄自引擎：地址是 `translation/network.py` 的 `DEFAULT_OLLAMA_ENDPOINT`，模型名是
 * `runtime.py` `_configure_translation` 里 ollama 分支的 `resolved(model, "qwen3:4b")`。
 *
 * **不能从 `DEFAULT_SETTINGS.translation` 借。** 那一层只有 OpenAI 的一对默认值，借过来会得到
 * 一个 `cloudApiFormat: 'ollama'` 却把请求发去 `https://api.openai.com/v1/api/chat` 的配置 ——
 * 地址是错的，比「没搬」更糟。
 */
const LEGACY_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'
const LEGACY_OLLAMA_MODEL = 'qwen3:4b'

/**
 * 把旧形状的 `translation` 段搬成新形状。
 *
 * 纯函数，且**只**在旧 provider 上动字段：已经是新枚举的 provider 原样通过，所以重复加载
 * 同一份配置不会二次改写（首次迁移后文件在下一次设置写入前仍是旧形状，第二次加载重跑同一
 * 次搬运，结果与第一次完全相同）。
 *
 * 字段搬运按当前 provider 取值，不做「把五对旧键全搬过来」——未启用的那一对存的是从没碰过
 * 的默认值（未改动的用户，`ollamaEndpoint` 永远是 `http://127.0.0.1:11434`），全搬会拿没
 * 关的默认值盖掉刚搬过来的真值。
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
        // M2M100 并进「本地模型」之后，唯一区分「装的是哪个模型」的就是 localModelId，
        // 所以这里写死而不是搬 hymt2ModelId —— 那个值对 M2M100 用户只是从没碰过的默认档位。
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
        // Ollama 变成了 `cloud` 下面的一种 API 格式，而不是一个 provider。
        next.provider = 'cloud'
        next.cloudApiFormat = 'ollama'
        // 旧键缺失时写引擎那一档的默认值，不留空给 `DEFAULT_SETTINGS.translation` 去填 ——
        // 它填进来的是 OpenAI 的地址与模型名（见上面两个常量的注释）。
        next.cloudEndpoint = typeof raw.ollamaEndpoint === 'string' ? raw.ollamaEndpoint : LEGACY_OLLAMA_ENDPOINT
        next.cloudModel = typeof raw.ollamaModel === 'string' ? raw.ollamaModel : LEGACY_OLLAMA_MODEL
        break
      default:
        // 未知值（含早已退役的 argos）回落到本地默认模型，而不是留一个非法 provider 在设置里。
        next.provider = 'local'
        next.localModelId = DEFAULT_SETTINGS.translation.localModelId
        break
    }
  }
  // 'microsoft' 前后同名，不需要搬运。
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
      const rawTranslation = migrateTranslation({ ...(raw.translation ?? {}) })
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
        compute: computeSettingsSchema.safeParse(raw.compute ?? {}).data ?? { ...DEFAULT_COMPUTE_SETTINGS },
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
      // 迁移已经保证 provider 落在三个新值里；这层 allowlist 留给手工改坏的文件，
      // 免得一个非法值一路走到引擎。
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
      compute: { ...this.settings.compute, ...(patch.compute ?? {}) },
    }
    // Writes share the load-time allowlist so no write path can persist an invalid language code.
    next.recognition.sourceLanguage = sanitizeSourceLanguage(next.recognition.sourceLanguage)
    next.translation.targetLanguage = sanitizeTargetLanguage(next.translation.targetLanguage)
    next.translation.localModelId = sanitizeLocalModelId(next.translation.localModelId)
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8')
    await rename(temporary, this.path)
    this.settings = next
    return structuredClone(this.settings)
  }
}
