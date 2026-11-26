import { useEffect, useId, useRef, useState } from 'react'
import { notifyInfo } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { sceneText } from './scene-copy'
import { sampleLine } from './session'

type ClipboardInputProps = {
  visible: boolean
  automatic: boolean
  request: { id: number; append: boolean } | null
  write: { id: number; text: string } | null
  onRead(text: string, append: boolean): void
}

export function ClipboardInput({ visible, automatic, request, write, onRead }: ClipboardInputProps) {
  const { language } = useI18n()
  const s = sceneText(language)
  const [draft, setDraft] = useState(() => sampleLine(0, 'ja', 'zh').original)
  const [clipboard, setClipboard] = useState(draft)
  const handled = useRef<number | null>(null)
  const written = useRef<number | null>(null)
  const id = useId()

  useEffect(() => {
    if (!write || written.current === write.id) return
    written.current = write.id
    setClipboard(write.text)
    setDraft(write.text)
  }, [write])

  useEffect(() => {
    if (!request || handled.current === request.id) return
    handled.current = request.id
    if (clipboard) onRead(clipboard, request.append)
  }, [request, clipboard, onRead])

  function copy() {
    const text = draft.trim()
    setClipboard(text)
    if (automatic) onRead(text, false)
    else notifyInfo(s('copied'))
  }

  if (!visible) return null
  return <div className="game-demo-clipboard-field">
    <label htmlFor={id} className="type-small">{s('content')}</label>
    <Textarea id={id} rows={2} value={draft} onChange={event => setDraft(event.currentTarget.value)} />
    <div className="game-demo-scene-actions">
      <Button variant="secondary" size="sm" disabled={!draft.trim()} onClick={copy}>{s('copy')}</Button>
      <Button variant="secondary" size="sm" disabled={!clipboard} onClick={() => onRead(clipboard, true)}>{s('append')}</Button>
    </div>
  </div>
}
