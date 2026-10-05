/**
 * 数据访问层的类型出口。
 *
 * **本文件里所有"契约"类型都是从主仓 `src/shared/` 直接 import 的，不再自己抄一份。**
 * 早期版本在这里逐字复制了 `src/shared/contracts.ts`、`src/shared/settings.ts` 与
 * `src/shared/bridge.ts`，复制品迟早会和原件漂移：主会话刚给 preload 加了
 * `setSessionPaused` / `closeOverlay` / `minimizeOverlay` 三个方法，抄本就得跟着改一遍。
 * 现在只剩「UI 自己定义的类型」和「主仓还没有、需要主进程补的字段」两段。
 *
 * 相对路径是刻意的：`@` alias 指向 `src/renderer/`，而 `src/shared/` 在它外面，
 * 写成 `@/shared/contracts` 会解析到不存在的 `src/renderer/shared/contracts`。
 */

import type { NolaTranslatorApi } from '../../shared/bridge'
import type { ResourceRecord, ResourceSnapshot } from '../../shared/contracts'

// ---------------------------------------------------------------------------
// 主仓契约 · 原样 re-export
// ---------------------------------------------------------------------------

export type {
  AudioDevice,
  AudioSource,
  CaptionSegment,
  EngineCommand,
  EngineErrorCode,
  EngineEvent,
  EngineProcessState,
  MeetingMeta,
  ResourceRecord,
  ResourceSnapshot,
  SessionConfig,
  Translation,
} from '../../shared/contracts'

export type { EngineChannelEvent, EngineLifecycleEvent, ModelStorageInfo, OverlayTargetPage, SessionStartResult } from '../../shared/bridge'

export type {
  AppearancePrefs,
  AppSettings,
  AppSettingsPatch,
  CloudApiFormat,
  Hymt2ModelId,
  OverlaySettings,
  RecognitionModelId,
  RecognitionSettings,
  RecordingSettings,
  TranslationProvider,
  TranslationSettings,
} from '../../shared/settings'

/**
 * 需要凭据的翻译服务商，即 `credentials.json` 的顶层键；已随 `cloud` 合并改名为
 * `CredentialProvider`，从主仓 `src/shared/settings` 原样透出，本文件不再自己定义一份。
 */
export type { CredentialProvider } from '../../shared/settings'

export {
  CLOUD_API_FORMATS,
  CLOUD_FORMAT_DEFAULTS,
  DEFAULT_SETTINGS,
  HYMT2_MODEL_IDS,
  HYMT2_MODEL_LABELS,
  RECOGNITION_MODEL_IDS,
  RECOGNITION_MODEL_LABELS,
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  TRANSLATION_PROVIDERS,
} from '../../shared/settings'

export { PROTOCOL_VERSION } from '../../shared/contracts'

export type { NolaTranslatorApi }

// ---------------------------------------------------------------------------
// 主仓还没有的字段（tier: 'ipc-new'）
// ---------------------------------------------------------------------------

/**
 * `ResourceRecord.bytesPerSecond`：主仓的 `ResourceRecord` 与 `modelProgress` 事件都不带速率。
 * 下载任务表的速度列需要它。**不要**用时间差反推一个假的速率出来 —— 缺这个字段时 UI 只显示
 * 「已落盘 / 总量」两个真值。主进程补上之后，把这个交叉类型换回裸 `ResourceSnapshot` 即可。
 */
export type ResourceRecordWithRate = ResourceRecord & {
  readonly bytesPerSecond?: number
}

export type ResourceSnapshotWithRate = Omit<ResourceSnapshot, 'resources'> & {
  readonly resources: readonly ResourceRecordWithRate[]
}

// ---------------------------------------------------------------------------
// UI 自己的类型（不属于协议）
// ---------------------------------------------------------------------------

/**
 * UI 侧会话状态机。刻意**不是**引擎 `EngineEvent` 的 status 码
 * （`idle | starting | ready | listening | paused | stopping`）：界面还要说「出错」，
 * 而协议里没有这个词；反过来协议有 `'ready'`（引擎级握手）而界面不需要它。
 *
 * **映射在 `sessionStore` 里，不在 `ipcBridge`。** `ipcBridge` 原样透传 `EngineEvent`，
 * 它是数据通路、不含状态机；`sessionStore` 的 `ENGINE_STATUS_TO_UI` 是唯一做这件事的
 * 地方，引擎那条权威 `status` 事件也在那里被消费。
 */
export type SessionStatus = 'idle' | 'starting' | 'running' | 'paused' | 'stopping' | 'error'

