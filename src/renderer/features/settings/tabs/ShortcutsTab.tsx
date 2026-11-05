import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Keyboard, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { ShortcutKeys, shortcutLabel } from '@/components/primitives/ShortcutKeys'
import { useI18n } from '@/i18n'
import { actions, getBridge, stores } from '@/store'
import { DEFAULT_MEETING_MODE } from '../../../../shared/meeting-mode'
import { EDITOR_SHORTCUT_DEFAULTS, normalizeShortcut, shortcutFromEvent, type EditorShortcut } from '../../../../shared/keyboard-shortcuts'
import { screenConfigSchema, type ScreenShortcuts, type ScreenSnapshot } from '../../../../shared/screen-translation'
import type { SettingsPanelProps } from '../SettingsPage'

type Row = { id: string; label: string; scope: 'global' | 'meeting' | 'editor'; value: string; defaultValue: string }
const DEFAULTS = screenConfigSchema.parse({})
const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export function ShortcutsTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const api = getBridge()?.screenTranslation
  const [snapshot, setSnapshot] = useState<ScreenSnapshot>()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string>()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const recorder = useRef<HTMLButtonElement>(null)
  const saving = useRef(false)
  const captured = useRef<string | null>(null)
  const generation = useRef(0)
  const current = useRef(snapshot)
  const accept = (value: ScreenSnapshot) => { current.current = value; setSnapshot(value) }
  useEffect(() => {
    if (!api) return
    let alive = true, changed = false
    const off = api.onChanged(value => { changed = true; if (alive) accept(value) })
    void api.snapshot().then(value => { if (alive && !changed) accept(value) }).catch(() => { if (alive) setError(t('screen.errors.backendUnavailable')) })
    const blur = () => { if (!saving.current) { setEditing(undefined); void api.command({ action: 'shortcutRecording', active: false }).catch(() => {}) } }
    window.addEventListener('blur', blur)
    return () => { generation.current++; alive = false; off(); window.removeEventListener('blur', blur); void api.command({ action: 'shortcutRecording', active: false }).catch(() => {}) }
  }, [api, t])
  useEffect(() => { if (editing && !busy) recorder.current?.focus() }, [editing, busy])

  const config = snapshot?.config ?? DEFAULTS
  const rows: Row[] = [
    ...(['toggleShortcut', 'editShortcut', 'stopShortcut', 'showRegionsShortcut'] as const).map(id => ({ id, label: t(`screen.${id}`), scope: 'global' as const, value: config[id], defaultValue: DEFAULTS[id] })),
    { id: 'meeting', label: t('meeting.passthroughKey'), scope: 'meeting', value: settings.meetingMode?.passthroughKey ?? DEFAULT_MEETING_MODE.passthroughKey, defaultValue: DEFAULT_MEETING_MODE.passthroughKey },
    ...Object.entries(EDITOR_SHORTCUT_DEFAULTS).map(([id, defaultValue]) => ({ id: `editor:${id}`, label: id === 'cancel' ? t('screen.cancel') : id === 'remove' ? t('screen.remove') : t(`shortcuts.actions.${id as Exclude<EditorShortcut, 'cancel' | 'remove'>}`),
      scope: 'editor' as const, value: config.editorShortcuts?.[id as EditorShortcut] ?? defaultValue, defaultValue })),
  ]
  const scopeName = (scope: Row['scope']) => t(scope === 'global' ? 'shortcuts.global' : scope === 'meeting' ? 'meeting.title' : 'shortcuts.editor')
  const equal = (left: string, right: string) => normalizeShortcut(left, mac) === normalizeShortcut(right, mac)
  const changed = rows.some(row => !equal(row.value, row.defaultValue))
  const visible = rows.filter(row => query.trim().toLowerCase().split(/[\s+]+/).every(term => `${row.label} ${scopeName(row.scope)} ${row.value} ${shortcutLabel(row.value)} ${normalizeShortcut(row.value, mac)}`.toLowerCase().includes(term)))
  const stopRecording = async () => { captured.current = null; if (api) await api.command({ action: 'shortcutRecording', active: false }) }
  const cancel = () => { setEditing(undefined); setDraft(''); void stopRecording().catch(() => setError(t('shortcuts.saveFailed'))) }
  const meetingIdle = async () => {
    const state = await getBridge()?.meetingMode?.snapshot()
    if (state && ['starting', 'running', 'stopping', 'unknown'].includes(state.state)) throw new Error('meetingRunning')
  }
  const failure = (cause: unknown) => cause instanceof Error && cause.message === 'meetingRunning' ? t('shortcuts.meetingRunning')
    : cause instanceof Error && cause.message === 'shortcutConflict' ? t('screen.errors.shortcutConflict') : t('shortcuts.saveFailed')
  const begin = async (row: Row) => {
    if (!api || saving.current) return
    setBusy(true); setError(''); setDraft(''); captured.current = null
    const version = generation.current
    try {
      await meetingIdle()
      if (version !== generation.current) return
      await api.command({ action: 'shortcutRecording', active: true })
      if (version !== generation.current) { await stopRecording(); return }
      setEditing(row.id)
    }
    catch (cause) { setError(failure(cause)) }
    finally { setBusy(false) }
  }
  const save = async (row: Row, value: string) => {
    if (!api || !current.current || saving.current) return
    const conflict = value && rows.find(other => other.id !== row.id && other.value && equal(other.value, value)
      && (other.scope === row.scope || other.scope === 'global' || row.scope === 'global'))
    if (conflict) { setError(t('shortcuts.conflict', { command: conflict.label })); captured.current = null; return }
    saving.current = true; setBusy(true); setError('')
    try {
      await stopRecording()
      if (row.id === 'meeting') {
        await meetingIdle()
        await actions.settings.updateSettings({ meetingMode: { ...(stores.settings.getState().settings?.meetingMode ?? DEFAULT_MEETING_MODE), passthroughKey: value } })
      } else {
        const { toggleShortcut, editShortcut, stopShortcut, showRegionsShortcut, editorShortcuts } = current.current.config
        const shortcuts: ScreenShortcuts = { toggleShortcut, editShortcut, stopShortcut, showRegionsShortcut, editorShortcuts }
        if (row.scope === 'editor') shortcuts.editorShortcuts = { ...editorShortcuts, [row.id.slice(7)]: value }
        else shortcuts[row.id as 'toggleShortcut' | 'editShortcut' | 'stopShortcut' | 'showRegionsShortcut'] = value
        const result = await api.command({ action: 'shortcuts', shortcuts })
        accept(result)
        if (result.shortcutError) throw new Error('shortcutConflict')
      }
      setEditing(undefined); setDraft('')
    } catch (cause) {
      setError(failure(cause))
      if (editing && !(cause instanceof Error && cause.message === 'meetingRunning')) await api.command({ action: 'shortcutRecording', active: true }).catch(() => {})
      else setEditing(undefined)
    } finally { saving.current = false; setBusy(false) }
  }
  const restoreAll = async () => {
    if (!api || !current.current || saving.current) return
    saving.current = true; setBusy(true); setError(''); setEditing(undefined)
    const { toggleShortcut, editShortcut, stopShortcut, showRegionsShortcut, editorShortcuts } = current.current.config
    const previous: ScreenShortcuts = { toggleShortcut, editShortcut, stopShortcut, showRegionsShortcut, editorShortcuts }
    let applied = false
    try {
      await stopRecording()
      await meetingIdle()
      const result = await api.command({ action: 'shortcuts', shortcuts: { toggleShortcut: DEFAULTS.toggleShortcut, editShortcut: DEFAULTS.editShortcut, stopShortcut: DEFAULTS.stopShortcut, showRegionsShortcut: DEFAULTS.showRegionsShortcut, editorShortcuts: { ...EDITOR_SHORTCUT_DEFAULTS } } })
      accept(result)
      if (result.shortcutError) throw new Error('shortcutConflict')
      applied = true
      await actions.settings.updateSettings({ meetingMode: { ...(stores.settings.getState().settings?.meetingMode ?? DEFAULT_MEETING_MODE), passthroughKey: DEFAULT_MEETING_MODE.passthroughKey } })
    } catch (cause) {
      if (applied) { try { accept(await api.command({ action: 'shortcuts', shortcuts: previous })) } catch {} }
      setError(failure(cause))
    } finally { saving.current = false; setBusy(false) }
  }
  const keydown = (event: KeyboardEvent<HTMLButtonElement>, row: Row) => {
    event.preventDefault(); event.stopPropagation()
    if (event.repeat || saving.current) return
    if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) { cancel(); return }
    if (event.key === 'Backspace' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) { void save(row, row.defaultValue); return }
    const value = shortcutFromEvent(event.nativeEvent)
    if (value) { captured.current = value; setDraft(value); setError('') }
  }
  const icon = (label: string, onClick: () => void, disabled: boolean, content: ReactNode) => <Tooltip>
    <TooltipTrigger render={<Button variant="bare" size="icon-sm" disabled={disabled} aria-label={label} onClick={onClick}>{content}</Button>} />
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
  return <div className="settings-panel shortcuts-page">
    <Card className="shortcuts-page__card">
      <CardHeader className="shortcuts-page__header">
        <CardTitle>{t('shortcuts.title')}</CardTitle>
        <CardAction className="shortcuts-page__toolbar">
          <InputGroup className="shortcuts-page__search"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('shortcuts.search')} aria-label={t('shortcuts.search')} /></InputGroup>
          <Button variant="outline" size="sm" disabled={busy || !snapshot || !changed} onClick={() => void restoreAll()}><RotateCcw data-icon="inline-start" />{t('shortcuts.restoreAll')}</Button>
        </CardAction>
      </CardHeader>
      {error && !editing && <CardContent><Alert variant="danger"><AlertDescription>{error}</AlertDescription></Alert></CardContent>}
      <CardContent className="shortcuts-page__table">
      <Table aria-label={t('shortcuts.title')}><TableHeader><TableRow><TableHead>{t('shortcuts.command')}</TableHead><TableHead>{t('shortcuts.binding')}</TableHead><TableHead>{t('shortcuts.scope')}</TableHead><TableHead>{t('shortcuts.operations')}</TableHead></TableRow></TableHeader>
        <TableBody>{visible.map(row => <TableRow key={row.id} data-shortcut-id={row.id}>
          <TableCell>{row.label}</TableCell>
          <TableCell><div className="shortcuts-page__binding">
            {editing === row.id ? <div className="shortcuts-page__recording"><Button ref={recorder} data-shortcut-recorder variant="secondary" size="sm" disabled={busy} onKeyDown={event => keydown(event, row)}
              onKeyUp={event => { event.preventDefault(); if (captured.current && !saving.current) void save(row, captured.current) }}
              onBlur={() => { if (!saving.current) cancel() }} aria-label={t('shortcuts.record')}>
              {busy ? <Spinner data-icon="inline-start" /> : <Keyboard data-icon="inline-start" />}{draft ? <ShortcutKeys value={draft} /> : t('shortcuts.record')}
            </Button>{row.value ? <ShortcutKeys value={row.value} /> : <Badge variant="secondary">{t('shortcuts.unassigned')}</Badge>}</div> : <>
              {row.value ? <ShortcutKeys value={row.value} /> : <Badge variant="secondary">{t('shortcuts.unassigned')}</Badge>}
              {icon(t('shortcuts.editCommand', { command: row.label }), () => void begin(row), busy || !snapshot, <Pencil />)}
            </>}
            {editing === row.id && error && <Alert variant="danger"><AlertDescription>{error}</AlertDescription></Alert>}
          </div></TableCell>
          <TableCell>{scopeName(row.scope)}</TableCell>
          <TableCell><div className="shortcuts-page__operations">
            {icon(t('shortcuts.resetCommand', { command: row.label }), () => void save(row, row.defaultValue), busy || !snapshot || equal(row.value, row.defaultValue), <RotateCcw />)}
            {icon(t('shortcuts.deleteCommand', { command: row.label }), () => void save(row, ''), busy || !snapshot || !row.value, <Trash2 />)}
          </div></TableCell>
        </TableRow>)}
        {!visible.length && <TableRow><TableCell colSpan={4}><Empty><EmptyHeader><EmptyTitle>{t('shortcuts.noResults')}</EmptyTitle></EmptyHeader></Empty></TableCell></TableRow>}
        </TableBody>
      </Table>
      </CardContent>
    </Card>
  </div>
}
