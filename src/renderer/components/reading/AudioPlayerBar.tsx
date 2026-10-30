/**
 * Transport bar under the record detail page.
 *
 * The scrubber is a `Slider`, not a `ProgressBar`, which is for waiting and cannot be
 * dragged. The native `<audio>` element is the engine only — the controls are drawn
 * here, since native chrome ignores our surface tokens.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { LoaderCircle, Pause, Play } from 'lucide-react'

import { notifyError } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/i18n'

/** Playback speed steps, in the order they appear. */
const RATES = [0.5, 1, 1.5, 2] as const
type Rate = (typeof RATES)[number]

export interface AudioPlayerBarProps {
  /** Audio URL from the engine; null means this meeting has no recording. */
  audioUrl: string | null
  /** Known total length in ms. Optional: the element reads it from its own metadata. */
  durationMs?: number | null
  /** The URL is still loading; the play button shows pending and is disabled. */
  isPending?: boolean
  /** Copy for the no-recording case; callers pass the result of `t(...)`. */
  unavailableLabel?: string
  /** Playback position, used by the detail page to drive the dual column's focus. */
  onTimeChange?: (ms: number) => void
  className?: string
}

export function AudioPlayerBar({
  audioUrl,
  durationMs = null,
  isPending = false,
  unavailableLabel,
  onTimeChange,
  className,
}: AudioPlayerBarProps): ReactNode {
  const { t } = useI18n()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackErrorReportedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [positionMs, setPositionMs] = useState(0)
  const [totalMs, setTotalMs] = useState(durationMs ?? 0)
  const [rate, setRate] = useState<Rate>(1)

  const reportPlaybackError = useCallback(() => {
    if (playbackErrorReportedRef.current) return
    playbackErrorReportedRef.current = true
    notifyError(t('records.playerError'), {
      description: t('shellUi.actionHint'),
      action: {
        label: t('common.retry'),
        onPress: () => {
          const audio = audioRef.current
          if (!audio) return
          void audio.play().then(
            () => { playbackErrorReportedRef.current = false; setPlaying(true) },
            () => setPlaying(false),
          )
        },
      },
    })
  }, [t])

  // A new URL resets the bar, or the previous meeting's position carries over.
  useEffect(() => {
    setPlaying(false)
    setPositionMs(0)
    setTotalMs(durationMs ?? 0)
    playbackErrorReportedRef.current = false
    const audio = audioRef.current
    audio?.load()
  }, [audioUrl, durationMs])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate, audioUrl])

  // Playback state is driven by element events; the UI is only a projection of them.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = (): void => {
      setPositionMs(audio.currentTime * 1000)
      onTimeChange?.(audio.currentTime * 1000)
    }
    const onMeta = (): void => {
      if (Number.isFinite(audio.duration)) setTotalMs(audio.duration * 1000)
    }
    const onEnd = (): void => setPlaying(false)
    const onError = (): void => {
      setPlaying(false)
      reportPlaybackError()
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('error', onError)
    }
  }, [onTimeChange, reportPlaybackError])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    if (audio.paused) {
      void audio.play().then(
        () => { playbackErrorReportedRef.current = false; setPlaying(true) },
        () => {
          setPlaying(false)
          reportPlaybackError()
        },
      )
    } else {
      audio.pause()
      setPlaying(false)
    }
  }, [audioUrl, reportPlaybackError])

  const seek = useCallback((nextMs: number) => {
    const audio = audioRef.current
    setPositionMs(nextMs)
    if (audio) audio.currentTime = nextMs / 1000
  }, [])

  const changeRate = useCallback((next: Rate) => {
    setRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }, [])

  // No recording: say so, rather than render a play button that does nothing.
  if (!audioUrl) {
    return (
      <div
        className={['nola-record-audio', className ?? ''].filter(Boolean).join(' ')}
      >
        <p className="nola-caption text-muted">
          {unavailableLabel ?? t('records.audioUnavailable')}
        </p>
      </div>
    )
  }

  return (
    <div
      className={['nola-record-audio', className ?? ''].filter(Boolean).join(' ')}
    >
      {/* The playback engine itself; every control below is drawn here. */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />

      <Button
        variant="default"
        size="icon"
        disabled={isPending}
        onClick={toggle}
        aria-label={playing ? t('records.playerPause') : t('records.playerPlay')}
        className="size-10 shrink-0 rounded-full"
      >
        {isPending
          ? <LoaderCircle className="animate-spin" aria-hidden="true" />
          : playing
            ? <Pause aria-hidden="true" />
            : <Play aria-hidden="true" />}
      </Button>

      <span className="nola-mono shrink-0 text-foreground">{formatClock(positionMs)}</span>

      <SliderRoot
        className="slider min-w-0 flex-1"
        value={totalMs === 0 ? 0 : Math.min(positionMs, totalMs)}
        min={0}
        max={Math.max(totalMs, 1)}
        step={100}
        disabled={isPending || totalMs === 0}
        // Base UI reports the value in the unit the slider was given, which is the
        // millisecond the engine handed over.
        onValueChange={(next: number | readonly number[]) => seek(typeof next === 'number' ? next : (next[0] ?? 0))}
      >
        <SliderControl>
          <SliderTrack className="h-1 w-full rounded-full bg-surface-tertiary">
            <SliderIndicator className="rounded-full bg-accent" />
            <SliderThumb aria-label={t('records.columnDuration')} className="size-3 rounded-full bg-accent" />
          </SliderTrack>
        </SliderControl>
      </SliderRoot>

      <span className="nola-mono shrink-0 text-muted">{formatClock(totalMs)}</span>

      <ToggleGroup className="shrink-0" aria-label={t('homeRecordsUi.playbackRate')} value={[String(rate)]} onValueChange={([value]) => {
        const next = Number(value)
        if (RATES.includes(next as Rate)) changeRate(next as Rate)
      }}>
          {RATES.map(value => <ToggleGroupItem key={value} value={String(value)} className="tabular-nums">{value}x</ToggleGroupItem>)}

      </ToggleGroup>
    </div>
  )
}

/**
 * `HH:MM:SS` with every field zero-padded, so the width does not jump as the
 * clock ticks.
 */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number): string => value.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

