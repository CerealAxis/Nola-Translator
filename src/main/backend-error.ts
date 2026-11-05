import { z } from 'zod'
import type { EngineErrorCode } from '../shared/contracts'

export const backendError = z.object({
  code: z.string(), stage: z.string(), scope: z.string(), retryable: z.boolean(), fatal: z.boolean(),
  message_key: z.string(), correlation_id: z.string().optional(), provider_code: z.string().nullish(),
})

type BackendError = z.infer<typeof backendError>

const causes: Readonly<Partial<Record<string, EngineErrorCode>>> = {
  INVALID_CONFIG: 'invalidConfiguration',
  CAPABILITY_MISMATCH: 'invalidConfiguration',
  MODEL_NOT_READY: 'modelNotLoaded',
  RESOURCE_BUSY: 'resourceBusy',
  RESOURCE_EXHAUSTED: 'resourceUnavailable',
  AUDIO_GAP: 'audioBufferOverflow',
  AUDIO_SOURCE_UNAVAILABLE: 'audioDeviceDisconnected',
  SOURCE_FINALIZE_TIMEOUT: 'recognitionTimeout',
  TRANSLATION_TIMEOUT: 'translationTimeout',
  SYNTHESIS_FAILED: 'synthesisFailed',
  PLAYBACK_DEVICE_LOST: 'audioPlaybackUnavailable',
  PLAYBACK_UNKNOWN: 'playbackUnconfirmed',
  PROVIDER_DISCONNECTED: 'recognitionClosed',
  RESYNC_REQUIRED: 'sessionInvalidStream',
  SESSION_NOT_FOUND: 'sessionNotRunning',
  SESSION_SLOT_BUSY: 'sessionAlreadyRunning',
  COMMAND_CONFLICT: 'invalidConfiguration',
  PROTOCOL_ERROR: 'protocolValidationFailed',
}

// Several providers share the same v2 error code. Use the specific reason before the wire category.
const reasons: Readonly<Partial<Record<string, EngineErrorCode>>> = {
  'backend.gatewayDisabled': 'gatewayNotRunning',
  'backend.shuttingDown': 'engineTransportUnavailable',
  'pipeline.s2sConfigurationUnavailable': 's2sConfigurationMissing',
  'pipeline.s2sConnectionLost': 's2sConnectionLost',
  'pipeline.recognitionUnauthorized': 'invalidCredential',
  'pipeline.recognitionInsufficientBalance': 'cloudRecognitionInsufficientBalance',
  'pipeline.recognitionRateLimited': 'cloudRecognitionRateLimited',
  'pipeline.recognitionNetworkError': 'recognitionNetworkUnavailable',
  'pipeline.recognitionTimeout': 'recognitionTimeout',
  'pipeline.recognitionInvalidResponse': 'recognitionInvalidResponse',
  'pipeline.recognitionInvalidHandshake': 'recognitionInvalidResponse',
  'pipeline.recognitionClosed': 'recognitionClosed',
  'pipeline.recognitionBufferOverflow': 'recognitionBufferOverflow',
  'pipeline.finalRecognitionQueueFull': 'recognitionBufferOverflow',
  s2sAudioResponseFailed: 'synthesisFailed',
  'session.alreadyClosed': 'sessionNotRunning',
  'gateway.INVALID_INPUT': 'invalidConfiguration',
  'gateway.CAPABILITY_MISMATCH': 'invalidConfiguration',
  'gateway.MODEL_NOT_INSTALLED': 'modelMissing',
  'gateway.MODEL_INTEGRITY': 'modelWeightsInvalid',
  'gateway.LOAD_FAILED': 'modelLoadFailed',
  'gateway.WORKER_OOM': 'modelOutOfMemory',
  'gateway.RESOURCE_EXHAUSTED': 'resourceUnavailable',
  'gateway.LEASE_CONFLICT': 'resourceBusy',
  'gateway.WORKER_EXITED': 'engineTransportUnavailable',
}

export function backendErrorCode(error: BackendError): EngineErrorCode {
  if (Object.hasOwn(reasons, error.message_key)) return reasons[error.message_key]!
  if (error.provider_code === 'authentication_failed') return 'invalidCredential'
  if (error.stage === 'asr') {
    if (error.provider_code === 'rate_limited') return 'cloudRecognitionRateLimited'
    if (error.provider_code === 'network_unavailable') return 'recognitionNetworkUnavailable'
    if (error.provider_code === 'request_timeout' || error.message_key === 'gateway.TIMEOUT') return 'recognitionTimeout'
  }
  if (error.stage === 'mt') {
    if (error.provider_code === 'network_unavailable') return 'translationNetworkUnavailable'
    if (error.provider_code === 'request_timeout' || error.message_key === 'gateway.TIMEOUT') return 'translationTimeout'
  }
  if (error.code === 'PROVIDER_DISCONNECTED' && error.stage === 's2s') return 's2sConnectionLost'
  if (error.code === 'PROVIDER_DISCONNECTED' && error.stage === 'tts') return 'synthesisFailed'
  if (error.code === 'PROVIDER_DISCONNECTED' && error.stage !== 'asr') return 'internalError'
  return Object.hasOwn(causes, error.code) ? causes[error.code]! : 'internalError'
}

export function backendFailure(error: BackendError): Error {
  const code = backendErrorCode(error)
  return Object.assign(new Error(code), {
    engineCode: code, backendCode: error.code, messageKey: error.message_key,
    correlationId: error.correlation_id || undefined,
  })
}

export async function readBackendFailure(response: Response): Promise<BackendError | undefined> {
  const body = await response.json().catch(() => undefined)
  return z.object({ error: backendError }).safeParse(body).data?.error
}
