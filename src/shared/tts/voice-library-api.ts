import type { TtsVoiceProfile } from './voice-profile'
import type { TtsModelCapabilities } from './capabilities'
import type { TtsVoiceBinding } from './voice-binding'
import type { TtsVoiceRef } from './voice-ref'

export type TtsUsage = 'synthesis' | 'realtime'
export interface TtsVoiceCompatibility {
  ref: TtsVoiceRef;
  compatible: boolean;
  code?: string;
  details?: Record<string, unknown>;
}

export interface VoiceLibraryApi {
  list(): Promise<TtsVoiceProfile[]>;
  save(profile: TtsVoiceProfile, expectedRevision?: number): Promise<TtsVoiceProfile>;
  delete(id: string, expectedRevision: number): Promise<TtsVoiceProfile>;
  importAudio(profileId: string, role: 'reference' | 'sample' | 'consent'): Promise<{ assetId: string; mime: string; durationMs?: number; fileName: string } | null>;
  audio(assetId: string): Promise<string>;
  capabilities(modelBinding: string, refresh?: boolean, modelId?: string, catalog?: boolean): Promise<TtsModelCapabilities>;
  compatibility(modelBinding: string, targetLanguage: string, refs: TtsVoiceRef[], usage?: TtsUsage): Promise<TtsVoiceCompatibility[]>;
  addProviderVoice(modelBinding: string, voiceId: string, name: string): Promise<TtsVoiceProfile>;
  bindings(profileId: string, revision: number): Promise<TtsVoiceBinding[]>;
  refreshBinding(profileId: string, revision: number, bindingId: string, remove?: boolean): Promise<TtsVoiceBinding>;
  prepare(profileId: string, revision: number, modelBinding: string, previewText: string, language: string): Promise<TtsVoiceBinding>;
  preview(modelBinding: string, voiceRef: TtsVoiceRef, text: string, targetLanguage?: string): Promise<string>;
}
