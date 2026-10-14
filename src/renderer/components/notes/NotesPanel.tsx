/** Markdown notes with an editable source and rendered preview. */
import { useCallback, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button, Card, TextArea } from '@heroui/react'
import { Bold, FilePenLine, Italic, StickyNote, Strikethrough, Underline } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'

interface Marker { key: string; prefix: string; suffix: string; icon: LucideIcon; labelKey: TranslationKey }
const MARKERS: Marker[] = [
  { key: 'bold', prefix: '**', suffix: '**', icon: Bold, labelKey: 'notes.bold' },
  { key: 'italic', prefix: '*', suffix: '*', icon: Italic, labelKey: 'notes.italic' },
  { key: 'underline', prefix: '__', suffix: '__', icon: Underline, labelKey: 'notes.underline' },
  { key: 'strikethrough', prefix: '~~', suffix: '~~', icon: Strikethrough, labelKey: 'notes.strikethrough' },
]

export interface NotesPanelProps {
  value: string
  onChange: (next: string) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  className?: string
}

export function NotesPanel({ value, onChange, collapsed = false, onToggleCollapsed, className }: NotesPanelProps) {
  const { t } = useI18n()
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(true)
  const applyMarker = useCallback((marker: Marker) => {
    const area = areaRef.current
    const start = area?.selectionStart ?? value.length
    const end = area?.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    onChange(`${value.slice(0, start)}${marker.prefix}${selected}${marker.suffix}${value.slice(end)}`)
    requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(start + marker.prefix.length, start + marker.prefix.length + selected.length) })
  }, [onChange, value])

  if (collapsed) {
    return <Button variant="secondary" isIconOnly onPress={onToggleCollapsed} aria-label={t('workspaceUi.notesExpand')} data-slot="notes-handle" className="nola-workspace-notes-handle"><StickyNote aria-hidden="true" /></Button>
  }
  return (
    <Card ref={panelRef} role="complementary" data-slot="notes-panel" aria-label={t('notes.title')} className={['nola-workspace-notes', className ?? ''].join(' ')}>
      <Card.Header className="nola-workspace-notes-heading">
        <Card.Title>{t('notes.title')}</Card.Title>
        <span className="nola-workspace-notes-state" title={t('workspaceUi.notesLocalHint')}>{t('workspaceUi.notesLocal')}</span>
      </Card.Header>
      <div className="nola-workspace-notes-tools" role="toolbar" aria-label={t('notes.title')}>
        {editing ? MARKERS.map((marker) => {
          const Icon = marker.icon
          return <Button key={marker.key} isIconOnly variant="secondary" size="sm" aria-label={t(marker.labelKey)} onPress={() => applyMarker(marker)}><Icon aria-hidden="true" /></Button>
        }) : null}
        <Button variant="secondary" size="sm" className="nola-workspace-notes-mode" onPress={() => setEditing((current) => !current)}>
          <FilePenLine aria-hidden="true" />{editing ? t('notes.preview') : t('notes.edit')}
        </Button>
      </div>
      <Card.Content className="nola-workspace-notes-content">
        {editing ? (
          <TextArea ref={areaRef} value={value} onChange={(event) => onChange(event.target.value)} placeholder={t('notes.placeholder')} aria-label={t('notes.title')} className="nola-workspace-notes-area" onFocus={() => setEditing(true)} onBlur={() => requestAnimationFrame(() => {
            if (!panelRef.current?.contains(document.activeElement)) setEditing(false)
          })} onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey)) return
            const marker = event.key.toLowerCase() === 'b' ? MARKERS[0] : event.key.toLowerCase() === 'i' ? MARKERS[1] : null
            if (marker) { event.preventDefault(); applyMarker(marker) }
          }} />
        ) : (
          <div className="nola-workspace-notes-preview" aria-label={t('notes.title')}>
            {value.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown> : <p className="nola-workspace-notes-empty">{t('notes.placeholder')}</p>}
          </div>
        )}
      </Card.Content>
    </Card>
  )
}
