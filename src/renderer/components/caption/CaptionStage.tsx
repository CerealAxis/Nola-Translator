/**
 * 字幕区。同传进行中的主视图，**DESIGN 第 13 节原创方向 A（阅读优先）与 B（焦点跟随）的落点**。
 *
 * 为什么不用记录详情那套 `DualColumnView`：那一屏的两栏**各自独立滚动**（读者在回看历史，
 * 需要自己控制位置）；工作台的字幕区必须**实时焦点跟随**（眼睛钉在屏幕中下部，新句自己滚进来）。
 * 两种滚动行为放在一个组件里会互相打架，所以工作台有自己的 `CaptionStage`。
 *
 * 两种版式：
 * - `split` 分区对照：每句一段，两栏并排，共用 `.nola-baseline-pair` 的共享基线网格，
 *   跨中间那条 1px 分隔线逐行对齐（DESIGN 第 13.A 节，本项目与参考实现最主要的差异）。
 * - `sentence` 逐句对照：一句一块，原文在上译文在下，行宽由 `.nola-measure` 锁在 34em。
 *
 * 滚动行为：只在用户还贴在底部时自动跟随。用户往上翻看历史时**不抢滚动位置**，
 * 他滚回底部才恢复跟随（`stickToBottom`）。抢位置是实时字幕界面最招人烦的行为。
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { CaptionSegment } from '@/bridge'
import { useI18n } from '@/i18n'
import { translationErrorSummary } from '@/translation-status'

import { CaptionLine } from './CaptionLine'

export type CaptionLayout = 'split' | 'sentence'
export type CaptionDisplayMode = 'both' | 'source' | 'translation'

export interface CaptionStageProps {
  segments: readonly CaptionSegment[]
  /** 当前未确认句段。引擎总是先改写最后一句，所以同一时刻最多一条。 */
  interim: CaptionSegment | null
  layout?: CaptionLayout
  displayMode?: CaptionDisplayMode
  fontSize?: number
  /** 暂停态：整块降对比度，且不再跟随滚动。 */
  paused?: boolean
  /** 空态内容（工作台与悬浮窗给的文案不同）。 */
  emptyState?: ReactNode
  className?: string
  /** 工作台带时间列；独立浮窗继续使用紧凑字幕。 */
  showTimestamps?: boolean
}

/** 距底部多少像素以内算"还贴着底部"。32px 是一行正文的高度量级。 */
export const STICK_SLACK_PX = 32

/**
 * 是否仍贴在底部。**纯函数，独立可测。**
 *
 * 真实浏览器里 `scrollHeight - clientHeight` 才是可滚动距离；jsdom 不做布局，三个值都是 0，
 * 所以这个函数是测试里唯一能确定地断言的滚动决策点。
 */
export function isStuckToBottom(scrollTop: number, scrollHeight: number, clientHeight: number, slack = STICK_SLACK_PX): boolean {
  const distance = scrollHeight - clientHeight - scrollTop
  return distance <= slack
}

/** 已确认句段里第一条 completed 的译文。pending / failed 都返回空串：宁可这一栏空着，也不显示占位符。 */
export function translationOf(segment: CaptionSegment): string {
  return segment.translations.find((item) => item.state === 'complete')?.text ?? ''
}

/**
 * 这一栏该显示的译文：**先要真译文，没有才显示失败原因**。
 *
 * 旧工作台与旧浮窗都只画 `complete`，于是「翻译模型没装 / key 过期 / 断网」与
 * 「还在翻译」在屏幕上完全一样 —— 都是空白。空白不给用户任何可行动的信息。
 * 这里把失败原因当成译文栏的文字画出来，用户一眼就知道是配置问题还是网络问题。
 *
 * **纯函数，不碰 i18n**（传入的 `translate` 决定语言），所以独立可测。
 */
export function translationTextOf(
  segment: CaptionSegment,
  translate: (segment: CaptionSegment) => string,
): string {
  return translationOf(segment) || translate(segment)
}

