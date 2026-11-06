/**
 * The session bar: timer plus pause / resume and end.
 *
 * The timer needs monospaced digits (`.nola-mono .nola-num`): a per-second digit
 * whose width changes makes the whole bar twitch. `<time dateTime>` keeps the
 * reading a duration in the DOM, where export and screen readers can use it.
 *
 * `.nola-tick` is a 400ms `opacity 0.85 <-> 1.0` alternate, not a scale (which
 * would make the digits jump size) and not a colour change (harsh on a dark bar).
 */

import { Button } from '@/components/ui/button'
import { CircleStop, Mic, Pause, Play } from 'lucide-react'

import type { SessionStatus } from '@/bridge'
import { useI18n } from '@/i18n'
import { Spinner } from '@/components/ui/spinner'

/**
 * Milliseconds to the timer reading.
 *
 * Hours are not zero-padded: the width difference between `0:07:03` and `7:03`
 * is absorbed by the outer `min-w-[10ch]` and the monospaced digits. Seconds
 * are always two digits, being the one that changes most often.
 */
export function formatElapsed(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0
  const totalSeconds = Math.floor(safe / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** `dateTime` takes an ISO 8601 duration, which is cleaner than `HH:MM:SS`. */
export function isoDuration(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0
  const totalSeconds = Math.floor(safe / 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `PT${Math.floor(totalSeconds / 3600)}H${pad(Math.floor(totalSeconds / 60) % 60)}M${pad(totalSeconds % 60)}S`
}

export interface SessionBarProps {
  status: SessionStatus
  pausePending?: boolean
  elapsedMs: number
  onPause: () => void
  onResume: () => void
  onStop: () => void
  className?: string
  audioLabel?: string
  playbackPhase?: 'waiting' | 'synthesizing' | 'playing' | 'idle' | 'failed'
  waitingSpeechCount?: number
  playbackJob?: { jobId: string; state: 'failed' | 'unknown' }
  onResolvePlayback?: (jobId: string, action: 'retry' | 'skip') => void
}

export function SessionBar({ status, pausePending, elapsedMs, onPause, onResume, onStop, className, audioLabel, playbackPhase, waitingSpeechCount, playbackJob, onResolvePlayback }: SessionBarProps) {
  const { t } = useI18n()
  const playbackCopy = playbackPhase === 'waiting' ? 'session.playbackWaiting'
    : playbackPhase === 'synthesizing' ? 'session.playbackSynthesizing'
      : playbackPhase === 'playing' ? 'session.playbackPlaying'
        : playbackPhase === 'failed' ? 'session.playbackFailed' : null
  const running = status === 'running'
  const paused = status === 'paused'
  const busy = pausePending || status === 'starting' || status === 'stopping'

  return (
    <footer
      data-slot="session-bar"
      className={['nola-workspace-session-bar', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {audioLabel ? <div className="nola-workspace-audio-status"><span className="nola-workspace-mic"><Mic aria-hidden="true" /></span><span>{audioLabel}</span></div> : null}
      {playbackCopy ? <span className="nola-caption text-muted" aria-live="polite">{t(playbackCopy)}{waitingSpeechCount ? ` · ${t('session.playbackQueueCount', { count: waitingSpeechCount })}` : ''}</span> : null}
      {playbackJob && onResolvePlayback ? <div className="flex shrink-0 items-center gap-1">
        {playbackJob.state === 'failed' ? <Button variant="secondary" size="sm" className="rounded-xl" disabled={busy} onClick={() => onResolvePlayback(playbackJob.jobId, 'retry')}>{t('session.retryPlayback')}</Button> : null}
        <Button variant="outline" size="sm" className="rounded-xl" disabled={busy} onClick={() => onResolvePlayback(playbackJob.jobId, 'skip')}>{t('session.skipPlayback')}</Button>
      </div> : null}
      <time
        dateTime={isoDuration(elapsedMs)}
        data-slot="session-timer"
        // Every state other than `running` gets data-paused, which the CSS turns
        // into `animation: none`. A timer that has not started (idle, starting)
        // or is winding down (stopping) has nothing to animate, and the dimmed
        // colour says "stopped" without reading the digits.
        data-paused={running ? undefined : 'true'}
        className={[
          'nola-mono nola-num nola-tick min-w-[10ch] text-[14px] leading-none font-medium',
          running ? 'text-foreground' : 'text-muted',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {formatElapsed(elapsedMs)}
      </time>

      <div className="nola-workspace-bar-spacer" />

      <div className="flex shrink-0 items-center gap-2">
        {paused ? (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={onResume} disabled={busy} title={t('workspace.resume')}>
            {pausePending ? <Spinner /> : <Play aria-hidden="true" />}
            {t('workspace.resume')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={onPause}
            disabled={!running || busy}
            title={t('workspace.pause')}
          >
            {pausePending ? <Spinner /> : <Pause aria-hidden="true" />}
            {t('workspace.pause')}
          </Button>
        )}

        <Button
          variant="danger"
          size="sm"
          className="rounded-xl"
          onClick={onStop}
          disabled={busy}
          title={t('workspace.endConfirm')}
        >
          <CircleStop aria-hidden="true" />
          {status === 'stopping' ? t('workspace.stopping') : t('workspace.stop')}
        </Button>
      </div>
    </footer>
  )
}
