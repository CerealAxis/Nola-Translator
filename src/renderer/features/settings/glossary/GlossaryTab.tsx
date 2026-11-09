import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getBridge } from '@/store'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { SettingGroup } from '../SettingsPage'
import { SettingsRow } from '../SettingsRow'
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '../../../../shared/languages'
import { glossaryEntrySchema, type GlossaryCommand, type GlossaryContext, type GlossaryDocument, type GlossaryEntry, type GlossaryLibrary, type GlossaryMatch } from '../../../../shared/glossary'
import { exportGlossaryCsv, parseGlossaryCsv, planGlossaryImport, type GlossaryCsvResult } from '../../../../shared/glossary-csv'
import { glossaryEntryKey } from '../../../../shared/glossary-match'

export function GlossaryTab({ libraryId }: { libraryId?: string }) {
  const { t, language } = useI18n()
  const api = getBridge()?.glossary
  const [document, setDocument] = useState<GlossaryDocument>()
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [libraryDraft, setLibraryDraft] = useState<Omit<GlossaryLibrary, 'entries'>>()
  const [entryDraft, setEntryDraft] = useState<GlossaryEntry>()
  const [formRevision, setFormRevision] = useState(0)
  const [deleting, setDeleting] = useState<{ name: string; command: GlossaryCommand }>()
  const [csv, setCsv] = useState<GlossaryCsvResult>()
  const [csvPolicy, setCsvPolicy] = useState<'skip' | 'replace'>('skip')
  const [testText, setTestText] = useState('')
  const [testLanguage, setTestLanguage] = useState('zh')
  const [testScenario, setTestScenario] = useState<GlossaryContext['scenario'] | 'website'>('tool')
  const [testProjectId, setTestProjectId] = useState('')
  const [testProjects, setTestProjects] = useState<Array<{ id: string; name: string }>>([])
  const [testPageUrl, setTestPageUrl] = useState('')
  const [testResult, setTestResult] = useState<GlossaryMatch>()
  const library = document?.libraries.find(item => item.id === libraryId)
  const csvPlan = useMemo(() => csv && library ? planGlossaryImport(library.entries, csv.entries, csvPolicy) : undefined, [csv, library, csvPolicy])
  const csvExisting = useMemo(() => new Map(library?.entries.map(entry => [glossaryEntryKey(entry), entry]) ?? []), [library])
  const scopeLabel = (kind: GlossaryContext['scenario'] | 'website') => t(kind === 'game' ? 'suite.gameTitle' : kind === 'comic' ? 'suite.comicTitle' : kind === 'screen' ? 'screen.title' : kind === 'website' ? 'browser.title' : kind === 'realtime' ? 'suite.realtimeScope' : 'suite.translationTools')
  const scopedTargets = library?.scope.mode === 'selected' ? library.scope.targets.filter(target => target.kind === testScenario && 'ids' in target) : []
  const restrictedProjects = scopedTargets.length > 0 && scopedTargets.every(target => 'ids' in target && target.ids !== '*')
  const scopedIds = scopedTargets.flatMap(target => 'ids' in target && target.ids !== '*' ? target.ids : [])
  const projectOptions = testProjects.filter(project => !restrictedProjects || scopedIds.includes(project.id))
  const accept = (value: GlossaryDocument) => setDocument(previous => !previous || value.revision >= previous.revision ? value : previous)
  const load = async () => {
    if (!api) { setLoadFailed(true); return }
    try { accept(await api.snapshot()); setLoadFailed(false) }
    catch { setLoadFailed(true) }
  }
  useEffect(() => { void load(); return api?.onChanged(() => { void load() }) }, [api])
  useEffect(() => { setQuery(''); setPage(0); setTestResult(undefined) }, [libraryId])
  useEffect(() => {
    const target = library?.scope.mode === 'selected' ? library.scope.targets[0] : undefined
    setTestScenario(target?.kind ?? 'tool'); setTestProjectId(''); setTestResult(undefined)
    setTestPageUrl(target?.kind === 'website' && target.patterns[0] ? `https://${target.patterns[0].replace(/^\*\./, '').replace(/\/\*$/, '/')}` : '')
  }, [libraryId, JSON.stringify(library?.scope)])
  useEffect(() => {
    let live = true
    setTestProjects([]); setTestProjectId('')
    const bridge = getBridge()
    const load = testScenario === 'game' ? bridge?.gameTranslation?.snapshot().then(value => value.profiles.map(profile => ({ id: profile.id, name: profile.name })))
      : testScenario === 'comic' ? bridge?.comic?.listProjects().then(value => value.map(project => ({ id: project.id, name: project.title })))
        : testScenario === 'screen' ? bridge?.screenTranslation?.snapshot().then(value => (value.presets ?? []).map(preset => ({ id: preset.id, name: preset.name }))) : undefined
    void load?.then(value => { if (live) setTestProjects(value) }).catch(() => {})
    return () => { live = false }
  }, [testScenario, libraryId])
  const mutate = async (command: GlossaryCommand, expectedRevision = document?.revision) => {
    if (!api || !document || pending.current) return false
    pending.current = true; setBusy(true)
    try { accept(await api.command({ operationId: crypto.randomUUID(), expectedRevision: expectedRevision!, command })); return true }
    catch (error) {
      const message = error instanceof Error ? error.message : ''
      const saved = message.toUpperCase().includes('REALTIMEGLOSSARYSAVEDSYNCFAILED')
      notifyError(t(saved ? 'suite.savedSyncFailed' : message.includes('conflict') ? 'suite.revisionConflict' : 'suite.actionFailed'), { cause: error })
      await load()
      return saved
    }
    finally { pending.current = false; setBusy(false) }
  }
  const entries = useMemo(() => (library?.entries ?? []).filter(entry => `${entry.source}\n${entry.target}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [library, query])
  const shown = entries.slice(page * 50, (page + 1) * 50)
  const label = (code: string) => code === '*' ? t('suite.allLanguages') : LANGUAGE_LABELS[code]?.[language === 'zh-CN' ? 'zh' : language === 'zh-TW' ? 'zhTW' : language === 'zh-HK' ? 'zhHK' : language] ?? code
  const newLibrary = () => { setFormRevision(document!.revision); setLibraryDraft({ id: crypto.randomUUID(), name: '', description: '', enabled: true, scope: { mode: 'global' } }) }
  const download = (kind: 'csv' | 'json') => {
    if (!library) return
    const url = URL.createObjectURL(new Blob([kind === 'csv' ? exportGlossaryCsv(library.entries) : JSON.stringify(library, null, 2)], { type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' }))
    const link = window.document.createElement('a'); link.href = url; link.download = `${library.name}.${kind}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!document) return <Card><CardContent>{loadFailed ? <div className="flex flex-col items-start gap-3"><p>{t('suite.actionFailed')}</p><Button variant="outline" onClick={() => void load()}>{t('suite.retry')}</Button></div> : <Spinner />}</CardContent></Card>
  if (libraryId && !library) return <Card><CardContent className="flex flex-col items-start gap-3"><p>{t('suite.notFound')}</p><Button nativeButton={false} variant="outline" render={<a href="#/settings/glossary" />}>{t('suite.back')}</Button></CardContent></Card>
  return <div className="flex min-w-0 flex-col gap-4">
    {library ? <div className="flex flex-wrap items-center gap-2"><Button nativeButton={false} variant="outline" size="sm" render={<a href="#/settings/glossary" />}><ArrowLeft data-icon="inline-start" />{t('suite.glossaryTitle')}</Button><h2 className="nola-title">{library.name}</h2></div> : <SettingGroup legend={t('suite.glossaryTitle')} actions={<Button variant="outline" size="sm" disabled={busy} onClick={newLibrary}><Plus data-icon="inline-start" />{t('suite.newLibrary')}</Button>}>
      <SettingsRow label={t('suite.enabled')}><Switch checked={document.enabled} disabled={busy} aria-label={t('suite.enabled')} onCheckedChange={enabled => void mutate({ action: 'setEnabled', enabled })}><SwitchThumb /></Switch></SettingsRow>
    </SettingGroup>}
    {!library && document.libraries.map(item => (
      <Card key={item.id} size="sm">
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>{item.name}</CardTitle>
          <CardDescription>{t('suite.terms', { count: item.entries.length })}</CardDescription>
          <CardAction className="flex items-center gap-2">
            <Switch checked={item.enabled} disabled={busy} aria-label={`${t('suite.active')} ${item.name}`} onCheckedChange={enabled => {
              const { entries: _, ...metadata } = item
              void mutate({ action: 'saveLibrary', library: { ...metadata, enabled } })
            }}><SwitchThumb /></Switch>
            <Button nativeButton={false} variant="outline" size="sm" render={<a href={`#/settings/glossary/${encodeURIComponent(item.id)}`} />}>{t('suite.edit')}</Button>
          </CardAction>
        </CardHeader>
        {item.description && <CardContent className="wrap-anywhere">{item.description}</CardContent>}
      </Card>
    ))}
    {!library && !document.libraries.length && <Empty><EmptyHeader><EmptyTitle>{t('suite.emptyGlossary')}</EmptyTitle></EmptyHeader><Button disabled={busy} onClick={newLibrary}>{t('suite.newLibrary')}</Button></Empty>}
    {library && <>
      <SettingGroup legend={t('suite.description')} actions={<div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => { const { entries: _, ...metadata } = library; setFormRevision(document.revision); setLibraryDraft(metadata) }}><Pencil data-icon="inline-start" />{t('suite.edit')}</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => setDeleting({ name: library.name, command: { action: 'deleteLibrary', libraryId: library.id } })}><Trash2 data-icon="inline-start" />{t('suite.delete')}</Button></div>}>
        {library.description && <p>{library.description}</p>}<SettingsRow label={t('suite.scope')} desc={t('suite.glossaryScopeHint')} descriptionTooltip><span>{library.scope.mode === 'global' ? t('suite.global') : library.scope.targets.map(target => t(target.kind === 'game' ? 'suite.gameTitle' : target.kind === 'comic' ? 'suite.comicTitle' : target.kind === 'screen' ? 'screen.title' : target.kind === 'website' ? 'browser.title' : target.kind === 'realtime' ? 'suite.realtimeScope' : 'suite.translationTools')).join(', ')}</span></SettingsRow>
      </SettingGroup>
      <Card><CardHeader><CardTitle>{t('suite.terms', { count: library.entries.length })}</CardTitle><div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => download('csv')}><Download data-icon="inline-start" />{t('suite.exportCsv')}</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => download('json')}>{t('suite.exportJson')}</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { setFormRevision(document.revision); setCsvPolicy('skip'); setCsv({ entries: [], errors: [] }) }}><Upload data-icon="inline-start" />{t('suite.importCsv')}</Button>
        <Button size="sm" disabled={busy} onClick={() => { setFormRevision(document.revision); setEntryDraft({ id: crypto.randomUUID(), source: '', target: '', targetLanguage: '*', caseSensitive: false, enabled: true }) }}><Plus data-icon="inline-start" />{t('suite.addTerm')}</Button>
      </div></CardHeader><CardContent className="flex min-w-0 flex-col gap-3">
        <Field><FieldLabel htmlFor="glossary-search">{t('suite.search')}</FieldLabel><Input id="glossary-search" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></Field>
        <Table><TableHeader><TableRow><TableHead>{t('suite.source')}</TableHead><TableHead>{t('suite.translation')}</TableHead><TableHead>{t('suite.targetLanguage')}</TableHead><TableHead>{t('suite.active')}</TableHead><TableHead><span className="sr-only">{t('suite.edit')}</span></TableHead></TableRow></TableHeader><TableBody>
          {shown.map(entry => <TableRow key={entry.id}><TableCell className="break-all">{entry.source}</TableCell><TableCell className="break-all">{entry.target || <span className="text-muted">{t('suite.keep')}</span>}</TableCell><TableCell>{label(entry.targetLanguage)}</TableCell><TableCell><Switch checked={entry.enabled} disabled={busy} aria-label={`${t('suite.active')} ${entry.source}`} onCheckedChange={enabled => void mutate({ action: 'saveTerm', libraryId: library.id, entry: { ...entry, enabled } })}><SwitchThumb /></Switch></TableCell><TableCell><div className="flex gap-2"><Button variant="outline" size="icon-sm" aria-label={`${t('suite.edit')} ${entry.source}`} onClick={() => { setFormRevision(document.revision); setEntryDraft({ ...entry }) }}><Pencil /></Button><Button variant="outline" size="icon-sm" disabled={busy} aria-label={`${t('suite.delete')} ${entry.source}`} onClick={() => setDeleting({ name: entry.source, command: { action: 'deleteTerms', libraryId: library.id, entryIds: [entry.id] } })}><Trash2 /></Button></div></TableCell></TableRow>)}
        </TableBody></Table>
        {!entries.length && <p className="text-muted">{t('suite.noMatches')}</p>}
        {entries.length > 50 && <div className="flex items-center justify-end gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>{t('suite.previous')}</Button><span>{page + 1} / {Math.ceil(entries.length / 50)}</span><Button variant="outline" size="sm" disabled={(page + 1) * 50 >= entries.length} onClick={() => setPage(value => value + 1)}>{t('suite.next')}</Button></div>}
      </CardContent></Card>
      <SettingGroup legend={t('suite.matchTest')}><FieldGroup><Field><FieldLabel htmlFor="glossary-test-scenario">{t('suite.testScenario')}</FieldLabel><Select value={testScenario} onValueChange={value => { if (value) { setTestScenario(value as typeof testScenario); setTestResult(undefined) } }}><SelectTrigger id="glossary-test-scenario"><SelectValue>{scopeLabel(testScenario)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(['screen', 'game', 'comic', 'realtime', 'tool', 'website'] as const).map(scenario => <SelectItem key={scenario} value={scenario}>{scopeLabel(scenario)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
{(!!projectOptions.length || restrictedProjects) && <Field><FieldLabel htmlFor="glossary-test-project">{t('suite.testProject')}</FieldLabel><Select value={testProjectId || null} disabled={!projectOptions.length} onValueChange={value => { if (value) { setTestProjectId(value); setTestResult(undefined) } }}><SelectTrigger id="glossary-test-project"><SelectValue placeholder={t('suite.testProject')}>{projectOptions.find(project => project.id === testProjectId)?.name}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{projectOptions.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}
{testScenario === 'website' && <Field><FieldLabel htmlFor="glossary-test-url">{t('suite.testPageUrl')}</FieldLabel><Input id="glossary-test-url" type="url" maxLength={4096} value={testPageUrl} onChange={event => { setTestPageUrl(event.target.value); setTestResult(undefined) }} /></Field>}<Field><FieldLabel htmlFor="glossary-test-language">{t('suite.targetLanguage')}</FieldLabel><Select value={testLanguage} onValueChange={value => { if (value) { setTestLanguage(value); setTestResult(undefined) } }}><SelectTrigger id="glossary-test-language"><SelectValue>{label(testLanguage)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{LANGUAGE_CODES.map(code => <SelectItem key={code} value={code}>{label(code)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="glossary-test">{t('suite.source')}</FieldLabel><Textarea id="glossary-test" value={testText} maxLength={64000} onChange={event => { setTestText(event.target.value); setTestResult(undefined) }} /></Field><Button variant="outline" disabled={!testText.trim() || busy || restrictedProjects && !testProjectId || testScenario === 'website' && !testPageUrl.trim()} onClick={() => { if (api) void api.testMatch({ text: testText, targetLanguage: testLanguage, context: { scenario: testScenario === 'website' ? 'tool' : testScenario, ...(testProjectId ? { projectId: testProjectId } : {}), ...(testScenario === 'website' ? { pageUrl: testPageUrl } : {}) }, selection: { mode: 'selected', libraryIds: [library.id] } }).then(setTestResult).catch(error => notifyError(t('suite.actionFailed'), { cause: error })) }}>{t('suite.matchTest')}</Button>{testResult && <div role="status">{testResult.hits.length ? testResult.hits.map(hit => <p key={`${hit.entryId}:${hit.start}`}>{hit.actual} → {hit.term.mode === 'keep' ? t('suite.keep') : hit.term.target}</p>) : t('suite.noMatches')}</div>}</FieldGroup></SettingGroup>
    </>}
    <Dialog open={!!libraryDraft} onOpenChange={open => { if (!open && !busy) setLibraryDraft(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.newLibrary')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent>{libraryDraft && <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void mutate({ action: 'saveLibrary', library: libraryDraft }, formRevision).then(ok => { if (ok) setLibraryDraft(undefined) }) }}><FieldGroup><Field><FieldLabel htmlFor="glossary-name">{t('suite.title')}</FieldLabel><Input id="glossary-name" required maxLength={100} value={libraryDraft.name} disabled={busy} onChange={event => setLibraryDraft({ ...libraryDraft, name: event.target.value })} /></Field><Field><FieldLabel htmlFor="glossary-description">{t('suite.description')}</FieldLabel><Textarea id="glossary-description" maxLength={500} value={libraryDraft.description} disabled={busy} onChange={event => setLibraryDraft({ ...libraryDraft, description: event.target.value })} /></Field><Field><FieldLabel htmlFor="glossary-scope">{t('suite.scope')}</FieldLabel><Select value={libraryDraft.scope.mode === 'global' ? 'global' : libraryDraft.scope.targets.length === 1 ? libraryDraft.scope.targets[0].kind : 'selected'} disabled={busy} onValueChange={value => { if (value === 'global') setLibraryDraft({ ...libraryDraft, scope: { mode: 'global' } }); else if (value === 'screen' || value === 'game' || value === 'comic') setLibraryDraft({ ...libraryDraft, scope: { mode: 'selected', targets: [{ kind: value, ids: '*' }] } }); else if (value === 'realtime' || value === 'tool') setLibraryDraft({ ...libraryDraft, scope: { mode: 'selected', targets: [{ kind: value }] } }) }}><SelectTrigger id="glossary-scope"><SelectValue>{libraryDraft.scope.mode === 'global' ? t('suite.global') : libraryDraft.scope.targets.map(target => scopeLabel(target.kind)).join(', ')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="global">{t('suite.global')}</SelectItem><SelectItem value="screen">{t('screen.title')}</SelectItem><SelectItem value="game">{t('suite.gameTitle')}</SelectItem><SelectItem value="comic">{t('suite.comicTitle')}</SelectItem><SelectItem value="realtime">{t('suite.realtimeScope')}</SelectItem><SelectItem value="tool">{t('suite.translationTools')}</SelectItem></SelectGroup></SelectContent></Select></Field></FieldGroup><Button type="submit" disabled={busy || !libraryDraft.name.trim()}>{t('suite.save')}</Button></form>}</CardContent></DialogContent></Dialog>
    <Dialog open={!!entryDraft} onOpenChange={open => { if (!open && !busy) setEntryDraft(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.addTerm')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent>{entryDraft && library && <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (glossaryEntrySchema.safeParse(entryDraft).success) void mutate({ action: 'saveTerm', libraryId: library.id, entry: entryDraft }, formRevision).then(ok => { if (ok) setEntryDraft(undefined) }) }}><FieldGroup>
      <Field><FieldLabel htmlFor="term-source">{t('suite.source')}</FieldLabel><Input id="term-source" required maxLength={200} disabled={busy} value={entryDraft.source} onChange={event => setEntryDraft({ ...entryDraft, source: event.target.value })} /></Field>
      <Field><FieldLabel htmlFor="term-target">{t('suite.translation')}</FieldLabel><Input id="term-target" maxLength={200} disabled={busy} value={entryDraft.target} onChange={event => setEntryDraft({ ...entryDraft, target: event.target.value })} />{!entryDraft.target && <span className="text-muted">{t('suite.keep')}</span>}</Field>
      <Field><FieldLabel htmlFor="term-language">{t('suite.targetLanguage')}</FieldLabel><Select value={entryDraft.targetLanguage} disabled={busy} onValueChange={value => { if (value) setEntryDraft({ ...entryDraft, targetLanguage: value }) }}><SelectTrigger id="term-language"><SelectValue>{label(entryDraft.targetLanguage)}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{['*', ...LANGUAGE_CODES].map(code => <SelectItem key={code} value={code}>{label(code)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field className="flex flex-row items-center justify-between"><FieldLabel htmlFor="term-case">{t('suite.caseSensitive')}</FieldLabel><Switch id="term-case" checked={entryDraft.caseSensitive} disabled={busy} onCheckedChange={caseSensitive => setEntryDraft({ ...entryDraft, caseSensitive })}><SwitchThumb /></Switch></Field>
      </FieldGroup><Button type="submit" disabled={busy || !glossaryEntrySchema.safeParse(entryDraft).success}>{t('suite.save')}</Button></form>}</CardContent></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: deleting?.name ?? '' })}</DialogTitle><DialogDescription>{t('suite.deleteHint')}</DialogDescription><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => { if (deleting) void mutate(deleting.command).then(ok => { if (ok) { setDeleting(undefined); if (deleting.command.action === 'deleteLibrary') location.hash = '/settings/glossary' } }) }}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
    <Dialog open={!!csv} onOpenChange={open => { if (!open && !busy) setCsv(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.preview')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="glossary-csv">{t('suite.importCsv')}</FieldLabel><Input id="glossary-csv" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 40 * 1024 * 1024) { notifyError(t('suite.csvInvalid')); return } void file.text().then(text => { try { setCsv(parseGlossaryCsv(text)) } catch { setCsv({ entries: [], errors: [{ line: 0, reason: 'invalidCsv' }] }); notifyError(t('suite.csvInvalid')) } }).catch(error => notifyError(t('suite.actionFailed'), { cause: error })) }} /></Field>
      {csv && <><p>{t('suite.terms', { count: csv.entries.length })}</p>{!!csvPlan?.conflicts && <><p>{t('suite.importConflicts', { count: csvPlan.conflicts })}</p><Field><FieldLabel htmlFor="glossary-csv-policy">{t('suite.conflictPolicy')}</FieldLabel><Select value={csvPolicy} disabled={busy} onValueChange={value => { if (value) setCsvPolicy(value as 'skip' | 'replace') }}><SelectTrigger id="glossary-csv-policy"><SelectValue>{t(csvPolicy === 'skip' ? 'suite.skipExisting' : 'suite.replaceExisting')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="skip">{t('suite.skipExisting')}</SelectItem><SelectItem value="replace">{t('suite.replaceExisting')}</SelectItem></SelectGroup></SelectContent></Select></Field></>}{!!csv.errors.length && <Alert><AlertDescription>{t('suite.csvErrors', { count: csv.errors.length })}</AlertDescription></Alert>}<Table><TableHeader><TableRow><TableHead>{t('suite.source')}</TableHead><TableHead>{t('suite.translation')}</TableHead><TableHead>{t('suite.currentTranslation')}</TableHead></TableRow></TableHeader><TableBody>{csv.entries.slice(0, 5).map(entry => <TableRow key={entry.id}><TableCell>{entry.source}</TableCell><TableCell>{entry.target || t('suite.keep')}</TableCell><TableCell>{csvExisting.has(glossaryEntryKey(entry)) ? csvExisting.get(glossaryEntryKey(entry))!.target || t('suite.keep') : t('suite.newTerm')}</TableCell></TableRow>)}</TableBody></Table><Button disabled={busy || !csv.entries.length || !!csv.errors.length || !library} onClick={() => { if (library) void mutate({ action: 'importTerms', libraryId: library.id, entries: csvPlan!.entries, mode: 'replace' }, formRevision).then(ok => { if (ok) { setCsv(undefined); notifySuccess(t('suite.saved')) } }) }}>{t('suite.importCsv')}</Button></>}
    </CardContent></DialogContent></Dialog>
  </div>
}
