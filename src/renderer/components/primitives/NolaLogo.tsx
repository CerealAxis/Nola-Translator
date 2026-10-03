/**
 * 品牌 logo，内联 SVG（不引图片资源，也不引图标库）。
 *
 * 形状：蓝色圆角方 + 白色 N + 薄荷色短竖。渐变 `#168BD9 -> #2255C7` 是 DESIGN 第 2.5 节的
 * 品牌锚点，**薄荷色 `#97F0DA` 只允许出现在这个文件里**，不得作为界面色。
 *
 * 注意 logo 用的是品牌渐变而不是界面强调色 `--accent (#1268d0)`：logo 是品牌物，
 * 界面色是可访问性推导出来的，两者刻意不同。
 */

import { useId } from 'react'
import type { CSSProperties } from 'react'

export interface NolaLogoProps {
  /** 边长，px。默认 24（标题栏规格）。传 0 或负数没有意义，直接夹到 8 到 96。 */
  size?: number
  className?: string
  /**
   * 去掉渐变，用 `currentColor` 实心填充。单色场景（例如印在深色玻璃上）用这个。
   */
  monochrome?: boolean
  /** 无障碍标签。传 null 表示纯装饰（旁边已经有文字时）。 */
  title?: string | null
}

const MIN_SIZE = 8
const MAX_SIZE = 96

export function NolaLogo({ size = 24, className, monochrome = false, title = null }: NolaLogoProps) {
  // 多个 logo 同屏时渐变 id 必须唯一，否则第二个会抢第一个的渐变。
  const gradientId = useId()
  const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size))

  // viewBox 固定 32，尺寸只改外框，形状永远等比。
  const style: CSSProperties = { width: clamped, height: clamped }

  return (
    <svg
      viewBox="0 0 32 32"
      style={style}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title ?? undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#168BD9" />
          <stop offset="1" stopColor="#2255C7" />
        </linearGradient>
      </defs>
      <rect
        width="32"
        height="32"
        rx="8"
        fill={monochrome ? 'currentColor' : `url(#${gradientId})`}
      />
      {/* 白色 N：一竖、斜、一竖，stroke 而不是填充，小尺寸下不会糊。 */}
      <path
        d="M9 23V9l7 14V9"
        fill="none"
        stroke={monochrome ? 'var(--nola-logo-knockout, #ffffff)' : '#FFFFFF'}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 薄荷色短竖：品牌点缀，只在这里出现。 */}
      <path
        d="M23 9.5V17"
        fill="none"
        stroke={monochrome ? 'var(--nola-logo-knockout, #ffffff)' : '#97F0DA'}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
