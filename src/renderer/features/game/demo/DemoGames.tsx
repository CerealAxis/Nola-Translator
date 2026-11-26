import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, FolderPlus, Gamepad2, ListFilter, Monitor, MousePointer2, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogCloseButton, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/i18n'
import { formatChineseCaption } from '@/chinese-script'
import lanternLetters from '@/assets/lantern-letters.webp'
import { useGameLabels } from './games-copy'
import { characterNames, defaultHookSettings, hookCodePages, menu, sampleLine, type HookSettings } from './session'

export type DemoGame = {
  id: string
  name: string
  process: string
  pid: number
  emulator?: boolean
  version?: string
  launchSource?: 'hook' | 'ocr' | 'clipboard'
  executable?: string
  architecture?: 'x86' | 'x64'
  launchMethod?: 'direct' | 'cmd' | 'le' | 'lr' | 'ntleas'
  commandLine?: string
  localeProfile?: string
  charactersRead?: number
  playSeconds?: number
  lists?: string[]
  originalId?: string
}

export const demoGames: DemoGame[] = [
  { id: 'tideglass-harbor', name: 'Tideglass Harbor', process: 'TideglassHarbor.exe', pid: 4180 },
  { id: 'lantern-letters', name: 'Lantern Letters', process: 'LanternLetters.exe', pid: 5216, architecture: 'x86' },
  { id: 'ULJS-99001', name: 'Glass Harbor Portable', process: 'PPSSPPWindows64.exe', pid: 7720, emulator: true, version: '1.0' },
  { id: 'ULJS-99002', name: 'Lantern Post', process: 'PPSSPPWindows64.exe', pid: 7720, emulator: true, version: '1.0' },
]
const emulatorTitles = demoGames.filter(game => game.emulator)
const processes = [...demoGames.filter(game => !game.emulator), emulatorTitles[0]]
const rowClass = 'flex min-w-0 flex-wrap items-center justify-between gap-2'
const groupClass = 'grid min-w-0 gap-[var(--field-gap)]'

type PickerProps = { open: boolean; onOpenChange(open: boolean): void; onPick(game: DemoGame): void }

export function GamePicker({ open, onOpenChange, onPick }: PickerProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {open && <ProcessList onOpenChange={onOpenChange} onPick={onPick} />}
  </Dialog>
}

