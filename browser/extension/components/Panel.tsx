import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '../../../src/renderer/components/ui/button'
import { Alert, AlertDescription } from '../../../src/renderer/components/ui/alert'
import { AudioLines, Play, RefreshCw, Square, X } from 'lucide-react'
import { captionAudioSource, type ExtensionStore } from '../store'
import { browserText, errorKey } from '../i18n'
import { NolaLogo } from '../logo'
import { ChoiceField } from './ChoiceField'
import { savePreferences } from '../preferences'
import type { SubtitleState, SubtitleTranslation } from '../subtitle-translation'

export interface PanelProps { store: ExtensionStore; subtitles?: SubtitleState; toggleSubtitles?: () => void; selectTrack?: (id: string) => void; subtitleController?: SubtitleTranslation }
export function Panel({ store, subtitles, toggleSubtitles, selectTrack, subtitleController }: PanelProps) {
  const transcript = useRef<HTMLDivElement>(null)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [rate, setRate] = useState('1')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const download = async (translated: boolean) => {
    if (!subtitleController) return
    setExporting(true); setExportError(false)
    try {
      const text = await subtitleController.exportSrt(translated)
      if (!text) return
      const url = URL.createObjectURL(new Blob([text], { type: 'application/x-subrip;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = `nola-${translated ? 'translated' : 'source'}.srt`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setExportError(true) } finally { setExporting(false) }
  }
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const currentTime = state.selectedVideo?.currentTime ?? 0
  useEffect(() => {
    if (!transcriptOpen || !state.preferences?.subtitleFollow) return
    const active = subtitles?.transcript?.findIndex(cue => currentTime >= cue.start && currentTime < cue.end) ?? -1
    const row = transcript.current?.children[active] as HTMLElement | undefined
    if (row && transcript.current) transcript.current.scrollTop = Math.max(0, row.offsetTop - transcript.current.offsetTop - transcript.current.clientHeight / 2)
  }, [currentTime, transcriptOpen, state.preferences?.subtitleFollow, subtitles?.transcript])
  const t = browserText(state.preferences?.uiLanguage)
  const enhanced = Boolean(state.summary?.realtimeTranslation && state.preferences)
  const locked = state.status !== 'idle' || state.capturePending
  const running = state.status === 'starting' || state.status === 'active'
  const tabAudio = captionAudioSource(state.config) === 'tab'
  const compatible = state.summary?.extensionCompatible !== false
  const available = enhanced || Boolean(state.summary?.browserAudio && state.captionServiceActive)
  const blocked = !state.selectedVideo || !state.connected || !available || !compatible
  const primaryDisabled = state.status === 'active' ? false : blocked || locked
  const status = !state.connected ? 'statusDisconnected' : !compatible ? 'extensionVersionMismatch' : state.status === 'starting' ? 'starting' : state.status === 'stopping' ? 'stopping' : running ? 'statusRecognizing' : available ? 'statusReady' : 'captionServiceOff'
  return <section className="nola-extension nola-panel" aria-label={t('button')}>
    <header className="nola-panel-header">
      <span className="nola-panel-brand"><NolaLogo /><h2 className="nola-heading">{t('button')}</h2></span>
      <Button data-slot="button" variant="secondary" className="button button--secondary nola-panel-close" aria-label={t('close')} onClick={store.closePanel}><X aria-hidden="true" /></Button>
    </header>
    <p className="nola-status" role="status" data-state={running ? 'recognizing' : state.connected && compatible && available ? 'ready' : 'unavailable'}>{t(status)}</p>
    {state.connected && state.config.pipeline ? <p>{t(state.config.pipeline === 's2s' ? 'directSpeechTranslation' : 'stepSpeechTranslation')} · {t(state.config.desktopApplicationAudio ? 'desktopApplicationAudio' : tabAudio ? 'tabAudio' : 'systemAudio')}</p> : null}
    {state.error === 'tabAudioSilent'
      ? <Alert role="status" variant="warning"><AlertDescription>{t(errorKey(state.error))}</AlertDescription></Alert>
      : state.error ? <Alert variant="danger"><AlertDescription>{t(errorKey(state.error))}</AlertDescription></Alert> : null}
    {subtitles && <div className="flex flex-col gap-2">
      <Button disabled={locked || !state.selectedVideo} onClick={toggleSubtitles}>
        {t(subtitles.active ? 'stopSubtitles' : 'translateSubtitles')}
      </Button>
      {subtitles.error && <p role="status" className="nola-muted">{t(errorKey(subtitles.error))}</p>}
      {subtitles.tracks.length > 0 && <ChoiceField label={t('subtitleTrack')} value={subtitles.trackId ?? ''} options={subtitles.tracks.map(track => ({ value: track.id, label: track.label || track.language }))} onChange={id => selectTrack?.(id)} />}
      {state.preferences && <ChoiceField label={t('display')} value={state.preferences.videoDisplay} options={[{ value: 'source', label: t('sourceSubtitles') }, { value: 'bilingual', label: t('bilingual') }, { value: 'translation', label: t('translationOnly') }]} onChange={value => { void savePreferences({ videoDisplay: value === 'source' ? 'source' : value === 'translation' ? 'translation' : 'bilingual' }) }} />}
    </div>}
    {subtitles?.active && subtitleController && <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={transcriptOpen} onClick={() => setTranscriptOpen(!transcriptOpen)}>{t('transcript')}</Button>
        <Button variant="secondary" disabled={exporting} onClick={() => void download(false)}>{t('sourceSubtitles')} · SRT</Button>
        <Button variant="secondary" disabled={exporting} onClick={() => void download(true)}>{t('translatedSubtitles')} · SRT</Button>
        <Button variant="secondary" disabled={subtitles.processing} onClick={() => void subtitleController.summarize()}>{t('summarizeVideo')}</Button>
        <Button variant="secondary" disabled={subtitles.processing} onClick={() => void subtitleController.segment()}>{t('segmentSubtitles')}</Button>
        <Button variant="secondary" onClick={() => subtitleController.playback()}>{t('playVideo')} / {t('pauseVideo')}</Button>
      </div>
      <ChoiceField label={t('playbackRate')} value={rate} options={[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => ({ value: String(rate), label: `${rate}×` }))} onChange={value => { setRate(value); subtitleController.playback(Number(value)) }} />
      {exportError && <p role="alert">{t('internalError')}</p>}
      {subtitles.summary && <p dir="auto">{subtitles.summary}</p>}
      {transcriptOpen && <div ref={transcript} className="nola-transcript" role="region" aria-label={t('transcript')} style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        {subtitles.transcript?.map((cue, index) => <Button key={`${cue.start}-${index}`} aria-current={currentTime >= cue.start && currentTime < cue.end ? 'true' : undefined} variant="secondary" onClick={() => subtitleController.seek(cue.start)}><span>{Math.floor(cue.start / 60)}:{String(Math.floor(cue.start % 60)).padStart(2, '0')}</span><span dir="auto">{cue.text}</span></Button>)}
      </div>}
    </div>}
    <div className="nola-panel-controls">
      <Button variant={enhanced ? 'secondary' : 'default'} disabled={primaryDisabled} onClick={() => { if (state.status === 'active') void store.stop(); else store.pressStart() }}>
        {state.status === 'active' ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        {state.status === 'active' ? t('end') : state.status === 'starting' ? t('starting') : state.status === 'stopping' ? t('stopping') : t(enhanced ? 'live' : 'start')}
      </Button>
      <Button data-slot="button" variant="secondary" className="button button--secondary" disabled={state.status === 'starting' || state.status === 'stopping' || state.capturePending} onClick={() => { void store.refresh() }}><RefreshCw aria-hidden="true" />{t('refresh')}</Button>
    </div>
    {tabAudio && !enhanced && <Button data-slot="button" variant="secondary" className="button button--secondary" disabled={locked || !state.connected || !compatible} onClick={store.pressCapture}><AudioLines aria-hidden="true" />{t(state.audioCaptured ? 'audioCaptured' : 'captureAudio')}</Button>}
  </section>
}
