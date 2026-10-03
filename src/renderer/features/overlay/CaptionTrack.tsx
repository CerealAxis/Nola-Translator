/**
 * 一条字幕轨道。**从主仓 `src/renderer/overlay/CaptionTrack.tsx` 逐字移植**（只改了
 * class 名与 CSS 变量名以对齐本项目的 `nola-` 约定，几何与动效一字未动）。
 *
 * 两种排版模式：
 *   · `rolling`（主仓叫"分区对照"）——所有句子折成**一条连续文本流**，从顶部填满后
 *     继续向上滚。只放得下一行的轨道，每来一次修订就把那一行滑出去；更高的轨道则
 *     在文本块超出可视高度时自然丢掉顶部的行。
 *   · `sentence`（主仓叫"逐句对照"）——每句各自成块，新句把上一句往下推，轨道不滚。
 *
 * 折叠逻辑（`mergeLine`）是这个组件的实质：引擎对同一句话会连续修订若干次，若每次
 * 都追加一段，字幕就会一遍遍重复自己。判定分三种：
 *   1. 同一个 segmentId → 就地替换（修订）
 *   2. 换了 id 但开头 16 字以上相同、长度差不超过一半 → 也是修订（引擎偶尔换 id 重发）
 *   3. 其余 → 下一句，只追加它**没有重复说**的那部分
 */

import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export type TrackLine = { key: string; text: string }

/** 已经滚出视口很远、留着只会让 DOM 无限增长的句子，攒够就从头丢。 */
const MAX_ENTRIES = 40

/*
 * CJK 与全角标点。用 `\uXXXX` 转义而不是直接写字符：`scripts/check-guardrails.mjs`
 * 的 `no-hardcoded-cjk` 判的是"组件里有没有中文字面量"，字面量写出来的字符类会
 * 被它当成界面文案报错。转义之后正则语义一模一样。
 */
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/

/** 屏幕上那句话的修订，开头总是一样；下一句则不会。 */
const MIN_REVISION_PREFIX = 16
/** 跨句的修订长度相近；真正的新句子没有这种牵连。 */
const REVISION_LENGTH_RATIO = 0.5
/** 相邻两句最多只共用这么长的一段接缝，所以搜索范围有界。 */
const MAX_SEAM = 160

function sharedPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let size = 0
  while (size < max && a.charCodeAt(size) === b.charCodeAt(size)) size += 1
  return size
}

function seamOverlap(previous: string, next: string): number {
  const max = Math.min(previous.length, next.length, MAX_SEAM)
  for (let size = max; size > 0; size -= 1) {
    if (previous.endsWith(next.slice(0, size))) return size
  }
  return 0
}

/**
 * 把一句折进文本流。详见文件头。
 */
function mergeLine(stream: TrackLine[], line: TrackLine): TrackLine[] {
  const last = stream[stream.length - 1]
  if (!last) return [line]
  const prefix = sharedPrefix(last.text, line.text)
  const lengthGap = Math.abs(last.text.length - line.text.length) / Math.max(last.text.length, line.text.length)
  const revises = last.key === line.key
    || (prefix >= MIN_REVISION_PREFIX && lengthGap <= REVISION_LENGTH_RATIO)
  if (revises) {
    if (last.key === line.key && last.text === line.text) return stream
    return [...stream.slice(0, -1), { key: line.key, text: line.text }]
  }
  /*
   * 切点落在接缝中间，所以剩下的部分通常以空白开头，而渲染层会在接缝处自己插一个
   * 分隔符 —— 不去掉这个空白，每个句子的边界都会显示成两个空格。
   */
  const fresh = line.text.slice(seamOverlap(last.text, line.text)).trim()
  if (!fresh) return stream
  return [...stream, { key: line.key, text: fresh }].slice(-MAX_ENTRIES)
}

/** 句子连成一段；只有拉丁文字需要在接缝处补空格。 */
function seamNeedsSpace(previous: string, next: string): boolean {
  return !(CJK.test(previous.slice(-1)) && CJK.test(next.slice(0, 1)))
}

