/** Plain text notes with Markdown shortcuts, held by the workspace page. */
import { useCallback, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button, Card, TextArea } from '@heroui/react'
import { Bold, Italic, StickyNote, Strikethrough, Underline } from 'lucide-react'
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
    <Card role="complementary" data-slot="notes-panel" aria-label={t('notes.title')} className={['nola-workspace-notes', className ?? ''].join(' ')}>
      <Card.Header className="nola-workspace-notes-heading">
        <Card.Title>{t('notes.title')}</Card.Title>
        <span className="nola-workspace-notes-state" title={t('workspaceUi.notesLocalHint')}>{t('workspaceUi.notesLocal')}</span>
      </Card.Header>
      <div className="nola-workspace-notes-tools" role="toolbar" aria-label={t('notes.title')}>
        {MARKERS.map((marker) => {
          const Icon = marker.icon
          return <Button key={marker.key} isIconOnly variant="ghost" size="sm" aria-label={t(marker.labelKey)} onPress={() => applyMarker(marker)}><Icon aria-hidden="true" /></Button>
        })}
      </div>
      <Card.Content className="nola-workspace-notes-content">
        <TextArea ref={areaRef} value={value} onChange={(event) => onChange(event.target.value)} placeholder={t('notes.placeholder')} aria-label={t('notes.title')} className="nola-workspace-notes-area" onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey)) return
          const marker = event.key.toLowerCase() === 'b' ? MARKERS[0] : event.key.toLowerCase() === 'i' ? MARKERS[1] : null
          if (marker) { event.preventDefault(); applyMarker(marker) }
        }} />
      </Card.Content>
    </Card>
  )
}
