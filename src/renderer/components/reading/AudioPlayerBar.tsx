/**
 * 播放条。记录详情页底部，64px 高。
 *
 * ============================ 为什么它是台账组件 ============================
 * DESIGN 第 11.2 节第 11 条：播放条要"可拖动进度（Slider）+ 倍速（ToggleButtonGroup）
 * + 跟随滚动"，这个组合 HeroUI 没有对应物。
 *
 * **进度条不使用 `ProgressBar`**：那是给"有进度值的等待"用的，不可拖动。
 * 可拖动的播放进度必须用 `Slider`（DESIGN 第 6.10 节）。
 *
 * **不用原生 audio 控件**：原生控件是浏览器外观，无法压进我们的表面色阶，
 * 且不可访问性差。这里用一个隐藏的 `<audio>` 只做播放引擎，界面全部自绘。
 *
 * 归属：记录详情页。工作台那一侧不共用这个组件（那边没有回放）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@heroui/react'
import type { Selection } from '@react-types/shared'
import { Pause, Play } from 'lucide-react'

import { useI18n } from '@/i18n'

/** 倍速档位。DESIGN 第 6.10 节：0.5x / 1x / 1.5x / 2x。 */
const RATES = [0.5, 1, 1.5, 2] as const
type Rate = (typeof RATES)[number]

export interface AudioPlayerBarProps {
  /** 引擎给的音频地址。null 表示这场没录音。 */
  audioUrl: string | null
  /** 已知总时长（ms）。没有也能用，等 `<audio>` 自己读出 metadata。 */
  durationMs?: number | null
  /** 音频地址还在取。true 时播放键是 pending 且不可点。 */
  isPending?: boolean
  /** 没有录音时的替代文案，调用方传 `t(...)` 的结果。 */
  unavailableLabel?: string
  /** 进度变化回调，详情页用它把播放头同步给双栏。 */
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

  // 地址换了就复位：否则上一场的进度会带到下一场。
  useEffect(() => {
    setPlaying(false)
    setPositionMs(0)
    setTotalMs(durationMs ?? 0)
  }, [audioUrl, durationMs])

  // 播放状态由元素事件驱动，界面只是它的投影。
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
        // 自动播放策略可能拒绝：界面回到"暂停"态，不假装在放。
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

  // 没录音：给一句说明，不画一个点了没反应的播放键。
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
      {/* 播放引擎。display:none 会让部分浏览器暂停，这里用视觉隐藏而不是隐藏。 */}
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
        // react-aria 的 onChange 收 `number | number[]`：单值 Slider 传 number，
        // 保险起见取第一个（多个值只会在 range Slider 上出现）。
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
        // react-aria 的分段控件用 onSelectionChange（收 Selection）而不是 onChange。
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
            // 分段控件里 `id` 就是它在 selectedKeys 里的键。
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
 * `00:00:00` 形式。小时位不补零（DESIGN 第 13.C 节：补零会避免宽度跳变是反的，
 * 实际上定宽反而更稳，所以这里按播放条规格固定三段）。
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

