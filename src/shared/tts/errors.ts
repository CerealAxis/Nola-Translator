export type TtsErrorCode = 'MODEL_LANGUAGE_UNSUPPORTED' | 'VOICE_LANGUAGE_UNSUPPORTED'
  | 'LANGUAGE_UNVERIFIED' | 'VOICE_MODEL_MISMATCH' | 'VOICE_UNVERIFIED'
  | 'VOICE_MISSING' | 'VOICE_DELETED' | 'PROFILE_REVISION_MISSING' | 'VOICE_PREPARATION_REQUIRED'
  | 'VOICE_CONDITIONING_UNSUPPORTED' | 'CONTROL_UNSUPPORTED' | 'OUTPUT_UNSUPPORTED'
  | 'ASSET_INVALID' | 'BINDING_UNAVAILABLE'

export class TtsCompatibilityError extends Error {
  constructor(readonly code: TtsErrorCode, readonly details: Record<string, unknown> = {}) {
    super(code)
    this.name = 'TtsCompatibilityError'
  }
}
