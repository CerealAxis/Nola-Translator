import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Gamepad2, Pause, Play, Plus, Save, Square, Trash2 } from 'lucide-react'
import { useI18n, type TranslationKey } from '@/i18n'
import { getBridge } from '@/store'
import { PageHeader } from '@/components/primitives'
import { LanguageDirectionSelect } from '@/components/primitives/LanguageDirectionSelect'
import { DualColumnView } from '@/components/reading/DualColumnView'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
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
import './game.css'
import { GlossarySelectionField } from '../settings/glossary/GlossarySelectionField'
import { stripIpcErrorMessage } from '../../../shared/ipc-error'

const gameIssueKeys = {
  gameExists: 'suite.gameAlreadyExists', gameNotFound: 'suite.notFound', invalidExecutable: 'suite.invalidExecutable',
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
  useEffect(() => { setDraft(profile ? { ...profile } : undefined); setDraftRevision(snapshot?.revision ?? 0) }, [gameId, profile?.id])
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
  if (!snapshot) return <div className="game-page"><PageHeader title={t('suite.gameTitle')} /><Card><CardContent>{failed ? <div className="flex flex-col items-start gap-3"><p>{t('suite.actionFailed')}</p><Button variant="outline" onClick={() => void load()}>{t('suite.retry')}</Button></div> : <Spinner />}</CardContent></Card></div>
  if (!gameId) return <div className="game-page"><PageHeader title={t('suite.gameTitle')} actions={<Button disabled={busy || !api} onClick={() => void run({ action: 'add' })}><Plus data-icon="inline-start" />{t('suite.addGame')}</Button>} />
    {!snapshot.profiles.length && <Empty><EmptyHeader><EmptyTitle>{t('suite.libraryEmpty')}</EmptyTitle></EmptyHeader><Button disabled={busy || !api} onClick={() => void run({ action: 'add' })}>{t('suite.addGame')}</Button></Empty>}
    <div className="game-library">{snapshot.profiles.map(item => <Card key={item.id}><CardHeader><CardTitle>{item.name}</CardTitle></CardHeader><CardContent className="flex flex-col items-start gap-3"><Gamepad2 aria-hidden="true" /><Button nativeButton={false} variant="outline" render={<a href={`#/game-translation/${encodeURIComponent(item.id)}`} />}>{t('suite.connect')}</Button></CardContent></Card>)}</div>
  </div>
  if (!profile || !draft) return <Card><CardContent className="flex flex-col items-start gap-3"><p>{t('suite.notFound')}</p><Button nativeButton={false} variant="outline" render={<a href="#/game-translation" />}>{t('suite.gameLibrary')}</Button></CardContent></Card>
  const patch = (value: Partial<GameProfile>) => setDraft({ ...draft, ...value })
  const save = async () => { if (await run({ action: 'saveProfile', profile: draft, expectedRevision: draftRevision })) notifySuccess(t('suite.saved')) }
  return <div className="game-page"><PageHeader title={profile.name} actions={<div className="flex flex-wrap gap-2"><Button nativeButton={false} variant="outline" render={<a href="#/game-translation" />}><ArrowLeft data-icon="inline-start" />{t('suite.gameLibrary')}</Button>{profile.executable && <Button variant="outline" disabled={busy} onClick={() => void run({ action: 'launch', id: profile.id })}><Play data-icon="inline-start" />{t('suite.launch')}</Button>}{active ? <><Button variant="outline" disabled={busy} onClick={() => void run({ action: snapshot.status === 'paused' ? 'resume' : 'pause' })}>{snapshot.status === 'paused' ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}{t(snapshot.status === 'paused' ? 'suite.resume' : 'suite.pause')}</Button><Button variant="destructive" onClick={() => void api?.command({ action: 'stop' }).then(accept).catch(error => notifyError(t('suite.actionFailed'), { cause: error }))}><Square data-icon="inline-start" />{t('screen.stop')}</Button></> : <Button disabled={busy || draft.source !== 'clipboard' && !sourceId || draft.source === 'hook' && !snapshot.hookAvailable} onClick={() => { void (async () => { if (await run({ action: 'saveProfile', profile: draft, expectedRevision: draftRevision })) await run({ action: 'connect', id: profile.id, sourceId: sourceId || undefined }) })() }}>{t('suite.connect')}</Button>}</div>} />
    {snapshot.error && snapshot.activeGameId === gameId && <Alert><AlertDescription>{t(gameIssueKey(snapshot.error))}</AlertDescription></Alert>}
    <Card className="nola-settings-card"><CardContent className="nola-settings-content"><section className="nola-settings-section"><FieldGroup className="nola-settings-fields">
      <Field className="nola-settings-field"><FieldLabel htmlFor="game-name">{t('suite.gameName')}</FieldLabel><Input id="game-name" maxLength={80} value={draft.name} disabled={active || busy} onChange={event => patch({ name: event.target.value })} /></Field>
      <Field className="nola-settings-field"><FieldLabel htmlFor="game-source">{t('suite.textSource')}</FieldLabel><Select value={draft.source} disabled={active || busy} onValueChange={value => { if (value) patch({ source: value as GameProfile['source'] }) }}><SelectTrigger id="game-source"><SelectValue>{draft.source === 'ocr' ? 'OCR' : t(`suite.${draft.source}`)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(['auto', 'ocr', 'clipboard', 'hook'] as const).map(source => <SelectItem key={source} value={source} disabled={source === 'hook' && !snapshot.hookAvailable}>{source === 'ocr' ? 'OCR' : t(`suite.${source}`)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      {draft.source !== 'clipboard' && <Field className="nola-settings-field"><FieldLabel htmlFor="game-window">{t('suite.selectWindow')}</FieldLabel><Select value={sourceId || null} disabled={active || busy || !sources.length} onValueChange={value => { if (value) setSourceId(value) }}><SelectTrigger id="game-window"><SelectValue placeholder={t('suite.selectWindow')}>{sources.find(source => source.id === sourceId)?.name}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{sources.map(source => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}
      <Field className="nola-settings-field"><FieldLabel htmlFor="game-strategy">{t('suite.strategy')}</FieldLabel><Select value={draft.strategy} disabled={active || busy} onValueChange={value => { if (value) patch({ strategy: value as GameProfile['strategy'] }) }}><SelectTrigger id="game-strategy"><SelectValue>{t(`suite.${draft.strategy}`)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(['auto', 'speed', 'quality'] as const).map(strategy => <SelectItem key={strategy} value={strategy}>{t(`suite.${strategy}`)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field className="nola-settings-field"><FieldLabel>{t('shellUi.languageDirection')}</FieldLabel><LanguageDirectionSelect source={draft.sourceLanguage} target={draft.targetLanguage} sourceCodes={['auto', ...LANGUAGE_CODES]} targetCodes={[...LANGUAGE_CODES]} sourceLabel={t('screen.sourceLanguage')} targetLabel={t('screen.targetLanguage')} disabled={active || busy} onSourceChange={sourceLanguage => patch({ sourceLanguage })} onTargetChange={targetLanguage => patch({ targetLanguage })} /></Field>
      <GlossarySelectionField className="nola-settings-field" value={draft.glossarySelection} disabled={active || busy} onChange={glossarySelection => patch({ glossarySelection })} />
      </FieldGroup></section><div className="screen-settings__footer flex flex-wrap justify-end gap-2"><Button nativeButton={false} variant="outline" render={<a href="#/settings/glossary" />}>{t('suite.manageGlossary')}</Button><Button variant="outline" disabled={active || busy} onClick={() => setDeleting(true)}><Trash2 data-icon="inline-start" />{t('suite.delete')}</Button><Button disabled={active || busy || !draft.name.trim()} onClick={() => void save()}><Save data-icon="inline-start" />{t('suite.save')}</Button></div></CardContent></Card>
    {snapshot.activeGameId === gameId && snapshot.source === 'hook' && snapshot.sessionId && <Card><CardHeader><CardTitle>{t('suite.hookThreads')}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
      {!snapshot.threads?.length && <p role="status">{t('suite.hookWaiting')}</p>}
      {snapshot.threads?.map(thread => <section key={thread.id} className="flex min-w-0 flex-col gap-2"><div className="flex items-center justify-between gap-3"><span className="nola-body-strong">{thread.name}</span><Switch aria-label={`${t('suite.active')} ${thread.name}`} checked={thread.selected} disabled={busy || !thread.selected && (snapshot.threads?.filter(item => item.selected).length ?? 0) >= 8} onCheckedChange={selected => { const ids = snapshot.threads!.filter(item => item.id === thread.id ? selected : item.selected).map(item => item.id); void run({ action: 'selectThreads', sessionId: snapshot.sessionId!, ids }) }}><SwitchThumb /></Switch></div><code className="break-all text-muted">{thread.code}</code><p className="whitespace-pre-wrap break-words">{thread.preview}</p></section>)}
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (snapshot.sessionId) void run({ action: 'insertHook', sessionId: snapshot.sessionId, code: hookCode }).then(ok => { if (ok) setHookCode('') }) }}><Field className="min-w-0 flex-1"><FieldLabel htmlFor="game-hook-code">{t('suite.hookCode')}</FieldLabel><Input id="game-hook-code" maxLength={1024} value={hookCode} disabled={busy} onChange={event => setHookCode(event.target.value)} /></Field><Button type="submit" variant="outline" disabled={busy || !hookCode.trim()}>{t('suite.insertHook')}</Button></form>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>{t('suite.readingLog')}</CardTitle><span role="status">{active ? t(snapshot.status === 'paused' ? 'screen.states.paused' : 'screen.states.running') : t('suite.disconnected')}</span></CardHeader><CardContent><DualColumnView sourceLabel={t('suite.source')} targetLabel={t('suite.translation')} segments={snapshot.activeGameId === gameId ? snapshot.lines.map(line => ({ id: line.id, source: line.text, target: line.translation ?? '', interim: line.status !== 'ready' })) : []} empty={<Empty><EmptyHeader><EmptyTitle>{t('suite.resultEmpty')}</EmptyTitle></EmptyHeader></Empty>} /></CardContent></Card>
    <Dialog open={deleting} onOpenChange={open => { if (!busy) setDeleting(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: profile.name })}</DialogTitle><DialogDescription>{t('suite.deleteHint')}</DialogDescription><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => void run({ action: 'deleteProfile', id: profile.id, expectedRevision: snapshot.revision }).then(ok => { if (ok) location.hash = '/game-translation' })}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
  </div>
}
