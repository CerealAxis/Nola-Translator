import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import type { DirectModelResult } from '../../../shared/agent-workspace'
import { cloudModelError } from '../../cloud-model-tools'

export function audio(data: Buffer | string, mime = 'audio/wav'): DirectModelResult {
  const encoded = typeof data === 'string' ? data : data.toString('base64')
  if (!encoded) throw cloudModelError('CLOUD_MODEL_NO_AUDIO', 'The cloud service returned no audio.')
  return { text: '', audio: 'data:' + mime + ';base64,' + encoded }
}

export function pcmWav(data: Buffer, rate: number) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(data.length + 36, 4)
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

export function xml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export function cosyVoice(endpoint: string, model: string, voice: string, text: string, apiKey: string, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint, {
      headers: { Authorization: 'Bearer ' + apiKey }, maxPayload: 4 * 1024 * 1024,
    })
    const task = randomUUID()
    const chunks: Buffer[] = []
    let size = 0
    const send = (action: string, payload: object) => socket.send(JSON.stringify({
      header: { action, task_id: task, streaming: 'duplex' }, payload,
    }))
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', cancel)
      if (error) { reject(error); socket.terminate() }
      else { resolve(Buffer.concat(chunks)); socket.close() }
    }
    const cancel = () => finish(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    socket.once('error', () => finish(new Error('DashScope WebSocket request failed.')))
    socket.once('close', () => finish(new Error('DashScope closed the WebSocket before completing synthesis.')))
    socket.once('open', () => send('run-task', {
      task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer', model,
      parameters: { text_type: 'PlainText', voice, format: 'wav', sample_rate: 24000 }, input: {},
    }))
    socket.on('message', (data, binary) => {
      try {
        if (binary) {
          const chunk = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)
          size += chunk.length
          if (size > 32 * 1024 * 1024) throw new Error('DashScope response is too large.')
          chunks.push(chunk)
          return
        }
        const header = JSON.parse(data.toString()).header
        if (header?.task_id !== task) return
        if (header.event === 'task-started') {
          send('continue-task', { input: { text } })
          send('finish-task', { input: {} })
        } else if (header.event === 'task-finished') finish()
        else if (header.event === 'task-failed') finish(new Error('DashScope rejected the synthesis request.'))
      } catch (error) { finish(error) }
    })
  })
}
