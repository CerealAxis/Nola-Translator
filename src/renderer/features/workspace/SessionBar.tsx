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

import { Button, Tooltip } from '@heroui/react'
import { CircleStop, Mic, Pause, Play } from 'lucide-react'

import type { SessionStatus } from '@/bridge'
import { useI18n } from '@/i18n'

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
  elapsedMs: number
  onPause: () => void
  onResume: () => void
  onStop: () => void
  /** No session yet: the timer stays and the controls are hidden. */
  showControls?: boolean
  className?: string
  audioLabel?: string
}

export function SessionBar({ status, elapsedMs, onPause, onResume, onStop, showControls = true, className, audioLabel }: SessionBarProps) {
  const { t } = useI18n()
  const running = status === 'running'
  const paused = status === 'paused'
  const busy = status === 'starting' || status === 'stopping'

  return (
    <footer
      data-slot="session-bar"
      className={['nola-workspace-session-bar', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {audioLabel ? <div className="nola-workspace-audio-status"><span className="nola-workspace-mic"><Mic aria-hidden="true" /></span><span>{audioLabel}</span></div> : null}
      <div className="nola-workspace-wave" title={t('workspaceUi.noLevel')} aria-hidden="true">
        {[8, 12, 8, 16, 24, 16, 30, 38, 24, 18, 30, 20, 34, 42, 32, 20, 24, 36, 28, 16, 24, 18, 26, 32, 16, 12, 18, 24, 12, 16, 8, 12].map((height, index) => <span key={index} style={{ height }} />)}
      </div>
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

      {showControls ? (
        <div className="flex shrink-0 items-center gap-2">
          {paused ? (
            <Tooltip delay={1500}>
              <Button variant="outline" size="sm" className="rounded-xl" onPress={onResume} isDisabled={busy}>
                <Play aria-hidden="true" />
                {t('workspace.resume')}
              </Button>
              <Tooltip.Content>
                <p className="nola-caption">{t('workspace.resume')}</p>
              </Tooltip.Content>
            </Tooltip>
          ) : (
            <Tooltip delay={1500}>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onPress={onPause}
                isDisabled={!running || busy}
              >
                <Pause aria-hidden="true" />
                {t('workspace.pause')}
              </Button>
              <Tooltip.Content>
                <p className="nola-caption">{t('workspace.pause')}</p>
              </Tooltip.Content>
            </Tooltip>
          )}

          <Tooltip delay={1500}>
            <Button
              variant="danger-soft"
              size="sm"
              className="rounded-xl"
              onPress={onStop}
              isDisabled={busy}
              isPending={status === 'stopping'}
            >
              <CircleStop aria-hidden="true" />
              {status === 'stopping' ? t('workspace.stopping') : t('workspace.stop')}
            </Button>
            <Tooltip.Content>
              <p className="nola-caption">{t('workspace.endConfirm')}</p>
            </Tooltip.Content>
          </Tooltip>
        </div>
      ) : null}
    </footer>
  )
}
