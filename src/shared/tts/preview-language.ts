import type { TtsModelCapabilities } from './capabilities'
import type { TtsVoiceProfile } from './voice-profile'
import type { TtsVoiceRef } from './voice-ref'

export function ttsPreviewLanguage(explicit: string | undefined, profile: TtsVoiceProfile | undefined,
  capabilities: TtsModelCapabilities, voiceRef: TtsVoiceRef): string {
  if (explicit) return explicit
  if (profile?.defaultLanguage) return profile.defaultLanguage
  if (voiceRef.kind === 'preset') {
    const voice = capabilities.presetVoices.find(item => item.id === voiceRef.voiceId)
    if (voice?.languages?.[0]) return voice.languages[0]
  }
  if (capabilities.languageInputMode === 'auto-detect') return 'auto'
  if (capabilities.languages.mode === 'finite' && capabilities.languages.values[0]) return capabilities.languages.values[0]
  throw new Error('voicePreviewLanguageRequired')
}
