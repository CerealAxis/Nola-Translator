import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { ComicRegion } from '../../../shared/comic'

export type ComicTextStyle = Partial<Pick<ComicRegion['style'], 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'color' | 'strokeColor' | 'strokeWidth'>>
/** Run offsets are Unicode code points and the end is exclusive. */
export type ComicTextRun = { start: number; end: number; style: ComicTextStyle }
export type ComicTextSelection = { start: number; end: number }
export type ComicTextEditorHandle = { applyStyle: (style: ComicTextStyle) => void }
type Value = { text: string; runs: ComicTextRun[]; baseStyle?: ComicRegion['style'] }

export function utf16ToCodePoints(text: string, offset: number): number { return Array.from(text.slice(0, offset)).length }
export function codePointsToUtf16(text: string, offset: number): number { return Array.from(text).slice(0, offset).join('').length }

function stylesFor(text: string, runs: ComicTextRun[]): ComicTextStyle[] {
  return Array.from(text, (_, index) => Object.assign({}, ...runs.filter(run => run.start <= index && index < run.end).map(run => run.style)))
}
function compress(styles: ComicTextStyle[]): ComicTextRun[] {
  const runs: ComicTextRun[] = []
  styles.forEach((style, index) => {
    if (!Object.keys(style).length) return
    const last = runs.at(-1)
    if (last && last.end === index && JSON.stringify(last.style) === JSON.stringify(style)) last.end++
    else runs.push({ start: index, end: index + 1, style })
  })
  return runs
}
export function rebaseTextRuns(before: string, after: string, runs: ComicTextRun[], insertionStyle?: ComicTextStyle): ComicTextRun[] {
  const old = Array.from(before), next = Array.from(after), styles = stylesFor(before, runs)
  let start = 0, suffix = 0
  while (start < old.length && start < next.length && old[start] === next[start]) start++
  while (suffix < old.length - start && suffix < next.length - start && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++
  const inherited = insertionStyle ?? styles[start > 0 ? start - 1 : start] ?? {}
  return compress([...styles.slice(0, start), ...Array.from({ length: next.length - start - suffix }, () => inherited), ...styles.slice(old.length - suffix)])
}

function textStyle(style: ComicTextStyle): CSSProperties {
  return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, color: style.color,
    WebkitTextStroke: style.strokeWidth ? `${style.strokeWidth}px ${style.strokeColor ?? style.color ?? '#000000'}` : undefined }
}

