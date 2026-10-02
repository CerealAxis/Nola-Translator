import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownloadRegular, ChevronLeftRegular, PauseRegular, PlayRegular } from '@fluentui/react-icons'

import type { CaptionSegment, MeetingMeta } from '../../shared/contracts'
import { useI18n } from '../i18n'
import { clockLabel, meetingTitleFor } from '../components/meeting-format'

const MIN_SOURCE_SCALE = 0.7
const MAX_SOURCE_SCALE = 2
const SCALE_STEP = 0.1
const DIVIDER_WIDTH = 14
const EXPORT_FORMATS = ['txt', 'srt', 'vtt'] as const

type MeetingDetailPageProps = {
  meetingId: string
  onBack: () => void
}

export function MeetingDetailPage({ meetingId, onBack }: MeetingDetailPageProps): React.JSX.Element {
  const { language, t } = useI18n()
  const [meta, setMeta] = useState<MeetingMeta | null>(null)
  const [segments, setSegments] = useState<CaptionSegment[]>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [sourceScale, setSourceScale] = useState(1)
  const [translationScale, setTranslationScale] = useState(1)
  const [split, setSplit] = useState(0.5)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startX: number; startSplit: number } | null>(null)
  const activeSessionRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    setSegments([])
    setMeta(null)
    setNotice(null)
    const api = window.nolaTranslator
    if (!api) return
    void Promise.all([api.getMeeting(meetingId), api.readMeeting(meetingId), api.getMeetingAudioUrl(meetingId)])
      .then(([nextMeta, nextSegments, nextAudio]) => {
        if (!active) return
        setMeta(nextMeta)
        setSegments(nextSegments)
        setAudioUrl(nextAudio)
        setDuration((nextMeta?.audioDurationMs ?? 0) / 1000)
      })
      .catch(() => { if (active) setNotice(t('无法读取会议记录，请重试。')) })
    const unsubscribe = api.onEngineEvent((event) => {
      if (event.type !== 'caption' || event.sessionId !== activeSessionRef.current) return
      // A meeting that is still recording grows while it is open.
      void api.readMeeting(meetingId).then((next) => { if (active) setSegments(next) })
    })
    return () => { active = false; unsubscribe() }
  }, [meetingId, t])

  useEffect(() => {
    const api = window.nolaTranslator
    if (!api) return
    return api.onEngineEvent((event) => {
      if (event.type === 'sessionStarted') activeSessionRef.current = event.sessionId
    })
  }, [])

  // The transcript should always show the newest line, like the overlay does.
  useEffect(() => {
    const node = bodyRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [segments])

  const onDividerPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startX: event.clientX, startSplit: split }
  }
  const onDividerPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    const container = event.currentTarget.parentElement
    if (!drag || !container) return
    const width = container.getBoundingClientRect().width - DIVIDER_WIDTH
    if (width <= 0) return
    const next = drag.startSplit + (event.clientX - drag.startX) / width
    setSplit(Math.min(0.85, Math.max(0.15, next)))
  }
  const onDividerPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }
  const onDividerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') setSplit((value) => Math.max(0.15, value - 0.05))
    else if (event.key === 'ArrowRight') setSplit((value) => Math.min(0.85, value + 0.05))
    else return
    event.preventDefault()
  }

  const runExport = useCallback(async (format: (typeof EXPORT_FORMATS)[number]) => {
    setExportOpen(false)
    try {
      const path = await window.nolaTranslator?.exportMeeting(meetingId, format)
      setNotice(path ? t('已导出到 {path}', { path }) : null)
    } catch {
      setNotice(t('导出失败，请重试。'))
    }
  }, [meetingId, t])

  const title = meta ? meetingTitleFor(meta, language) : t('正在加载…')

  return (
    <section className="page meeting-detail-page">
      <header className="meeting-detail-header">
        <button type="button" className="icon-button" aria-label={t('返回')} onClick={onBack}><ChevronLeftRegular aria-hidden /></button>
        <h1 className="meeting-detail-title">{title}</h1>
        <span className="meeting-badges">
          <span className="meeting-badge">{t('内容自动保存')}</span>
          <span className="meeting-badge">{t('数据安全保护')}</span>
        </span>
        <div className="meeting-font-controls" role="group" aria-label={t('字号')}>
          <button type="button" aria-label={t('增大字号')} onClick={() => { setSourceScale((value) => Math.min(MAX_SOURCE_SCALE, value + SCALE_STEP)); setTranslationScale((value) => Math.min(MAX_SOURCE_SCALE, value + SCALE_STEP)) }}>A+</button>
          <button type="button" aria-label={t('减小字号')} onClick={() => { setSourceScale((value) => Math.max(MIN_SOURCE_SCALE, value - SCALE_STEP)); setTranslationScale((value) => Math.max(MIN_SOURCE_SCALE, value - SCALE_STEP)) }}>A-</button>
        </div>
        <div className="meeting-export">
          <button type="button" className="button primary-button" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>
            <ArrowDownloadRegular aria-hidden />{t('导出')}
          </button>
          {exportOpen && <div className="language-menu surface" role="menu" aria-label={t('导出')}>
            {EXPORT_FORMATS.map((format) => (
              <button key={format} type="button" role="menuitem" onClick={() => void runExport(format)}>{format.toUpperCase()}</button>
            ))}
          </div>}
        </div>
      </header>
      {notice && <p className="page-error" role="status">{notice}</p>}
      <div className="meeting-panes" style={{ gridTemplateColumns: split + 'fr ' + DIVIDER_WIDTH + 'px ' + (1 - split) + 'fr' }}>
        <article className="meeting-pane" style={{ fontSize: 'calc(1rem * ' + sourceScale + ')' }}>
          <h2 className="meeting-pane-title">{t('原文')}</h2>
          <div className="meeting-pane-body" ref={bodyRef}>
            {segments.map((segment) => <p key={segment.segmentId} className="meeting-paragraph">{segment.sourceText}</p>)}
            {segments.length === 0 && <p className="meeting-empty">{t('本次会议没有识别到语音内容。')}</p>}
          </div>
        </article>
        <div
          className="meeting-divider"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={t('调整原文与译文的显示比例')}
          aria-valuenow={Math.round(split * 100)}
          aria-valuemin={15}
          aria-valuemax={85}
          onPointerDown={onDividerPointerDown}
          onPointerMove={onDividerPointerMove}
          onPointerUp={onDividerPointerUp}
          onKeyDown={onDividerKeyDown}
        ><span aria-hidden="true">‹ ›</span></div>
        <article className="meeting-pane" style={{ fontSize: 'calc(1rem * ' + translationScale + ')' }}>
          <h2 className="meeting-pane-title">{t('译文')}</h2>
          <div className="meeting-pane-body">
            {segments.map((segment) => (
              <p key={segment.segmentId} className="meeting-paragraph">
                {segment.translations.find((item) => item.state === 'complete')?.text ?? ''}
              </p>
            ))}
            {segments.length === 0 && <p className="meeting-empty">{t('本次会议没有识别到语音内容。')}</p>}
          </div>
        </article>
      </div>
      {audioUrl && <div className="meeting-player">
        <button
          type="button"
          className="meeting-play"
          aria-label={playing ? t('暂停') : t('播放')}
          onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) void audio.play(); else audio.pause() }}
        >{playing ? <PauseRegular aria-hidden /> : <PlayRegular aria-hidden />}</button>
        <input
          className="meeting-progress"
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.floor(elapsed)}
          aria-label={t('播放进度')}
          onChange={(event) => { const audio = audioRef.current; if (audio) audio.currentTime = Number(event.target.value) }}
        />
        <span className="meeting-clock">{clockLabel(elapsed * 1000)} / {clockLabel(duration * 1000)}</span>
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration
            if (Number.isFinite(value) && value > 0) setDuration(value)
          }}
          onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        />
      </div>}
    </section>
  )
}
