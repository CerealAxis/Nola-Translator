/**
 * 会话底栏：计时器 + 暂停 / 继续 + 结束同传。
 *
 * 计时器是 **DESIGN 第 13 节原创方向 C（时间即材料）** 的落点，三条决定都在这一个文件里：
 *
 * 1. **等宽数位**（`.nola-mono .nola-num`）：每秒跳的数字宽度必须不变，否则整条底栏在左右抽动。
 *    标签用 `<time dateTime>`，让"这是一个时间量"留在 DOM 里，导出与朗读都拿得到。
 * 2. **极轻微的呼吸**：`.nola-tick` 是 400ms 的 `opacity 0.85 ↔ 1.0` 无限交替。
 *    不是缩放（缩放会让数字跳大小），不是颜色跳变（深色底上刺眼）。
 * 3. **暂停即信息**：暂停时数字转 `--muted` **并且停止呼吸**。CSS 里 `.nola-tick[data-paused='true']`
 *    是 `animation: none`，所以这里只要把 `data-paused` 写对，"它停了"这件事就同时被两处表达
 *    （颜色降一档 + 不再呼吸），用户不用读数字就知道表停了。
 *
 * 呼吸的周期是 400ms，而计时器每秒跳一次，所以呼吸与跳数并不同步：这是故意的。
 * 让呼吸周期等于 1s 会让"跳数"和"变淡"叠成一个周期运动，读起来像在闪。
 */

import { Button, Tooltip } from '@heroui/react'
import { CircleStop, Mic, Pause, Play } from 'lucide-react'

import type { SessionStatus } from '@/bridge'
import { useI18n } from '@/i18n'

/**
 * 把毫秒格式化成计时器读数。**纯函数，独立可测。**
 *
 * 小时位不补零（DESIGN 第 13.C 节）：`0:07:03` 与 `7:03` 的宽度差由外层的 `min-w-[10ch]`
 * 与等宽数位吸收，不靠补零去凑宽度。秒位永远两位，因为秒是跳得最勤的一位。
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

/** `dateTime` 属性用 ISO 8601 时长，语义比 `HH:MM:SS` 干净。 */
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
  /** 会话还没开（idle）：只留计时器，按钮不出现。 */
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
        // 呼吸只在 running 时挂。其余状态一律写 data-paused="true"，CSS 的
        // `.nola-tick[data-paused='true'] { animation: none }` 就会把动画摘掉：
        // 表还没开始走（idle / starting）或正在收尾（stopping），动的数字没有含义。
        // 暂停时同时把字色降为 --muted —— "停止本身就是信息"，用户不用读数字就知道表停了。
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
      <span className="nola-workspace-record-hint">{t('workspaceUi.localRecord')}</span>
    </footer>
  )
}
