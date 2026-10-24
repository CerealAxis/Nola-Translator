import type { DictationAdapter } from '@assistant-ui/react'
import { pcmWavData } from './audio-attachment'

/** Captures audio for direct ASR mode through the official composer dictation lifecycle. */
export class AudioRecordingDictationAdapter implements DictationAdapter {
  private active?: DictationAdapter.Session
  constructor(private readonly onAudio: (data: { url: string; mimeType: string }) => void | string | Promise<void | string>,
    private readonly onError: (error: unknown) => void,
    private readonly onCancel?: () => void) {}
  dispose() { this.active?.cancel() }
  listen(): DictationAdapter.Session {
    this.dispose()
    let recording: MediaRecorder | undefined
    let media: MediaStream | undefined
    let cancelled = false
    const started = new Set<() => void>()
    const ended = new Set<(result: DictationAdapter.Result) => void>()
    const complete = (reason: 'stopped' | 'cancelled' | 'error', transcript = '') => {
      session.status = { type: 'ended', reason }
      media?.getTracks().forEach(track => track.stop())
      ended.forEach(callback => callback({ transcript, isFinal: true }))
    }
    const session: DictationAdapter.Session = {
      status: { type: 'starting' },
      stop: async () => {
        if (recording?.state === 'recording') await new Promise<void>(resolve => {
          recording!.addEventListener('stop', () => resolve(), { once: true }); recording!.stop()
        })
        else { cancelled = true; complete('stopped') }
      },
      cancel: () => { cancelled = true; this.onCancel?.(); if (recording?.state === 'recording') recording.stop(); complete('cancelled') },
      onSpeechStart: callback => { started.add(callback); return () => { started.delete(callback) } },
      onSpeechEnd: callback => { ended.add(callback); return () => { ended.delete(callback) } },
      onSpeech: () => () => undefined,
    }
    this.active = session
    void navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      media = stream
      if (cancelled) { stream.getTracks().forEach(track => track.stop()); return }
      recording = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recording.onstop = () => {
        media?.getTracks().forEach(track => track.stop())
        if (cancelled || !chunks.length) { complete(cancelled ? 'cancelled' : 'stopped'); return }
        void pcmWavData(new Blob(chunks, { type: recording!.mimeType })).then(async url => {
          if (cancelled) return
          const transcript = await this.onAudio({ url, mimeType: 'audio/wav' })
          if (!cancelled) complete('stopped', transcript || '')
        }).catch(error => { if (!cancelled) { complete('error'); this.onError(error) } })
      }
      recording.start()
      session.status = { type: 'running' }
      started.forEach(callback => callback())
    }).catch(error => { complete('error'); this.onError(error) })
    return session
  }
}
