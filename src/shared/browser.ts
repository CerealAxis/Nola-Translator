import { z } from 'zod'
import type { AudioDevice, EngineEvent } from './contracts'
import type { VideoCaptionSettings } from './settings'

export const BROWSER_HOST_NAME = 'com.nola.captions'
export const BROWSER_EXTENSION_ID = 'cgbjfdpkcoapeiefeflikdolennbdcbe'
export const BROWSER_EXTENSION_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoiJ7hfz9nPxIe4Iax2PF+o4Dtq8w1y2X/HGa6aPZRTZWBOYzr13mdqzCC+UfJKpAzeGIPL2V0xNvkCXoxCjUBCOduL36uaXwmSSUpNcg1wcob05ZTDod6XIxAOXViMcJKd+wLronqx9gy6bDigQm7J1c5f6Z7Iw9xmOdPS7n01LTqCQINrpEzU/DzAzFTTv9JUKd6Oy/PyzQg6BHzhIAhyBYhYJOsuhGIMQTE+pd/1xL/NKYAmrbNWOOYvrUxlcgk7TwORkdx/NpeA4E5R8dB4CtX14GL/Ktc7R9gAVptQH524j2ZUszKA/WrQU1CmRneS2bIyjOE0idJt1Xd3O9iQIDAQAB'
export const BROWSER_PROTOCOL_VERSION = 1

const identity = { id: z.string().min(1).max(128) }
const session = { ...identity, sessionId: z.string().min(1).max(128) }
const timeline = { epoch: z.number().int().nonnegative(), videoTimeMs: z.number().nonnegative().finite(), playbackRate: z.number().positive().max(16) }
/**
 * The languages are accepted but never read: the desktop settings decide both, so an extension
 * that still sends them stays compatible while a newer one that omits them parses unchanged.
 */
const legacyLanguages = { sourceLanguage: z.string().min(1).max(32).optional(), targetLanguage: z.string().min(1).max(32).optional() }
export const browserRequestSchema = z.discriminatedUnion('type', [
  z.object({ ...identity, type: z.literal('hello'), browser: z.enum(['chrome', 'edge']).optional() }).strict(),
  z.object({ ...identity, type: z.literal('start'), ...timeline, source: z.enum(['tab', 'system']), streamId: z.string().min(1).max(128), deviceId: z.string().min(1).max(512).optional(), ...legacyLanguages }).strict(),
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
/**
 * What the desktop app has configured, handed to the extension on `hello`. The extension keeps no
 * settings of its own for this — it draws captions and nothing more.
 */
export interface BrowserCaptionConfig {
  videoCaptions: VideoCaptionSettings
  sourceLanguage: string
  targetLanguage: string
}
export interface BrowserSummary {
  protocolVersion: 1
  uiLanguage: 'zh-CN' | 'en'
  sourceLanguage: string
  targetLanguage: string
  devices: AudioDevice[]
  browserAudio: boolean
  /** The desktop's caption-service gate. Extensions may only start captions while it is true. */
  captionServiceActive: boolean
  config: BrowserCaptionConfig
}
export type BrowserResponse =
  | { type: 'result'; id: string; value?: BrowserSummary | { sessionId: string } }
  | { type: 'error'; id: string; code: string; message: string }
  | { type: 'event'; event: EngineEvent }
export type BrowserKind = 'chrome' | 'edge'
export interface BrowserIntegrationInfo {
  browser: BrowserKind
  available: boolean
  extensionStatus: 'installed' | 'notInstalled' | 'disabled' | 'unknown'
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
  /** The live browser caption session, so the desktop can end it through the existing stopSession path. */
  sessionId?: string
  browsers?: BrowserIntegrationInfo[]
  error?: string
}
export type BrowserConnectionAction = 'status' | 'repair' | 'enable' | 'extension' | 'download' | 'manage' | 'browserEnable'
