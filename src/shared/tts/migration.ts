import type { TtsVoiceRef } from './voice-ref'

export interface LegacyVoiceOrigin {
  rawVoice: string;
  modelBinding: string;
  providerId?: string;
  connectionId?: string;
  accountScope?: string;
  verificationStatus: 'verified' | 'unverified';
  migrationVersion: 1;
}

export function migrateLegacyVoice(rawVoice: string, modelBinding: string,
  knownVoices: readonly string[] = [], origin: Pick<LegacyVoiceOrigin, 'providerId' | 'connectionId' | 'accountScope'> = {},
): { voiceRef: TtsVoiceRef; legacy?: LegacyVoiceOrigin } {
  if (!rawVoice) return { voiceRef: { kind: 'engine-default' } }
  return {
    voiceRef: { kind: 'preset', modelBinding, voiceId: rawVoice },
    legacy: { ...origin, rawVoice, modelBinding,
      verificationStatus: knownVoices.includes(rawVoice) ? 'verified' : 'unverified', migrationVersion: 1 },
  }
}

export function selectTtsVoiceRef(...values: Array<TtsVoiceRef | undefined>): TtsVoiceRef {
  return values.find(value => value !== undefined) ?? { kind: 'engine-default' }
}
