import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
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
import { notifyError } from '@/components/primitives/notify'
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
  const [activeId, setActiveId] = useState(libraryId)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [libraryDraft, setLibraryDraft] = useState<WordRuleLibrary>()
  const [entryDraft, setEntryDraft] = useState<WordRuleEntry>()
  const [baseRevision, setBaseRevision] = useState(0)
  const [deleting, setDeleting] = useState<{ name: string; command: WordRuleCommand }>()
  const [csv, setCsv] = useState<ReturnType<typeof parseWordRulesCsv>>()
  const [csvOpen, setCsvOpen] = useState(false)
  const [policy, setPolicy] = useState<'skip' | 'replace'>('skip')
  const [testText, setTestText] = useState('')
  const [testLanguage, setTestLanguage] = useState('*')
  const [matches, setMatches] = useState<WordRuleMatch>()
  useEffect(() => {
    setActiveId(libraryId)
  }, [libraryId])
  useEffect(() => {
    setQuery('')
    setPage(0)
    setSelected([])
    setMatches(undefined)
  }, [activeId])
  const library = document.libraries.find((item) => item.id === activeId && item.kind === kind)
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
  const editEntry = (value?: WordRuleEntry) => {
    setBaseRevision(document.revision)
    setEntryDraft(
      value
        ? { ...value }
        : { id: crypto.randomUUID(), text: '', language: '*', caseSensitive: false, enabled: true },
    )
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
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {failed && <p role="alert">{t('suite.actionFailed')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {library && (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('suite.back')}
              onClick={() => {
                setActiveId(undefined)
                setSelected([])
                setQuery('')
                setPage(0)
              }}
            >
              <ArrowLeft />
            </Button>
          )}
          <h2 className="nola-title">{library?.name ?? p(kind)}</h2>
        </div>
        {!library && (
          <div className="flex items-center gap-3">
            <Switch
              aria-label={p('enabled')}
              disabled={busy || !api}
              checked={kind === 'preserve' ? document.preserveEnabled : document.maskEnabled}
              onCheckedChange={(enabled) => void mutate({ action: 'setEnabled', kind, enabled })}
            >
              <SwitchThumb />
            </Switch>
            <Button disabled={busy || !api} onClick={() => editLibrary()}>
              <Plus data-icon="inline-start" />
              {p('newLibrary')}
            </Button>
          </div>
        )}
      </div>
      {!library &&
        libraries.map((item) => (
          <Card size="sm" key={item.id}>
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
              <CardAction className="flex items-center gap-2">
                <Switch
                  aria-label={`${t('suite.active')} ${item.name}`}
                  disabled={busy}
                  checked={item.enabled}
                  onCheckedChange={(enabled) =>
                    void mutate({ action: 'saveLibrary', library: { ...item, enabled } })
                  }
                >
                  <SwitchThumb />
                </Switch>
                <Button variant="outline" size="sm" onClick={() => setActiveId(item.id)}>
                  {t('suite.edit')}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>{p('entries') + ' · ' + item.entries.length}</CardContent>
          </Card>
        ))}
      {!library && !libraries.length && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{p('empty')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {library && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => editLibrary(library)}>
              <Pencil data-icon="inline-start" />
              {t('suite.edit')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDeleting({
                  name: library.name,
                  command: { action: 'deleteLibrary', libraryId: library.id },
                })
              }
            >
              <Trash2 data-icon="inline-start" />
              {t('suite.delete')}
            </Button>
            <span className="self-center text-muted">
              {library.scope.mode === 'global'
                ? scopeLabel('global')
                : library.scope.targets.map((target) => scopeLabel(target.kind)).join(', ')}
            </span>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{p('entries') + ' · ' + library.entries.length}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => download('csv')}>
                  <Download data-icon="inline-start" />
                  {t('suite.exportCsv')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => download('json')}>
                  {t('suite.exportJson')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCsvOpen(true)
                    setCsv(undefined)
                    setBaseRevision(document.revision)
                  }}
                >
                  <Upload data-icon="inline-start" />
                  {t('suite.importCsv')}
                </Button>
                <Button size="sm" onClick={() => editEntry()}>
                  <Plus data-icon="inline-start" />
                  {p('addTerm')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="word-rule-query">{t('suite.search')}</FieldLabel>
                <Input
                  id="word-rule-query"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPage(0)
                  }}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelected(selected.length ? [] : visible.map((entry) => entry.id))
                  }
                >
                  {p('selectAll')}
                </Button>
                {selected.length > 0 && (
                  <>
                    <Button
                      variant="outline"
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
                      variant="outline"
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
                      variant="destructive"
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
                  </>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <span className="sr-only">{p('selectAll')}</span>
                    </TableHead>
                    <TableHead>{p('term')}</TableHead>
                    <TableHead>{p('language')}</TableHead>
                    <TableHead>{t('suite.active')}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t('suite.edit')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Switch
                          aria-label={`${p('selected')} ${entry.text}`}
                          checked={selected.includes(entry.id)}
                          onCheckedChange={(checked) =>
                            setSelected(
                              checked
                                ? [...selected, entry.id]
                                : selected.filter((id) => id !== entry.id),
                            )
                          }
                        >
                          <SwitchThumb />
                        </Switch>
                      </TableCell>
                      <TableCell className="break-all">{entry.text}</TableCell>
                      <TableCell>{languageLabel(entry.language)}</TableCell>
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
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={`${t('suite.edit')} ${entry.text}`}
                          onClick={() => editEntry(entry)}
                        >
                          <Pencil />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!visible.length && <p>{t('suite.noMatches')}</p>}
              {shownEntries.length > 50 && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!page}
                    onClick={() => setPage(page - 1)}
                  >
                    {t('suite.previous')}
                  </Button>
                  <span>
                    {page + 1} / {Math.ceil(shownEntries.length / 50)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(page + 1) * 50 >= shownEntries.length}
                    onClick={() => setPage(page + 1)}
                  >
                    {t('suite.next')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('suite.matchTest')}</CardTitle>
            </CardHeader>
            <CardContent>
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
                <Button
                  variant="outline"
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
                {matches && (
                  <div role="status">
                    {matches.hits.length
                      ? matches.hits.map((hit) => (
                          <p key={`${hit.entryId}:${hit.start}`}>
                            {hit.actual} → {kind === 'mask' ? '**' : t('suite.keep')}
                          </p>
                        ))
                      : t('suite.noMatches')}
                  </div>
                )}
              </FieldGroup>
            </CardContent>
          </Card>
        </>
      )}
      <Dialog
        open={!!libraryDraft}
        onOpenChange={(open) => {
          if (!open && !busy) setLibraryDraft(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p('newLibrary')}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          <CardContent>
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
                className="flex flex-col gap-4"
              >
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
                <Button
                  disabled={busy || !wordRuleLibrarySchema.safeParse(libraryDraft).success}
                  type="submit"
                >
                  {t('suite.save')}
                </Button>
              </form>
            )}
          </CardContent>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!entryDraft}
        onOpenChange={(open) => {
          if (!open && !busy) setEntryDraft(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p('addTerm')}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          <CardContent>
            {entryDraft && library && (
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void mutate(
                    { action: 'saveTerm', libraryId: library.id, entry: entryDraft },
                    baseRevision,
                  ).then((ok) => {
                    if (ok) setEntryDraft(undefined)
                  })
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="word-entry-text">{p('term')}</FieldLabel>
                    <Input
                      required
                      id="word-entry-text"
                      maxLength={200}
                      value={entryDraft.text}
                      onChange={(event) =>
                        setEntryDraft({ ...entryDraft, text: event.target.value })
                      }
                    />
                  </Field>
                  {languageChoice('word-entry-language', entryDraft.language, (value) =>
                    setEntryDraft({ ...entryDraft, language: value }),
                  )}
                  <Field>
                    <FieldLabel htmlFor="word-entry-case">{t('suite.caseSensitive')}</FieldLabel>
                    <Switch
                      id="word-entry-case"
                      checked={entryDraft.caseSensitive}
                      onCheckedChange={(caseSensitive) =>
                        setEntryDraft({ ...entryDraft, caseSensitive })
                      }
                    >
                      <SwitchThumb />
                    </Switch>
                  </Field>
                </FieldGroup>
                <Button
                  type="submit"
                  disabled={busy || !wordRuleEntrySchema.safeParse(entryDraft).success}
                >
                  {t('suite.save')}
                </Button>
              </form>
            )}
          </CardContent>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('suite.deleteConfirm', { name: deleting?.name ?? '' })}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          <CardContent>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deleting)
                  void mutate(deleting.command).then((ok) => {
                    if (ok) {
                      if (deleting.command.action === 'deleteLibrary') setActiveId(undefined)
                      setDeleting(undefined)
                      setSelected([])
                    }
                  })
              }}
            >
              {t('suite.delete')}
            </Button>
          </CardContent>
        </DialogContent>
      </Dialog>
      <Dialog
        open={csvOpen}
        onOpenChange={(open) => {
          if (!busy) setCsvOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('suite.preview')}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          <CardContent>
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
                    <p role="alert">{t('suite.csvErrors', { count: csv.errors.length })}</p>
                  )}
                  <ul>
                    {csv.entries.slice(0, 5).map((entry) => (
                      <li key={entry.id}>{entry.text}</li>
                    ))}
                  </ul>
                </>
              )}
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
            </FieldGroup>
          </CardContent>
        </DialogContent>
      </Dialog>
    </div>
  )
}
