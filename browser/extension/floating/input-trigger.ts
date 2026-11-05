import { editableText } from '../text-actions'

function atEnd(target: HTMLElement): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target.selectionStart === target.value.length && target.selectionEnd === target.value.length
  const selection = window.getSelection()
  if (!selection?.isCollapsed || !selection.rangeCount || !target.contains(selection.focusNode)) return false
  const remaining = selection.getRangeAt(0).cloneRange()
  remaining.selectNodeContents(target)
  const caret = selection.getRangeAt(0)
  remaining.setStart(caret.endContainer, caret.endOffset)
  return !remaining.toString()
}
export function createInputTrigger() {
  let lastTarget: HTMLElement | undefined
  let times: number[] = []
  return (event: KeyboardEvent, target?: HTMLElement): boolean => {
    if (!target || event.isComposing || event.repeat || event.key !== ' ' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !atEnd(target)) { times = []; lastTarget = undefined; return false }
    if (lastTarget !== target) times = []
    lastTarget = target
    const now = event.timeStamp
    times = [...times.filter(time => now - time <= 500), now]
    if (times.length < 3) return false
    times = []
    // Consume only the explicit suffix; ordinary internal spaces remain typing.
    const text = editableText(target)
    return text.length <= 4000 && /\S[\s\S]* {2}$/.test(text)
  }
}
