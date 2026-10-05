import { z } from 'zod'
import { computeSettingsSchema, computeSnapshotSchema } from './compute'

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

const hubModelId = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.startsWith('hub:'), '只有 hub: 前缀的自装模型 id 才被接受')

const recognitionModelIdSchema = z.union([
  z.enum(['qwen3-asr-1.7b-hf', 'qwen3-asr-0.6b-hf', 'sensevoice-small']),
  hubModelId,
])

const translationModelIdSchema = z.union([
  z.enum(['hy-mt2-1.8b-q4-k-m', 'hy-mt2-1.8b-q3-k-m', 'hy-mt2-1.8b-iq2-m', 'm2m100-418m']),
  hubModelId,
])

export const sessionConfigSchema = z
  .object({
    audioSource: audioSourceSchema,
    compute: computeSettingsSchema.optional(),
    recognitionMode: z.enum(['realtime', 'accurate']),
    recognitionModelId: recognitionModelIdSchema.optional(),
    sourceLanguage: z.string().min(1).max(32),
    targetLanguages: z.array(z.string().min(1).max(32)).max(8),
    allowIntermediateTranslation: z.boolean().optional(),
    translationProvider: z.enum(['local', 'cloud', 'microsoft']).optional(),
    translationModelId: translationModelIdSchema.optional(),
    translationOptions: z.object({
      endpoint: z.string().max(2048).optional(),
      apiKey: z.string().max(4096).optional(),
      region: z.string().max(128).optional(),
      model: z.string().max(256).optional(),
      apiFormat: z.enum(['chat-completions', 'chat-responses', 'anthropic', 'ollama']).optional(),
      // The ceiling the engine fits a request into: it reserves room for the reply and splits the
      // source text when it does not fit. Nothing clips it to a vendor window, so 10M is a
      // fat-finger guard.
      contextWindow: z.number().int().min(256).max(10_000_000).optional(),
      maxOutputTokens: z.number().int().min(1).max(10_000_000).optional(),
    }).strip().optional(),
    recordingPath: z.string().min(1).max(4096).optional(),
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
  z.object({ ...envelope, type: z.literal('listComputeDevices') }).strip(),
  z.object({ ...envelope, type: z.literal('listResources') }).strip(),
  z.object({
    ...envelope,
    type: z.literal('manageResource'),
    resourceId: z.string().min(1).max(256),
    action: z.enum(['install', 'remove', 'cancel']),
  }).strip(),
  z.object({ ...envelope, type: z.literal('startSession'), config: sessionConfigSchema }).strip(),
  z.object({ ...envelope, type: z.literal('stopSession'), sessionId: z.string().min(1).max(128) }).strip(),
  z
    .object({
      ...envelope,
      type: z.literal('setSessionPaused'),
      sessionId: z.string().min(1).max(128),
      paused: z.boolean(),
    })
    .strip(),
  z.object({ ...envelope, type: z.literal('shutdown') }).strip(),
  z
    .object({
      ...envelope,
      type: z.literal('searchHubModels'),
      // Empty is meaningful: the hub's list endpoint treats `search=` as "most downloaded",
      // which is how the search tab browses when its box is empty.
      query: z.string().max(256),
      slot: z.enum(['recognition', 'translation']).optional(),
      weightFormat: z.literal('gguf').optional(),
      cursor: z.string().min(1).max(2048).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strip(),
  z.object({ ...envelope, type: z.literal('inspectHubRepo'), repo: z.string().min(3).max(256) }).strip(),
  z
    .object({
      ...envelope,
      type: z.literal('installHubRepo'),
      repo: z.string().min(3).max(256),
      slot: z.enum(['recognition', 'translation']).optional(),
    })
    .strip(),
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
  'resourceUnavailable',
  'resourceNotFound',
  'resourceBusy',
  'resourceInUse',
  'networkUnavailable',
  'integrityCheckFailed',
  'installFailed',
  'lineTooLarge',
  'internalError',
] as const

const resourceSchema = z
  .object({
    resourceId: z.string().min(1).max(256),
    kind: z.enum(['recognitionModel', 'translationModel']),
    // The loader that will run this model, in either vocabulary: built-ins report the provider
    // from resources.py, a hub repo passes through its adapter id. It cannot be a closed union —
    // and a value this schema rejects kills the engine, because an unparseable event is treated
    // as protocol corruption.
    provider: z.string().min(1).max(64),
    name: z.string().min(1).max(256),
    description: z.string().min(1).max(1024),
    languages: z.array(z.string().min(1).max(32)).max(16),
    sourceLanguage: z.string().max(32).optional(),
    targetLanguage: z.string().max(32).optional(),
    installed: z.boolean(),
    installedBytes: z.number().int().nonnegative(),
    downloadBytes: z.number().int().nonnegative().optional(),
    state: z.enum(['idle', 'running', 'cancelling', 'failed']),
    phase: z.enum(['resolve', 'download', 'verify', 'install', 'remove', 'cleanup']).optional(),
    progress: z.number().min(0).max(1).optional(),
    cancellable: z.boolean(),
    errorCode: z.string().min(1).max(128).optional(),
  })
  .strip()

const hubCompatibilitySchema = z
  .object({
    compatible: z.boolean(),
    reasonCode: z.string().min(1).max(64),
    reason: z.string().min(1).max(1024),
    slot: z.enum(['recognition', 'translation']).optional(),
    loader: z.enum(['llama.cpp', 'transformers', 'funasr']).optional(),
    adapterId: z.string().max(64).optional(),
    languages: z.array(z.string().min(1).max(32)).max(128),
    evidence: z.record(z.string(), z.string()),
  })
  .strip()

const hubModelSummarySchema = z
  .object({
    repo: z.string().min(1).max(256),
    resourceId: z.string().min(1).max(256),
    revision: z.string().max(64).optional(),
    formats: z.array(z.enum(['pytorch', 'gguf'])).max(2).optional(),
    description: z.string().max(600).optional(),
    author: z.string().max(256).optional(),
    pipelineTag: z.string().max(64).optional(),
    libraryName: z.string().max(64).optional(),
    downloads: z.number().int().nonnegative().optional(),
    lastModified: z.string().max(64).optional(),
    hasGguf: z.boolean(),
    ggufArchitecture: z.string().max(64).optional(),
    fileCount: z.number().int().nonnegative(),
    downloadBytes: z.number().int().nonnegative().optional(),
    installed: z.boolean(),
    compatibility: hubCompatibilitySchema.optional(),
  })
  .strip()

export const engineEventSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('computeDevices'), ...computeSnapshotSchema.shape }).strip(),
  z
    .object({
      ...envelope,
      type: z.literal('ready'),
      engineVersion: z.string().min(1).max(64),
      capabilities: z.array(z.string().min(1).max(64)).max(32),
    })
    .strip(),
  z.object({ ...envelope, type: z.literal('devices'), devices: z.array(audioDeviceSchema).max(256) }).strip(),
  z.object({
    ...envelope,
    type: z.literal('resources'),
    storagePath: z.string().min(1).max(2048),
    resources: z.array(resourceSchema).max(64),
  }).strip(),
  z.object({ ...envelope, type: z.literal('resourceActionResult'), resource: resourceSchema }).strip(),
  z.object({ ...envelope, type: z.literal('resourceChanged'), resource: resourceSchema }).strip(),
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
      code: z.enum(['idle', 'starting', 'ready', 'listening', 'paused', 'stopping']),
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
  z
    .object({
      ...envelope,
      type: z.literal('hubModels'),
      query: z.string().max(256),
      models: z.array(hubModelSummarySchema).max(20),
      candidates: z.number().int().nonnegative(),
      rateLimited: z.boolean(),
      nextCursor: z.string().min(1).max(2048).optional(),
    })
    .strip(),
  z
    .object({
      ...envelope,
      type: z.literal('hubInspect'),
      repo: z.string().min(1).max(256),
      revision: z.string().max(64).optional(),
      fileCount: z.number().int().nonnegative(),
      downloadBytes: z.number().int().nonnegative().optional(),
      compatibility: hubCompatibilitySchema,
    })
    .strip(),
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
