import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Copy, Languages, MoreVertical, Undo2, Volume2, X } from 'lucide-react'
import { Button } from '../../src/renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../../src/renderer/components/ui/popover'
import { Spinner } from '../../src/renderer/components/ui/spinner'
import { showToast } from '../../src/renderer/components/ui/toast'
import { browserText, errorKey } from './i18n'
import { DISABLED_PROVIDER, siteEnabled, type Preferences } from './preferences'
import { synthesize, translate as translateText } from './provider-client'

export function editableTarget(element: Element | null): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  if (element instanceof HTMLTextAreaElement && !element.disabled && !element.readOnly) return element
  if (element instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel'].includes(element.type) && !element.disabled && !element.readOnly) return element
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return null
  const editable = element instanceof HTMLElement ? element.closest<HTMLElement>('[contenteditable]') : null
  return editable?.getAttribute('contenteditable') !== 'false' ? editable : null
}
export function editableText(element: HTMLElement): string {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : element.innerText ?? element.textContent ?? ''
}
export function replaceEditable(element: HTMLElement, text: string): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, text)
  } else {
    const root = element.getRootNode()
    const selection = root instanceof ShadowRoot
      ? (root as ShadowRoot & { getSelection?(): Selection | null }).getSelection?.() ?? window.getSelection()
      : window.getSelection()
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    element.focus({ preventScroll: true })
    selection?.removeAllRanges()
    selection?.addRange(range)
    const before = editableText(element)
    const accepted = element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: text }))
    if (!accepted || editableText(element) !== before) return editableText(element) !== before
    if (typeof DataTransfer === 'function' && typeof ClipboardEvent === 'function') {
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', text)
      const pasted = element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData }))
      if (!pasted || editableText(element) !== before) return editableText(element) !== before
    }
    if (document.execCommand?.('insertText', false, text)) return true
    element.textContent = text
    selection?.collapse(element, element.childNodes.length)
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: text }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+')
  return event.altKey === parts.includes('alt') && event.ctrlKey === parts.includes('ctrl')
    && event.metaKey === parts.includes('meta') && event.shiftKey === parts.includes('shift')
    && event.key.toLowerCase() === parts.at(-1)
}
export interface TextActionState { text: string; target?: HTMLElement; x: number; y: number; autoTranslate?: boolean; autoSpeak?: boolean; inputSource?: string }
export function TextActions({ selection, preferences, dismiss }: { selection: TextActionState; preferences: Preferences; dismiss(): void }) {
  const originalNodes = useRef(selection.target && !(selection.target instanceof HTMLInputElement) && !(selection.target instanceof HTMLTextAreaElement) ? Array.from(selection.target.childNodes) : undefined)
  const controller = useRef(new AbortController())
  const audio = useRef<HTMLAudioElement | null>(null)
  const audioUrl = useRef<string | null>(null)
  useEffect(() => () => { controller.current.abort(); audio.current?.pause(); if (audioUrl.current) URL.revokeObjectURL(audioUrl.current) }, [])
  const t = browserText(preferences.uiLanguage)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (error) { showToast({ type: 'error', description: error }); setError('') } }, [error])
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const [menuContainer, setMenuContainer] = useState<HTMLDivElement | null>(null)
  const [restorable, setRestorable] = useState<string>()
  const indicator = useRef<HTMLSpanElement>(null)
  const target = selection.target
  useLayoutEffect(() => {
    if (!busy || !target || !indicator.current) return
    const node = indicator.current
    const position = () => {
      const box = target.getBoundingClientRect()
      node.style.left = Math.max(box.left, box.right - node.offsetWidth - 8) + 'px'
      node.style.top = box.top + Math.max(0, (box.height - node.offsetHeight) / 2) + 'px'
    }
    position()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(position) : undefined
    observer?.observe(target)
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [busy, target])
  const translate = async () => {
    if (!siteEnabled(preferences, location.href)) return
    const request = new AbortController()
    const signal = AbortSignal.any([request.signal, controller.current.signal])
    const cancelOnEdit = () => request.abort()
    target?.addEventListener('input', cancelOnEdit, { once: true })
    target?.addEventListener('compositionstart', cancelOnEdit, { once: true })
    target?.addEventListener('blur', cancelOnEdit, { once: true })
    const stopWatching = () => {
      target?.removeEventListener('input', cancelOnEdit)
      target?.removeEventListener('compositionstart', cancelOnEdit)
      target?.removeEventListener('blur', cancelOnEdit)
    }
    setBusy(true); setError('')
    try {
      const draft = target ? editableText(target) : selection.text
      const source = draft === selection.text ? selection.inputSource ?? draft : draft
      if (!source.trim()) return
      const translated = await translateText(source, target ? preferences.inputSourceLanguage : preferences.sourceLanguage ?? 'auto', target ? preferences.inputTargetLanguage : preferences.pageLanguage, target ? 'input' : 'selection', signal, target ? preferences.inputProvider : preferences.selectionProvider)
      if (signal.aborted) return
      if (target && (!target.isConnected || editableText(target) !== draft)) return
      stopWatching()
      if (target && replaceEditable(target, translated)) setRestorable(editableText(target))
      setResult(translated)
    } catch (error) { if (!signal.aborted) setError(t(errorKey(error instanceof Error ? error.message : 'internalError'))) }
    finally { stopWatching(); setBusy(false) }
  }
  useEffect(() => { if (selection.autoTranslate) void translate() }, [])
  const speak = async () => {
    if (preferences.ttsProvider === DISABLED_PROVIDER || !siteEnabled(preferences, location.href)) return
    setBusy(true); setError('')
    try {
      const sound = await synthesize(result || selection.text, result ? selection.target ? preferences.inputTargetLanguage : preferences.pageLanguage : selection.target ? preferences.inputSourceLanguage : preferences.sourceLanguage ?? 'auto', controller.current.signal, preferences.ttsProvider)
      if (controller.current.signal.aborted) return
      const bytes = Uint8Array.from(atob(sound.audioBase64), value => value.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: sound.contentType }))
      audio.current?.pause()
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
      audioUrl.current = url
      const player = new Audio(url); audio.current = player
      player.playbackRate = preferences.ttsRate ?? 1
      player.volume = preferences.ttsVolume ?? 1
      const release = () => URL.revokeObjectURL(url)
      player.addEventListener('ended', release, { once: true }); player.addEventListener('error', release, { once: true })
      try { await player.play() } catch (error) { release(); throw error }
    } catch (error) { if (!controller.current.signal.aborted) setError(t(errorKey(error instanceof Error ? error.message : 'internalError'))) } finally { setBusy(false) }
  }
  useEffect(() => { if (selection.autoSpeak) void speak() }, [])
  const copy = async () => { try { await navigator.clipboard.writeText(result || selection.text); showToast({ type: 'success', description: t('copied') }) } catch { setError(t(errorKey('internalError'))) } }
  const restore = () => {
    if (selection.target && editableText(selection.target) === restorable) {
      if (originalNodes.current) { selection.target.replaceChildren(...originalNodes.current); selection.target.dispatchEvent(new Event('input', { bubbles: true })) }
      else replaceEditable(selection.target, selection.inputSource ?? selection.text)
    }
    setRestorable(undefined); setMore(false)
  }
  return <section className="nola-text-actions" style={{ opacity: preferences.selectionOpacity }} aria-label={t(selection.target ? 'translateInput' : 'translateSelection')} onKeyDown={event => { if (event.key === 'Escape' && !more) dismiss() }}>
    {busy && target && <span ref={indicator} role="status" aria-label={t('translating')} className="pointer-events-none fixed grid place-items-center rounded-[var(--radius-xl)] bg-nola-ui-background p-1 text-nola-ui-primary"><Spinner className="animate-spin" /></span>}
    <div className="nola-selection-toolbar nola-glass-popup" role="toolbar" aria-label={t('selection')} aria-busy={busy} onPointerDown={event => { if (event.pointerType === 'mouse') event.preventDefault() }} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
      event.preventDefault(); buttons[next]?.focus()
    }}>
      {(selection.target || preferences.selectionTranslate) && <Button variant="bare" size="icon-sm" disabled={busy} aria-label={t(selection.target ? 'translateInput' : 'translateSelection')} title={t(selection.target ? 'translateInput' : 'translateSelection')} onClick={() => void translate()}>{busy ? <Spinner className="animate-spin" /> : <Languages />}</Button>}
      {preferences.ttsProvider !== DISABLED_PROVIDER && (selection.target || preferences.selectionSpeak) && <Button variant="bare" size="icon-sm" disabled={busy} aria-label={t('readAloud')} title={t('readAloud')} onClick={() => void speak()}><Volume2 /></Button>}
      <Popover open={more} onOpenChange={setMore}>
        <PopoverTrigger render={<Button variant="bare" size="icon-sm" aria-label={t('more')} title={t('more')} />}><MoreVertical /></PopoverTrigger>
        {menuContainer && <PopoverContent container={menuContainer} align="start" className="nola-selection-menu"><PopoverTitle className="sr-only">{t('more')}</PopoverTitle>
          {(selection.target || preferences.selectionCopy) && <Button variant="bare" disabled={busy} onClick={() => { void copy(); setMore(false) }}><Copy data-icon="inline-start" />{t('copyTranslation')}</Button>}
          {selection.target && restorable !== undefined && <Button variant="bare" onClick={restore}><Undo2 data-icon="inline-start" />{t('restoreInput')}</Button>}
          <Button variant="bare" onClick={dismiss}><X data-icon="inline-start" />{t('close')}</Button>
        </PopoverContent>}
      </Popover>
    </div>
    <div ref={setMenuContainer} style={{ display: 'contents' }} />
    {result && <div className="nola-selection-result nola-glass-popup" aria-live="polite">
      <div className="nola-selection-result-actions">
        {(selection.target || preferences.selectionCopy) && result && <Button variant="bare" size="icon-sm" aria-label={t('copyTranslation')} title={t('copyTranslation')} onClick={() => void copy()}><Copy /></Button>}
        <Button variant="bare" size="icon-sm" aria-label={t('close')} title={t('close')} onClick={dismiss}><X /></Button>
      </div>
      <p dir="auto">{result}</p>
    </div>}
  </section>
}
