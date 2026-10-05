/**
 * Transport bar under the record detail page.
 *
 * The scrubber is a `Slider`, not a `ProgressBar`, which is for waiting and cannot be
 * dragged. The native `<audio>` element is the engine only — the controls are drawn
 * here, since native chrome ignores our surface tokens.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@heroui/react'
import type { Selection } from '@react-types/shared'
import { Pause, Play } from 'lucide-react'

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
  const [playing, setPlaying] = useState(false)
  const [positionMs, setPositionMs] = useState(0)
  const [totalMs, setTotalMs] = useState(durationMs ?? 0)
  const [rate, setRate] = useState<Rate>(1)

  // A new URL resets the bar, or the previous meeting's position carries over.
  useEffect(() => {
    setPlaying(false)
    setPositionMs(0)
    setTotalMs(durationMs ?? 0)
  }, [audioUrl, durationMs])

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

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
    }
  }, [onTimeChange])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    if (audio.paused) {
      void audio.play().then(
        () => setPlaying(true),
        // Autoplay policy can refuse: the UI falls back to paused rather than pretending.
        () => setPlaying(false),
      )
    } else {
      audio.pause()
      setPlaying(false)
    }
  }, [audioUrl])

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
        <Typography className="nola-caption text-muted">
          {unavailableLabel ?? t('records.audioUnavailable')}
        </Typography>
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
        variant="primary"
        isIconOnly
        isPending={isPending}
        isDisabled={isPending}
        onPress={toggle}
        aria-label={playing ? t('records.playerPause') : t('records.playerPlay')}
        className="size-10 shrink-0 rounded-full"
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>

      <span className="nola-mono shrink-0 text-foreground">{formatClock(positionMs)}</span>

      <Slider
        value={totalMs === 0 ? 0 : Math.min(positionMs, totalMs)}
        minValue={0}
        maxValue={Math.max(totalMs, 1)}
        step={100}
        isDisabled={isPending || totalMs === 0}
        // react-aria's onChange takes `number | number[]`; a single-value Slider sends a
        // number, and taking the first entry also covers a range Slider.
        onChange={(next: number | number[]) => seek(Array.isArray(next) ? (next[0] ?? 0) : next)}
        aria-label={t('records.columnDuration')}
        className="min-w-0 flex-1"
      >
        <Slider.Track className="h-1 rounded-full bg-surface-tertiary">
          <Slider.Fill className="rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb className="size-3 rounded-full bg-accent" />
      </Slider>

      <span className="nola-mono shrink-0 text-muted">{formatClock(totalMs)}</span>

      <ToggleButtonGroup
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[String(rate)]}
        // A react-aria segmented control reports selection, not change.
        onSelectionChange={(keys: Selection) => {
          const first = keys === 'all' ? null : Array.from(keys)[0] ?? null
          if (first === null) return
          const next = Number(first)
          if (RATES.includes(next as Rate)) changeRate(next as Rate)
        }}
        size="sm"
        aria-label={t('homeRecordsUi.playbackRate')}
        className="shrink-0"
      >
        {RATES.map((value) => (
          <ToggleButton
            key={value}
            // In a segmented control the `id` is the key it is selected by.
            id={String(value)}
            className="rounded-[10px] text-[12.5px] leading-[1.5] font-normal tabular-nums"
          >
            {value}x
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
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