export function CaptionTrack({
  line,
  kind,
  maxLines,
  layout,
}: {
  line: TrackLine | null
  kind: 'source' | 'translation'
  maxLines: number
  layout: 'rolling' | 'sentence'
}) {
  const [entries, setEntries] = useState<TrackLine[]>([])
  const [offset, setOffset] = useState(0)
  const stream = useRef<TrackLine[]>([])
  const viewport = useRef<HTMLDivElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)

  const key = line?.key ?? null
  const text = line?.text ?? null
  const commit = (next: TrackLine[]): void => {
    stream.current = next
    setEntries(next)
  }
  /*
   * `mergeLine` 不是幂等的 —— 它会把它去重后的切片挂在**传入那句**的 key 下，所以拿
   * 同一份输入再折一次，会把那条读成"自己的修订"而把接缝刚去掉的那段又还原回来。
   * 记住上一次折进去的输入，折叠就对 React 重复调用免疫。
   */
  const folded = useRef<{ key: string; text: string } | null>(null)
  // 在渲染期间就地调整：一串修订里 React 重跑多少次，中间态都不会被画出来。
  if (key && text && (folded.current?.key !== key || folded.current.text !== text)) {
    folded.current = { key, text }
    const next = mergeLine(stream.current, { key, text })
    if (next !== stream.current) commit(next)
  }

  useLayoutEffect(() => {
    // 从**未经变换**的文本块量：文本块一滚起来 scrollHeight 就跟着缩了。
    const measure = (): void => {
      const box = viewport.current
      if (!box) return
      if (layout === 'sentence') {
        /*
         * 逐句模式每条一块装在 `overflow: auto` 的流里，CSS 又把它的 transform 钉成
         * `none`，所以露出最新一句的唯一办法就是滚动。这里是程序化滚动，所以卡片
         * 处于 `-webkit-app-region: drag` 区域时依然有效。
         */
        box.scrollTop = box.scrollHeight
        return
      }
      const next = Math.max(0, (content.current?.offsetHeight ?? 0) - box.clientHeight)
      setOffset((current) => Math.abs(current - next) < 0.5 ? current : next)
    }
    measure()
    const block = content.current
    const observer = typeof ResizeObserver === 'undefined' || !block ? null : new ResizeObserver(measure)
    if (observer && block) observer.observe(block)
    return () => observer?.disconnect()
  }, [entries, maxLines, layout])

  if (layout === 'sentence') {
    return (
      <div
        data-slot="caption-track"
        data-kind={kind}
        data-layout="sentence"
        className="nola-caption-track"
        style={{ '--nola-overlay-visible-lines': maxLines } as CSSProperties}
        aria-live="polite"
      >
        <div className="nola-caption-track-flow nola-caption-track-sentence" ref={viewport}>
          <div className="nola-caption-track-content" ref={content}>
            {entries.map((entry) => <p className="nola-caption-entry" key={entry.key}>{entry.text}</p>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-slot="caption-track"
      data-kind={kind}
      data-layout="rolling"
      data-rolling={offset > 0}
      className="nola-caption-track"
      style={{ '--nola-overlay-visible-lines': maxLines } as CSSProperties}
    >
      <div className="nola-caption-track-flow" ref={viewport}>
        <div
          className="nola-caption-track-content"
          ref={content}
          style={{ transform: offset > 0 ? `translate3d(0, -${offset}px, 0)` : 'none' }}
        >
          {/*
           * 每句在整段文字里仍是自己那个节点，所以文本照样能换行、照样作为一个块上滚。
           * `aria-atomic` 为 false 时，读屏只念发生变化的那个节点而不是整段，所以一次
           * 修订只念正在被改的那一句，字幕也就没必要镜像到第二个节点里。
           */}
          <p className="nola-caption-entry" aria-live="polite" aria-atomic="false">
            {entries.flatMap((entry, index) => [
              index > 0 && seamNeedsSpace(entries[index - 1].text, entry.text) ? ' ' : null,
              <span className="nola-caption-segment" key={entry.key}>{entry.text}</span>,
            ])}
          </p>
        </div>
      </div>
    </div>
  )
}
