import { useEffect, useMemo, useState } from 'react'
import { Braces, Check, ChevronRight, Download, FlaskConical, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { notifyError } from '@/components/primitives/notify'
import { ProcessingIconButton, ProcessingPageHeading, textProcessingPath, type BreadcrumbEntry } from '../text-processing/ProcessingPage'
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '../../../../shared/languages'
import {
  exportWordRulesCsv,
  parseWordRulesCsv,
  wordRuleEntrySchema,
  wordRuleLibrarySchema,
  type WordRuleCommand,
  type WordRuleEntry,
  type WordRuleKind,
  type WordRuleLibrary,
  type WordRuleMatch,
} from '../../../../shared/word-rules'
import { useWordRules } from './useWordRules'
import { useWordRuleText } from './word-rules-copy'

export function WordRulesTab({ kind, libraryId }: { kind: WordRuleKind; libraryId?: string }) {
  const { t, language } = useI18n(),
    p = useWordRuleText(),
    { document, api, failed, refresh } = useWordRules()
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [libraryDraft, setLibraryDraft] = useState<WordRuleLibrary>()
  const [addingEntry, setAddingEntry] = useState<WordRuleEntry>()
  const [editingTexts, setEditingTexts] = useState<Record<string, string>>({})
  const [baseRevision, setBaseRevision] = useState(0)
  const [deleting, setDeleting] = useState<{ name: string; command: WordRuleCommand }>()
  const [csv, setCsv] = useState<ReturnType<typeof parseWordRulesCsv>>()
  const [csvOpen, setCsvOpen] = useState(false)
  const [policy, setPolicy] = useState<'skip' | 'replace'>('skip')
  const [testing, setTesting] = useState(false)
  const [testText, setTestText] = useState('')
  const [testLanguage, setTestLanguage] = useState('*')
  const [matches, setMatches] = useState<WordRuleMatch>()

  useEffect(() => {
    setQuery('')
    setPage(0)
    setSelected([])
    setMatches(undefined)
    setAddingEntry(undefined)
    setEditingTexts({})
  }, [libraryId])

  const library = document.libraries.find((item) => item.id === libraryId && item.kind === kind)
  const base = textProcessingPath + (kind === 'preserve' ? '/preserve-words' : '/subtitle-words')
  const overview = textProcessingPath + '/optimization'
  const libraries = document.libraries.filter((item) => item.kind === kind)
  const shownEntries = useMemo(
    () =>
      (library?.entries ?? []).filter((entry) =>
        entry.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [library, query],
  )
  const visible = shownEntries.slice(page * 50, (page + 1) * 50)
  const scopeLabel = (scope: string) =>
    scope === 'global'
      ? t('suite.global')
      : scope === 'realtime'
        ? t('suite.realtimeScope')
        : scope === 'game'
          ? t('suite.gameTitle')
          : scope === 'comic'
            ? t('suite.comicTitle')
            : scope === 'screen'
              ? t('screen.title')
              : t('suite.translationTools')
  const languageLabel = (code: string) =>
    code === '*'
      ? t('suite.allLanguages')
      : (LANGUAGE_LABELS[code]?.[
          language === 'zh-CN'
            ? 'zh'
            : language === 'zh-TW'
              ? 'zhTW'
              : language === 'zh-HK'
                ? 'zhHK'
                : language
        ] ?? code)
  const mutate = async (command: WordRuleCommand, expectedRevision = document.revision) => {
    if (!api || busy) return false
    setBusy(true)
    try {
      await api.command({ operationId: crypto.randomUUID(), expectedRevision, command })
      setMatches(undefined)
      return true
    } catch (error) {
      const saved = error instanceof Error && error.message.includes('wordRulesSavedSyncFailed')
      notifyError(
        t(
          saved
            ? 'suite.savedSyncFailed'
            : error instanceof Error && error.message.includes('conflict')
              ? 'suite.revisionConflict'
              : 'suite.actionFailed',
        ),
        { cause: error },
      )
      if (saved) {
        setMatches(undefined)
        await refresh()
      }
      return saved
    } finally {
      setBusy(false)
    }
  }
  const editLibrary = (value?: WordRuleLibrary) => {
    setBaseRevision(document.revision)
    setLibraryDraft(
      value
        ? structuredClone(value)
        : {
            id: crypto.randomUUID(),
            kind,
            name: '',
            enabled: true,
            scope: { mode: 'global' },
            entries: [],
          },
    )
  }
  const startNewEntry = () => {
    setBaseRevision(document.revision)
    setAddingEntry({ id: crypto.randomUUID(), text: '', language: '*', caseSensitive: false, enabled: true })
  }
  const commitExisting = (entry: WordRuleEntry) => {
    const draftText = editingTexts[entry.id]
    if (draftText === undefined || !library) return
    setEditingTexts((prev) => {
      const next = { ...prev }
      delete next[entry.id]
      return next
    })
    const updated = { ...entry, text: draftText }
    if (draftText !== entry.text && wordRuleEntrySchema.safeParse(updated).success) {
      void mutate({ action: 'saveTerm', libraryId: library.id, entry: updated })
    }
  }
  const download = (format: 'csv' | 'json') => {
    if (!library) return
    const url = URL.createObjectURL(
      new Blob(
        [format === 'csv' ? exportWordRulesCsv(library.entries) : JSON.stringify(library, null, 2)],
        { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' },
      ),
    )
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${library.name.replace(/[<>:"/\\|?*]/g, '_')}.${format}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const languageChoice = (id: string, value: string, change: (value: string) => void) => (
    <Field>
      <FieldLabel htmlFor={id}>{p('language')}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) change(next)
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue>{languageLabel(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {['*', ...LANGUAGE_CODES].map((code) => (
              <SelectItem key={code} value={code}>
                {languageLabel(code)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
  const scopeName = (item: WordRuleLibrary) => item.scope.mode === 'global'
    ? scopeLabel('global') : item.scope.targets.map(target => scopeLabel(target.kind)).join(', ')
  const failure = failed && <Alert variant="danger"><AlertDescription>{t('suite.actionFailed')}</AlertDescription></Alert>

  const breadcrumbs: BreadcrumbEntry[] = [
    { label: t('suite.textProcessing'), href: textProcessingPath },
    { label: t('suite.textOptimize'), href: overview },
    { label: p(kind), href: library ? base : undefined },
    ...(library ? [{ label: library.name }] : []),
  ]

  const allSelected = visible.length > 0 && visible.every((entry) => selected.includes(entry.id))
  const someSelected = visible.some((entry) => selected.includes(entry.id)) && !allSelected

  return (
    <div className="settings-panel">
      {!library ? (
        <>
          <ProcessingPageHeading
            title={p(kind)}
            back={overview}
            breadcrumbs={breadcrumbs}
            actions={
              <Button size="sm" disabled={busy || !api} onClick={() => editLibrary()}>
                <Plus data-icon="inline-start" />{p('newLibrary')}
              </Button>
            }
          />
          {failure}
          <Card>
            <CardContent>
              {libraries.length ? (
                <Table aria-label={p(kind)}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t('suite.title')}</TableHead>
                      <TableHead scope="col">{t('suite.scope')}</TableHead>
                      <TableHead scope="col" className="processing-fit">{p('entries')}</TableHead>
                      <TableHead scope="col" className="processing-fit">{t('suite.active')}</TableHead>
                      <TableHead scope="col" className="processing-fit text-right">{t('suite.textActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {libraries.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="processing-text-cell">
                          <a className="processing-table-link font-medium" href={base + '/' + encodeURIComponent(item.id)}>{item.name}</a>
                        </TableCell>
                        <TableCell className="processing-text-cell">
                          <Badge variant="secondary">{scopeName(item)}</Badge>
                        </TableCell>
                        <TableCell>{item.entries.length}</TableCell>
                        <TableCell>
                          <Switch aria-label={t('suite.active') + ' ' + item.name} disabled={busy}
                            checked={item.enabled} onCheckedChange={enabled => void mutate({ action: 'saveLibrary', library: { ...item, enabled } })}>
                            <SwitchThumb />
                          </Switch>
                        </TableCell>
                        <TableCell>
                          <div className="text-processing-actions">
                            <Tooltip>
                              <TooltipTrigger render={
                                <ProcessingIconButton label={t('suite.textOpenTable') + ' ' + item.name} nativeButton={false}
                                  render={<a href={base + '/' + encodeURIComponent(item.id)} />}><ChevronRight /></ProcessingIconButton>
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
                    <EmptyTitle>{p('empty')}</EmptyTitle>
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
                    <ProcessingIconButton label={t('suite.edit')} disabled={busy} onClick={() => editLibrary(library)}><Pencil /></ProcessingIconButton>
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
          {failure}
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <InputGroup className="w-full max-w-xs">
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label={t('suite.search')}
                placeholder={t('suite.search')}
                value={query}
                onChange={event => { setQuery(event.target.value); setPage(0); setSelected([]) }}
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
                  <ProcessingIconButton label={t('suite.exportCsv')} onClick={() => download('csv')}><Download /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.exportCsv')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.exportJson')} onClick={() => download('json')}><Braces /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.exportJson')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <ProcessingIconButton label={t('suite.importCsv')} onClick={() => {
                    setCsvOpen(true); setCsv(undefined); setBaseRevision(document.revision)
                  }}><Upload /></ProcessingIconButton>
                } />
                <TooltipContent>{t('suite.importCsv')}</TooltipContent>
              </Tooltip>
              <Button size="sm" disabled={busy || Boolean(addingEntry)} onClick={startNewEntry}>
                <Plus data-icon="inline-start" />{p('addTerm')}
              </Button>
            </div>
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-small text-nola-ui-muted-foreground">{t('suite.textSelectedCount', { count: selected.length })}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void mutate({
                    action: 'setTermsEnabled',
                    libraryId: library.id,
                    entryIds: selected,
                    enabled: true,
                  })
                }
              >
                {p('enable')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void mutate({
                    action: 'setTermsEnabled',
                    libraryId: library.id,
                    entryIds: selected,
                    enabled: false,
                  })
                }
              >
                {p('disable')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  setDeleting({
                    name: `${selected.length}`,
                    command: {
                      action: 'deleteTerms',
                      libraryId: library.id,
                      entryIds: selected,
                    },
                  })
                }
              >
                {t('suite.delete')}
              </Button>
            </div>
          )}

          <Card>
            <CardContent className="flex flex-col gap-3">
              {(visible.length > 0 || addingEntry) ? (
                <Table aria-label={library.name}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="processing-fit">
                        <Checkbox
                          aria-label={p('selectAll')}
                          disabled={!visible.length || busy}
                          checked={allSelected}
                          indeterminate={someSelected}
                          onCheckedChange={checked => setSelected(checked ? visible.map(entry => entry.id) : [])}
                        />
                      </TableHead>
                      <TableHead>{p('term')}</TableHead>
                      <TableHead className="processing-fit">{p('language')}</TableHead>
                      <TableHead className="processing-fit text-center">{t('suite.caseSensitive')}</TableHead>
                      <TableHead className="processing-fit">{t('suite.active')}</TableHead>
                      <TableHead className="processing-fit text-right">{t('suite.textActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {addingEntry && (
                      <TableRow>
                        <TableCell />
                        <TableCell className="min-w-40">
                          <Input
                            aria-label={p('term')}
                            placeholder={p('term')}
                            autoFocus
                            maxLength={200}
                            disabled={busy}
                            value={addingEntry.text}
                            onChange={(event) => setAddingEntry({ ...addingEntry, text: event.target.value })}
                          />
                        </TableCell>
                        <TableCell className="processing-fit">
                          <Select value={addingEntry.language} disabled={busy}
                            onValueChange={(value) => { if (value) setAddingEntry({ ...addingEntry, language: value }) }}>
                            <SelectTrigger size="sm" aria-label={p('language')}>
                              <SelectValue>{languageLabel(addingEntry.language)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>{['*', ...LANGUAGE_CODES].map((code) => <SelectItem key={code} value={code}>{languageLabel(code)}</SelectItem>)}</SelectGroup>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="processing-fit">
                          <div className="flex justify-center">
                            <Checkbox
                              aria-label={t('suite.caseSensitive')}
                              checked={addingEntry.caseSensitive}
                              disabled={busy}
                              onCheckedChange={(checked) => setAddingEntry({ ...addingEntry, caseSensitive: Boolean(checked) })}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="processing-fit">
                          <Switch checked={addingEntry.enabled} disabled={busy} aria-label={t('suite.active')}
                            onCheckedChange={(enabled) => setAddingEntry({ ...addingEntry, enabled })}><SwitchThumb /></Switch>
                        </TableCell>
                        <TableCell className="processing-fit">
                          <div className="text-processing-actions">
                            <ProcessingIconButton label={t('suite.save')} disabled={busy || !wordRuleEntrySchema.safeParse(addingEntry).success}
                              onClick={() => {
                                if (wordRuleEntrySchema.safeParse(addingEntry).success) {
                                  void mutate({ action: 'saveTerm', libraryId: library.id, entry: addingEntry }, baseRevision).then((ok) => {
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
                    {visible.map((entry) => {
                      const textVal = editingTexts[entry.id] ?? entry.text
                      return (
                        <TableRow key={entry.id} data-state={selected.includes(entry.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox
                              aria-label={`${p('selected')} ${entry.text}`}
                              checked={selected.includes(entry.id)}
                              onCheckedChange={(checked) =>
                                setSelected(
                                  checked
                                    ? [...selected, entry.id]
                                    : selected.filter((id) => id !== entry.id),
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="min-w-40">
                            <Input
                              aria-label={`${p('term')} ${entry.text}`}
                              maxLength={200}
                              disabled={busy}
                              value={textVal}
                              onChange={(event) => setEditingTexts((prev) => ({ ...prev, [entry.id]: event.target.value }))}
                              onBlur={() => commitExisting(entry)}
                            />
                          </TableCell>
                          <TableCell className="processing-fit">
                            <Select value={entry.language} disabled={busy}
                              onValueChange={(value) => {
                                if (value) void mutate({ action: 'saveTerm', libraryId: library.id, entry: { ...entry, language: value } })
                              }}>
                              <SelectTrigger size="sm" aria-label={`${p('language')} ${entry.text}`}>
                                <SelectValue>{languageLabel(entry.language)}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>{['*', ...LANGUAGE_CODES].map((code) => <SelectItem key={code} value={code}>{languageLabel(code)}</SelectItem>)}</SelectGroup>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="processing-fit">
                            <div className="flex justify-center">
                              <Checkbox
                                aria-label={`${t('suite.caseSensitive')} ${entry.text}`}
                                checked={entry.caseSensitive}
                                disabled={busy}
                                onCheckedChange={(checked) => void mutate({
                                  action: 'saveTerm', libraryId: library.id, entry: { ...entry, caseSensitive: Boolean(checked) },
                                })}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              aria-label={`${t('suite.active')} ${entry.text}`}
                              disabled={busy}
                              checked={entry.enabled}
                              onCheckedChange={(enabled) =>
                                void mutate({
                                  action: 'saveTerm',
                                  libraryId: library.id,
                                  entry: { ...entry, enabled },
                                })
                              }
                            >
                              <SwitchThumb />
                            </Switch>
                          </TableCell>
                          <TableCell>
                            <div className="text-processing-actions">
                              <Tooltip>
                                <TooltipTrigger render={
                                  <ProcessingIconButton
                                    label={`${t('suite.delete')} ${entry.text}`}
                                    disabled={busy}
                                    onClick={() => setDeleting({
                                      name: entry.text,
                                      command: { action: 'deleteTerms', libraryId: library.id, entryIds: [entry.id] },
                                    })}
                                  >
                                    <Trash2 />
                                  </ProcessingIconButton>
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
              {shownEntries.length > 50 && (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" size="sm" disabled={!page} onClick={() => { setPage(page - 1); setSelected([]) }}>
                    {t('suite.previous')}
                  </Button>
                  <span className="type-muted tabular-nums">
                    {page + 1} / {Math.ceil(shownEntries.length / 50)}
                  </span>
                  <Button variant="secondary" size="sm" disabled={(page + 1) * 50 >= shownEntries.length} onClick={() => { setPage(page + 1); setSelected([]) }}>
                    {t('suite.next')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={Boolean(libraryDraft)} onOpenChange={open => { if (!open && !busy) setLibraryDraft(undefined) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{libraryDraft?.id === library?.id ? t('suite.edit') + ' ' + library?.name : p('newLibrary')}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          {libraryDraft && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void mutate({ action: 'saveLibrary', library: libraryDraft }, baseRevision).then(
                  (ok) => {
                    if (ok) setLibraryDraft(undefined)
                  },
                )
              }}
            >
              <CardContent className="px-0 pb-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="word-library-name">{t('suite.title')}</FieldLabel>
                    <Input
                      id="word-library-name"
                      required
                      maxLength={100}
                      value={libraryDraft.name}
                      onChange={(event) =>
                        setLibraryDraft({ ...libraryDraft, name: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="word-library-scope">{t('suite.scope')}</FieldLabel>
                    <Select
                      value={
                        libraryDraft.scope.mode === 'global'
                          ? 'global'
                          : libraryDraft.scope.targets[0]?.kind
                      }
                      onValueChange={(value) => {
                        if (value === 'global')
                          setLibraryDraft({ ...libraryDraft, scope: { mode: 'global' } })
                        else if (value === 'game' || value === 'screen' || value === 'comic')
                          setLibraryDraft({
                            ...libraryDraft,
                            scope: { mode: 'selected', targets: [{ kind: value, ids: '*' }] },
                          })
                        else if (value === 'realtime' || value === 'tool')
                          setLibraryDraft({
                            ...libraryDraft,
                            scope: { mode: 'selected', targets: [{ kind: value }] },
                          })
                      }}
                    >
                      <SelectTrigger id="word-library-scope">
                        <SelectValue>
                          {scopeLabel(
                            libraryDraft.scope.mode === 'global'
                              ? 'global'
                              : (libraryDraft.scope.targets[0]?.kind ?? 'global'),
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(kind === 'mask'
                            ? ['global', 'realtime', 'game']
                            : ['global', 'screen', 'game', 'comic', 'realtime', 'tool']
                          ).map((scope) => (
                            <SelectItem key={scope} value={scope}>
                              {scopeLabel(scope)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
              </CardContent>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setLibraryDraft(undefined)}>{t('common.cancel')}</Button>
                <Button disabled={busy || !wordRuleLibrarySchema.safeParse(libraryDraft).success} type="submit">
                  {t('suite.save')}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting ? t('suite.deleteConfirm', { name: deleting.name }) : ''}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (deleting)
                  void mutate(deleting.command).then((ok) => {
                    if (ok) {
                      if (deleting.command.action === 'deleteLibrary') location.hash = base
                      setDeleting(undefined)
                      setSelected([])
                    }
                  })
              }}
            >
              {t('suite.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={csvOpen} onOpenChange={open => { if (!open && !busy) setCsvOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('suite.importCsv')}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          <CardContent className="px-0 pb-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="word-rule-file">{t('suite.importCsv')}</FieldLabel>
                <Input
                  id="word-rule-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    if (file.size > 40 * 1024 * 1024) {
                      notifyError(t('suite.csvInvalid'))
                      return
                    }
                    void file
                      .text()
                      .then((content) => setCsv(parseWordRulesCsv(content)))
                      .catch((error) => notifyError(t('suite.csvInvalid'), { cause: error }))
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="word-rule-policy">{t('suite.conflictPolicy')}</FieldLabel>
                <Select
                  value={policy}
                  onValueChange={(value) => {
                    if (value === 'skip' || value === 'replace') setPolicy(value)
                  }}
                >
                  <SelectTrigger id="word-rule-policy">
                    <SelectValue>
                      {t(policy === 'skip' ? 'suite.skipExisting' : 'suite.replaceExisting')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="skip">{t('suite.skipExisting')}</SelectItem>
                      <SelectItem value="replace">{t('suite.replaceExisting')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {csv && (
                <>
                  <p>{p('entries') + ' · ' + csv.entries.length}</p>
                  {csv.errors.length > 0 && (
                    <Alert variant="danger"><AlertDescription>{t('suite.csvErrors', { count: csv.errors.length })}</AlertDescription></Alert>
                  )}
                  <ul className="list-disc ps-5 type-body">
                    {csv.entries.slice(0, 5).map((entry) => (
                      <li key={entry.id}>{entry.text}</li>
                    ))}
                  </ul>
                </>
              )}
            </FieldGroup>
          </CardContent>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setCsvOpen(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={busy || !library || !csv?.entries.length || !!csv?.errors.length}
              onClick={() => {
                if (library && csv)
                  void mutate(
                    {
                      action: 'importTerms',
                      libraryId: library.id,
                      entries: csv.entries,
                      policy,
                    },
                    baseRevision,
                  ).then((ok) => {
                    if (ok) setCsvOpen(false)
                  })
              }}
            >
              {t('suite.importCsv')}
            </Button>
          </div>
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
                  {languageChoice('word-test-language', testLanguage, setTestLanguage)}
                  <Field>
                    <FieldLabel htmlFor="word-test-text">{p('term')}</FieldLabel>
                    <Textarea
                      id="word-test-text"
                      maxLength={64000}
                      value={testText}
                      onChange={(event) => {
                        setTestText(event.target.value)
                        setMatches(undefined)
                      }}
                    />
                  </Field>
                  {matches && (
                    <Alert>
                      <AlertDescription role="status">
                        {matches.hits.length
                          ? matches.hits.map((hit) => (
                              <p key={`${hit.entryId}:${hit.start}`}>
                                {hit.actual} → {kind === 'mask' ? '**' : t('suite.keep')}
                              </p>
                            ))
                          : t('suite.noMatches')}
                      </AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </CardContent>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setTesting(false)}>{t('common.close')}</Button>
                <Button
                  disabled={!testText || busy || !api}
                  onClick={() => {
                    const target =
                      library.scope.mode === 'selected' ? library.scope.targets[0] : undefined
                    const scenario = target?.kind ?? (kind === 'mask' ? 'realtime' : 'tool')
                    if (api && scenario !== 'website')
                      void api
                        .testMatch({
                          kind,
                          text: testText,
                          language: testLanguage,
                          context: {
                            scenario,
                            ...(target && 'ids' in target && target.ids !== '*'
                              ? { projectId: target.ids[0] }
                              : {}),
                          },
                          selection: { mode: 'selected', libraryIds: [library.id] },
                        })
                        .then(setMatches)
                        .catch((error) => notifyError(t('suite.actionFailed'), { cause: error }))
                  }}
                >
                  {t('suite.matchTest')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
