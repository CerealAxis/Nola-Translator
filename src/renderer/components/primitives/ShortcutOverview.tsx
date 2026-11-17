import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ShortcutKeys } from '@/components/primitives/ShortcutKeys'
import { useI18n } from '@/i18n'
import { getBridge, settingsStore, useStore } from '@/store'
import { useComicPrototypeText } from '@/features/comic/comic-prototype-copy'
import { DEFAULT_MEETING_MODE } from '../../../shared/meeting-mode'
import { EDITOR_SHORTCUT_DEFAULTS, type EditorShortcut } from '../../../shared/keyboard-shortcuts'
import { screenConfigSchema, type ScreenSnapshot } from '../../../shared/screen-translation'

const defaults = screenConfigSchema.parse({})

export function ShortcutOverview({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const p = useComicPrototypeText()
  const settings = useStore(settingsStore, state => state.settings)
  const [snapshot, setSnapshot] = useState<ScreenSnapshot>()
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!open) { setQuery(''); return }
    const api = getBridge()?.screenTranslation
    if (!api) return
    let alive = true, changed = false
    const off = api.onChanged(value => { changed = true; if (alive) setSnapshot(value) })
    void api.snapshot().then(value => { if (alive && !changed) setSnapshot(value) }).catch(() => {})
    return () => { alive = false; off() }
  }, [open])
  const config = snapshot?.config ?? defaults
  const sections = [
    { title: t('shortcuts.global'), rows: (['toggleShortcut', 'editShortcut', 'stopShortcut', 'showRegionsShortcut'] as const).map(id => ({ label: t(`screen.${id}`), key: config[id] })) },
    { title: t('meeting.title'), rows: [{ label: t('meeting.passthroughKey'), key: settings?.meetingMode?.passthroughKey ?? DEFAULT_MEETING_MODE.passthroughKey }] },
    { title: t('shortcuts.editor'), rows: Object.entries(EDITOR_SHORTCUT_DEFAULTS).map(([id, value]) => ({ label: id === 'cancel' ? t('screen.cancel') : id === 'remove' ? t('screen.remove') : t(`shortcuts.actions.${id as Exclude<EditorShortcut, 'cancel' | 'remove'>}`), key: config.editorShortcuts?.[id as EditorShortcut] ?? value })) },
    { title: t('suite.comicTitle'), rows: [
      { label: t('suite.previous'), key: 'A' }, { label: t('suite.next'), key: 'D' },
      { label: p('next'), key: 'CommandOrControl+Enter' }, { label: t('suite.delete'), key: 'Delete' },
      { label: t('suite.undo'), key: 'CommandOrControl+Z' }, { label: t('suite.redo'), key: 'CommandOrControl+Shift+Z' },
      { label: p('selection'), key: 'Escape' },
    ] },
  ]
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const visible = sections.map(section => ({ ...section, rows: section.rows.filter(row => terms.every(term => `${section.title} ${row.label} ${row.key}`.toLowerCase().includes(term))) })).filter(section => section.rows.length > 0)
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="shortcut-overview">
      <DialogHeader><DialogTitle>{p('shortcuts')}</DialogTitle><DialogCloseButton /></DialogHeader>
      <InputGroup><InputGroupInput type="search" aria-label={t('shortcuts.search')} placeholder={t('shortcuts.search')} value={query} onChange={event => setQuery(event.target.value)} /><InputGroupAddon><Search /></InputGroupAddon></InputGroup>
      <div className="shortcut-overview__list">
        {!visible.length && <p>{t('shortcuts.noResults')}</p>}
        {visible.map(section => <section key={section.title} className="shortcut-overview__section">
          <h3>{section.title}</h3>
          {section.rows.map(row => <div className="shortcut-overview__row" key={`${row.label}-${row.key}`}><span>{row.label}</span>{row.key ? <ShortcutKeys value={row.key} /> : <span>{t('shortcuts.unassigned')}</span>}</div>)}
        </section>)}
      </div>
    </DialogContent>
  </Dialog>
}
