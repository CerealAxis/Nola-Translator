import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ChevronRight, Keyboard, Settings2, VolumeX } from 'lucide-react'
import { Button, Input, showToast } from '@/components/ui'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import {
  captureDemoSceneScreenshot,
  dispatchDemoSceneTool,
  saveDemoSceneScreenshot,
  type SceneToolCommand,
} from './DemoScene'
import {
  actions,
  defaultTools,
  hotkeyGroups,
  sessionActions,
  shortcutOnly,
  sourceRestriction,
  toolIds,
  type HotkeyId,
  type SessionCommand,
  type ToolAction,
  type ToolSource,
} from './tools-catalog'
import { Choice, SettingSwitch } from './tools-controls'
import { useToolLabels } from './tools-labels'
import {
  MemoryTools,
  ProcessingTools,
  processGameText,
  type TextProcessor,
  type DemoHistoryItem,
} from './tools-processing'
import { HistoryTools, NoteTools, StudyTools, exportHistory } from './tools-reading'
import { ToolState, useToolState } from './tools-state'
import { SubtitleToolbar } from './tools-toolbar'
import type { SampleLanguage } from './session'
import './tools-layout.css'

const sections = ['toolbar', 'shortcuts', 'rules', 'memory', 'history', 'notes', 'learning', 'output'] as const
type Section = (typeof sections)[number]
type Group = keyof typeof hotkeyGroups
type OutputLine = { id: number; channel: string; text: string }
type ToolProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: DemoHistoryItem[]
  onEdit: (id: number, translation: string) => void
  gameName: string
  gameId?: string
  source: ToolSource
  onAction: (action: SessionCommand) => void
  ruleEnabled: boolean
  onRuleChange: (value: boolean) => void
  memoryEnabled: boolean
  onMemoryChange: (value: boolean) => void
  zoom?: number
  onZoomChange?: (zoom: number) => void
  showTranslation?: boolean
  onShowTranslationChange?: (value: boolean) => void
  showOriginal?: boolean
  capabilityAvailable?: boolean
  onClipboardWrite?: (value: string) => void
  onRetranslate?: () => void
  onStop?: () => void
  processorRef?: { current: TextProcessor }
  onClipboardAppend?: () => void
  sourceLanguage?: SampleLanguage | 'auto'
  targetLanguage?: SampleLanguage
  windowBound?: boolean
  onWindowBindChange?: (bound: boolean) => void
}
const names = { ...actions, ...shortcutOnly }
const alternateTools: ToolAction[] = ['scale', 'screenshot', 'once']
const regionCommands: Partial<Record<HotkeyId, SceneToolCommand>> = {
  rangeFrame: 'toggle-region-frame',
  clearRange: 'clear-regions',
  prevRegion: 'previous-region',
  nextRegion: 'next-region',
  nearRegion: 'nearest-region',
  releaseRegion: 'release-region',
}
const sessionTools = new Map<string, unknown>()
export function resetDemoTools() {
  sessionTools.clear()
}
function keyCombo(event: KeyboardEvent | ReactKeyboardEvent) {
  if (['Shift', 'Control', 'Alt', 'Meta', 'Dead', 'Process', 'Unidentified'].includes(event.key)) return ''
  return [
    event.ctrlKey ? 'Ctrl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    event.metaKey ? 'Meta' : '',
    event.key.length === 1 ? event.key.toUpperCase() : event.key,
  ]
    .filter(Boolean)
    .join('+')
}
export function DemoTools(props: ToolProps) {
  return (
    <ToolState.Provider value={sessionTools}>
      <ToolWorkspace {...props} />
    </ToolState.Provider>
  )
}
function ToolWorkspace(props: ToolProps) {
  const {
    open,
    onOpenChange,
    source,
    history,
    gameName,
    gameId,
    ruleEnabled,
    onRuleChange,
    memoryEnabled,
    onMemoryChange,
  } = props
  const { label, translate } = useToolLabels()
  const [toolbarMount, setToolbarMount] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const mount = document.getElementById('game-demo-subtitle-tools')
    if (mount !== toolbarMount) setToolbarMount(mount)
  })
  const { t } = useI18n()
  const current = history.at(-1)
  const [section, setSection] = useToolState<Section>('section', 'toolbar')
  const [optimizer, setOptimizer] = useState<'before' | 'nouns' | 'correction'>('before')
  const [noteScope, setNoteScope] = useState<'game' | 'global'>('game')
  const [enabledTools, setEnabledTools] = useToolState<ToolAction[]>('enabledTools', defaultTools)
  const [order, setOrder] = useToolState('toolOrder', toolIds)
  const [customize, setCustomize] = useState(false)
  const [swapped, setSwapped] = useToolState<ToolAction[]>('swappedButtons', [])
  const [flags, setFlags] = useToolState<Record<string, boolean>>('windowFlags', {
    bind: true,
    top: true,
    lock: true,
    original: true,
    translated: true,
  })
  const [localZoom, setLocalZoom] = useToolState('localZoom', 1)
  const [expanded, setExpanded] = useState(false)
  const zoom = props.zoom ?? localZoom
  const [clip, setClip] = useToolState('clipboardValue', '')
  const [image, setImage] = useState('')
  const [log, setLog] = useToolState<OutputLine[]>('outputs', [])
  const sequence = useRef(log[0]?.id ?? 0)
  const cache = useRef(sessionTools)
  useEffect(()=>{
    if(cache.current.get('autoSaveTxt') && history.length) cache.current.set('history.txt/'+(gameId??gameName),exportHistory(history,'TXT'))
  },[history,gameId,gameName])
  useEffect(() => {
    if (!props.processorRef) return
    props.processorRef.current = (text, stage, embedded) =>
      processGameText(cache.current, gameId ?? gameName, source, ruleEnabled, text, stage, embedded)
  }, [props.processorRef, gameId, gameName, source, ruleEnabled])
  const [group, setGroup] = useState<Group>('general')
  const [hotkey, setHotkey] = useState<HotkeyId>('run')
  const [keyMap, setKeyMap] = useToolState<Partial<Record<HotkeyId, string>>>('keyMap', {})
  const [hotkeysOn, setHotkeysOn] = useToolState('hotkeysEnabled', true)
  const [recording, setRecording] = useState(false)
  const [wordRequest, setWordRequest] = useState(0)
  const [windowsTarget, setWindowsTarget] = useState<'game' | 'foreground'>('game')
  const [routes, setRoutes] = useToolState('outputChannels', { original: false, translation: false, clipboard: false })
  const observed = useRef(history.at(-1)?.id ?? 0)
  const [customName, setCustomName] = useState('')
  const [customBindings, setCustomBindings] = useToolState<{ name: string; command: HotkeyId; combo: string }[]>(
    'customBindings',
    [],
  )
  const [creating, setCreating] = useState(false)
  const [editOriginal, setEditOriginal] = useState<string | null>(null)
  const windowBound = props.windowBound ?? flags.bind
  const target = windowBound && windowsTarget === 'game' && gameName ? gameName : label('foreground')
  const shownOriginal = props.showOriginal ?? flags.original
  const shownTranslation = props.showTranslation ?? flags.translated
  function addLog(channel: string, text: string) {
    const row = { id: ++sequence.current, channel, text }
    setLog((items) => [row, ...items].slice(0, 80))
  }
  function setFlag(key: string) {
    setFlags((f) => ({ ...f, [key]: !f[key] }))
  }
  function changeZoom(value: number) {
    setLocalZoom(value)
    props.onZoomChange?.(value)
  }
  function bindWindow(value: boolean) {
    setFlags((f) => ({ ...f, bind: value }))
    if (props.onWindowBindChange) {
      onOpenChange(false)
      props.onWindowBindChange(value)
    }
  }
  function writeClipboard(value: string) {
    setClip(value)
    props.onClipboardWrite?.(value)
    addLog(label('board'), value)
  }
  function send(row: DemoHistoryItem) {
    if (routes.original) addLog('WebSocket / original', row.original)
    if (routes.translation) addLog('WebSocket / translation', row.translation)
    if (routes.clipboard) writeClipboard(row.translation)
  }
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  })
  useEffect(() => {
    const previous = observed.current
    observed.current = history.at(-1)?.id ?? 0
    history.filter((row) => row.id > previous).forEach((row) => sendRef.current(row))
  }, [history])
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image)
    },
    [image],
  )
  function go(name: Section) {
    setSection(name)
    onOpenChange(true)
  }
  function act(action: SessionCommand) {
    onOpenChange(false)
    props.onAction(action)
  }
  const advance = useCallback(() => props.onAction('advance'), [props.onAction])
  function capture(alternate: boolean) {
    if (!alternate) {
      void saveDemoSceneScreenshot(zoom)
      return
    }
    void captureDemoSceneScreenshot(zoom)
      .then((blob) => {
        setImage(URL.createObjectURL(blob))
        setSection('output')
        addLog(label('board'), 'image/png · ' + target)
      })
      .catch(() => showToast({ type: 'error', description: t('suite.actionFailed') }))
  }
  function handleAction(id: HotkeyId, right = false) {
    const isSwapped = alternateTools.includes(id as ToolAction) && swapped.includes(id as ToolAction)
    const alternate = right !== isSwapped
    const regionCommand = regionCommands[id]
    if (regionCommand) {
      onOpenChange(false)
      dispatchDemoSceneTool(regionCommand)
      return
    }
    switch (id) {
      case 'run':
        if (props.onRetranslate) {
          onOpenChange(false)
          props.onRetranslate()
        } else if (current) {
          props.onEdit(current.id, current.translation)
          addLog(label('gateway'), current.original)
        } else showToast({ type: 'info', description: label('empty') })
        return
      case 'original':
        setFlag('original')
        act('original')
        return
      case 'clipboard':
        if (right && props.onClipboardAppend) {
          onOpenChange(false)
          props.onClipboardAppend()
        } else act('clipboard')
        return
      case 'translated':
        props.onShowTranslationChange?.(!shownTranslation)
        setFlag('translated')
        return
      case 'once':
        if (alternate) {
          onOpenChange(false)
          dispatchDemoSceneTool('once-in-place')
        } else act('once')
        return
      case 'scale':
      case 'windowScale':
      case 'fullScale': {
        const full = id === 'fullScale' || (id === 'scale' && alternate)
        const value = full ? 2 : 1.5
        changeZoom(zoom === value ? 1 : value)
        setExpanded(zoom !== value && full)
        addLog(target, zoom === value ? '100%' : String(value * 100) + '%')
        return
      }
      case 'screenshot':
        capture(alternate)
        return
      case 'reset':
        setEditOriginal(null)
        setFlag('reset')
        if (current && props.onRetranslate) props.onRetranslate()
        return
      case 'history':
      case 'editTranslation':
        go('history')
        return
      case 'edit':
        setEditOriginal(current?.original ?? '')
        go('toolbar')
        return
      case 'notes':
        setNoteScope(right ? 'global' : 'game')
        go('notes')
        return
      case 'before':
      case 'nouns':
      case 'correction':
        setOptimizer(id)
        go('rules')
        return
      case 'settings':
        go('toolbar')
        setCustomize(true)
        return
      case 'gameSettings':
        go('rules')
        return
      case 'logo':
        go('toolbar')
        return
      case 'tray':
      case 'overlay':
        setFlag('overlay')
        onOpenChange(false)
        return
      case 'exit':
        onOpenChange(false)
        props.onStop?.()
        return
      case 'copy':
      case 'copyTranslation':
        if (current) writeClipboard(id === 'copyTranslation' || right ? current.translation : current.original)
        else showToast({ type: 'info', description: label('empty') })
        return
      case 'speech':
      case 'speakWord':
      case 'autoSpeech':
      case 'stopSpeech':
      case 'lookup':
      case 'word':
      case 'ocrWord':
      case 'wordWindow':
      case 'wordTranslate':
      case 'addCard':
        go('learning')
        setWordRequest((n) => n + 1)
        cache.current.set('studyCommand', id)
        return
      case 'enter':
      case 'ctrl':
        addLog(target, id === 'enter' ? 'Enter' : 'Ctrl')
        if (id === 'enter') props.onAction('advance')
        return
      case 'bind':
        bindWindow(!windowBound)
        return
      case 'mute':
        setFlag(id)
        addLog(target, translate(actions[id]) + ' · ' + label(flags[id] ? 'disabled' : 'enabled'))
        return
      case 'through':
      case 'transparent':
      case 'top':
      case 'selectable':
      case 'lock':
      case 'rangeFrame':
      case 'hide':
      case 'disable':
      case 'clicker':
      case 'pauseGame':
        setFlag(id)
        return
      case 'clear':
        setEditOriginal('')
        return
      case 'move':
        setFlag('move')
        go('toolbar')
        return
      case 'save':
        showToast({ type: 'success', description: t('common.saved') })
        return
      case 'unfocus':
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        return
      case 'clearRange':
      case 'prevRegion':
      case 'nextRegion':
      case 'nearRegion':
      case 'releaseRegion':
        return
      case 'record':
      case 'sentence':
      case 'playRecord':
      case 'cropRecord':
      case 'windowRecord':
        go('output')
        setFlag(id)
        addLog(target, translate(names[id]) + ' · ' + label(flags[id] ? 'stop' : 'click'))
        return
      default: {
        const command = sessionActions[id]
        if (command) act(command)
      }
    }
  }
  function captureKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      setRecording(false)
      return
    }
    const combo = keyCombo(e)
    if (!combo) return
    if (
      Object.entries(keyMap).some(([id, c]) => c === combo && (creating || id !== hotkey)) ||
      customBindings.some((row) => row.combo === combo)
    ) {
      showToast({ type: 'warning', description: label('conflict') })
      return
    }
    if (creating) {
      setCustomBindings([...customBindings, { name: customName.trim(), command: hotkey, combo }])
      setCreating(false)
      setCustomName('')
    } else setKeyMap({ ...keyMap, [hotkey]: combo })
    setRecording(false)
  }
  const shortcutHandler = useRef(handleAction)
  useEffect(() => {
    shortcutHandler.current = handleAction
  })
  useEffect(() => {
    if (!hotkeysOn || recording) return
    function dispatch(e: KeyboardEvent) {
      const target = e.target
      if (
        e.repeat ||
        e.defaultPrevented ||
        e.isComposing ||
        (target instanceof HTMLElement &&
          target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]'))
      )
        return
      if (!open && !location.hash.startsWith('#/game')) return
      const combo = keyCombo(e)
      if (!combo) return
      const command =
        (Object.entries(keyMap).find(([, c]) => c === combo)?.[0] as HotkeyId | undefined) ??
        customBindings.find((c) => c.combo === combo)?.command
      if (!command || (flags.disable && command !== 'disable')) return
      e.preventDefault()
      shortcutHandler.current(command)
    }
    window.addEventListener('keydown', dispatch)
    return () => window.removeEventListener('keydown', dispatch)
  }, [keyMap, customBindings, hotkeysOn, recording, flags.disable, open])
  function reorder(id: ToolAction, delta: number) {
    const next = [...order],
      i = next.indexOf(id)
    const other = next[i + delta]
    if (!other) return
    next[i] = other
    next[i + delta] = id
    setOrder(next)
  }
  const visible = order.filter(
    (id) => enabledTools.includes(id) && (!sourceRestriction[id] || sourceRestriction[id] === source),
  )
  const groupName = (key: Group) =>
    key === 'hook' ? 'HOOK' : key === 'ocr' ? 'OCR' : key === 'speech' ? 'TTS' : label(key)
  const optionName = (id: HotkeyId) => translate(names[id])
  const restore = () => setFlags({ ...flags, hide: false, through: false, overlay: false })
  return (
    <>
      {toolbarMount &&
        createPortal(
          <SubtitleToolbar
            ids={visible}
            flags={{ ...flags, bind: windowBound, original: shownOriginal, translated: shownTranslation }}
            onAction={handleAction}
            restore={restore}
          />,
          toolbarMount,
        )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setRecording(false)
          onOpenChange(next)
        }}
      >
        <DialogContent className="gt-tool-dialog" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{label('tools')}</DialogTitle>
            <DialogCloseButton />
          </DialogHeader>
          <div className="gt-tool-workspace">
            <nav aria-label={label('tools')}>
              {sections.map((s) => (
                <Button
                  key={s}
                  variant="nav"
                  size="sm"
                  data-active={section === s}
                  aria-current={section === s ? 'page' : undefined}
                  onClick={() => {
                    setSection(s)
                    setRecording(false)
                  }}
                >
                  {label(s)}
                  <ChevronRight />
                </Button>
              ))}
            </nav>
            <section className="gt-tool-body" aria-label={label(section)}>
              <h3>{label(section)}</h3>
              {section === 'toolbar' && (
                <div className="gt-tool-stack">
                  {!(flags.hide || flags.through || flags.overlay) ? (
                    <>
                      {current && (
                        <div
                          className={
                            'gt-tool-preview gt-tool-subtitle' + (flags.transparent ? ' gt-tool-transparent' : '')
                          }
                          data-align={flags.move ? 'end' : undefined}
                          style={{ userSelect: flags.selectable ? 'text' : 'none' }}
                        >
                          {shownOriginal && <p>{editOriginal ?? current.original}</p>}
                          {shownTranslation && <p>{current.translation}</p>}
                        </div>
                      )}
                      <div className="gt-tool-actions">
                        {visible.map((id) => (
                          <Button
                            key={id}
                            variant="outline"
                            size="sm"
                            aria-pressed={id in flags ? !!flags[id] : undefined}
                            onClick={() => handleAction(id)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              handleAction(id, true)
                            }}
                          >
                            {optionName(id)}
                          </Button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Button variant="outline" onClick={restore}>
                      {label('restore')}
                    </Button>
                  )}
                  {editOriginal !== null && (
                    <label className="gt-tool-field">
                      {label('original')}
                      <Input value={editOriginal} onChange={(e) => setEditOriginal(e.target.value)} />
                    </label>
                  )}
                  <div className="gt-tool-actions">
                    <Button variant="outline" onClick={() => setCustomize(!customize)} aria-expanded={customize}>
                      <Settings2 />
                      {label('customize')}
                    </Button>
                    <Button variant="outline" onClick={() => go('shortcuts')}>
                      <Keyboard />
                      {label('shortcuts')}
                    </Button>
                  </div>
                  {customize && (
                    <ul className="gt-tool-list">
                      {order.map((id, i) => (
                        <li key={id}>
                          <SettingSwitch
                            title={
                              optionName(id) +
                              (sourceRestriction[id] ? ' · ' + sourceRestriction[id]!.toUpperCase() : '')
                            }
                            checked={enabledTools.includes(id)}
                            onChange={(v) =>
                              setEnabledTools(v ? [...enabledTools, id] : enabledTools.filter((k) => k !== id))
                            }
                          />
                          {alternateTools.includes(id) && (
                            <Button
                              size="xs"
                              variant="outline"
                              aria-pressed={swapped.includes(id)}
                              onClick={() =>
                                setSwapped(swapped.includes(id) ? swapped.filter((k) => k !== id) : [...swapped, id])
                              }
                            >
                              {label('swap')}
                            </Button>
                          )}
                          <Button
                            variant="bare"
                            size="icon-sm"
                            aria-label={label('up') + ' ' + optionName(id)}
                            disabled={i === 0}
                            onClick={() => reorder(id, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="bare"
                            size="icon-sm"
                            aria-label={label('down') + ' ' + optionName(id)}
                            disabled={i === order.length - 1}
                            onClick={() => reorder(id, 1)}
                          >
                            <ArrowDown />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {section === 'shortcuts' && (
                <div className="gt-tool-stack">
                  <SettingSwitch title={label('shortcuts')} checked={hotkeysOn} onChange={setHotkeysOn} />
                  <div className="gt-tool-columns">
                    <Choice
                      title={label('group')}
                      value={group}
                      onChange={(g) => {
                        setGroup(g)
                        setHotkey(hotkeyGroups[g][0])
                        setRecording(false)
                      }}
                      options={(Object.keys(hotkeyGroups) as Group[]).map((g) => [g, groupName(g)])}
                    />
                    <Choice
                      title={label('command')}
                      value={hotkey}
                      onChange={(v) => {
                        setHotkey(v)
                        setRecording(false)
                      }}
                      options={hotkeyGroups[group].map((id) => [id, optionName(id)])}
                    />
                  </div>
                  <div className="gt-tool-actions">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCreating(false)
                        setRecording(!recording)
                      }}
                      onKeyDown={captureKey}
                      disabled={!hotkeysOn}
                    >
                      {recording && !creating ? label('pressKeys') : (keyMap[hotkey] ?? label('unassigned'))}
                    </Button>
                    <Button
                      size="sm"
                      variant="bare"
                      disabled={!keyMap[hotkey]}
                      onClick={() => setKeyMap({ ...keyMap, [hotkey]: undefined })}
                    >
                      {label('clear')}
                    </Button>
                  </div>
                  <details>
                    <summary>{label('customKey')}</summary>
                    <div className="gt-tool-stack">
                      <Input
                        aria-label={label('customKey')}
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        disabled={!customName.trim() || !hotkeysOn}
                        onClick={() => {
                          setCreating(true)
                          setRecording(true)
                        }}
                        onKeyDown={captureKey}
                      >
                        {creating && recording ? label('pressKeys') : label('shortcut')}
                      </Button>
                      {customBindings.map((c) => (
                        <div key={c.combo} className="gt-tool-actions">
                          <span>
                            {c.name} · {c.combo} · {optionName(c.command)}
                          </span>
                          <Button
                            variant="bare"
                            size="sm"
                            onClick={() => setCustomBindings(customBindings.filter((row) => row !== c))}
                          >
                            {label('clear')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}
              {section === 'rules' && (
                <ProcessingTools
                  source={source}
                  gameId={gameId ?? gameName}
                  enabled={ruleEnabled}
                  onEnabled={onRuleChange}
                  optimizer={optimizer}
                  onOptimizer={setOptimizer}
                />
              )}
              {section === 'memory' && (
                <MemoryTools
                  key={gameId ?? gameName}
                  gameId={gameId ?? gameName}
                  history={history}
                  from={props.sourceLanguage ?? 'auto'}
                  to={props.targetLanguage ?? 'zh'}
                  enabled={memoryEnabled}
                  onEnabled={onMemoryChange}
                />
              )}
              {section === 'history' && <HistoryTools history={history} onEdit={props.onEdit} gameName={gameName} gameId={gameId??gameName} />}
              {section === 'notes' && (
                <NoteTools gameId={gameId ?? gameName} gameName={gameName} scope={noteScope} onScope={setNoteScope} />
              )}
              {section === 'learning' && (
                <StudyTools
                  current={current}
                  available={props.capabilityAvailable ?? true}
                  onAdvance={advance}
                  command={cache.current.get('studyCommand') as HotkeyId | undefined}
                  request={wordRequest}
                />
              )}
              {section === 'output' && (
                <div className="gt-tool-stack">
                  <SettingSwitch title={label('bound')} checked={!!windowBound} onChange={bindWindow} />
                  <Choice
                    title={label('target')}
                    value={windowsTarget}
                    onChange={setWindowsTarget}
                    options={[
                      ['game', gameName || label('game')],
                      ['foreground', label('foreground')],
                    ]}
                  />
                  <div className="gt-tool-preview">
                    <strong>{target}</strong>
                    <span>
                      {' '}
                      · {Math.round(zoom * 100)}%{expanded ? ' · ' + label('fullScreen') : ''}
                    </span>
                    {flags.mute && <VolumeX aria-label={label('muted')} />}
                  </div>
                  <div className="gt-tool-actions">
                    {(['scale', 'screenshot', 'mute', 'ctrl', 'enter'] as const).map((id) => (
                      <Button
                        key={id}
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          handleAction(id, true)
                        }}
                      >
                        {optionName(id)}
                      </Button>
                    ))}
                  </div>
                  {image && <img className="gt-tool-shot" alt={label('capture')} src={image} />}
                  <SettingSwitch
                    title={'WebSocket · ' + label('original')}
                    checked={routes.original}
                    onChange={(v) => setRoutes({ ...routes, original: v })}
                  />
                  <SettingSwitch
                    title={'WebSocket · ' + label('translation')}
                    checked={routes.translation}
                    onChange={(v) => setRoutes({ ...routes, translation: v })}
                  />
                  <SettingSwitch
                    title={label('board')}
                    checked={routes.clipboard}
                    onChange={(v) => setRoutes({ ...routes, clipboard: v })}
                  />
                  <Button
                    className="gt-tool-fit"
                    variant="outline"
                    disabled={!current || !Object.values(routes).some(Boolean)}
                    onClick={() => {
                      if (current) send(current)
                    }}
                  >
                    {label('send')}
                  </Button>
                  {clip && <output className="gt-tool-preview">{clip}</output>}
                  <h4>{label('events')}</h4>
                  {log.length ? (
                    <ol className="gt-tool-log">
                      {log.map((row) => (
                        <li key={row.id}>
                          <small>{row.channel}</small>
                          <p>{row.text}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="type-muted">{label('ready')}</p>
                  )}
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
