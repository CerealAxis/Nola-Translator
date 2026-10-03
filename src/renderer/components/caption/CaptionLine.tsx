/**
 * 字幕单行。**DESIGN 第 13 节原创方向 B（焦点跟随）的落点。**
 *
 * 一个组件只渲染"一行文字"（原文或译文），不渲染行对、不渲染网格、不管滚动：
 * 分区对照与逐句对照两种版式由 `CaptionStage` 组装，行内这一层只负责三件事：
 *
 * 1. **焦点连续衰减。** `lineOpacity(distance) = Math.max(0.42, 1 - 0.11 * distance)`。
 *    这是一个**连续函数**，不是三档查表：`distance` 是整数行数，所以相邻两行的差值恒为
 *    0.11，视觉上是一条均匀的斜坡。任何"最近 3 行 / 更早"的分档实现都会在第 3 行与第 4 行
 *    之间留下一个可见的台阶，读者会注意到台阶本身而不是文字。
 * 2. **当前行的 2px accent 指示条。** 只给 `distance === 0` 的 **final** 行；
 *    interim 行不挂指示条，因为"还没确认"和"正在说"是两件事。
 * 3. **interim 与 final 的区分靠静态属性，不靠动画。** interim 用 `--muted` 字色加一次
 *    额外降透明。引擎每 100 到 200ms 修订一次 interim，闪烁等于每秒 5 到 10 次的高频噪声，
 *    两三小时的会议里会引发明显疲劳。所以这一行**不挂任何入场动效类**。
 *
 * 行宽：逐句对照下由 `.nola-measure` 锁在 34em（14px 下约 34 个汉字），
 * 分区对照下由 `CaptionStage` 的两栏网格锁同一档，两种版式的行长因此一致。
 */

import type { CSSProperties } from 'react'

/** 衰减下限。再往前的行不再继续变淡，否则会掉到不可读。 */
export const FOCUS_FLOOR = 0.42
/** 每远离当前行一档，opacity 减多少。0.11 是 14px 正文在白底上仍可读的梯度。 */
export const FOCUS_DECAY = 0.11
/** interim 在焦点衰减之外的额外降透明。与字色一起构成"未确认"的静态表达。 */
export const INTERIM_FADE = 0.72
/**
 * 暂停时整块字幕区的降对比度系数。
 *
 * 放在这里而不是 `CaptionStage`，是为了让"行内降一档"和"整块降一档"这两个乘数写在同一处，
 * 读代码的人一眼能算出最坏情况的对比度（0.42 × 0.72 × 0.8 ≈ 0.24）。
 */
export const PAUSED_DIM = 0.8

/** 译文比原文低一档，用色阶而不是字号表达主次（字号差在两栏并排时会放大行高差）。 */
const TRANSLATION_COLOR = 'color-mix(in oklab, var(--foreground) 88%, var(--muted))'

export type CaptionLineKind = 'source' | 'translation'

export interface CaptionLineProps {
  /** 距离当前焦点行几行。0 是"正在说的那句"。负数与非有限值都按 0 处理。 */
  distance: number
  /** 未确认句段。改用 muted 字色 + 额外降透明，且不播入场动效。 */
  interim?: boolean
  kind?: CaptionLineKind
  text: string
  /** 字号，默认 14px（阅读优先的正文档）。 */
  fontSize?: number
  /** 行高固定 1.65，不随字号缩放，理由见 DESIGN 第 3.2 节。 */
  lineHeight?: number
  /** 新行入场。整段会议里最常播的动效，因此由调用方只在**刚追加**的那一行传 true。 */
  entering?: boolean
  /** 暂停时整块字幕区降对比度，这里再乘一档（见 `CaptionStage` 的 `PAUSED_DIM`）。 */
  paused?: boolean
  className?: string
  'data-testid'?: string
}

/**
 * 焦点衰减曲线。**纯函数，独立可测**。
 *
 * `distance <= 0` 一律返回 1：调用方传 0 表示"当前行"，传负数是 bug，这里兜住而不是让
 * opacity 变成 1.11（大于 1 会被浏览器截断成 1，但说明输入没被校验）。
 */
export function lineOpacity(distance: number): number {
  const steps = Number.isFinite(distance) && distance > 0 ? distance : 0
  return Math.max(FOCUS_FLOOR, 1 - FOCUS_DECAY * steps)
}

export function CaptionLine({
  distance,
  interim = false,
  kind = 'source',
  text,
  fontSize = 14,
  lineHeight = 1.65,
  entering = false,
  paused = false,
  className,
  'data-testid': testId,
}: CaptionLineProps) {
  const current = distance <= 0 && !interim
  const opacity = lineOpacity(distance) * (interim ? INTERIM_FADE : 1)

  const style: CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight,
    opacity: paused ? opacity * PAUSED_DIM : opacity,
    // interim 是唯一会换字色的一态。final 的两级对比度由上面那个 opacity 斜坡承担。
    color: interim ? 'var(--muted)' : kind === 'translation' ? TRANSLATION_COLOR : 'var(--foreground)',
  }

  return (
    <p
      data-slot="caption-line"
      data-kind={kind}
      data-current={current ? 'true' : 'false'}
      data-interim={interim ? 'true' : 'false'}
      data-testid={testId}
      // 12px 的左槽是给指示条留的：指示条贴在槽里，不压住文字的第一笔。
      // `entering && !interim` 是硬条件：interim 每次修订都要重挂一次 CSS 动画，
      // 120ms 的 opacity + 位移会被引擎的 100 到 200ms 修订节奏打成高频抖动。
      className={[
        'relative my-0 min-w-0 flex-1 pl-3',
        entering && !interim ? 'nola-caption-enter' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {current ? <span className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent" aria-hidden="true" /> : null}
      {text}
    </p>
  )
}
