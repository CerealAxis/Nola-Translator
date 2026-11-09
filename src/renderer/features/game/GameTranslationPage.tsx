import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Gamepad2, Pause, Play, Plus, Save, Square, Trash2 } from 'lucide-react'
import { useI18n, type TranslationKey } from '@/i18n'
import { getBridge } from '@/store'
import { PageHeader } from '@/components/primitives'
import { LanguageDirectionSelect } from '@/components/primitives/LanguageDirectionSelect'
import { DualColumnView } from '@/components/reading/DualColumnView'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from '@/components/ui/pagination'
import { pageNumbers } from '../records/recordLogic'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LANGUAGE_CODES } from '../../../shared/languages'
import type { ScreenSource } from '../../../shared/screen-translation'
import type { GameCommand, GameProfile, GameSnapshot } from '../../../shared/game-translation'
import type { MeetingMeta } from '../../../shared/contracts'
import { recordPath } from '@/routes'
import './game.css'
import { GlossarySelectionField } from '../settings/glossary/GlossarySelectionField'
import { stripIpcErrorMessage } from '../../../shared/ipc-error'

const gameIssueKeys = {
  recordWriteFailed: 'suite.gameRecordError', gameExists: 'suite.gameAlreadyExists', gameNotFound: 'suite.notFound', invalidExecutable: 'suite.invalidExecutable',
  revisionConflict: 'suite.revisionConflict', staleSession: 'suite.gameSessionEnded', threadUnavailable: 'suite.hookThreadUnavailable',
  hookUnavailable: 'suite.hookUnavailable', targetUnavailable: 'suite.gameSessionEnded', targetChanged: 'suite.gameSessionEnded',
  gatewayNotReady: 'gateway.notStarted', translationModelNotReady: 'suite.modelsNeeded', textTooLong: 'errors.translationInputTooLong',
  translationFailed: 'errors.translateFailed', hookThreadLimit: 'suite.hookThreadLimit', permissionDenied: 'suite.gamePermissionDenied',
  targetMismatch: 'suite.gameTargetMismatch', invalidHook: 'suite.invalidHook', hookTimeout: 'suite.hookConnectionFailed',
  hookProtocolError: 'suite.hookConnectionFailed', hookExited: 'suite.hookConnectionFailed', injectionTimeout: 'suite.hookConnectionFailed', injectionFailed: 'suite.hookConnectionFailed',
} satisfies Record<string, TranslationKey>

export function gameIssueKey(error: unknown): TranslationKey {
  const message = stripIpcErrorMessage(error instanceof Error ? error.message : String(error ?? ''))
  return Object.entries(gameIssueKeys).find(([code]) => code === message)?.[1] ?? 'suite.actionFailed'
}

function GamePages({ current, total, setPage, label }: { current: number; total: number; setPage(page: number): void; label: string }) {
  const { t } = useI18n()
  if (total < 2) return null
  return <Pagination aria-label={label}><PaginationContent>{pageNumbers(current, total).map(page =>
    <PaginationItem key={page}><PaginationLink isActive={page === current} aria-label={t('records.goToPage', { page })} onClick={() => setPage(page)}>{page}</PaginationLink></PaginationItem>,
  )}</PaginationContent></Pagination>
}