function ProcessList({ onOpenChange, onPick }: Omit<PickerProps, 'open'>) {
  const label = useGameLabels()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [windowMode, setWindowMode] = useState(false)
  const [loadingTitle, setLoadingTitle] = useState(false)
  const [version, setVersion] = useState('1.0')
  const [selected, setSelected] = useState<DemoGame>()
  const [refreshed, setRefreshed] = useState(false)
  const needle = query.trim().toLowerCase()
  const rows = loadingTitle ? emulatorTitles : processes.filter(game =>
    [game.process, game.emulator ? 'PPSSPP' : game.name, String(game.pid)].some(value => value.toLowerCase().includes(needle)))
  const confirm = () => {
    if (!selected) return
    if (selected.emulator && !loadingTitle) {
      setLoadingTitle(true)
      setSelected(undefined)
      return
    }
    onOpenChange(false)
    onPick(selected.emulator ? { ...selected, version } : selected)
  }
  return <DialogContent>
    <DialogHeader>
      <DialogTitle>{label(loadingTitle ? 'loadTitle' : windowMode ? 'pickWindow' : 'pick')}</DialogTitle>
      <DialogCloseButton />
    </DialogHeader>
    <CardContent className={groupClass}>
      {loadingTitle ? <p className="type-muted text-muted">{emulatorTitles[0].process} · PID {emulatorTitles[0].pid}</p>
        : <>
          <Input type="search" aria-label={label('process')} placeholder={label('process')} value={query}
            onChange={event => { setQuery(event.target.value); setSelected(undefined) }} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setWindowMode(!windowMode); setSelected(undefined) }}>
              {windowMode ? <ListFilter /> : <MousePointer2 />}{label(windowMode ? 'processList' : 'pickWindow')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setRefreshed(true); setQuery(''); setSelected(undefined) }}>
              <RefreshCw />{label('refresh')}
            </Button>
            <span role="status" className="sr-only">{refreshed ? label('refreshed') : ''}</span>
          </div>
        </>}
      <div role="group" aria-label={label(loadingTitle ? 'loadTitle' : windowMode ? 'pickWindow' : 'processList')}
        className={windowMode && !loadingTitle ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2' : 'grid gap-2'}>
        {rows.map(game => <Button key={game.id} variant="secondary" aria-pressed={selected?.id === game.id}
          className="h-auto w-full justify-start whitespace-normal py-2 text-start aria-pressed:border-nola-ui-primary"
          onClick={() => setSelected(game)}>
          {windowMode && !loadingTitle ? <Monitor /> : <Gamepad2 />}
          <span className="min-w-0 flex-1 break-words">
            <span className="block">{game.emulator && !loadingTitle ? 'PPSSPP' : game.name}</span>
            <span className="block break-all type-muted text-muted">{loadingTitle ? game.id : windowMode ? game.process : game.process + ' · PID ' + game.pid}</span>
          </span>
          {selected?.id === game.id && <Check />}
        </Button>)}
        {!rows.length && <p role="status" className="type-muted text-muted">{label('noResults')}</p>}
      </div>
      {loadingTitle && selected && <label className="grid gap-1"><span>{label('version')}</span>
        <Select value={version} onValueChange={value => { if (value) setVersion(value) }}>
          <SelectTrigger aria-label={label('version')}><SelectValue>{version}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{['1.0', '1.1'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </label>}
    </CardContent>
    <DialogFooter>
      {loadingTitle && <Button variant="secondary" onClick={() => { setLoadingTitle(false); setSelected(undefined) }}>{label('restore')}</Button>}
      <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
      <Button disabled={!selected} onClick={confirm}>{loadingTitle ? label('loadTitle') : t('common.confirm')}</Button>
    </DialogFooter>
  </DialogContent>
}

const threadIds = ['dialogue', 'name', 'menu'] as const
type Thread = typeof threadIds[number]
export type EmbedMode = 'translated' | 'originalFirst' | 'translatedFirst' | 'original'
const embedModes: EmbedMode[] = ['translated', 'originalFirst', 'translatedFirst', 'original']
export function embeddedText(mode: EmbedMode, original: string, translated: string, settings = defaultHookSettings, elapsedMs = 0) {
  if (settings.clearText) return ''
  if (!translated || elapsedMs >= settings.waitSeconds * 1000) return original
  if (settings.convertKanji) translated = formatChineseCaption(translated, 'zh-Hant')
  if (settings.limitWidth) {
    const width = settings.lineWidth || defaultHookSettings.lineWidth
    translated = translated.split('\n').flatMap(line => {
      const chars = Array.from(line)
      const parts: string[] = []
      for (let i = 0; i < chars.length; i += width) parts.push(chars.slice(i, i + width).join(''))
      return parts.length ? parts : ['']
    }).join('\n')
  }
  switch (mode) {
    case 'originalFirst': return [original, translated].join('\n')
    case 'translatedFirst': return [translated, original].join('\n')
    case 'original': return original
    default: return translated
  }
}

function retainedThreadLines(lines: string[], limit: number): string[] {
  const retained: string[] = []
  for (let i = lines.length - 1; i >= 0 && limit > 0; i--) {
    const characters = Array.from(lines[i])
    retained.push(characters.slice(-limit).join(''))
    limit -= characters.length + 1
  }
  return retained.reverse()
}

function HookFields({ settings, onChange, embedded }: { settings: HookSettings; onChange(value: HookSettings): void; embedded: boolean }) {
  const label = useGameLabels()
  const numberField = (key: 'flushDelay' | 'bufferSize' | 'historySize' | 'outputSize' | 'waitSeconds' | 'lineWidth' | 'scale', min: number, max: number, step = 1, disabled = false) =>
    <label className="grid gap-1"><span>{label(key)}</span>
      <Input type="number" min={min} max={max} step={step} key={settings[key]} defaultValue={settings[key]} disabled={disabled}
        onBlur={event => {
          const input = event.currentTarget
          if (!input.value || !input.validity.valid) { input.value = String(settings[key]); return }
          onChange({ ...settings, [key]: input.valueAsNumber })
        }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    </label>
  const toggle = (key: 'clearText' | 'convertKanji' | 'limitWidth' | 'changeFont' | 'changeScale') =>
    <label className="inline-flex items-center gap-2"><Checkbox checked={settings[key]} onCheckedChange={value => onChange({ ...settings, [key]: value })} />{label(key)}</label>
  return <details>
    <summary className="cursor-pointer type-muted text-muted">{label(embedded ? 'embedSettings' : 'hookSettings')}</summary>
    <div className={'mt-2 ' + groupClass}>
      {embedded ? <>
        {numberField('waitSeconds', 0, 30, 0.1)}
        {toggle('clearText')}{toggle('convertKanji')}{toggle('limitWidth')}
        {numberField('lineWidth', 0, 1000, 1, !settings.limitWidth)}
        {toggle('changeFont')}
        <label className="grid gap-1"><span>{label('font')}</span><Input value={settings.font} disabled={!settings.changeFont}
          onChange={event => onChange({ ...settings, font: event.target.value })} /></label>
        {toggle('changeScale')}{numberField('scale', 0.5, 2, 0.01, !settings.changeScale)}
      </> : <>
        <label className="grid gap-1"><span>{label('codePage')}</span>
          <Select value={settings.codePage} onValueChange={value => { if (value !== null) onChange({ ...settings, codePage: value }) }}>
            <SelectTrigger aria-label={label('codePage')}><SelectValue>{settings.codePage ? 'CP' + settings.codePage : label('auto')}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup>{hookCodePages.map(value => <SelectItem key={value} value={value}>{value ? 'CP' + value : label('auto')}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </label>
        {numberField('flushDelay', 0, 10000)}{numberField('bufferSize', 0, 1000000)}
        {numberField('historySize', 0, 1000000000)}{numberField('outputSize', 0, 1000000000)}
      </>}
    </div>
  </details>
}

type ThreadPickerProps = {
  open: boolean
  onOpenChange(open: boolean): void
  threads: string[]
  onChange(threads: string[]): void
  embedded: boolean
  onEmbed(value: boolean): void
  lines?: Record<Thread, string>
  translation?: string
  onAdvance?(): void
  separator?: string
  onSeparatorChange?(value: string): void
  embedMode?: EmbedMode
  onEmbedMode?(mode: EmbedMode): void
  hookSettings?: HookSettings
  onHookSettingsChange?(settings: HookSettings): void
}

export function ThreadPicker({ open, onOpenChange, threads, onChange, embedded, onEmbed, lines, translation, onAdvance, separator, onSeparatorChange, embedMode, onEmbedMode, hookSettings, onHookSettingsChange }: ThreadPickerProps) {
  const label = useGameLabels()
  const { language, t } = useI18n()
  const [line, setLine] = useState(0)
  const [history, setHistory] = useState<Record<Thread, string[]>>({ dialogue: [], name: [], menu: [] })
  const [removed, setRemoved] = useState<Thread[]>([])
  const [query, setQuery] = useState('')
  const [localEmbedMode, setLocalEmbedMode] = useState<EmbedMode>('translated')
  const [localSeparator, setLocalSeparator] = useState('\n')
  const [localSettings, setLocalSettings] = useState(defaultHookSettings)
  const settings = hookSettings ?? localSettings
  const setSettings = onHookSettingsChange ?? setLocalSettings
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    if (!open) setWaiting(false)
    return () => clearTimeout(timeout.current)
  }, [open])
  const joiner = separator ?? localSeparator
  const mode = embedMode ?? localEmbedMode
  const sample = sampleLine(line, 'ja', language === 'zh-CN' ? 'zh' : language === 'zh-TW' || language === 'zh-HK' ? 'zh-Hant' : language)
  const display = lines ?? { dialogue: sample.original, name: characterNames.ja, menu: menu.ja }
  const current = (id: Thread) => display[id]
  const mergedText = threads.filter((id): id is Thread => threadIds.some(thread => thread === id)).map(current).join(joiner)
  const advance = () => {
    if (waiting) return
    const emit = () => {
      setWaiting(false)
      setHistory(Object.fromEntries(threadIds.map(id => [id, retainedThreadLines([...history[id], current(id)], settings.historySize)])) as Record<Thread, string[]>)
      setLine(line + 1)
      onAdvance?.()
    }
    if (settings.flushDelay === 0 || current('dialogue').length > settings.bufferSize) emit()
    else { setWaiting(true); timeout.current = setTimeout(emit, settings.flushDelay) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>{label('text')}</DialogTitle><DialogCloseButton /></DialogHeader>
    <CardContent className={groupClass}>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" className="min-w-0 flex-1" aria-label={t('suite.searchDialogue')} placeholder={t('suite.search')} value={query} onChange={event => setQuery(event.target.value)} />
        <Button variant="secondary" size="sm" disabled={waiting} onClick={advance}><ChevronRight />{label('next')}</Button>
      </div>
      {threadIds.filter(id => !removed.includes(id) && [label(id), current(id), ...history[id]].some(text => text.toLowerCase().includes(query.trim().toLowerCase())))
        .map(id => <div className="grid gap-2 border-b border-nola-ui-border pb-3" key={id}>
        <div className={rowClass}>
          <strong className="type-body">{label(id)}</strong>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 type-small">
              <Checkbox aria-label={label('display') + ' · ' + label(id)} checked={threads.includes(id)}
                onCheckedChange={enabled => onChange(enabled ? [...threads.filter(thread => thread !== id), id] : threads.filter(thread => thread !== id))} />
              {label('display')}
            </label>
            {id === 'dialogue' && <label className="inline-flex cursor-pointer items-center gap-2 type-small">
              <Checkbox aria-label={t('suite.embedText') + ' · ' + label(id)} checked={embedded} onCheckedChange={onEmbed} />{t('suite.embedText')}
            </label>}
          </div>
        </div>
        <span className="type-body">{current(id)}</span>
        <details><summary className="cursor-pointer type-muted text-muted">{label('history')}</summary>
          <ol className="mt-1 grid list-inside list-decimal gap-1">{retainedThreadLines([...history[id], current(id)], settings.historySize).map((text, index) => <li key={index}>{text}</li>)}</ol>
        </details>
      </div>)}
      <div className={groupClass} aria-live="polite">
        <div><h3 className="type-small">{label('merged')}</h3><p className="whitespace-pre-line type-body">
          {threads.length ? Array.from(mergedText).length <= settings.outputSize ? mergedText : '' : label('emptyThreads')}
        </p></div>
        {embedded && <div className={groupClass}>
          <label className="grid gap-1"><span className="type-small">{t('suite.embedStyle')}</span>
            <Select value={mode} onValueChange={value => { if (value) (onEmbedMode ?? setLocalEmbedMode)(value as EmbedMode) }}>
              <SelectTrigger aria-label={t('suite.embedStyle')}><SelectValue>{label(mode)}</SelectValue></SelectTrigger>
              <SelectContent><SelectGroup>{embedModes.map(id => <SelectItem key={id} value={id}>{label(id)}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </label>
          <div><h3 className="type-small">{label('embedded')}</h3><p className="whitespace-pre-line" style={{
            fontFamily: settings.changeFont && settings.font ? settings.font : undefined,
            fontSize: settings.changeScale ? settings.scale + 'em' : undefined,
          }}>{embeddedText(mode, current('dialogue'), translation ?? sample.translation, settings)}</p></div>
        </div>}
      </div>
      <details><summary className="cursor-pointer type-muted text-muted">{label('threadTools')}</summary>
        <label className="mt-2 grid gap-1"><span>{label('separator')}</span>
          <Input value={joiner.replaceAll('\n', '\\n')} maxLength={64} onChange={event => (onSeparatorChange ?? setLocalSeparator)(event.target.value.replaceAll('\\n', '\n'))} />
        </label>
        <div className="mt-2 grid gap-2">{threadIds.map(id => <div key={id} className={rowClass}>
          <span>{label(id)}</span>
          <Button variant="secondary" size="sm" aria-label={label(removed.includes(id) ? 'insertThread' : 'removeThread') + ' · ' + label(id)} onClick={() => {
            if (removed.includes(id)) setRemoved(removed.filter(thread => thread !== id))
            else {
              setRemoved([...removed, id])
              onChange(threads.filter(thread => thread !== id))
              if (id === 'dialogue') onEmbed(false)
            }
          }}>{label(removed.includes(id) ? 'insertThread' : 'removeThread')}</Button>
        </div>)}</div>
      </details>
      <HookFields settings={settings} onChange={setSettings} embedded={false} />
      {embedded && <HookFields settings={settings} onChange={setSettings} embedded />}
    </CardContent>
    <DialogFooter><Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button></DialogFooter>
  </DialogContent></Dialog>
}

type LibraryProps = {
  games: DemoGame[]
  recentIds?: string[]
  onAdd(game: DemoGame): void
  onPlay(game: DemoGame): void
  onBack(): void
  onRemove(id: string): void
  onUpdate?(game: DemoGame): void
  profileId?: string
  onProfileChange?(id: string | null): void
}

function AddGames({ games, onAdd, onClose }: Pick<LibraryProps, 'games' | 'onAdd'> & { onClose(): void }) {
  const label = useGameLabels()
  const { t } = useI18n()
  const [selected, setSelected] = useState<string[]>([])
  const [copyProfile, setCopyProfile] = useState(false)
  const duplicates = games.some(game => selected.includes(game.id))
  const add = () => {
    for (const game of demoGames.filter(item => selected.includes(item.id))) {
      const existing = games.find(item => item.id === game.id)
      if (!existing) onAdd(game)
      else if (copyProfile) {
        let copy = 2
        while (games.some(item => item.id === game.id + '/' + copy)) copy++
        onAdd({ ...existing, id: game.id + '/' + copy, originalId: game.id, name: game.name + ' (' + copy + ')', charactersRead: 0, playSeconds: 0 })
      }
    }
    onClose()
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent><DialogHeader><DialogTitle>{t('suite.addGame')}</DialogTitle><DialogCloseButton /></DialogHeader>
      <CardContent className={groupClass}>
        {demoGames.map(game => <label key={game.id} className="flex cursor-pointer items-center gap-3">
          <Checkbox checked={selected.includes(game.id)} onCheckedChange={checked => setSelected(checked ? [...selected, game.id] : selected.filter(id => id !== game.id))} />
          <span className="grid min-w-0"><span>{game.name}</span><span className="break-all type-muted text-muted">{game.emulator ? game.id : game.process}</span></span>
        </label>)}
        {duplicates && <label className="flex items-center gap-3 border-t border-nola-ui-border pt-3">
          <Checkbox checked={copyProfile} onCheckedChange={setCopyProfile} />{label('copyProfile')}
        </label>}
      </CardContent>
      <DialogFooter><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button disabled={!selected.length || (selected.every(id => games.some(game => game.id === id)) && !copyProfile)} onClick={add}>{label('addSelected')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function Profile({ game, onPlay, onUpdate, onClose }: {
  game: DemoGame; onPlay(game: DemoGame): void; onUpdate(game: DemoGame): void; onClose(): void
}) {
  const { t } = useI18n()
  const label = useGameLabels()
  const modes = { keep: label('keep'), hook: 'HOOK', clipboard: label('clipboard'), ocr: 'OCR' }
  const methods = { direct: label('direct'), cmd: label('command'), le: 'Locale Emulator', lr: 'Locale Remulator', ntleas: 'Ntleas' }
  const x86 = game.architecture === 'x86'
  const method = game.launchMethod ?? (x86 ? 'le' : 'direct')
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent><DialogHeader><DialogTitle>{game.name}</DialogTitle><DialogCloseButton /></DialogHeader>
      <CardContent className={groupClass}>
        <p className="break-all type-muted text-muted">{game.process} · PID {game.pid}</p>
        <Tabs defaultValue="settings">
          <TabsList className="max-w-full flex-wrap" aria-label={label('details')}>
            {(['settings', 'gallery', 'data'] as const).map(tab => <TabsTrigger key={tab} value={tab}>{label(tab)}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="settings" className={groupClass}>
            {game.emulator && <p className="break-words">PSP · {game.originalId ?? game.id} · {label('version')} {game.version}</p>}
            <label className="grid gap-1"><span>{label('executable')}</span><Input value={game.executable ?? game.process}
              onChange={event => onUpdate({ ...game, executable: event.target.value })} /></label>
            <label className="grid gap-1"><span>{label('method')}</span>
              <Select value={method} onValueChange={value => { if (value) onUpdate({ ...game, launchMethod: value as DemoGame['launchMethod'] }) }}>
                <SelectTrigger aria-label={label('method')}><SelectValue>{methods[method]}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>{Object.entries(methods).filter(([id]) => id !== 'le' || x86)
                  .map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </label>
            {method === 'cmd' && <label className="grid gap-1"><span>{label('command')}</span><Input value={game.commandLine ?? '{exepath}'}
              onChange={event => onUpdate({ ...game, commandLine: event.target.value })} /></label>}
            {(method === 'le' || method === 'lr') && <label className="grid gap-1"><span>{label('localeProfile')}</span>
              <Select value={game.localeProfile ?? 'Japanese'} onValueChange={value => { if (value) onUpdate({ ...game, localeProfile: value }) }}>
                <SelectTrigger aria-label={label('localeProfile')}><SelectValue>{game.localeProfile ?? 'Japanese'}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>{['Japanese', 'Japanese (Admin)'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </label>}
            <label className="grid gap-2"><span>{label('switchMode')}</span>
              <Select value={game.launchSource ?? 'keep'} onValueChange={value => {
                if (value) onUpdate({ ...game, launchSource: value === 'keep' ? undefined : value as DemoGame['launchSource'] })
              }}>
                <SelectTrigger aria-label={label('switchMode')}><SelectValue>{modes[game.launchSource ?? 'keep']}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>{Object.entries(modes).map(([key, name]) => <SelectItem value={key} key={key}>{name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </label>
          </TabsContent>
          <TabsContent value="gallery">{(game.originalId ?? game.id) === 'lantern-letters'
            ? <img className="block w-full rounded-[var(--radius-lg)]" src={lanternLetters} alt={game.name} />
            : <p className="type-muted text-muted">{label('noImages')}</p>}</TabsContent>
          <TabsContent value="data"><dl className={groupClass}>
            <div className={rowClass}><dt>{label('readerCount')}</dt><dd>{game.charactersRead ?? 0}</dd></div>
            <div className={rowClass}><dt>{label('playTime')}</dt><dd>{game.playSeconds ?? 0}</dd></div>
          </dl></TabsContent>
        </Tabs>
      </CardContent>
      <DialogFooter><Button onClick={() => { onClose(); onPlay(game) }}><Play />{t('suite.launch')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

export function DemoLibrary({ games, recentIds = [], onAdd, onPlay, onBack, onRemove, onUpdate, profileId, onProfileChange }: LibraryProps) {
  const { t } = useI18n()
  const label = useGameLabels()
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('all')
  const [activeList, setActiveList] = useState('all')
  const [adding, setAdding] = useState(false)
  const [localProfileId, setLocalProfileId] = useState<string | null>(null)
  const setProfileId = onProfileChange ?? setLocalProfileId
  const [remove, setRemove] = useState<DemoGame>()
  const [createList, setCreateList] = useState(false)
  const [listName, setListName] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [changes, setChanges] = useState<Record<string, DemoGame>>({})
  const profiles = games.map(game => onUpdate ? game : changes[game.id] ?? game)
  const profile = profiles.find(game => game.id === (onProfileChange ? profileId : localProfileId))
  const groups = [...new Set(profiles.flatMap(game => game.lists ?? []))]
  const listKey = (name: string) => 'custom:' + name
  const selectedList = groups.find(name => listKey(name) === activeList)
  const list = selectedList ? activeList : activeList === 'recent' ? 'recent' : 'all'
  const ordered = list === 'recent' ? recentIds.slice(0, 10).flatMap(id => profiles.filter(game => game.id === id)) : profiles
  const needle = query.trim().toLowerCase()
  const visible = ordered.filter(game =>
    (!selectedList || game.lists?.includes(selectedList))
    && (tag === 'all' || (game.emulator ? 'PSP' : 'PC') === tag)
    && [game.name, game.process, game.id].some(value => value.toLowerCase().includes(needle)))
  const update = (game: DemoGame) => {
    if (onUpdate) onUpdate(game)
    else setChanges(current => ({ ...current, [game.id]: game }))
  }
  const saveList = () => {
    const name = listName.trim()
    for (const game of profiles.filter(item => members.includes(item.id))) {
      update({ ...game, lists: [...new Set([...(game.lists ?? []), name])] })
    }
    setActiveList(listKey(name))
    setCreateList(false)
  }
  return <div className="game-page min-w-0">
    <PageHeader title={t('suite.gameLibrary')} actions={<>
      <Button variant="secondary" onClick={onBack}><ArrowLeft />{t('suite.gameTitle')}</Button>
      <Button onClick={() => setAdding(true)}><Plus />{t('suite.addGame')}</Button>
    </>} />
    <Card><CardContent className={groupClass}>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'recent'] as const).map(id => <Button key={id} size="sm" variant={id === list ? 'default' : 'secondary'}
          aria-pressed={id === list} onClick={() => setActiveList(id)}>{label(id === 'all' ? 'allGames' : 'recent')}</Button>)}
        {groups.map(name => <Button key={name} size="sm" variant={name === selectedList ? 'default' : 'secondary'}
          aria-pressed={name === selectedList} onClick={() => setActiveList(listKey(name))}>{name}</Button>)}
        <Button size="icon-sm" variant="bare" disabled={!profiles.length} tooltip={label('newList')} aria-label={label('newList')}
          onClick={() => { setListName(''); setMembers([]); setCreateList(true) }}><FolderPlus /></Button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <Input className="min-w-0 flex-1" type="search" placeholder={label('search')} aria-label={label('search')} value={query} onChange={event => setQuery(event.target.value)} />
        <Select value={tag} onValueChange={value => { if (value) setTag(value) }}>
          <SelectTrigger aria-label={label('tag')}><SelectValue>{tag === 'all' ? label('allTags') : tag}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{['all', 'PC', 'PSP'].map(id => <SelectItem value={id} key={id}>{id === 'all' ? label('allTags') : id}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </div>
    </CardContent></Card>
    {visible.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--space-8)*3),1fr))] gap-[var(--panel-gap)]">{visible.map(game => <Card key={game.id}>
      <CardHeader><CardTitle className="break-words">{game.name}</CardTitle></CardHeader>
      <CardContent className={groupClass}>
        <p className="break-all type-muted text-muted">{game.emulator ? 'PSP · ' + (game.originalId ?? game.id) : game.process}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onPlay(game)}><Play />{t('suite.launch')}</Button>
          <Button variant="secondary" size="sm" onClick={() => setProfileId(game.id)}>{label('details')}</Button>
          {list !== 'recent' && <Button size="icon-sm" variant="bare" tooltip={label(selectedList ? 'removeFromList' : 'remove')} aria-label={label(selectedList ? 'removeFromList' : 'remove') + ' · ' + game.name}
            onClick={() => setRemove(game)}><Trash2 /></Button>}
        </div>
      </CardContent>
    </Card>)}</div> : <Empty><EmptyHeader><Gamepad2 aria-hidden="true" className="text-muted" />
      <EmptyTitle>{label(needle || tag !== 'all' ? 'noResults' : list === 'recent' ? 'noRecent' : 'empty')}</EmptyTitle>
    </EmptyHeader></Empty>}
    {adding && <AddGames games={profiles} onAdd={onAdd} onClose={() => setAdding(false)} />}
    {profile && <Profile game={profile} onPlay={onPlay} onUpdate={update} onClose={() => setProfileId(null)} />}
    {remove && <Dialog open onOpenChange={open => { if (!open) setRemove(undefined) }}>
      <DialogContent><DialogHeader><DialogTitle>{label(selectedList ? 'removeFromList' : 'remove')}</DialogTitle><DialogCloseButton /></DialogHeader>
        <CardContent>{remove.name}</CardContent>
        <DialogFooter><Button variant="secondary" onClick={() => setRemove(undefined)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => {
            if (selectedList) update({ ...remove, lists: remove.lists?.filter(name => name !== selectedList) })
            else onRemove(remove.id)
            setRemove(undefined)
          }}>{t('common.confirm')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>}
    {createList && <Dialog open onOpenChange={open => { if (!open) setCreateList(false) }}>
      <DialogContent><DialogHeader><DialogTitle>{label('newList')}</DialogTitle><DialogCloseButton /></DialogHeader>
        <CardContent className={groupClass}>
          <label className="grid gap-1"><span>{label('listName')}</span><Input value={listName} maxLength={60} onChange={event => setListName(event.target.value)} /></label>
          {profiles.map(game => <label className="flex items-center gap-2" key={game.id}>
            <Checkbox checked={members.includes(game.id)} onCheckedChange={checked => setMembers(checked ? [...members, game.id] : members.filter(id => id !== game.id))} />{game.name}
          </label>)}
        </CardContent><DialogFooter><Button variant="secondary" onClick={() => setCreateList(false)}>{t('common.cancel')}</Button>
          <Button onClick={saveList} disabled={!listName.trim() || !members.length || groups.includes(listName.trim())}>{t('common.confirm')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>}
  </div>
}
