import type { AttachmentAdapter, PendingAttachment, CompleteAttachment } from '@assistant-ui/react'
import { getFileDataURL } from '@assistant-ui/core/internal'

/** Normalize browser recordings and uploaded audio to the engine's mono 16 kHz PCM contract. */
export async function pcmWavData(input: Blob | string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const data = typeof input === 'string' ? await (await fetch(input)).arrayBuffer() : await input.arrayBuffer()
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(data)
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
    return { ...attachment, status: { type: 'complete' }, content: [{ type: 'file', mimeType: attachment.contentType || attachment.file.type || 'audio/wav',
      filename: attachment.name, data: await getFileDataURL(attachment.file, options) }] }
  }
  async remove() {}
}

type VideoErrorKey = 'videoUnsupported' | 'videoNoAudio' | 'videoExtractFailed'
class VideoAttachmentError extends Error {}

/** Keep the uploaded video intact; extraction belongs to the assistant's processing run. */
export class VideoAttachmentAdapter extends AudioAttachmentAdapter {
  override accept = 'video/*'
}

export async function extractVideoAudio(file: Blob, signal: AbortSignal | undefined, translate: (key: VideoErrorKey) => string): Promise<Blob> {
  signal?.throwIfAborted()
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.playsInline = true
  video.src = url
  let context: AudioContext | undefined
  let recorder: MediaRecorder | undefined
  let source: MediaElementAudioSourceNode | undefined
  let destination: MediaStreamAudioDestinationNode | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted) }
      const loaded = () => { cleanup(); resolve() }
      const failed = () => { cleanup(); reject(new VideoAttachmentError(translate('videoUnsupported'))) }
      const aborted = () => { cleanup(); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')) }
      video.addEventListener('loadedmetadata', loaded, { once: true })
      video.addEventListener('error', failed, { once: true })
      signal?.addEventListener('abort', aborted, { once: true })
    })
    signal?.throwIfAborted()
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new VideoAttachmentError(translate('videoUnsupported'))
    context = new AudioContext()
    destination = context.createMediaStreamDestination()
    source = context.createMediaElementSource(video)
    source.connect(destination)
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(type => MediaRecorder.isTypeSupported(type))
    if (!mimeType) throw new VideoAttachmentError(translate('videoUnsupported'))
    const chunks: BlobPart[] = []
    recorder = new MediaRecorder(destination.stream, { mimeType })
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data) })
    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder!.addEventListener('stop', () => chunks.length ? resolve(new Blob(chunks, { type: mimeType })) : reject(new VideoAttachmentError(translate('videoNoAudio'))), { once: true })
      recorder!.addEventListener('error', () => reject(new VideoAttachmentError(translate('videoExtractFailed'))), { once: true })
      signal?.addEventListener('abort', () => { if (recorder?.state === 'recording') recorder.stop() }, { once: true })
    })
    await context.resume()
    recorder.start()
    await video.play()
    await new Promise<void>((resolve, reject) => {
      const ended = () => { cleanup(); resolve() }
      const failed = () => { cleanup(); reject(new VideoAttachmentError(translate('videoUnsupported'))) }
      const aborted = () => { cleanup(); video.pause(); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')) }
      const cleanup = () => { video.removeEventListener('ended', ended); video.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted) }
      video.addEventListener('ended', ended, { once: true })
      video.addEventListener('error', failed, { once: true })
      signal?.addEventListener('abort', aborted, { once: true })
    })
    if (recorder.state === 'recording') recorder.stop()
    const blob = await recorded
    if (!blob.size) throw new VideoAttachmentError(translate('videoNoAudio'))
    return blob
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof VideoAttachmentError) throw error
    throw new Error(translate('videoExtractFailed'), { cause: error })
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    source?.disconnect()
    destination?.stream.getTracks().forEach(track => track.stop())
    if (context && context.state !== 'closed') await context.close()
    URL.revokeObjectURL(url)
  }
}