export function GameTranslationPage({ gameId }: { gameId?: string }) {
  const { t } = useI18n()
  const api = getBridge()?.gameTranslation
  const [snapshot, setSnapshot] = useState<GameSnapshot>()
  const [draft, setDraft] = useState<GameProfile>()
  const [draftRevision, setDraftRevision] = useState(0)
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [sourceId, setSourceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [threadPage, setThreadPage] = useState(1)
  const [recordPage, setRecordPage] = useState(1)
  useEffect(() => { setThreadPage(1); setRecordPage(1) }, [gameId, snapshot?.sessionId])
  const [records, setRecords] = useState<MeetingMeta[]>([])
  useEffect(() => {
    let live = true
    setRecords([])
    const meetings = getBridge()?.meetings
    if (gameId && meetings) void meetings.list().then(items => { if (live) setRecords(items.filter(item => item.sourceKind === 'game' && item.gameId === gameId)) }).catch(error => notifyError(t('suite.actionFailed'), { cause: error }))
    return () => { live = false }
  }, [gameId, snapshot?.recordRevision])
  const [embedId, setEmbedId] = useState('')
  const [query, setQuery] = useState('')
  const [seconds, setSeconds] = useState(10)
  const [hookCode, setHookCode] = useState('')
  const pending = useRef(false)
  const accept = (value: GameSnapshot) => setSnapshot(value)
  const load = async () => {
    if (!api) { setFailed(true); return }
    try { accept(await api.snapshot()); setFailed(false) }
    catch { setFailed(true) }
  }
  useEffect(() => { void load(); return api?.onChanged(accept) }, [api])
  const profile = snapshot?.profiles.find(item => item.id === gameId)
  useEffect(() => { setDraft(profile ? { ...profile } : undefined); setDraftRevision(snapshot?.revision ?? 0) }, [gameId, profile?.id, snapshot?.revision])
  useEffect(() => {
    if (!api || !gameId) return
    let live = true
    void api.sources().then(value => { if (live) setSources(value.filter(source => source.kind === 'window')) }).catch(error => notifyError(t('suite.actionFailed'), { cause: error }))
    return () => { live = false }
  }, [api, gameId])
  const run = async (command: GameCommand) => {
    if (!api || pending.current) return false
    pending.current = true; setBusy(true)
    try {
      const value = await api.command(command)
      accept(value)
      if (command.action === 'saveProfile') setDraftRevision(value.revision)
      return true
    }
    catch (error) { notifyError(t(gameIssueKey(error)), { cause: error }); return false }
    finally { pending.current = false; setBusy(false) }
  }
  const active = snapshot?.activeGameId === gameId && snapshot?.status !== 'idle' && snapshot?.status !== 'error'
  if (!snapshot) return <div className="game-page"><PageHeader warning={t('suite.experimentalUnavailable')} title={t('suite.gameTitle')} /><Card><CardContent>{failed ? <div className="flex flex-col items-start gap-3"><p>{t('suite.actionFailed')}</p><Button variant="outline" onClick={() => void load()}>{t('suite.retry')}</Button></div> : <Spinner />}</CardContent></Card></div>
  if (!gameId) return <div className="game-page"><PageHeader warning={t('suite.experimentalUnavailable')} title={t('suite.gameTitle')} actions={<Button disabled={busy || !api} onClick={() => void run({ action: 'add' })}><Plus data-icon="inline-start" />{t('suite.addGame')}</Button>} />
    {!snapshot.profiles.length && <Empty><EmptyHeader><EmptyTitle>{t('suite.libraryEmpty')}</EmptyTitle></EmptyHeader><Button disabled={busy || !api} onClick={() => void run({ action: 'add' })}>{t('suite.addGame')}</Button></Empty>}
    <div className="game-library">{snapshot.profiles.map(item => <Card key={item.id}><CardHeader><CardTitle>{item.name}</CardTitle></CardHeader><CardContent className="flex flex-col items-start gap-3"><Gamepad2 aria-hidden="true" /><Button nativeButton={false} variant="outline" render={<a href={`#/game-translation/${encodeURIComponent(item.id)}`} />}>{t('suite.connect')}</Button></CardContent></Card>)}</div>
  </div>
  if (!profile || !draft) return <Card><CardContent className="flex flex-col items-start gap-3"><p>{t('suite.notFound')}</p><Button nativeButton={false} variant="outline" render={<a href="#/game-translation" />}>{t('suite.gameLibrary')}</Button></CardContent></Card>
  const threadPages = Math.max(1, Math.ceil((snapshot.threads?.length ?? 0) / 12)), visibleThreadPage = Math.min(threadPage, threadPages)
  const recordPages = Math.max(1, Math.ceil(records.length / 10)), visibleRecordPage = Math.min(recordPage, recordPages)
  const patch = (value: Partial<GameProfile>) => setDraft({ ...draft, ...value })
  const embedStyle = draft.embedStyle ?? {}
  const patchStyle = (value: Partial<typeof embedStyle>) => patch({ embedStyle: { ...embedStyle, ...value } })
  const modes = { translation: t('suite.translation'), original: t('suite.source'), bilingual: t('suite.embedBoth') }
  const charsets = { game: t('suite.auto'), shiftJis: 'Shift JIS', gbk: 'GBK', big5: 'Big5', hangul: 'Hangul' }
  const save = async () => { if (await run({ action: 'saveProfile', profile: draft, expectedRevision: draftRevision })) notifySuccess(t('suite.saved')) }
  return <div className="game-page"><PageHeader warning={t('suite.experimentalUnavailable')} title={profile.name} actions={<div className="flex flex-wrap gap-2"><Button nativeButton={false} variant="outline" render={<a href="#/game-translation" />}><ArrowLeft data-icon="inline-start" />{t('suite.gameLibrary')}</Button>{profile.executable && <Button variant="outline" disabled={busy} onClick={() => void run({ action: 'launch', id: profile.id })}><Play data-icon="inline-start" />{t('suite.launch')}</Button>}{active ? <><Button variant="outline" disabled={busy} onClick={() => void run({ action: snapshot.status === 'paused' ? 'resume' : 'pause' })}>{snapshot.status === 'paused' ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}{t(snapshot.status === 'paused' ? 'suite.resume' : 'suite.pause')}</Button><Button variant="destructive" onClick={() => void api?.command({ action: 'stop' }).then(accept).catch(error => notifyError(t('suite.actionFailed'), { cause: error }))}><Square data-icon="inline-start" />{t('screen.stop')}</Button></> : <Button disabled={busy || draft.source !== 'clipboard' && !sourceId || draft.source === 'hook' && !snapshot.hookAvailable} onClick={() => { void (async () => { if (await run({ action: 'saveProfile', profile: draft, expectedRevision: draftRevision })) await run({ action: 'connect', id: profile.id, sourceId: sourceId || undefined }) })() }}>{t('suite.connect')}</Button>}</div>} />
    {snapshot.error && snapshot.activeGameId === gameId && <Alert><AlertDescription>{t(gameIssueKey(snapshot.error))}</AlertDescription></Alert>}
    <Card className="nola-settings-card"><CardContent className="nola-settings-content"><section className="nola-settings-section"><FieldGroup className="nola-settings-fields">
      <Field className="nola-settings-field"><FieldLabel htmlFor="game-name">{t('suite.gameName')}</FieldLabel><Input id="game-name" maxLength={80} value={draft.name} disabled={active || busy} onChange={event => patch({ name: event.target.value })} /></Field>
      <Field className="nola-settings-field"><FieldLabel htmlFor="game-source">{t('suite.textSource')}</FieldLabel><Select value={draft.source} disabled={active || busy} onValueChange={value => { if (value) patch({ source: value as GameProfile['source'] }) }}><SelectTrigger id="game-source"><SelectValue>{draft.source === 'ocr' ? 'OCR' : t(`suite.${draft.source}`)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(['auto', 'ocr', 'clipboard', 'hook'] as const).map(source => <SelectItem key={source} value={source} disabled={source === 'hook' && !snapshot.hookAvailable}>{source === 'ocr' ? 'OCR' : t(`suite.${source}`)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      {draft.source !== 'clipboard' && <Field className="nola-settings-field"><FieldLabel htmlFor="game-window">{t('suite.selectWindow')}</FieldLabel><Select value={sourceId || null} disabled={active || busy || !sources.length} onValueChange={value => { if (value) setSourceId(value) }}><SelectTrigger id="game-window"><SelectValue placeholder={t('suite.selectWindow')}>{sources.find(source => source.id === sourceId)?.name}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{sources.map(source => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}
      <Field className="nola-settings-field"><FieldLabel htmlFor="game-strategy">{t('suite.strategy')}</FieldLabel><Select value={draft.strategy} disabled={active || busy} onValueChange={value => { if (value) patch({ strategy: value as GameProfile['strategy'] }) }}><SelectTrigger id="game-strategy"><SelectValue>{t(`suite.${draft.strategy}`)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(['auto', 'speed', 'quality'] as const).map(strategy => <SelectItem key={strategy} value={strategy}>{t(`suite.${strategy}`)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field className="nola-settings-field"><FieldLabel>{t('shellUi.languageDirection')}</FieldLabel><LanguageDirectionSelect source={draft.sourceLanguage} target={draft.targetLanguage} sourceCodes={['auto', ...LANGUAGE_CODES]} targetCodes={[...LANGUAGE_CODES]} sourceLabel={t('screen.sourceLanguage')} targetLabel={t('screen.targetLanguage')} disabled={active || busy} onSourceChange={sourceLanguage => patch({ sourceLanguage })} onTargetChange={targetLanguage => patch({ targetLanguage })} /></Field>
      {(draft.source === 'auto' || draft.source === 'hook') && <details><summary>{t('suite.embedStyle')}</summary><FieldGroup className="nola-settings-fields">
        <Field><FieldLabel htmlFor="embed-mode">{t('suite.embedText')}</FieldLabel><Select value={embedStyle.mode ?? 'translation'} disabled={active || busy} onValueChange={mode => { if (mode) patchStyle({ mode: mode as keyof typeof modes }) }}><SelectTrigger id="embed-mode"><SelectValue>{modes[embedStyle.mode ?? 'translation']}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{Object.entries(modes).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="embed-wait">{t('suite.embedWait')}</FieldLabel><Input id="embed-wait" type="number" min={0} max={3000} value={draft.embedWaitMs ?? 500} disabled={active || busy} onChange={event => patch({ embedWaitMs: Number(event.target.value) })} /></Field>
        <Field><FieldLabel htmlFor="embed-font">{t('suite.embedFont')}</FieldLabel><Input id="embed-font" maxLength={90} placeholder={t('suite.auto')} disabled={active || busy} value={embedStyle.family ?? ''} onChange={event => patchStyle({ family: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="embed-scale">{t('suite.embedScale')}</FieldLabel><Input id="embed-scale" type="number" min={50} max={200} disabled={active || busy} value={embedStyle.scale ?? 100} onChange={event => patchStyle({ scale: event.target.value ? Number(event.target.value) : undefined })} /></Field>
        <Field><FieldLabel htmlFor="embed-width">{t('suite.embedWidth')}</FieldLabel><Input id="embed-width" type="number" min={5} max={200} placeholder={t('suite.auto')} disabled={active || busy} value={embedStyle.lineLength ?? ''} onChange={event => patchStyle({ lineLength: event.target.value ? Number(event.target.value) : undefined })} /></Field>
        <Field><FieldLabel htmlFor="embed-charset">{t('suite.embedCharset')}</FieldLabel><Select value={embedStyle.charset ?? 'game'} disabled={active || busy} onValueChange={charset => { if (charset) patchStyle({ charset: charset as keyof typeof charsets }) }}><SelectTrigger id="embed-charset"><SelectValue>{charsets[embedStyle.charset ?? 'game']}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{Object.entries(charsets).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <label className="flex items-center gap-2"><Switch checked={embedStyle.clear ?? false} disabled={active || busy} onCheckedChange={clear => patchStyle({ clear })}><SwitchThumb /></Switch>{t('suite.embedClear')}</label>
      </FieldGroup></details>}
      {!!draft.hookCodes?.length && <Field><FieldLabel>{t('suite.hookCode')}</FieldLabel>{draft.hookCodes.map(code => <div key={code} className="flex items-center justify-between gap-2"><code className="break-all">{code}</code><Button variant="outline" disabled={busy || active} onClick={() => patch({ hookCodes: draft.hookCodes?.filter(item => item !== code) })}>{t('suite.delete')}</Button></div>)}</Field>}
      <GlossarySelectionField className="nola-settings-field" value={draft.glossarySelection} disabled={active || busy} onChange={glossarySelection => patch({ glossarySelection })} />
      </FieldGroup></section><div className="screen-settings__footer flex flex-wrap justify-end gap-2"><Button nativeButton={false} variant="outline" render={<a href="#/settings/glossary" />}>{t('suite.manageGlossary')}</Button><Button variant="outline" disabled={active || busy} onClick={() => setDeleting(true)}><Trash2 data-icon="inline-start" />{t('suite.delete')}</Button><Button disabled={active || busy || !draft.name.trim()} onClick={() => void save()}><Save data-icon="inline-start" />{t('suite.save')}</Button></div></CardContent></Card>
    {snapshot.activeGameId === gameId && snapshot.source === 'hook' && snapshot.sessionId && <Card><CardHeader><CardTitle>{t('suite.hookThreads')}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
      {!snapshot.threads?.length && <p role="status">{t('suite.hookWaiting')}</p>}
      {snapshot.threads?.slice((visibleThreadPage - 1) * 12, visibleThreadPage * 12).map(thread => <section key={thread.id} className="flex min-w-0 flex-col gap-2"><div className="flex items-center justify-between gap-3"><span className="nola-body-strong">{thread.name}</span><Switch aria-label={`${t('suite.active')} ${thread.name}`} checked={thread.selected} disabled={busy || !thread.selected && (snapshot.threads?.filter(item => item.selected).length ?? 0) >= 8} onCheckedChange={selected => { const ids = snapshot.threads!.filter(item => item.id === thread.id ? selected : item.selected).map(item => item.id); void run({ action: 'selectThreads', sessionId: snapshot.sessionId!, ids }) }}><SwitchThumb /></Switch></div>{thread.embedSupported && <label className="flex items-center gap-2"><Switch checked={snapshot.embedThreadId === thread.id} disabled={busy || snapshot.status !== 'running'} onCheckedChange={on => { if (on) setEmbedId(thread.id); else void run({ action: 'embedHook', sessionId: snapshot.sessionId!, id: '' }) }}><SwitchThumb /></Switch>{t('suite.embedText')}</label>}<code className="break-all text-muted">{thread.code}</code><p className="whitespace-pre-wrap break-words">{thread.preview}</p></section>)}
      <GamePages current={visibleThreadPage} total={threadPages} setPage={setThreadPage} label={t('suite.hookThreads')} />
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (snapshot.sessionId) void run({ action: 'insertHook', sessionId: snapshot.sessionId, code: hookCode }).then(ok => { if (ok) setHookCode('') }) }}><Field className="min-w-0 flex-1"><FieldLabel htmlFor="game-hook-code">{t('suite.hookCode')}</FieldLabel><Input id="game-hook-code" maxLength={400} value={hookCode} disabled={busy} onChange={event => setHookCode(event.target.value)} /></Field><Button type="submit" variant="outline" disabled={busy || !hookCode.trim()}>{t('suite.insertHook')}</Button></form>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (snapshot.sessionId) void run({ action: 'searchHook', sessionId: snapshot.sessionId, text: query, seconds }) }}>
        <Field className="min-w-0 flex-1"><FieldLabel htmlFor="hook-query">{t('suite.searchDialogue')}</FieldLabel><Input id="hook-query" maxLength={256} value={query} onChange={event => setQuery(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor="hook-seconds">{t('suite.searchSeconds')}</FieldLabel><Input id="hook-seconds" type="number" min={1} max={120} value={seconds} onChange={event => setSeconds(Number(event.target.value))} /></Field>
        {snapshot.searching ? <Button type="button" variant="outline" onClick={() => void run({ action: 'cancelSearch', sessionId: snapshot.sessionId! })}>{t('screen.stop')}</Button> : <Button type="submit" variant="outline" disabled={busy || !query.trim() || [...query].length > 128}>{t('suite.search')}</Button>}
      </form>
      {snapshot.candidates && <section><h3>{t('suite.searchResults')} ({snapshot.candidates.length})</h3><div className="flex flex-wrap gap-2">{snapshot.candidates.map(code => <Button key={code} variant="outline" onClick={() => setHookCode(code)}>{code}</Button>)}</div></section>}
      <Dialog open={!!embedId} onOpenChange={open => { if (!open) setEmbedId('') }}><DialogContent><DialogHeader><DialogTitle>{t('suite.embedText')}</DialogTitle><DialogDescription>{t('suite.embedRisk')}</DialogDescription><DialogCloseButton /></DialogHeader><Button onClick={() => { void run({ action: 'embedHook', sessionId: snapshot.sessionId!, id: embedId }); setEmbedId('') }}>{t('suite.embedText')}</Button></DialogContent></Dialog>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>{t('suite.readingLog')}</CardTitle><span role="status">{active ? t(snapshot.status === 'paused' ? 'screen.states.paused' : 'screen.states.running') : t('suite.disconnected')}</span></CardHeader><CardContent>{records.slice((visibleRecordPage - 1) * 10, visibleRecordPage * 10).map(record => <Button key={record.meetingId} nativeButton={false} variant="outline" render={<a href={recordPath(record.meetingId)} />}>{new Date(record.startedAtMs).toLocaleString()}</Button>)}<GamePages current={visibleRecordPage} total={recordPages} setPage={setRecordPage} label={t('suite.readingLog')} /><DualColumnView sourceLabel={t('suite.source')} targetLabel={t('suite.translation')} segments={snapshot.activeGameId === gameId ? snapshot.lines.map(line => ({ id: line.id, source: line.text, target: line.translation ?? '', interim: line.status !== 'ready' })) : []} empty={<Empty><EmptyHeader><EmptyTitle>{t('suite.resultEmpty')}</EmptyTitle></EmptyHeader></Empty>} /></CardContent></Card>
    <Dialog open={deleting} onOpenChange={open => { if (!busy) setDeleting(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: profile.name })}</DialogTitle><DialogDescription>{t('suite.deleteHint')}</DialogDescription><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => void run({ action: 'deleteProfile', id: profile.id, expectedRevision: snapshot.revision }).then(ok => { if (ok) location.hash = '/game-translation' })}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
  </div>
}
