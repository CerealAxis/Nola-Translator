import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '../../../src/renderer/components/ui/button'
import { ArrowLeft, AudioLines, BookOpen, Captions, ChevronRight, Download, Play, RefreshCw, Settings2, Square, X } from 'lucide-react'
import { captionAudioSource, type ExtensionStore } from '../store'
import { browserText } from '../i18n'
import { NolaLogo } from '../logo'
import { ChoiceField } from './ChoiceField'
import { PopupLanguage } from './PopupLanguage'
import { ColorField, languageOptions, RangeField, subtitleFontOptions } from '../settings-fields'
import { resolveUiLanguage } from '../../../src/shared/languages'
import { Field, FieldGroup, FieldLabel } from '../../../src/renderer/components/ui/field'
import { Switch, SwitchThumb } from '../../../src/renderer/components/ui/switch'
import { DEFAULT_PREFERENCES, DISABLED_PROVIDER, liveTranslationEnabled, savePreferences, type Preferences } from '../preferences'
import type { SubtitleState, SubtitleTranslation } from '../subtitle-translation'
import { SubtitleAvailabilityTooltip } from './SubtitleAvailabilityTooltip'
import { useErrorToasts } from './useErrorToasts'

export interface PanelProps { store: ExtensionStore; subtitles?: SubtitleState; toggleSubtitles?: () => void; selectTrack?: (id: string) => void; subtitleController?: SubtitleTranslation; portalContainer?: HTMLElement }
export function Panel({ store, subtitles, toggleSubtitles, selectTrack, subtitleController, portalContainer }: PanelProps) {
  const panel = useRef<HTMLElement>(null)
  const [view, setView] = useState<'main' | 'settings' | 'style' | 'download' | 'study'>('main')
  const [saveError, setSaveError] = useState(false)
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
  useEffect(() => { if (state.panelOpen) { setView('main'); panel.current?.focus() } }, [state.panelOpen])
  const currentTime = state.selectedVideo?.currentTime ?? 0
  useEffect(() => {
    if (!transcriptOpen || !state.preferences?.subtitleFollow) return
    const active = subtitles?.transcript?.findIndex(cue => currentTime >= cue.start && currentTime < cue.end) ?? -1
    const row = transcript.current?.children[active] as HTMLElement | undefined
    if (row && transcript.current) transcript.current.scrollTop = Math.max(0, row.offsetTop - transcript.current.offsetTop - transcript.current.clientHeight / 2)
  }, [currentTime, transcriptOpen, state.preferences?.subtitleFollow, subtitles?.transcript])
  const t = browserText(state.preferences?.uiLanguage)
  useErrorToasts(t, state.liveAttempted ? state.error : undefined, subtitles?.error, saveError || exportError ? 'internalError' : undefined)
  const preferences = state.preferences
  const liveEnabled = preferences ? liveTranslationEnabled(preferences) : false
  const summaryEnabled = preferences?.llmProvider !== DISABLED_PROVIDER
  const save = (patch: Partial<Preferences>) => { setSaveError(false); void savePreferences(patch).catch(() => setSaveError(true)) }
  const languages = languageOptions(resolveUiLanguage(preferences?.uiLanguage ?? 'auto', navigator.language))
  const enhanced = Boolean(state.summary?.realtimeTranslation && state.preferences)
  const locked = state.status !== 'idle' || state.capturePending
  const running = state.status === 'starting' || state.status === 'active'
  const trackSource = !running && Boolean(subtitles?.tracks.length)
  const tabAudio = captionAudioSource(state.config) === 'tab'
  const compatible = state.summary?.extensionCompatible !== false
  const available = enhanced || Boolean(state.summary?.browserAudio && state.captionServiceActive)
  const blocked = !state.selectedVideo || !state.connected || !available || !compatible
  const primaryDisabled = state.status === 'active' ? false : blocked || locked
  const status = !state.connected ? 'statusDisconnected' : !compatible ? 'extensionVersionMismatch' : state.status === 'starting' ? 'starting' : state.status === 'stopping' ? 'stopping' : running ? (state.playbackPaused ? 'statusWaitingForPlayback' : 'statusRecognizing') : available ? 'statusReady' : 'captionServiceOff'
  const title = view === 'settings' ? t('subtitleSettings') : view === 'style' ? t('subtitleStyle') : view === 'download' ? t('downloadSrt') : view === 'study' ? t('transcript') : t('button')
  const link = (next: typeof view, label: string, Icon: typeof Captions, disabled = false) => <Button variant="bare" size="sm" className="nola-subtitle-menu-item" disabled={disabled} onClick={() => setView(next)}><Icon aria-hidden="true" /><span>{label}</span><ChevronRight aria-hidden="true" /></Button>
  return <section ref={panel} tabIndex={-1} className="nola-panel nola-subtitle-menu nola-glass-popup" aria-label={t('button')} onKeyDown={event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.stopPropagation()
    if (view === 'main') store.closePanel()
    else setView(view === 'style' ? 'settings' : 'main')
  }}>
    <header className="nola-panel-header">
      {view !== 'main' && <Button variant="bare" size="icon-sm" className="nola-panel-close" aria-label={t('back')} onClick={() => setView(view === 'style' ? 'settings' : 'main')}><ArrowLeft /></Button>}
      <span className="nola-panel-brand">{view === 'main' && <NolaLogo />}<h2 className="nola-heading">{title}</h2></span>
      <Button variant="bare" size="icon-sm" className="nola-panel-close" aria-label={t('close')} onClick={store.closePanel}><X aria-hidden="true" /></Button>
    </header>
    {view === 'main' && <>
    {(state.liveAttempted || locked) && <p className="nola-status" role="status">{t(status)}</p>}
    {subtitles && <div className="nola-subtitle-toggle">
      <Captions aria-hidden="true" /><span>{t('translateSubtitles')}</span>
      <SubtitleAvailabilityTooltip availability={subtitles.availability} active={subtitles.active} container={portalContainer} t={t}>
        <Switch aria-label={t('translateSubtitles')} disabled={locked || !state.selectedVideo || !subtitles.active && subtitles.availability !== 'ready'} checked={subtitles.active} onCheckedChange={toggleSubtitles}><SwitchThumb /></Switch>
      </SubtitleAvailabilityTooltip>
    </div>}
    {link('download', t('downloadSrt'), Download, !subtitleController || !subtitles?.active)}
    {link('study', t('transcript'), BookOpen, !subtitleController || !subtitles?.active)}
    {link('settings', t('subtitleSettings'), Settings2, !preferences)}
    {(liveEnabled || locked) && <div className="nola-panel-controls">
      <Button variant="secondary" disabled={primaryDisabled} title={blocked ? t(status) : undefined} onClick={() => { if (state.status === 'active') void store.stop(); else store.pressStart() }}>
        {state.status === 'active' ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        {state.status === 'active' ? t('end') : state.status === 'starting' ? t('starting') : state.status === 'stopping' ? t('stopping') : t(enhanced ? 'live' : 'start')}
      </Button>
      <Button variant="bare" size="icon-sm" aria-label={t('refresh')} title={t('refresh')} disabled={state.status === 'starting' || state.status === 'stopping' || state.capturePending} onClick={() => { subtitleController?.checkAvailability(true); void store.refresh() }}><RefreshCw aria-hidden="true" /></Button>
    </div>}
    {liveEnabled && tabAudio && !enhanced && <Button variant="secondary" disabled={locked || !state.connected || !compatible} onClick={store.pressCapture}><AudioLines aria-hidden="true" />{t(state.audioCaptured ? 'audioCaptured' : 'captureAudio')}</Button>}
    </>}
    {view === 'download' && <div className="nola-subtitle-page">
      <Button variant="secondary" disabled={exporting} onClick={() => void download(false)}><Download />{t('sourceSubtitles')} · SRT</Button>
      <Button variant="secondary" disabled={exporting} onClick={() => void download(true)}><Download />{t('translatedSubtitles')} · SRT</Button>
    </div>}
    {view === 'study' && subtitles && subtitleController && <div className="nola-subtitle-page">
      <div className="nola-subtitle-study-actions">
        <Button variant="secondary" aria-expanded={transcriptOpen} onClick={() => setTranscriptOpen(!transcriptOpen)}>{t('transcript')}</Button>
        {summaryEnabled && <Button variant="secondary" disabled={subtitles.processing} onClick={() => void subtitleController.summarize()}>{t('summarizeVideo')}</Button>}
        {summaryEnabled && <Button variant="secondary" disabled={subtitles.processing} onClick={() => void subtitleController.segment()}>{t('segmentSubtitles')}</Button>}
        <Button variant="secondary" onClick={() => subtitleController.playback()}>{t('playVideo')} / {t('pauseVideo')}</Button>
      </div>
      <ChoiceField t={t} label={t('playbackRate')} value={rate} options={[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => ({ value: String(rate), label: `${rate}×` }))} onChange={value => { setRate(value); subtitleController.playback(Number(value)) }} />
      {subtitles.summary && <p dir="auto">{subtitles.summary}</p>}
      {transcriptOpen && <div ref={transcript} className="nola-transcript" role="region" aria-label={t('transcript')}>
        {subtitles.transcript?.map((cue, index) => <Button key={`${cue.start}-${index}`} aria-current={currentTime >= cue.start && currentTime < cue.end ? 'true' : undefined} variant="secondary" onClick={() => subtitleController.seek(cue.start)}><span>{Math.floor(cue.start / 60)}:{String(Math.floor(cue.start % 60)).padStart(2, '0')}</span><span dir="auto">{cue.text}</span></Button>)}
      </div>}
    </div>}
    {view === 'settings' && preferences && <div className="nola-subtitle-page">
      <div className="nola-subtitle-languages">
        <PopupLanguage size="sm" label={t('source')} value={trackSource ? subtitles?.trackId ?? subtitles?.tracks[0]?.id ?? '' : preferences.sourceLanguage} options={trackSource ? subtitles!.tracks.map(track => ({ value: track.id, label: track.label || track.language })) : [{ value: 'auto', label: t('autoDetect') }, ...languages]} onChange={value => { if (trackSource) selectTrack?.(value); else save({ sourceLanguage: value }) }} t={t} disabled={locked} />
        <PopupLanguage size="sm" label={t('target')} value={preferences.videoLanguage} options={languages} onChange={value => save({ videoLanguage: value })} t={t} disabled={locked} />
      </div>
      <ChoiceField t={t} label={t('display')} value={preferences.videoDisplay} options={[{ value: 'source', label: t('sourceSubtitles') }, { value: 'bilingual', label: t('bilingual') }, { value: 'translation', label: t('translationOnly') }]} onChange={value => save({ videoDisplay: value as Preferences['videoDisplay'] })} />
      {preferences.videoDisplay === 'bilingual' && <ChoiceField t={t} label={t('translationPosition')} value={preferences.subtitleTranslationFirst ? 'above' : 'below'} options={[{ value: 'above', label: t('aboveOriginal') }, { value: 'below', label: t('belowOriginal') }]} onChange={value => save({ subtitleTranslationFirst: value === 'above' })} />}
      {link('style', t('subtitleStyle'), Settings2)}
    </div>}
    {view === 'style' && preferences && <FieldGroup className="nola-subtitle-page">
      <RangeField label={t('subtitleBackgroundOpacity')} value={preferences.subtitleBackgroundOpacity} min={0} max={1} step={0.05} onChange={subtitleBackgroundOpacity => save({ subtitleBackgroundOpacity })} />
      <ColorField label={t('subtitleBackground')} value={preferences.subtitleBackground} onChange={subtitleBackground => save({ subtitleBackground })} />
      {(['source', 'translation'] as const).map(kind => {
        const sizeKey = kind === 'source' ? 'subtitleSourceSize' : 'subtitleTranslationSize'
        const colorKey = kind === 'source' ? 'subtitleSourceColor' : 'subtitleTranslationColor'
        const fontKey = kind === 'source' ? 'subtitleSourceFont' : 'subtitleTranslationFont'
        return <fieldset key={kind} className="nola-subtitle-style-group"><legend>{t(kind === 'source' ? 'sourceCaption' : 'translatedCaption')}</legend>
          <RangeField label={t('fontSize')} value={preferences[sizeKey]} min={10} max={60} suffix="px" onChange={value => save({ [sizeKey]: value })} />
          <ColorField label={t('subtitleColor')} value={preferences[colorKey]} onChange={value => save({ [colorKey]: value })} />
          <ChoiceField t={t} label={t('subtitleFont')} value={preferences[fontKey]} options={subtitleFontOptions(preferences[fontKey], t)} onChange={value => save({ [fontKey]: value })} />
        </fieldset>
      })}
      <Field className="nola-subtitle-style-row"><FieldLabel htmlFor="nola-subtitle-bold">{t('subtitleBold')}</FieldLabel><Switch id="nola-subtitle-bold" checked={preferences.subtitleBold} onCheckedChange={value => save({ subtitleBold: value })}><SwitchThumb /></Switch></Field>
      <Field className="nola-subtitle-style-row"><FieldLabel htmlFor="nola-subtitle-hover">{t('subtitlePauseOnHover')}</FieldLabel><Switch id="nola-subtitle-hover" checked={preferences.subtitlePauseOnHover} onCheckedChange={value => save({ subtitlePauseOnHover: value })}><SwitchThumb /></Switch></Field>
      <Button variant="outline" onClick={() => save(Object.fromEntries((['subtitleSourceSize', 'subtitleSourceColor', 'subtitleSourceFont', 'subtitleTranslationSize', 'subtitleTranslationColor', 'subtitleTranslationFont', 'subtitleBold', 'subtitleBackground', 'subtitleBackgroundOpacity', 'subtitlePauseOnHover'] as const).map(key => [key, DEFAULT_PREFERENCES[key]])))}><RefreshCw />{t('resetStyle')}</Button>
    </FieldGroup>}
  </section>
}
