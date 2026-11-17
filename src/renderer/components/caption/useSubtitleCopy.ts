import { useEffect, type RefObject } from 'react'
import type { SubtitleCopySpan } from '../../../shared/subtitle-word-rules'

export function subtitleCopySlice(spans: readonly SubtitleCopySpan[], start: number, end: number) {
  return spans
    .filter((span) => span.end > start && span.start < end)
    .map((span) =>
      span.atomic
        ? span.text
        : span.text.slice(Math.max(0, start - span.start), Math.min(span.end, end) - span.start),
    )
    .join('')
}

export function copySubtitleSelection(event: ClipboardEvent, root: HTMLElement) {
  const selection = window.getSelection()
  if (
    event.defaultPrevented ||
    !event.clipboardData ||
    !selection?.rangeCount ||
    selection.isCollapsed
  )
    return
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) && !root.contains(range.endContainer)) return
  const originals = Array.from(
    document.querySelectorAll<HTMLElement>('[data-subtitle-copy-id]'),
  ).filter((element) => range.intersectsNode(element))
  if (!originals.length) return
  const fragment = range.cloneContents()
  let single: string | undefined
  for (const element of originals) {
    const spans = JSON.parse(element.dataset.subtitleCopy!) as SubtitleCopySpan[]
    let start = 0,
      end = element.textContent?.length ?? 0
    if (element.contains(range.startContainer)) {
      const prefix = document.createRange()
      prefix.selectNodeContents(element)
      prefix.setEnd(range.startContainer, range.startOffset)
      start = prefix.toString().length
    }
    if (element.contains(range.endContainer)) {
      const prefix = document.createRange()
      prefix.selectNodeContents(element)
      prefix.setEnd(range.endContainer, range.endOffset)
      end = prefix.toString().length
    }
    if (start >= end) continue
    const copied = subtitleCopySlice(spans, start, end)
    if (element.contains(range.startContainer) && element.contains(range.endContainer)) {
      single = copied
      break
    }
    const clone = Array.from(
      fragment.querySelectorAll<HTMLElement>('[data-subtitle-copy-id]'),
    ).find((item) => item.dataset.subtitleCopyId === element.dataset.subtitleCopyId)
    if (clone) clone.textContent = copied
  }
  const plain = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE
      ? (node.textContent ?? '')
      : Array.from(node.childNodes).map(plain).join('') +
        (node instanceof Element && ['P', 'BR'].includes(node.tagName) ? '\n' : '')
  event.clipboardData.setData('text/plain', single ?? plain(fragment).replace(/\n$/, ''))
  event.preventDefault()
}

export function useSubtitleCopy(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const copy = (event: ClipboardEvent) => {
      if (ref.current) copySubtitleSelection(event, ref.current)
    }
    document.addEventListener('copy', copy)
    return () => document.removeEventListener('copy', copy)
  }, [ref, enabled])
}