export const ComicTextEditor = forwardRef<ComicTextEditorHandle, {
  region: ComicRegion; scale: number; runs?: ComicTextRun[]; label: string; caretPoint?: { x: number; y: number }; liveLayout?: ComicRegion['resolvedLayout']
  onChange: (value: Value) => void; onCommit: () => void; onCancel: () => void
  onSelectionChange?: (selection: ComicTextSelection) => void
  onCompositionChange?: (composing: boolean) => void
}>(function ComicTextEditor({ region, scale, runs = [], label, caretPoint, liveLayout, onChange, onCommit, onCancel, onSelectionChange, onCompositionChange }, ref) {
  const initial = useRef<Value>({ text: region.targetText ?? '', runs })
  const initialLayout = useRef(region.resolvedLayout?.text === (region.targetText ?? '') ? region.resolvedLayout : undefined)
  const initialFontSize = useRef(region.style.fontSize)
  const initialAutoFontSize = useRef(region.style.autoFontSize)
  const initialStyle = useRef(region.style)
  const value = useRef<Value>(initial.current)
  const history = useRef<Value[]>([initial.current])
  const historyIndex = useRef(0)
  const selection = useRef<ComicTextSelection>({ start: 0, end: 0 })
  const insertionStyle = useRef<ComicTextStyle | undefined>(undefined)
  const composing = useRef(false)
  const element = useRef<HTMLDivElement>(null)
  const [revision, setRevision] = useState(0)
  const lastRestoredRevision = useRef(0)
  const publish = (next: Value) => {
    if (JSON.stringify(next) !== JSON.stringify(value.current)) {
      history.current = [...history.current.slice(0, historyIndex.current + 1), next]
      if (history.current.length > 100) history.current.shift()
      historyIndex.current = history.current.length - 1
    }
    value.current = next; onChange(next)
  }
  const undo = (direction: number) => {
    const index = Math.max(0, Math.min(history.current.length - 1, historyIndex.current + direction))
    if (index === historyIndex.current) return
    historyIndex.current = index; value.current = history.current[index]
    const length = Array.from(value.current.text).length
    selection.current = { start: Math.min(selection.current.start, length), end: Math.min(selection.current.end, length) }
    onChange({ ...value.current, baseStyle: value.current.baseStyle ?? initialStyle.current }); setRevision(n => n + 1)
  }
  const readSelection = () => {
    const root = element.current, current = window.getSelection()
    if (!root || !current?.rangeCount || !root.contains(current.anchorNode) || !root.contains(current.focusNode)) return
    const range = current.getRangeAt(0), prefix = range.cloneRange()
    prefix.selectNodeContents(root); prefix.setEnd(range.startContainer, range.startOffset)
    const start = utf16ToCodePoints(root.textContent ?? '', prefix.toString().length)
    const end = start + Array.from(range.toString()).length
    selection.current = { start, end }; onSelectionChange?.(selection.current)
  }
  useImperativeHandle(ref, () => ({ applyStyle: style => {
    const { start, end } = selection.current
    let current = value.current
    const layout = liveLayout?.text === current.text ? liveLayout : initialLayout.current
    if (style.fontSize !== undefined && region.style.autoFontSize && layout && region.style.fontSize === initialFontSize.current) {
      const ratio = layout.fontSize / region.style.fontSize
      current = { ...current, baseStyle: { ...region.style, fontSize: layout.fontSize, autoFontSize: false }, runs: current.runs.map(run => ({ ...run,
        style: { ...run.style, ...(run.style.fontSize === undefined ? {} : { fontSize: Math.max(6, Math.round(run.style.fontSize * ratio)) }) } })) }
    }
    if (start === end) { insertionStyle.current = { ...insertionStyle.current, ...style }; if (current !== value.current) { publish(current); setRevision(n => n + 1) }; return }
    const styles = stylesFor(current.text, current.runs)
    for (let i = start; i < end && i < styles.length; i++) styles[i] = { ...styles[i], ...style }
    publish({ ...current, runs: compress(styles) }); setRevision(n => n + 1)
  } }))
  useEffect(() => {
    const root = element.current
    if (!root) return
    root.focus()
    if (!caretPoint || !root.parentElement) return
    const parent = root.parentElement.getBoundingClientRect(), x = parent.left + caretPoint.x, y = parent.top + caretPoint.y
    const range = document.caretRangeFromPoint?.(x, y)
    if (range && root.contains(range.startContainer)) { const current = window.getSelection(); current?.removeAllRanges(); current?.addRange(range); readSelection() }
  }, [])
  useEffect(() => {
    const revisionChanged = revision !== lastRestoredRevision.current
    lastRestoredRevision.current = revision
    if (!element.current || (!revisionChanged && document.activeElement !== element.current)) return
    const root = element.current, text = value.current.text, walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const start = codePointsToUtf16(text, selection.current.start), end = codePointsToUtf16(text, selection.current.end)
    const range = document.createRange(); let offset = 0, node: Node | null, started = false
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0
      if (!started && start <= offset + length) { range.setStart(node, start - offset); started = true }
      if (started && end <= offset + length) { range.setEnd(node, end - offset); break }
      offset += length
    }
    if (started) { root.focus(); const current = window.getSelection(); current?.removeAllRanges(); current?.addRange(range) }
  }, [revision, region.style.fontSize, region.style.autoFontSize, liveLayout?.fontSize, JSON.stringify(liveLayout?.lines)])
  const update = () => {
    const text = element.current?.textContent ?? ''
    publish({ ...value.current, text, runs: rebaseTextRuns(value.current.text, text, value.current.runs, insertionStyle.current) }); readSelection()
    if (insertionStyle.current) setRevision(n => n + 1)
  }
  const base = region.style
  const resolved = initialLayout.current
  const displayLayout = liveLayout?.text === value.current.text ? liveLayout : resolved
  const keepFittedSize = base.fontSize === initialFontSize.current && base.autoFontSize === initialAutoFontSize.current
  const runScale = displayLayout && keepFittedSize ? displayLayout.fontSize / initialFontSize.current : 1
  useLayoutEffect(() => {
    const root = element.current
    if (!root || composing.current) return
    const chars = Array.from(value.current.text), styles = stylesFor(value.current.text, value.current.runs)
    const breaks = new Set<number>()
    if (displayLayout && !value.current.text.includes('\n') && displayLayout.lines.join('') === value.current.text) {
      let count = 0
      displayLayout.lines.slice(0, -1).forEach(line => { count += Array.from(line).length; breaks.add(count) })
    }
    const segments: { text: string; style: ComicTextStyle; lineBreak?: boolean }[] = []
    chars.forEach((char, index) => {
      if (breaks.has(index)) segments.push({ text: '', style: {}, lineBreak: true })
      const style = styles[index], last = segments.at(-1)
      if (last && !last.lineBreak && JSON.stringify(last.style) === JSON.stringify(style)) last.text += char
      else segments.push({ text: char, style })
    })
    root.replaceChildren(...segments.map(segment => {
      if (segment.lineBreak) return document.createElement('br')
      const span = document.createElement('span')
      Object.entries(textStyle(segment.style)).forEach(([key, value]) => { if (value !== undefined) (span.style as unknown as Record<string, string>)[key] = String(value) })
      if (segment.style.fontSize !== undefined) span.style.fontSize = `${Math.max(6, Math.round(segment.style.fontSize * runScale))}px`
      span.textContent = segment.text; return span
    }))
    // Rebuild only for explicit formatting or undo; normal input remains under browser/IME control.
  }, [revision, runScale, JSON.stringify(displayLayout?.lines)])
  const box = displayLayout && displayLayout.width > 0 && displayLayout.height > 0 ? displayLayout : region
  const fittedLineHeight = liveLayout?.text === value.current.text ? liveLayout.lineHeight : resolved && keepFittedSize ? resolved.lineHeight : Math.max(base.fontSize, ...value.current.runs.map(run => run.style.fontSize ?? 0)) * (base.lineSpacing ?? 1.15)
  return <div ref={element} role="textbox" aria-label={label} aria-multiline="true" contentEditable suppressContentEditableWarning
    style={{ position: 'absolute', left: box.x * scale, top: box.y * scale, width: box.width, height: box.height,
      transformOrigin: 'top left', transform: `translate(${box.width * scale / 2}px, ${box.height * scale / 2}px) rotate(${base.angle ?? 0}deg) translate(${-box.width * scale / 2}px, ${-box.height * scale / 2}px) scale(${scale})`, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      outline: 'none', background: 'transparent', padding: 0, paddingTop: displayLayout && base.direction === 'horizontal' ? Math.max(0, (box.height - displayLayout.lines.length * fittedLineHeight) / 2) : 0, margin: 0, boxSizing: 'border-box', textAlign: base.align,
      writingMode: base.direction === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb', lineHeight: liveLayout?.text === value.current.text ? `${liveLayout.lineHeight}px` : resolved && keepFittedSize ? `${resolved.lineHeight}px` : (base.lineSpacing ?? 1.2), ...textStyle(base),
      fontFamily: liveLayout?.fontFamily ?? (base.fontFamily === initialStyle.current.fontFamily ? (resolved?.fontFamily ?? base.fontFamily) : base.fontFamily),
      fontWeight: liveLayout?.fontWeight ?? (base.fontWeight === initialStyle.current.fontWeight ? (resolved?.fontWeight ?? base.fontWeight) : base.fontWeight),
      fontStyle: liveLayout?.fontStyle ?? (base.fontStyle === initialStyle.current.fontStyle ? (resolved?.fontStyle ?? base.fontStyle) : base.fontStyle),
      fontSize: keepFittedSize ? (displayLayout?.fontSize ?? base.fontSize) : base.fontSize }}
    onPointerDown={event => event.stopPropagation()} onPointerUp={readSelection} onKeyUp={readSelection} onClick={event => event.stopPropagation()} onSelect={readSelection}
    onCompositionStart={() => { composing.current = true; onCompositionChange?.(true) }} onCompositionEnd={() => { composing.current = false; update(); onCompositionChange?.(false) }}
    onInput={() => { if (!composing.current) update() }}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || composing.current) { event.stopPropagation(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') return
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); onCancel() }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey ? 1 : -1) }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); undo(1) }
      else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onCommit() }
      else if (event.key === 'Enter') { event.preventDefault(); document.execCommand('insertText', false, '\n') }
    }}
    onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')) }}
  />
})
