import { z } from 'zod'
import { glossaryTermsSchema } from './glossary'
import extensionRelease from '../../browser/version.json'
import type { AudioDevice, EngineErrorCode, EngineEvent } from './contracts'
import type { SupportErrorCode } from './error-catalog'
import { REALTIME_S2S_MODELS } from './settings'
import type { BrowserCaptionStyleSettings, VideoCaptionAudioSource } from './settings'

export const FIREFOX_EXTENSION_ID = 'captions@nola-translator.app'
export const BROWSER_HOST_NAME = 'com.nola.captions'
export const BROWSER_EXTENSION_ID = 'cgbjfdpkcoapeiefeflikdolennbdcbe'
export const BROWSER_EXTENSION_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoiJ7hfz9nPxIe4Iax2PF+o4Dtq8w1y2X/HGa6aPZRTZWBOYzr13mdqzCC+UfJKpAzeGIPL2V0xNvkCXoxCjUBCOduL36uaXwmSSUpNcg1wcob05ZTDod6XIxAOXViMcJKd+wLronqx9gy6bDigQm7J1c5f6Z7Iw9xmOdPS7n01LTqCQINrpEzU/DzAzFTTv9JUKd6Oy/PyzQg6BHzhIAhyBYhYJOsuhGIMQTE+pd/1xL/NKYAmrbNWOOYvrUxlcgk7TwORkdx/NpeA4E5R8dB4CtX14GL/Ktc7R9gAVptQH524j2ZUszKA/WrQU1CmRneS2bIyjOE0idJt1Xd3O9iQIDAQAB'
export const BROWSER_PROTOCOL_VERSION = 4
/** Extension releases are independent; compatibility is negotiated by protocol version. */
export const BROWSER_EXTENSION_VERSION = extensionRelease.version

const identity = { id: z.string().min(1).max(128) }
const session = { ...identity, sessionId: z.string().min(1).max(128) }
const timeline = { epoch: z.number().int().nonnegative(), videoTimeMs: z.number().nonnegative().finite(), playbackRate: z.number().positive().max(16) }
const language = z.string().min(1).max(32).regex(/^[a-z]+(?:-[a-z0-9]+)*$/i)
const languages = { sourceLanguage: language.optional(), targetLanguage: language.optional() }
const model = z.string().min(1).max(512).optional()
const audio = z.string().min(4).max(102400).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
export const browserRequestSchema = z.discriminatedUnion('type', [
  z.object({ ...identity, type: z.literal('hello'), browser: z.enum(['chrome', 'edge', 'firefox']).optional(), extensionVersion: z.string().min(1).max(32).optional(), protocolVersion: z.number().int().min(1).max(100).optional() }).strict(),
  z.object({ ...identity, type: z.literal('generate'), model, messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().max(16000) }).strict()).min(1).max(32) }).strict(),
  z.object({ ...identity, type: z.literal('synthesize'), model, text: z.string().trim().min(1).max(4000), voice: z.string().max(256).optional() }).strict(),
  z.object({ ...identity, type: z.literal('voices'), model }).strict(),
  z.object({ ...identity, type: z.literal('transcribe'), model, audio, sourceLanguage: language.optional() }).strict(),
  z.object({ ...identity, type: z.literal('cancel'), requestId: identity.id }).strict(),
  z.object({ ...identity, type: z.literal('streamStart'), model, sourceLanguage: language.optional() }).strict(),
  z.object({ ...identity, type: z.literal('streamAudio'), streamId: identity.id, pcmBase64: audio, sampleRate: z.literal(16000) }).strict(),
  z.object({ ...identity, type: z.literal('streamFinish'), streamId: identity.id }).strict(),
  z.object({ ...identity, type: z.literal('streamStop'), streamId: identity.id }).strict(),
  z.object({ ...identity, type: z.literal('runtimeSettings'), component: z.enum(['engine', 'llama']) }).strict(),
  z.object({ ...identity, type: z.literal('translate'), text: z.string().trim().min(1).max(4000), sourceLanguage: language, targetLanguage: language, glossary: glossaryTermsSchema.optional() }).strict(),
  z.object({ ...identity, type: z.literal('cancelTranslation'), requestId: identity.id }).strict(),
  z.object({ ...identity, type: z.literal('start'), ...timeline, source: z.enum(['tab', 'system']), streamId: z.string().min(1).max(128), deviceId: z.string().min(1).max(512).optional(), ...languages, pipeline: z.enum(['desktop', 'cascade', 's2s']).optional(), model: z.enum(REALTIME_S2S_MODELS).optional() }).strict(),
  z.object({ ...session, type: z.literal('stop') }).strict(),
  z.object({ ...session, type: z.literal('finish'), epoch: timeline.epoch }).strict(),
  z.object({ ...session, type: z.literal('pause'), paused: z.boolean() }).strict(),
  z.object({ ...session, type: z.literal('reset'), ...timeline }).strict(),
  z.object({ ...session, type: z.literal('audio'), streamId: z.string().min(1).max(128), epoch: timeline.epoch, sequence: z.number().int().nonnegative(), sampleRate: z.number().int().min(8000).max(192000), capturedAtMs: z.number().nonnegative().finite(), pcmBase64: z.string().min(4).max(102400).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict(),
  /*
   * A diagnostic line on the caption path rather than a command with an effect: the desktop
   * forwards it to the engine's own log and answers with a plain result, so an extension never
   * learns anything it could act on and a failed forward cannot fail the session.
   */
  z.object({ ...identity, type: z.literal('debug'), event: z.string().min(1).max(64), data: z.record(z.string(), z.unknown()).optional() }).strict(),
])
export type BrowserRequest = z.infer<typeof browserRequestSchema>
export type BrowserWireErrorCode =
  | 'browserConnectionUnavailable'
  | 'browserConnectionLost'
  | 'browserPermissionDenied'
  | 'browserExtensionVersionMismatch'
  | 'browserProtocolMismatch'
  | 'browserGlossaryModeUnsupported'
  | 'browserCaptureUnsupported'
  | 'browserCaptureTargetMismatch'
  | 'browserCaptureCancelled'
  | 'browserAudioSilent'
  | 'browserAudioBacklog'
  | 'browserSessionAlreadyRunning'
  | 'browserSessionNotRunning'
  | 'browserCaptionServiceDisabled'
  | 'browserIntegrationDisabled'
  | 'browserTextModelUnavailable'
  | 'browserTranslationTimeout'
  | 'browserTranslationRateLimited'
  | 'browserS2sUnavailable'
  | 'browserS2sTargetUnsupported'
  | 'browserSubtitleReadFailed'
  | 'browserSubtitleLoginRequired'
  | 'browserTabCapturePermission'
  | 'gatewayNotRunning'
  | 'realtimeBackendUnavailable'
  | 'modelNotLoaded'
  | 'modelDisabled'
  | 'torchUnavailable'
  | 'llamaUnavailable'
  | 'internalError'
  | 'connectionLost'
  | 'appUnavailable'
  | 'slowAudio'
  | 'permissionFailed'
  | 'captureUnsupported'
  | 'wrongCapture'
  | 'captureCancelled'
  | 'tabAudioSilent'
  | 'updateRequired'
  | 'error'
  | EngineErrorCode
  | SupportErrorCode
