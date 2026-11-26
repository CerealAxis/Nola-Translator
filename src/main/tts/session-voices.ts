import type { ResolvedVoiceConditioning } from '../../shared/tts/synthesis'
import { voiceAssetIdSchema } from '../../shared/tts/voice-profile'
import { TtsCompatibilityError } from '../../shared/tts/errors'

type Reference = Extract<ResolvedVoiceConditioning, { kind: 'reference-audio' }>
export class SessionVoices {
  private readonly sessions = new Map<string, Map<string, Reference>>()

  register(sessionId: string, speakerId: string, reference: Reference): void {
    voiceAssetIdSchema.parse(sessionId)
    voiceAssetIdSchema.parse(speakerId)
    const speakers = this.sessions.get(sessionId) ?? new Map<string, Reference>()
    speakers.set(speakerId, structuredClone(reference))
    this.sessions.set(sessionId, speakers)
  }

  resolve(sessionId: string, speakerId: string): Reference {
    const reference = this.sessions.get(sessionId)?.get(speakerId)
    if (!reference) throw new TtsCompatibilityError('VOICE_MISSING')
    return structuredClone(reference)
  }

  close(sessionId: string): void { this.sessions.delete(sessionId) }
  clear(): void { this.sessions.clear() }
}