export function CaptionStage({
  segments,
  interim,
  layout = 'split',
  displayMode = 'both',
  fontSize = 14,
  paused = false,
  emptyState,
  className,
  showTimestamps = false,
}: CaptionStageProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  /** 已经播过入场动效的最后一个句段 id。用 ref 而不是 state 是为了 StrictMode 双跑时不重复播。 */
  const enteredRef = useRef<string | null>(null)
  const [enteringId, setEnteringId] = useState<string | null>(null)

  const showSource = displayMode !== 'translation'
  const showTranslation = displayMode !== 'source'

  const lastId = segments.length > 0 ? segments[segments.length - 1].segmentId : null
  useEffect(() => {
    if (lastId === null || lastId === enteredRef.current) return
    enteredRef.current = lastId
    setEnteringId(lastId)
  }, [lastId])

  // 焦点跟随：新句到了就滚到底部。暂停时不滚（表停了，眼也别被拽着走）。
  useEffect(() => {
    if (paused) return
    const element = scrollRef.current
    if (!element || !stickRef.current) return
    element.scrollTop = element.scrollHeight
  }, [segments, interim, paused])

  const handleScroll = (): void => {
    const element = scrollRef.current
    if (!element) return
    stickRef.current = isStuckToBottom(element.scrollTop, element.scrollHeight, element.clientHeight)
  }

  // 句段数组加上未确认句段，就是"视线应该落在哪"的完整序列：
  // interim 在最后，因此 distance 为 0，但它走 interim 那一套静态表达，不挂指示条。
  const rows: Array<{ segment: CaptionSegment; distance: number; interim: boolean }> = []
  segments.forEach((segment, index) => {
    rows.push({ segment, distance: segments.length - 1 - index + (interim ? 1 : 0), interim: false })
  })
  if (interim) rows.push({ segment: interim, distance: 0, interim: true })

  const hasRows = rows.length > 0
  // 共享基线：--nola-baseline 必须跟随字号，否则 A+ 之后两栏的基线网格会与实际行高脱节。
  const baselineStyle = { '--nola-baseline': `${(fontSize * 1.65).toFixed(2)}px` } as CSSProperties
  /** 译文失败原因（多条失败用「；」连接）。没有失败时返回空串，译文栏就保持空白。 */
  const failureText = (segment: CaptionSegment): string => translationErrorSummary(t, segment)

  return (
    <div data-paused={paused} className={['relative flex min-h-0 min-w-0 flex-1 flex-col', className ?? ''].filter(Boolean).join(' ')}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-slot="caption-scroll"
        data-layout={layout}
        className="nola-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5"
      >
        {hasRows ? (
          <div className="mx-auto flex w-full max-w-[68em] flex-col pb-5">
            {rows.map((row) => (
              <Block
                key={`${row.segment.segmentId}-${row.interim ? 'interim' : 'final'}`}
                segment={row.segment}
                distance={row.distance}
                interim={row.interim}
                layout={layout}
                showSource={showSource}
                showTranslation={showTranslation}
                fontSize={fontSize}
                paused={paused}
                entering={enteringId === row.segment.segmentId}
                baselineStyle={baselineStyle}
                showTimestamps={showTimestamps}
                translate={failureText}
              />
            ))}
          </div>
        ) : (
          emptyState ?? null
        )}
      </div>
    </div>
  )
}

/**
 * 一个句段在当前版式下的排布。
 *
 * 分区对照时它就是 `.nola-baseline-pair` 本身（两个单元格 + 中间那条分隔线）；
 * 逐句对照时是一个上下堆叠的块，原文与译文共享同一个 `distance`，所以整句一起衰减。
 */
function Block({
  segment,
  distance,
  interim,
  layout,
  showSource,
  showTranslation,
  fontSize,
  paused,
  entering,
  baselineStyle,
  showTimestamps,
  translate,
}: {
  segment: CaptionSegment
  distance: number
  interim: boolean
  layout: CaptionLayout
  showSource: boolean
  showTranslation: boolean
  fontSize: number
  paused: boolean
  entering: boolean
  baselineStyle: CSSProperties
  showTimestamps: boolean
  translate: (segment: CaptionSegment) => string
}) {
  const translation = translationTextOf(segment, translate)

  if (layout === 'split') {
    return (
      <div className="nola-baseline-pair nola-baseline-row py-1" data-bilingual={showSource && showTranslation} data-latest={distance === 0} style={baselineStyle}>
        {showTimestamps ? <time className="nola-caption-timestamp">{captionTime(segment.startedAtMs)}</time> : null}
        {showSource ? (
          <CaptionLine
            kind="source"
            text={segment.sourceText}
            distance={distance}
            interim={interim}
            fontSize={fontSize}
            paused={paused}
            entering={entering}
            data-testid={`caption-source-${segment.segmentId}`}
          />
        ) : null}
        {showTranslation ? (
          <CaptionLine
            kind="translation"
            text={translation}
            distance={distance}
            interim={interim}
            fontSize={fontSize}
            paused={paused}
            entering={entering}
            data-testid={`caption-target-${segment.segmentId}`}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="nola-caption-sentence flex flex-col gap-1 py-2" data-latest={distance === 0}>
      {showTimestamps ? <time className="nola-caption-timestamp">{captionTime(segment.startedAtMs)}</time> : null}
      {showSource ? (
        <CaptionLine
          kind="source"
          text={segment.sourceText}
          distance={distance}
          interim={interim}
          fontSize={fontSize}
          paused={paused}
          entering={entering}
          className="nola-measure"
          data-testid={`caption-source-${segment.segmentId}`}
        />
      ) : null}
      {showTranslation ? (
        <CaptionLine
          kind="translation"
          text={translation}
          distance={distance}
          interim={interim}
          fontSize={fontSize}
          paused={paused}
          entering={entering}
          className="nola-measure"
          data-testid={`caption-target-${segment.segmentId}`}
        />
      ) : null}
    </div>
  )
}

function captionTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