/**
 * The browser caption appearance is configured independently from the desktop's video caption page.
 */
export interface BrowserCaptionConfig {
  appearance: BrowserCaptionStyleSettings
  pipeline?: 'cascade' | 's2s'
  desktopApplicationAudio?: boolean
  audioSource: VideoCaptionAudioSource
  audioDeviceId?: string
  sourceLanguage: string
  targetLanguage: string
}
export interface BrowserSummary {
  protocolVersion: 1 | 2 | 3 | typeof BROWSER_PROTOCOL_VERSION
  features?: { matchedGlossaryV1: boolean }
  capabilities?: Record<'asr' | 'mt' | 'tts' | 's2s' | 'llm', boolean>
  textTranslation?: boolean
  textTranslationConcurrency?: number
  textTranslationError?: 'gatewayNotRunning' | 'browserTextModelUnavailable'
  realtimeTranslation?: boolean
  extensionVersion?: string
  extensionCompatible?: boolean
  uiLanguage: 'auto' | 'zh-CN' | 'zh-TW' | 'zh-HK' | 'ko' | 'ja' | 'en'
  sourceLanguage: string
  targetLanguage: string
  devices: AudioDevice[]
  browserAudio: boolean
  /** The desktop's caption-service gate. Extensions may only start captions while it is true. */
  captionServiceActive: boolean
  config: BrowserCaptionConfig
}
export type BrowserCapabilityRequest = Extract<BrowserRequest, { type: 'generate' | 'synthesize' | 'voices' | 'transcribe' }>
export type BrowserCapabilityResult = { text: string; voices?: string[]; audio?: string } | { audioChunks: number; format: string } | { streamId: string }
export type BrowserResponse =
  | { type: 'result'; id: string; value?: BrowserSummary | { sessionId: string } | BrowserCapabilityResult }
  | { type: 'error'; id: string; code: BrowserWireErrorCode; message: string }
  | { type: 'event'; event: EngineEvent }
  | { type: 'capabilityEvent'; id: string; event: { type: 'audio'; index: number; data: string } | { type: 'asr'; data: Record<string, unknown> } }
export type BrowserKind = 'chrome' | 'edge' | 'firefox'
export interface BrowserIntegrationInfo {
  browser: BrowserKind
  available: boolean
  extensionStatus: 'installed' | 'notInstalled' | 'disabled' | 'unknown'
  extensionVersion?: string
  extensionCompatible?: boolean
  connected: boolean
  enabled: boolean
}
export interface BrowserConnectionStatus {
  enabled: boolean
  registered: boolean
  connections: number
  /** The desktop's caption-service gate, surfaced so the video-captions page can render the toggle. */
  captionServiceActive: boolean
  /** True while any connected extension owns a live caption session. */
  sessionActive: boolean
  /** True while a browser-owned session is loading and has reserved the engine. */
  sessionStarting?: boolean
  /** True while the floating caption window is open, which also reserves the caption service. */
  overlayActive?: boolean
  /** The live browser caption session, so the desktop can end it through the existing stopSession path. */
  sessionId?: string
  browsers?: BrowserIntegrationInfo[]
  error?: string
}
export type BrowserConnectionAction = 'status' | 'inspect' | 'repair' | 'enable' | 'extension' | 'download' | 'manage' | 'browserEnable'
