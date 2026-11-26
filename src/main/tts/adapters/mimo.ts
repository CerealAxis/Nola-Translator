import type { DirectModelRequest } from '../../../shared/agent-workspace'

export function mimoSynthesisPayload(request: DirectModelRequest, modelId: string, defaultVoice: string,
  options: { format?: string; instruction?: string; style?: string } = {}) {
  const conditioning = request.conditioning
  const messages: Array<{ role: string; content: string }> = []
  const instruction = conditioning?.kind === 'design' ? conditioning.description : request.controls?.instruct || options.instruction
  if (instruction) messages.push({ role: 'user', content: instruction })
  const style = [options.style, request.controls?.emotion].filter(Boolean).join(' ')
  messages.push({ role: 'assistant', content: (style ? `<style>${style}</style>` : '') + (request.text ?? '') })
  const format = request.output?.format ?? options.format ?? 'wav'
  if (!['wav', 'mp3', 'pcm', 'pcm16'].includes(format)) throw new Error('mimoOutputUnsupported')
  const audio: { format: string; voice?: string } = { format }
  if (modelId === 'mimo-v2.5-tts') {
    if (conditioning && !['preset', 'engine-default'].includes(conditioning.kind)) throw new Error('mimoPresetRequired')
    audio.voice = conditioning?.kind === 'preset' ? conditioning.voiceId : request.voice || defaultVoice || 'mimo_default'
  } else if (modelId === 'mimo-v2.5-tts-voicedesign') {
    if (!instruction || conditioning && conditioning.kind !== 'design') throw new Error('mimoDesignRequired')
  } else if (modelId === 'mimo-v2.5-tts-voiceclone') {
    if (conditioning?.kind !== 'reference-audio') throw new Error('mimoReferenceRequired')
    const match = /^data:(audio\/(?:wav|mpeg|mp3));base64,([A-Za-z0-9+/]+={0,2})$/.exec(request.audio ?? '')
    if (!match || Buffer.byteLength(match[2], 'ascii') > 10_000_000) throw new Error('mimoReferenceInvalid')
    const data = Buffer.from(match[2], 'base64')
    if (!data.length || data.toString('base64') !== match[2]) throw new Error('mimoReferenceInvalid')
    audio.voice = request.audio
  } else throw new Error('mimoModelUnsupported')
  return { model: modelId, messages, audio, stream: false }
}