/**
 * 下载生命周期，按模型列表的画法。引擎报的是更粗的
 * `state ('idle'|'running'|'cancelling'|'failed') + phase`；`resourceStateOf()` 在
 * `contract.ts` 里把两者压成这台扁平状态机，UI 就不必再压一次。
 */
export type ResourceState = 'absent' | 'queued' | 'downloading' | 'verifying' | 'installed' | 'failed'

/** 诊断负载形状；主仓的 `getDiagnostics()` 返回的就是这个类型。 */
export type DiagnosticsPayload = Record<string, string | number>

/** `meetings.export()` 接受的导出格式；与主仓的并集保持一致。 */
export type ExportFormat = 'txt' | 'srt' | 'vtt'

/** 声源选择器里的一项。`AudioDevice` 表达不了「系统默认输出」这个伪选项 ——
 * 协议里它是 `SessionConfig.audioSource = { kind: 'defaultOutput' }`，根本不是一个设备 ——
 * 所以选择器需要这个并集，而不是裸的 `AudioDevice[]`。
 */
export type AudioSourceOption =
  | { value: 'defaultOutput'; kind: 'defaultOutput'; deviceId: null; name: string; isDefault: true }
  | {
      value: string
      kind: 'systemOutput' | 'microphone'
      deviceId: string
      name: string
      isDefault: boolean
    }

/** 语言代码的双语标签。数据而非界面文案：i18n 层按 `code` 取值。 */
export type LanguageLabel = { code: string; zh: string; en: string }

/**
 * 语言名表。**数据不是 fixture** —— 语言名与界面语言无关，选哪种语言都得显示真名，
 * 所以它跟着 `SOURCE_LANGUAGE_OPTIONS` / `TARGET_LANGUAGE_OPTIONS` 走，不进 i18n 词典。
 */
export const LANGUAGE_LABELS: Record<string, LanguageLabel> = {
  auto: { code: 'auto', zh: '自动检测', en: 'Auto detect' },
  zh: { code: 'zh', zh: '中文（简体）', en: 'Chinese (Simplified)' },
  yue: { code: 'yue', zh: '粤语', en: 'Cantonese' },
  en: { code: 'en', zh: '英语', en: 'English' },
  ja: { code: 'ja', zh: '日语', en: 'Japanese' },
  ko: { code: 'ko', zh: '韩语', en: 'Korean' },
  fr: { code: 'fr', zh: '法语', en: 'French' },
  de: { code: 'de', zh: '德语', en: 'German' },
  es: { code: 'es', zh: '西班牙语', en: 'Spanish' },
  pt: { code: 'pt', zh: '葡萄牙语', en: 'Portuguese' },
  it: { code: 'it', zh: '意大利语', en: 'Italian' },
  ru: { code: 'ru', zh: '俄语', en: 'Russian' },
  ar: { code: 'ar', zh: '阿拉伯语', en: 'Arabic' },
  th: { code: 'th', zh: '泰语', en: 'Thai' },
  vi: { code: 'vi', zh: '越南语', en: 'Vietnamese' },
  tr: { code: 'tr', zh: '土耳其语', en: 'Turkish' },
  id: { code: 'id', zh: '印度尼西亚语', en: 'Indonesian' },
  ms: { code: 'ms', zh: '马来语', en: 'Malay' },
}

/**
 * 「系统默认输出」这个伪声源。`listDevices()` 只回真设备，协议里的 `defaultOutput`
 * 没有对应设备，所以选择器的第一项由这里补出来。名称走 i18n（`audio.defaultOutput`），
 * 这里只给 `value` / `kind` / `deviceId` 三个协议字段。
 */
export const DEFAULT_OUTPUT_VALUE = 'defaultOutput'

/**
 * 失败原因，引擎报的 —— 大多是 `type(error).__name__`，另有几个固定语义码。
 *
 * 这是**兜底词表**，不是界面文案：界面走 i18n 词典（`shellUi.error.*`），
 * 这里只保证词典里没有的码还能显示出点什么，而不是一片空白。
 */
export const TRANSLATION_ERROR_LABELS: Record<string, string> = {
  URLError: '网络不可达',
  HTTPError: '接口返回错误',
  TimeoutError: '请求超时',
  translationTimeout: '翻译超时',
  resourceUnavailable: '翻译模型未安装',
  llamaServerUnavailable: '本地翻译服务未就绪',
  unsupportedLanguagePair: '不支持该语言组合',
  translationUnavailable: '翻译暂不可用',
  RuntimeError: '翻译服务返回异常',
  ValueError: '翻译参数无效',
  ConnectionError: '网络连接失败',
}
