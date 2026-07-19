import { z } from 'zod'

import type { EngineCommand, EngineEvent } from './contracts'

export const MAX_PROTOCOL_LINE_BYTES = 32 * 1024

const requestId = z.string().min(1).max(128)
const envelope = {
  protocolVersion: z.literal(1),
  requestId,
}

const audioSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('defaultOutput') }).strip(),
  z.object({ kind: z.literal('systemOutput'), deviceId: z.string().min(1).max(512) }).strip(),
  z.object({ kind: z.literal('microphone'), deviceId: z.string().min(1).max(512) }).strip(),
])

export const sessionConfigSchema = z
  .object({
    audioSource: audioSourceSchema,
    recognitionMode: z.enum(['realtime', 'accurate']),
    sourceLanguage: z.string().min(1).max(32),
    targetLanguages: z.array(z.string().min(1).max(32)).max(8),
    allowIntermediateTranslation: z.boolean().optional(),
    translationProvider: z.enum(['argos', 'microsoft', 'openai', 'ollama']).optional(),
    translationOptions: z.object({
      endpoint: z.string().min(1).max(2048).optional(),
      apiKey: z.string().max(4096).optional(),
      region: z.string().max(128).optional(),
      model: z.string().max(256).optional(),
    }).strip().optional(),
  })
  .strip()

const translationSchema = z
  .object({
    targetLanguage: z.string().min(1).max(32),
    text: z.string().max(16_384).optional(),
    state: z.enum(['pending', 'complete', 'failed']),
    provider: z.string().min(1).max(64),
    errorCode: z.string().min(1).max(128).optional(),
  })
  .strip()

const captionSegmentSchema = z
  .object({
    segmentId: z.string().min(1).max(128),
    revision: z.number().int().nonnegative(),
    startedAtMs: z.number().nonnegative(),
    endedAtMs: z.number().nonnegative().optional(),
    sourceLanguage: z.string().min(1).max(32).optional(),
    sourceText: z.string().max(16_384),
    isFinal: z.boolean(),
    translations: z.array(translationSchema).max(8),
  })
  .strip()

export const engineCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('hello'), clientVersion: z.string().min(1).max(64) }).strip(),
  z.object({ ...envelope, type: z.literal('listDevices') }).strip(),
  z.object({ ...envelope, type: z.literal('startSession'), config: sessionConfigSchema }).strip(),
  z.object({ ...envelope, type: z.literal('stopSession'), sessionId: z.string().min(1).max(128) }).strip(),
  z.object({ ...envelope, type: z.literal('shutdown') }).strip(),
])

const audioDeviceSchema = z
  .object({
    deviceId: z.string().min(1).max(512),
    name: z.string().min(1).max(512),
    kind: z.enum(['systemOutput', 'microphone']),
    isDefault: z.boolean(),
  })
  .strip()

const errorCodes = [
  'invalidMessage',
  'unsupportedProtocol',
  'invalidConfiguration',
  'sessionNotRunning',
  'sessionAlreadyRunning',
  'audioDeviceUnavailable',
  'modelUnavailable',
  'lineTooLarge',
  'internalError',
] as const

export const engineEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...envelope,
      type: z.literal('ready'),
      engineVersion: z.string().min(1).max(64),
      capabilities: z.array(z.string().min(1).max(64)).max(32),
    })
    .strip(),
  z.object({ ...envelope, type: z.literal('devices'), devices: z.array(audioDeviceSchema).max(256) }).strip(),
  z.object({ ...envelope, type: z.literal('sessionStarted'), sessionId: z.string().min(1).max(128) }).strip(),
  z.object({ ...envelope, type: z.literal('sessionStopped'), sessionId: z.string().min(1).max(128) }).strip(),
  z
    .object({
      ...envelope,
      type: z.literal('caption'),
      sessionId: z.string().min(1).max(128),
      segment: captionSegmentSchema,
    })
    .strip(),
  z
    .object({
      ...envelope,
      type: z.literal('modelProgress'),
      modelId: z.string().min(1).max(256),
      operation: z.enum(['download', 'install', 'remove']),
      progress: z.number().min(0).max(1),
      state: z.enum(['running', 'complete', 'failed']),
    })
    .strip(),
  z
    .object({
      ...envelope,
      type: z.literal('status'),
      code: z.enum(['idle', 'starting', 'ready', 'listening', 'stopping']),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .strip(),
  z
    .object({
      ...envelope,
      type: z.literal('error'),
      code: z.enum(errorCodes),
      recoverable: z.boolean(),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .strip(),
  z.object({ ...envelope, type: z.literal('shutdownComplete') }).strip(),
])

function parseLine(line: string): unknown {
  if (new TextEncoder().encode(line).byteLength > MAX_PROTOCOL_LINE_BYTES) {
    throw new Error('协议单行不能超过 32 KiB')
  }
  return JSON.parse(line) as unknown
}

export function parseCommandLine(line: string): EngineCommand {
  return engineCommandSchema.parse(parseLine(line)) as EngineCommand
}

export function parseEventLine(line: string): EngineEvent {
  return engineEventSchema.parse(parseLine(line)) as EngineEvent
}
