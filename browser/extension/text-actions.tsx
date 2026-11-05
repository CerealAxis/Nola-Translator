import { useEffect, useRef, useState } from 'react'
import { Button } from '../../src/renderer/components/ui/button'
import { browserText, errorKey } from './i18n'
import { siteEnabled, type Preferences } from './preferences'
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
export function replaceEditable(element: HTMLElement, text: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, text)
  } else element.textContent = text
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+')
  return event.altKey === parts.includes('alt') && event.ctrlKey === parts.includes('ctrl')
    && event.metaKey === parts.includes('meta') && event.shiftKey === parts.includes('shift')
    && event.key.toLowerCase() === parts.at(-1)
}
export interface TextActionState { text: string; target?: HTMLElement; x: number; y: number; autoTranslate?: boolean; autoSpeak?: boolean }
export function TextActions({ selection, preferences, dismiss }: { selection: TextActionState; preferences: Preferences; dismiss(): void }) {
  const originalNodes = useRef(selection.target && !(selection.target instanceof HTMLInputElement) && !(selection.target instanceof HTMLTextAreaElement) ? Array.from(selection.target.childNodes) : undefined)
  const controller = useRef(new AbortController())
  const audio = useRef<HTMLAudioElement | null>(null)
  const audioUrl = useRef<string | null>(null)
  useEffect(() => () => { controller.current.abort(); audio.current?.pause(); if (audioUrl.current) URL.revokeObjectURL(audioUrl.current) }, [])
  const t = browserText(preferences.uiLanguage)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [restorable, setRestorable] = useState<string>()
  const translate = async () => {
    if (!siteEnabled(preferences, location.href)) return
    setBusy(true); setError('')
    try {
      const source = selection.target ? editableText(selection.target) : selection.text
      const translated = await translateText(selection.autoTranslate ? source.replace(/ {2}$/, '') : source, selection.target ? preferences.inputSourceLanguage : preferences.sourceLanguage ?? 'auto', selection.target ? preferences.inputTargetLanguage : preferences.pageLanguage, selection.target ? 'input' : 'selection', controller.current.signal, selection.target ? preferences.inputProvider : preferences.selectionProvider)
      if (controller.current.signal.aborted) return
      if (selection.target?.isConnected && editableText(selection.target) === source) { replaceEditable(selection.target, translated); setRestorable(translated) }
      setResult(translated)
    } catch (error) { if (!controller.current.signal.aborted) setError(t(errorKey(error instanceof Error ? error.message : 'internalError'))) } finally { setBusy(false) }
  }
  useEffect(() => { if (selection.autoTranslate) void translate() }, [])
  const speak = async () => {
    if (!siteEnabled(preferences, location.href)) return
    setBusy(true); setError('')
    try {
      const sound = await synthesize(result || selection.text, result ? selection.target ? preferences.inputTargetLanguage : preferences.pageLanguage : selection.target ? preferences.inputSourceLanguage : preferences.sourceLanguage ?? 'auto', controller.current.signal, preferences.ttsProvider)
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
  const copy = async () => { try { await navigator.clipboard.writeText(result || selection.text) } catch { setError(t(errorKey('internalError'))) } }
  return <section className="nola-panel" style={{ opacity: preferences.selectionOpacity }} aria-label={t(selection.target ? 'translateInput' : 'translateSelection')}>
    <div className="flex flex-wrap gap-2">
      {(selection.target || preferences.selectionTranslate) && <Button disabled={busy} onClick={() => void translate()}>{t(selection.target ? 'translateInput' : 'translateSelection')}</Button>}
      {selection.target && restorable !== undefined && <Button variant="secondary" onClick={() => { if (selection.target && editableText(selection.target) === restorable) { if (originalNodes.current) { selection.target.replaceChildren(...originalNodes.current); selection.target.dispatchEvent(new Event('input', { bubbles: true })) } else replaceEditable(selection.target, selection.text) }; setRestorable(undefined) }}>{t('restoreInput')}</Button>}
      {(selection.target || preferences.selectionCopy) && <Button variant="secondary" disabled={busy} onClick={() => void copy()}>{t('copyTranslation')}</Button>}
      {(selection.target || preferences.selectionSpeak) && <Button variant="secondary" disabled={busy} onClick={() => void speak()}>{t('readAloud')}</Button>}
      <Button variant="secondary" onClick={dismiss}>{t('close')}</Button>
    </div>
    {result && <p dir="auto">{result}</p>}{error && <p role="alert">{error}</p>}
  </section>
}
