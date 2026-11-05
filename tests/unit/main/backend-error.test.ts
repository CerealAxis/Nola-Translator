import { describe, expect, it } from 'vitest'
import { normalizeThrownError } from '../../../src/shared/ipc-error'
import { backendErrorCode, backendFailure } from '../../../src/main/backend-error'

describe('v2 diagnostic causes', () => {
  it.each([
    ['RESOURCE_BUSY', 'backend.gatewayDisabled', 'gatewayNotRunning', 'GTW-001'],
    ['RESOURCE_BUSY', 'gateway.directInferenceFailed', 'resourceBusy', 'MDL-015'],
    ['MODEL_NOT_READY', 'pipeline.recognitionUnauthorized', 'invalidCredential', 'ARG-004'],
    ['PROVIDER_DISCONNECTED', 'pipeline.recognitionTimeout', 'recognitionTimeout', 'ASR-005'],
    ['RESOURCE_EXHAUSTED', 'pipeline.finalRecognitionQueueFull', 'recognitionBufferOverflow', 'ASR-008'],
    ['PROVIDER_DISCONNECTED', 'pipeline.s2sConnectionLost', 's2sConnectionLost', 'S2S-002'],
    ['TRANSLATION_TIMEOUT', 'pipeline.translationTimeout', 'translationTimeout', 'MT-011'],
    ['SESSION_SLOT_BUSY', 'session.slotBusy', 'sessionAlreadyRunning', 'SES-008'],
    ['PLAYBACK_DEVICE_LOST', 'playback.deviceLost', 'audioPlaybackUnavailable', 'AUD-007'],
  ])('classifies %s (%s) by its actual cause', (code, message_key, cause, supportCode) => {
    const error = { code, message_key, stage: 'pipeline', scope: 'session', retryable: false, fatal: false }
    expect(backendErrorCode(error)).toBe(cause)
    expect(normalizeThrownError(backendFailure(error))).toMatchObject({ code: cause, supportCode })
  })
})
