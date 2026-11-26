import { useEffect, useMemo, useRef, useState } from 'react'
import { Braces, Check, ChevronRight, Download, FlaskConical, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getBridge } from '@/store'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProcessingIconButton, ProcessingPageHeading, textProcessingPath, type BreadcrumbEntry } from '../text-processing/ProcessingPage'
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
  const [addingEntry, setAddingEntry] = useState<GlossaryEntry>()
  const [editingDrafts, setEditingDrafts] = useState<Record<string, { source: string; target: string }>>({})
  const [formRevision, setFormRevision] = useState(0)
  const [deleting, setDeleting] = useState<{ name: string; command: GlossaryCommand }>()
  const [csv, setCsv] = useState<GlossaryCsvResult>()
  const [csvPolicy, setCsvPolicy] = useState<'skip' | 'replace'>('skip')
  const [testing, setTesting] = useState(false)
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
  useEffect(() => { setQuery(''); setPage(0); setTestResult(undefined); setAddingEntry(undefined); setEditingDrafts({}) }, [libraryId])
  useEffect(() => {
    const target = library?.scope.mode === 'selected' ? library.scope.targets[0] : undefined
    setTestScenario(target?.kind ?? 'tool'); setTestProjectId(''); setTestResult(undefined)
    setTestPageUrl(target?.kind === 'website' && target.patterns[0] ? `https://${target.patterns[0].replace(/^\*\./, '').replace(/\/\*$/, '/')}` : '')
  }, [libraryId, JSON.stringify(library?.scope)])
  useEffect(() => {
    let live = true
    setTestProjects([]); setTestProjectId('')
    const bridge = getBridge()
    const loadProjects = testScenario === 'game' ? bridge?.gameTranslation?.snapshot().then(value => value.profiles.map(profile => ({ id: profile.id, name: profile.name })))
      : testScenario === 'comic' ? bridge?.comic?.listProjects().then(value => value.map(project => ({ id: project.id, name: project.title })))
        : testScenario === 'screen' ? bridge?.screenTranslation?.snapshot().then(value => (value.presets ?? []).map(preset => ({ id: preset.id, name: preset.name }))) : undefined
    void loadProjects?.then(value => { if (live) setTestProjects(value) }).catch(() => {})
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
  const base = textProcessingPath + '/glossary'
  const overview = textProcessingPath + '/optimization'
  const scopeName = (item: GlossaryLibrary) => item.scope.mode === 'global'
    ? t('suite.global') : item.scope.targets.map(target => scopeLabel(target.kind)).join(', ')

  function startNewEntry() {
    setFormRevision(document!.revision)
    setAddingEntry({ id: crypto.randomUUID(), source: '', target: '', targetLanguage: '*', caseSensitive: false, enabled: true })
  }

  function commitExisting(entry: GlossaryEntry) {
    const draft = editingDrafts[entry.id]
    if (!draft || !library) return
    setEditingDrafts(prev => {
      const next = { ...prev }
      delete next[entry.id]
      return next
    })
    const updated = { ...entry, source: draft.source, target: draft.target }
    if ((updated.source !== entry.source || updated.target !== entry.target) && glossaryEntrySchema.safeParse(updated).success) {
      void mutate({ action: 'saveTerm', libraryId: library.id, entry: updated })
    }
  }

  const breadcrumbs: BreadcrumbEntry[] = [
    { label: t('suite.textProcessing'), href: textProcessingPath },
    { label: t('suite.textOptimize'), href: overview },
    { label: t('suite.glossaryTitle'), href: library ? base : undefined },
    ...(library ? [{ label: library.name }] : []),
  ]

  if (!document) return (
    <div className="settings-panel">
      <ProcessingPageHeading title={t('suite.glossaryTitle')} back={overview} breadcrumbs={breadcrumbs} />
      <Card size="sm">
        <CardContent>
          {loadFailed ? (
            <div className="flex flex-col items-start gap-3" role="alert">
              <p>{t('suite.actionFailed')}</p>
              <Button variant="secondary" size="sm" onClick={() => void load()}>{t('suite.retry')}</Button>
            </div>
          ) : <div className="flex items-center gap-2"><Spinner /><span>{t('common.loading')}</span></div>}
        </CardContent>
      </Card>
    </div>
  )
  if (libraryId && !library) return <ProcessingPageHeading title={t('suite.notFound')} back={base} breadcrumbs={breadcrumbs} />

  return (
    <div className="settings-panel">
      {!library ? (
        <>
          <ProcessingPageHeading
            title={t('suite.glossaryTitle')}
            back={overview}
            breadcrumbs={breadcrumbs}
            actions={
              <Button size="sm" disabled={busy} onClick={newLibrary}>
                <Plus data-icon="inline-start" />{t('suite.newLibrary')}
              </Button>
            }
          />
          <Card>
            <CardContent>
              {document.libraries.length ? (
                <Table aria-label={t('suite.glossaryTitle')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t('suite.title')}</TableHead>
                      <TableHead scope="col">{t('suite.scope')}</TableHead>
                      <TableHead scope="col" className="processing-fit">{t('suite.textRuleCount')}</TableHead>
                      <TableHead scope="col" className="processing-fit">{t('suite.active')}</TableHead>
                      <TableHead scope="col" className="processing-fit text-right">{t('suite.textActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {document.libraries.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="processing-text-cell">
                          <a className="processing-table-link font-medium" href={base + '/' + encodeURIComponent(item.id)}>{item.name}</a>
                        </TableCell>
                        <TableCell className="processing-text-cell">
                          <Badge variant="secondary">{scopeName(item)}</Badge>
                        </TableCell>
                        <TableCell>{item.entries.length}</TableCell>
                        <TableCell>
                          <Switch checked={item.enabled} disabled={busy} aria-label={t('suite.active') + ' ' + item.name}
                            onCheckedChange={enabled => {
                              const { entries: _, ...metadata } = item
                              void mutate({ action: 'saveLibrary', library: { ...metadata, enabled } })
                            }}><SwitchThumb /></Switch>
                        </TableCell>
                        <TableCell>
                          <div className="text-processing-actions">
                            <Tooltip>
                              <TooltipTrigger render={
                                <ProcessingIconButton label={t('suite.textOpenTable') + ' ' + item.name}
                                  nativeButton={false} render={<a href={base + '/' + encodeURIComponent(item.id)} />}>
                                  <ChevronRight />
                                </ProcessingIconButton>
                              } />
                              <TooltipContent>{t('suite.textOpenTable')}</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{t('suite.emptyGlossary')}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <ProcessingPageHeading
            title={library.name}
            back={base}
            breadcrumbs={breadcrumbs}
            actions={
              <>
                <Badge variant="secondary">{scopeName(library)}</Badge>
                <Tooltip>
                  <TooltipTrigger render={
                    <ProcessingIconButton label={t('suite.edit')} disabled={busy} onClick={() => {
                      const { entries: _, ...metadata } = library
                      setFormRevision(document.revision); setLibraryDraft(metadata)
                    }}><Pencil /></ProcessingIconButton>
                  } />
                  <TooltipContent>{t('suite.edit')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <ProcessingIconButton label={t('suite.delete')} disabled={busy} onClick={() => setDeleting({
                      name: library.name, command: { action: 'deleteLibrary', libraryId: library.id },
                    })}><Trash2 /></ProcessingIconButton>
                  } />
                  <TooltipContent>{t('suite.delete')}</TooltipContent>
                </Tooltip>
              </>
            }
          />
          {library.description && <p className="type-muted">{library.description}</p>}
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <InputGroup className="w-full max-w-xs">
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label={t('suite.search')}
                placeholder={t('suite.search')}
                value={query}
                onChange={event => { setQuery(event.target.value); setPage(0) }}
              />
            </InputGroup>
            <div className="text-processing-actions">
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.matchTest')} onClick={() => setTesting(true)}><FlaskConical /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.matchTest')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.exportCsv')} disabled={busy} onClick={() => download('csv')}><Download /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.exportCsv')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.exportJson')} disabled={busy} onClick={() => download('json')}><Braces /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.exportJson')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.importCsv')} disabled={busy} onClick={() => {
                    setFormRevision(document.revision); setCsvPolicy('skip'); setCsv({ entries: [], errors: [] })
                  }}><Upload /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.importCsv')}</TooltipContent>
              </Tooltip>
              <Button size="sm" disabled={busy || Boolean(addingEntry)} onClick={startNewEntry}>
                <Plus data-icon="inline-start" />{t('suite.addTerm')}
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3">
              {(shown.length > 0 || addingEntry) ? (
                <Table aria-label={library.name}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t('suite.source')}</TableHead>
                      <TableHead scope="col">{t('suite.translation')}</TableHead>
                      <TableHead scope="col" className="processing-fit">{t('suite.targetLanguage')}</TableHead>
                      <TableHead scope="col" className="processing-fit text-center">{t('suite.caseSensitive')}</TableHead>
                      <TableHead scope="col" className="processing-fit">{t('suite.active')}</TableHead>
                      <TableHead scope="col" className="processing-fit text-right">{t('suite.textActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {addingEntry && (
                      <TableRow>
                        <TableCell className="min-w-36">
                          <Input
                            aria-label={t('suite.source')}
                            placeholder={t('suite.source')}
                            autoFocus
                            maxLength={200}
                            disabled={busy}
                            value={addingEntry.source}
                            onChange={event => setAddingEntry({ ...addingEntry, source: event.target.value })}
                          />
                        </TableCell>
                        <TableCell className="min-w-36">
                          <Input
                            aria-label={t('suite.translation')}
                            placeholder={t('suite.keep')}
                            maxLength={200}
                            disabled={busy}
                            value={addingEntry.target}
                            onChange={event => setAddingEntry({ ...addingEntry, target: event.target.value })}
                          />
                        </TableCell>
                        <TableCell className="processing-fit">
                          <Select value={addingEntry.targetLanguage} disabled={busy}
                            onValueChange={value => { if (value) setAddingEntry({ ...addingEntry, targetLanguage: value }) }}>
                            <SelectTrigger size="sm" aria-label={t('suite.targetLanguage')}>
                              <SelectValue>{label(addingEntry.targetLanguage)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>{['*', ...LANGUAGE_CODES].map(code => <SelectItem key={code} value={code}>{label(code)}</SelectItem>)}</SelectGroup>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="processing-fit">
                          <div className="flex justify-center">
                            <Checkbox
                              aria-label={t('suite.caseSensitive')}
                              checked={addingEntry.caseSensitive}
                              disabled={busy}
                              onCheckedChange={checked => setAddingEntry({ ...addingEntry, caseSensitive: Boolean(checked) })}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="processing-fit">
                          <Switch checked={addingEntry.enabled} disabled={busy} aria-label={t('suite.active')}
                            onCheckedChange={enabled => setAddingEntry({ ...addingEntry, enabled })}><SwitchThumb /></Switch>
                        </TableCell>
                        <TableCell className="processing-fit">
                          <div className="text-processing-actions">
                            <ProcessingIconButton label={t('suite.save')} disabled={busy || !glossaryEntrySchema.safeParse(addingEntry).success}
                              onClick={() => {
                                if (glossaryEntrySchema.safeParse(addingEntry).success) {
                                  void mutate({ action: 'saveTerm', libraryId: library.id, entry: addingEntry }, formRevision).then(ok => {
                                    if (ok) setAddingEntry(undefined)
                                  })
                                }
                              }}><Check /></ProcessingIconButton>
                            <ProcessingIconButton label={t('common.cancel')} disabled={busy} onClick={() => setAddingEntry(undefined)}>
                              <X />
                            </ProcessingIconButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {shown.map(entry => {
                      const draft = editingDrafts[entry.id]
                      const sourceVal = draft?.source ?? entry.source
                      const targetVal = draft?.target ?? entry.target
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="min-w-36">
                            <Input
                              aria-label={`${t('suite.source')} ${entry.source}`}
                              maxLength={200}
                              disabled={busy}
                              value={sourceVal}
                              onChange={event => setEditingDrafts(prev => ({
                                ...prev, [entry.id]: { source: event.target.value, target: targetVal },
                              }))}
                              onBlur={() => commitExisting(entry)}
                            />
                          </TableCell>
                          <TableCell className="min-w-36">
                            <Input
                              aria-label={`${t('suite.translation')} ${entry.source}`}
                              placeholder={t('suite.keep')}
                              maxLength={200}
                              disabled={busy}
                              value={targetVal}
                              onChange={event => setEditingDrafts(prev => ({
                                ...prev, [entry.id]: { source: sourceVal, target: event.target.value },
                              }))}
                              onBlur={() => commitExisting(entry)}
                            />
                          </TableCell>
                          <TableCell className="processing-fit">
                            <Select value={entry.targetLanguage} disabled={busy}
                              onValueChange={value => {
                                if (value) void mutate({ action: 'saveTerm', libraryId: library.id, entry: { ...entry, targetLanguage: value } })
                              }}>
                              <SelectTrigger size="sm" aria-label={`${t('suite.targetLanguage')} ${entry.source}`}>
                                <SelectValue>{label(entry.targetLanguage)}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>{['*', ...LANGUAGE_CODES].map(code => <SelectItem key={code} value={code}>{label(code)}</SelectItem>)}</SelectGroup>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="processing-fit">
                            <div className="flex justify-center">
                              <Checkbox
                                aria-label={`${t('suite.caseSensitive')} ${entry.source}`}
                                checked={entry.caseSensitive}
                                disabled={busy}
                                onCheckedChange={checked => void mutate({
                                  action: 'saveTerm', libraryId: library.id, entry: { ...entry, caseSensitive: Boolean(checked) },
                                })}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch checked={entry.enabled} disabled={busy} aria-label={t('suite.active') + ' ' + entry.source}
                              onCheckedChange={enabled => void mutate({ action: 'saveTerm', libraryId: library.id, entry: { ...entry, enabled } })}>
                              <SwitchThumb />
                            </Switch>
                          </TableCell>
                          <TableCell>
                            <div className="text-processing-actions">
                              <Tooltip>
                                <TooltipTrigger render={
                                  <ProcessingIconButton label={t('suite.delete') + ' ' + entry.source} disabled={busy} onClick={() => setDeleting({
                                    name: entry.source, command: { action: 'deleteTerms', libraryId: library.id, entryIds: [entry.id] },
                                  })}><Trash2 /></ProcessingIconButton>
                                } />
                                <TooltipContent>{t('suite.delete')}</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{t('suite.noMatches')}</EmptyTitle>
                  </EmptyHeader>
                  {query && (
                    <Button size="sm" variant="secondary" onClick={() => setQuery('')}>{t('suite.textClearSearch')}</Button>
                  )}
                </Empty>
              )}
              {entries.length > 50 && (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>{t('suite.previous')}</Button>
                  <span className="type-muted tabular-nums">{page + 1} / {Math.ceil(entries.length / 50)}</span>
                  <Button variant="secondary" size="sm" disabled={(page + 1) * 50 >= entries.length} onClick={() => setPage(value => value + 1)}>{t('suite.next')}</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={Boolean(libraryDraft)} onOpenChange={open => { if (!open && !busy) setLibraryDraft(undefined) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{libraryDraft?.id === library?.id ? t('suite.edit') + ' ' + library?.name : t('suite.newLibrary')}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          {libraryDraft && (
            <form onSubmit={event => {
              event.preventDefault()
              void mutate({ action: 'saveLibrary', library: libraryDraft }, formRevision).then(ok => { if (ok) setLibraryDraft(undefined) })
            }}>
              <CardContent className="px-0 pb-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="glossary-name">{t('suite.title')}</FieldLabel>
                    <Input id="glossary-name" required maxLength={100} value={libraryDraft.name} disabled={busy}
                      onChange={event => setLibraryDraft({ ...libraryDraft, name: event.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="glossary-description">{t('suite.description')}</FieldLabel>
                    <Textarea id="glossary-description" maxLength={500} value={libraryDraft.description} disabled={busy}
                      onChange={event => setLibraryDraft({ ...libraryDraft, description: event.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="glossary-scope">{t('suite.scope')}</FieldLabel>
                    <Select value={libraryDraft.scope.mode === 'global' ? 'global' : libraryDraft.scope.targets.length === 1 ? libraryDraft.scope.targets[0].kind : 'selected'}
                      disabled={busy} onValueChange={value => {
                        if (value === 'global') setLibraryDraft({ ...libraryDraft, scope: { mode: 'global' } })
                        else if (value === 'screen' || value === 'game' || value === 'comic') setLibraryDraft({ ...libraryDraft, scope: { mode: 'selected', targets: [{ kind: value, ids: '*' }] } })
                        else if (value === 'realtime' || value === 'tool') setLibraryDraft({ ...libraryDraft, scope: { mode: 'selected', targets: [{ kind: value }] } })
                      }}>
                      <SelectTrigger id="glossary-scope">
                        <SelectValue>{libraryDraft.scope.mode === 'global' ? t('suite.global') : libraryDraft.scope.targets.map(target => scopeLabel(target.kind)).join(', ')}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="global">{t('suite.global')}</SelectItem>
                          <SelectItem value="screen">{t('screen.title')}</SelectItem>
                          <SelectItem value="game">{t('suite.gameTitle')}</SelectItem>
                          <SelectItem value="comic">{t('suite.comicTitle')}</SelectItem>
                          <SelectItem value="realtime">{t('suite.realtimeScope')}</SelectItem>
                          <SelectItem value="tool">{t('suite.translationTools')}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
              </CardContent>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setLibraryDraft(undefined)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={busy || !libraryDraft.name.trim()}>{t('suite.save')}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting ? t('suite.deleteConfirm', { name: deleting.name }) : ''}</AlertDialogTitle>
            <AlertDialogDescription>{t('suite.deleteHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="danger" disabled={busy} onClick={() => {
              if (!deleting) return
              void mutate(deleting.command).then(ok => {
                if (!ok) return
                setDeleting(undefined)
                if (deleting.command.action === 'deleteLibrary') location.hash = base
              })
            }}>{t('suite.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(csv)} onOpenChange={open => { if (!open && !busy) setCsv(undefined) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('suite.importCsv')}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          {csv && (
            <>
              <CardContent className="flex flex-col gap-[var(--field-gap)] px-0 pb-4">
                <Field>
                  <FieldLabel htmlFor="glossary-csv">{t('suite.importCsv')}</FieldLabel>
                  <Input id="glossary-csv" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
                    const file = event.target.files?.[0]; if (!file) return
                    if (file.size > 40 * 1024 * 1024) { notifyError(t('suite.csvInvalid')); return }
                    void file.text().then(text => {
                      try { setCsv(parseGlossaryCsv(text)) }
                      catch { setCsv({ entries: [], errors: [{ line: 0, reason: 'invalidCsv' }] }); notifyError(t('suite.csvInvalid')) }
                    }).catch(error => notifyError(t('suite.actionFailed'), { cause: error }))
                  }} />
                </Field>
                <p>{t('suite.terms', { count: csv.entries.length })}</p>
                {!!csvPlan?.conflicts && (
                  <>
                    <p>{t('suite.importConflicts', { count: csvPlan.conflicts })}</p>
                    <Field>
                      <FieldLabel htmlFor="glossary-csv-policy">{t('suite.conflictPolicy')}</FieldLabel>
                      <Select value={csvPolicy} disabled={busy} onValueChange={value => { if (value) setCsvPolicy(value as 'skip' | 'replace') }}>
                        <SelectTrigger id="glossary-csv-policy"><SelectValue>{t(csvPolicy === 'skip' ? 'suite.skipExisting' : 'suite.replaceExisting')}</SelectValue></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="skip">{t('suite.skipExisting')}</SelectItem>
                            <SelectItem value="replace">{t('suite.replaceExisting')}</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}
                {!!csv.errors.length && <Alert variant="danger"><AlertDescription>{t('suite.csvErrors', { count: csv.errors.length })}</AlertDescription></Alert>}
                {csv.entries.length > 0 && (
                  <Table>
                    <TableHeader><TableRow><TableHead>{t('suite.source')}</TableHead><TableHead>{t('suite.translation')}</TableHead><TableHead>{t('suite.currentTranslation')}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {csv.entries.slice(0, 5).map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell>{entry.source}</TableCell>
                          <TableCell>{entry.target || t('suite.keep')}</TableCell>
                          <TableCell>{csvExisting.has(glossaryEntryKey(entry)) ? csvExisting.get(glossaryEntryKey(entry))!.target || t('suite.keep') : t('suite.newTerm')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setCsv(undefined)}>{t('common.cancel')}</Button>
                <Button disabled={busy || !csv.entries.length || !!csv.errors.length || !library} onClick={() => {
                  if (library) void mutate({ action: 'importTerms', libraryId: library.id, entries: csvPlan!.entries, mode: 'replace' }, formRevision).then(ok => {
                    if (ok) { setCsv(undefined); notifySuccess(t('suite.saved')) }
                  })
                }}>{t('suite.importCsv')}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(testing && library)} onOpenChange={open => { if (!open) setTesting(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('suite.matchTest')}</DialogTitle>
            <DialogCloseButton />
          </DialogHeader>
          {library && (
            <>
              <CardContent className="px-0 pb-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="glossary-test-scenario">{t('suite.testScenario')}</FieldLabel>
                    <Select value={testScenario} onValueChange={value => { if (value) { setTestScenario(value as typeof testScenario); setTestResult(undefined) } }}>
                      <SelectTrigger id="glossary-test-scenario"><SelectValue>{scopeLabel(testScenario)}</SelectValue></SelectTrigger>
                      <SelectContent><SelectGroup>{(['screen', 'game', 'comic', 'realtime', 'tool', 'website'] as const).map(scenario => <SelectItem key={scenario} value={scenario}>{scopeLabel(scenario)}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  {(!!projectOptions.length || restrictedProjects) && (
                    <Field>
                      <FieldLabel htmlFor="glossary-test-project">{t('suite.testProject')}</FieldLabel>
                      <Select value={testProjectId || null} disabled={!projectOptions.length} onValueChange={value => { if (value) { setTestProjectId(value); setTestResult(undefined) } }}>
                        <SelectTrigger id="glossary-test-project"><SelectValue placeholder={t('suite.testProject')}>{projectOptions.find(project => project.id === testProjectId)?.name}</SelectValue></SelectTrigger>
                        <SelectContent><SelectGroup>{projectOptions.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectGroup></SelectContent>
                      </Select>
                    </Field>
                  )}
                  {testScenario === 'website' && (
                    <Field>
                      <FieldLabel htmlFor="glossary-test-url">{t('suite.testPageUrl')}</FieldLabel>
                      <Input id="glossary-test-url" type="url" maxLength={4096} value={testPageUrl} onChange={event => { setTestPageUrl(event.target.value); setTestResult(undefined) }} />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="glossary-test-language">{t('suite.targetLanguage')}</FieldLabel>
                    <Select value={testLanguage} onValueChange={value => { if (value) { setTestLanguage(value); setTestResult(undefined) } }}>
                      <SelectTrigger id="glossary-test-language"><SelectValue>{label(testLanguage)}</SelectValue></SelectTrigger>
                      <SelectContent><SelectGroup>{LANGUAGE_CODES.map(code => <SelectItem key={code} value={code}>{label(code)}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="glossary-test">{t('suite.source')}</FieldLabel>
                    <Textarea id="glossary-test" value={testText} maxLength={64000} onChange={event => { setTestText(event.target.value); setTestResult(undefined) }} />
                  </Field>
                  {testResult && (
                    <Alert>
                      <AlertDescription role="status">
                        {testResult.hits.length ? testResult.hits.map(hit => (
                          <p key={`${hit.entryId}:${hit.start}`}>{hit.actual} → {hit.term.mode === 'keep' ? t('suite.keep') : hit.term.target}</p>
                        )) : t('suite.noMatches')}
                      </AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </CardContent>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setTesting(false)}>{t('common.close')}</Button>
                <Button disabled={!testText.trim() || busy || restrictedProjects && !testProjectId || testScenario === 'website' && !testPageUrl.trim()}
                  onClick={() => {
                    if (api) void api.testMatch({
                      text: testText, targetLanguage: testLanguage,
                      context: { scenario: testScenario === 'website' ? 'tool' : testScenario, ...(testProjectId ? { projectId: testProjectId } : {}), ...(testScenario === 'website' ? { pageUrl: testPageUrl } : {}) },
                      selection: { mode: 'selected', libraryIds: [library.id] },
                    }).then(setTestResult).catch(error => notifyError(t('suite.actionFailed'), { cause: error }))
                  }}>{t('suite.matchTest')}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
