import { z } from 'zod'
import { LANGUAGE_CODES } from './languages'
import { isSupportedShortcut } from './keyboard-shortcuts'
import type { EngineErrorCode } from './contracts'
import type { CaptionSegment } from './contracts'

const deviceId = z.string().max(512)
const language = z.string().refine(code => LANGUAGE_CODES.includes(code))

export const meetingModeSettingsSchema = z.object({
  uplinkEnabled: z.boolean().default(true),
  downlinkEnabled: z.boolean().default(true),
  downlinkSource: z.enum(['cable', 'application']).default('cable'),
  applicationId: deviceId.default(''),
  captionScope: z.enum(['uplink', 'downlink', 'both']).default('downlink'),
  showSpeaker: z.boolean().default(true),
  microphoneId: deviceId,
  uplinkOutputId: deviceId,
  downlinkInputId: deviceId,
  headphonesId: deviceId,
  localLanguage: language,
  remoteLanguage: language,
  pipeline: z.enum(['auto', 'cascade', 's2s']).default('auto'),
  duckVolume: z.number().min(0).max(100).int(),
  passthroughKey: z.string().max(100).refine(isSupportedShortcut),
})
export type MeetingModeSettings = z.infer<typeof meetingModeSettingsSchema>
export const DEFAULT_MEETING_MODE: MeetingModeSettings = {
  uplinkEnabled: true, downlinkEnabled: true, downlinkSource: 'cable', applicationId: '', captionScope: 'downlink', showSpeaker: true,
  microphoneId: '', uplinkOutputId: '', downlinkInputId: '', headphonesId: '',
  localLanguage: 'zh', remoteLanguage: 'en', pipeline: 'auto', duckVolume: 20, passthroughKey: 'F9',
}

export const meetingAudioTestRequestSchema = z.object({
  kind: z.enum(['microphone', 'headphones', 'cable', 'application']),
  deviceId: deviceId.min(1),
  playbackDeviceId: deviceId.min(1).optional(),
  recordingDeviceId: deviceId.min(1).optional(),
}).strict()
export type MeetingAudioTestRequest = z.infer<typeof meetingAudioTestRequestSchema>

export interface MeetingRouteTelemetry {
  inputPeak: number
  inputAgeMs: number | null
  sourceText?: string
  translatedText?: string
  playback: 'idle' | 'playing' | 'finished'
}

export interface MeetingAudioTestResult {
  kind: MeetingAudioTestRequest['kind']
  hasSignal: boolean
  peak: number
  playbackSent: boolean
  correlation?: number
  error?: MeetingModeSnapshot['error']
}

export interface MeetingModeSnapshot {
  paused?: boolean
  meetingId?: string
  segments?: readonly (CaptionSegment & { direction: 'uplink' | 'downlink'; speakerNumber?: number })[]
  state: 'idle' | 'starting' | 'running' | 'stopping' | 'failed' | 'unknown'
  passthroughActive: boolean
  telemetry?: { uplink?: MeetingRouteTelemetry; downlink?: MeetingRouteTelemetry }
  error?: { key: string; code?: EngineErrorCode; direction?: 'uplink' | 'downlink'; correlationId?: string }
}

export interface MeetingModeApi {
  snapshot(): Promise<MeetingModeSnapshot>
  start(settings: MeetingModeSettings): Promise<MeetingModeSnapshot>
  stop(): Promise<MeetingModeSnapshot>
  testAudio(request: MeetingAudioTestRequest): Promise<MeetingAudioTestResult>
  cancelAudioTest(): Promise<void>
  setPaused(paused: boolean): Promise<MeetingModeSnapshot>
  onChanged(callback: (snapshot: MeetingModeSnapshot) => void): () => void
}
