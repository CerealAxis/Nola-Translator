/**
 * 状态胶囊。`r-pill` + `t-micro`，只表达状态，**不承载动作**。
 *
 * 为什么不用 Chip 直接交付：`.chip` 的语义是可点击可移除的标签，内建圆角
 * `rounded-2xl`（`--radius` 为 6px 时是 12px）、内建 `text-xs font-medium`，
 * 三样都与 DESIGN 第 6.4 节（20px 高 / 11px / 400 / 9999px）不符。所以这里组合
 * HeroUI `Chip` 保留它的颜色 token 机制，用 utilities 层的工具类把几何与字阶压回规格。
 *
 * 需要点击进入某个状态时用 `Button variant="tertiary" size="sm"`，不要给胶囊加 onPress。
 */

import type { ReactNode } from 'react'
import { Chip } from '@heroui/react'

/**
 * 状态色。`neutral` 是"没有状态"（未开始、引擎未连接），用透明底 + 1px 发丝线，
 * 与四种彩色胶囊在视觉上明确分层。
 */
export type StatusPillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export type StatusPillSize = 'sm' | 'md'

export interface StatusPillProps {
  /** 可见文案。调用方传 `t(...)` 的结果，组件内不写字面量。 */
  label: ReactNode
  tone?: StatusPillTone
  size?: StatusPillSize
  /** 左侧状态点。默认 true。 */
  dot?: boolean
  /**
   * 状态点在动（呼吸）。稳定态传 false，"稳定态不需要动"。
   * 内部用 `.nola-live-dot`，配 `data-paused` 摘掉动画，减少动效时也由 CSS 统一关。
   */
  live?: boolean
  className?: string
}

const CHIP_COLOR: Record<StatusPillTone, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  neutral: 'default',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

const CHIP_VARIANT: Record<StatusPillTone, 'tertiary' | 'soft'> = {
  neutral: 'tertiary',
  accent: 'soft',
  success: 'soft',
  warning: 'soft',
  danger: 'soft',
}

const DOT_COLOR: Record<StatusPillTone, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const SIZE_CLASS: Record<StatusPillSize, string> = {
  sm: 'h-5 px-2',
  md: 'h-6 px-3',
}

export function StatusPill({
  label,
  tone = 'neutral',
  size = 'sm',
  dot = true,
  live = false,
  className,
}: StatusPillProps) {
  return (
    <Chip
      color={CHIP_COLOR[tone]}
      variant={CHIP_VARIANT[tone]}
      // rounded-pill 压回 HeroUI 的 rounded-2xl；text-[11px]/leading/normalize/font-normal
      // 压回 `.chip` 自带的 text-xs font-medium（它在 components 层，必须用 utilities 层的
      // 任意值工具类才能赢过 base 层的 .nola-micro）。
      className={[
        'shrink-0 items-center gap-1 rounded-full',
        SIZE_CLASS[size],
        'text-[11px] leading-[1.45] font-normal',
        tone === 'neutral' ? 'border border-border' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? (
        <span
          data-paused={live ? undefined : 'true'}
          className={['size-1.5 shrink-0 rounded-full', DOT_COLOR[tone], live ? 'nola-live-dot' : '']
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}
      <span className="whitespace-nowrap">{label}</span>
    </Chip>
  )
}
