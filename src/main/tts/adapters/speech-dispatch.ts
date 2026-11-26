import { synthesize as adapter0 } from './openai-tts-api-synthesis'
import { synthesize as adapter1 } from './mimo-synthesis'
import { synthesize as adapter2 } from './edge-tts-synthesis'
import { synthesize as adapter3 } from './fishaudio-tts-synthesis'
import { synthesize as adapter4 } from './dashscope-tts-synthesis'
import { synthesize as adapter5 } from './azure-tts-synthesis'
import { synthesize as adapter6 } from './minimax-tts-synthesis'
import { synthesize as adapter7 } from './volcengine-tts-synthesis'
import { synthesize as adapter8 } from './gemini-tts-synthesis'
import { synthesize as adapter9 } from './elevenlabs-tts-synthesis'
import type { SpeechAdapterContext } from './speech-context'

const adapters = {
  'openai-tts-api': adapter0,
  'mimo': adapter1,
  'edge-tts': adapter2,
  'fishaudio-tts': adapter3,
  'dashscope-tts': adapter4,
  'azure-tts': adapter5,
  'minimax-tts': adapter6,
  'volcengine-tts': adapter7,
  'gemini-tts': adapter8,
  'elevenlabs-tts': adapter9,
}
export function synthesizeSpeech(provider: string, context: SpeechAdapterContext) {
  const adapter = adapters[provider as keyof typeof adapters]
  if (!adapter) throw new Error('ttsAdapterMissing')
  return adapter(context)
}
