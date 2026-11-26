export function dashscopeVoiceApiModel(modelId: string, kind: 'clone' | 'design' | 'imported'): string {
  if (modelId.startsWith('qwen3-tts-')) return kind === 'design' ? 'qwen-voice-design' : 'qwen-voice-enrollment'
  return 'voice-enrollment'
}
