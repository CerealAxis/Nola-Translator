import type { AttachmentAdapter, PendingAttachment, CompleteAttachment } from '@assistant-ui/react'

/** Normalize browser recordings and uploaded audio to the engine's mono 16 kHz PCM contract. */
export async function pcmWavData(input: Blob | string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const data = typeof input === 'string' ? await (await fetch(input)).arrayBuffer() : await input.arrayBuffer()
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(data)
    if (decoded.duration > 300) throw new Error('Audio exceeds five minutes')
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000)
    const source = offline.createBufferSource()
    source.buffer = decoded; source.connect(offline.destination); source.start()
    const samples = (await offline.startRendering()).getChannelData(0)
    signal?.throwIfAborted()
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const tag = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
    tag(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ')
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    tag(36, 'data'); view.setUint32(40, samples.length * 2, true)
    samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(32767 / 32768, sample)) * 32768), true))
    let binary = ''
    const bytes = new Uint8Array(buffer)
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    return 'data:audio/wav;base64,' + btoa(binary)
  } finally { await context.close() }
}

export class AudioAttachmentAdapter implements AttachmentAdapter {
  accept = 'audio/*'
  async add({ file }: { file: File }): Promise<PendingAttachment> {
    return { id: crypto.randomUUID(), type: 'file', name: file.name, file, contentType: file.type,
      status: { type: 'requires-action', reason: 'composer-send' } }
  }
  async send(attachment: PendingAttachment, options?: { signal?: AbortSignal }): Promise<CompleteAttachment> {
    return { ...attachment, status: { type: 'complete' }, content: [{ type: 'file', mimeType: 'audio/wav',
      filename: attachment.name, data: await pcmWavData(attachment.file, options?.signal) }] }
  }
  async remove() {}
}
