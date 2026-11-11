import { editableText } from '../text-actions'

function caretOffset(target: HTMLElement): number | undefined {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart
    return start !== null && start === target.selectionEnd ? start : undefined
  }
  const root = target.getRootNode()
  const selection = root instanceof ShadowRoot
    ? (root as ShadowRoot & { getSelection?(): Selection | null }).getSelection?.() ?? window.getSelection()
    : window.getSelection()
  if (!selection?.isCollapsed || !selection.rangeCount || !target.contains(selection.focusNode)) return undefined
  const prefix = selection.getRangeAt(0).cloneRange()
  prefix.setStart(target, 0)
  return prefix.toString().length
}

const normalizeSpaces = (text: string) => text.replaceAll('\u00a0', ' ').replaceAll('\u200b', '')

export function createInputTrigger() {
  let sequence: { target: HTMLElement; source: string; expected: string; nextCaret: number; count: number; time: number } | undefined
  return (event: KeyboardEvent, target?: HTMLElement): string | undefined => {
    if (!target || event.isComposing || event.keyCode === 229 || event.repeat ||
      (event.key !== ' ' && event.code !== 'Space') || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      sequence = undefined
      return
    }
    const caret = caretOffset(target)
    if (caret === undefined) { sequence = undefined; return }
    const control = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    const raw = control ? target.value : target.textContent ?? ''
    const offset = normalizeSpaces(raw.slice(0, caret)).length
    const value = normalizeSpaces(raw)
    const previous = sequence
    const continuing = previous?.target === target && previous.expected === value && previous.nextCaret === offset && event.timeStamp - previous.time <= 1000
    const source = continuing ? previous.source : editableText(target)
    const count = continuing ? previous.count + 1 : 1
    if (count === 3) {
      sequence = undefined
      if (source.trim() && source.length <= 16000) return source
      return
    }
    sequence = { target, source, expected: value.slice(0, offset) + ' ' + value.slice(offset), nextCaret: offset + 1, count, time: event.timeStamp }
  }
}
