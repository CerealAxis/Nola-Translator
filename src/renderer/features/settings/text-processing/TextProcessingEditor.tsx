import { lazy, Suspense, useId, useState } from 'react'
import { ChevronRight, CircleHelp, ClipboardPaste, Copy, Download, GripVertical, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { notifyError } from '@/components/primitives/notify'
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
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { FeatureOptionCard } from './FeatureOptionDialog'
import { ProcessingIconButton, ProcessingPageHeading, textProcessingPath, type BreadcrumbEntry } from './ProcessingPage'
import { parseInlineRegex } from './text-processing-engine'
import type { ProcessingFeature } from './text-processing-features'
import { usePreviewSetting, type FeatureOptions, type Rule, type RuleTable } from './text-processing-preview'

function blankRule(): Rule {
  return {
    id: crypto.randomUUID(), pattern: '', replacement: '',
    regex: false, escape: false, caseSensitive: false, wholeWord: false,
  }
}

function encodeRules(rules: readonly Rule[]) {
  return rules.filter(rule => rule.pattern).map(rule => {
    const inline = !rule.regex ? parseInlineRegex(rule.pattern) : null
    const regex = rule.regex || Boolean(inline)
    const caseSensitive = inline ? !inline.flags.includes('i') : rule.caseSensitive
    const pattern = inline ? inline.body : rule.pattern
    return [
      regex, caseSensitive, rule.wholeWord, pattern, rule.replacement, rule.escape,
    ].map(value => '"' + String(value).replaceAll('"', '""') + '"').join('\t')
  }).join('\r\n')
}

function decodeRules(text: string) {
  if (text.length > 1000000) throw new Error('rule file too large')
  const rows: Rule[] = []
  const input = text.replace(/^\uFEFF/u, '')
  const cells = /(?:"((?:[^"]|"")*)"|([^"\t\r\n]*))(\t|\r\n|\r|\n|$)/gy
  let row: string[] = []
  let offset = 0
  const flag = (value: string) => /^(true|1)$/i.test(value.trim())
  while (offset < input.length) {
    const cell = cells.exec(input)
    if (!cell) throw new Error('invalid rule file')
    offset = cells.lastIndex
    row.push(cell[1]?.replaceAll('""', '"') ?? cell[2])
    if (cell[3] === '\t') {
      if (offset < input.length) continue
      row.push('')
    }
    if (row.length > 1 || row[0]) {
      const [regex, caseSensitive, wholeWord, pattern, replacement, escape = ''] = row
      if ((row.length !== 5 && row.length !== 6) || !pattern) {
        throw new Error('invalid rule row')
      }
      const isRegex = flag(regex)
      const isCaseSensitive = flag(caseSensitive)
      const isWholeWord = flag(wholeWord)
      const displayPattern = isRegex
        ? `/${isWholeWord ? `\\b(?:${pattern})\\b` : pattern}/${isCaseSensitive ? '' : 'i'}`
        : pattern
      rows.push({
        id: crypto.randomUUID(), pattern: displayPattern, replacement, regex: false, escape: flag(escape),
        caseSensitive: isCaseSensitive, wholeWord: isWholeWord,
      })
    }
    row = []
  }
  return rows
}

function isRegexInvalid(rule: Rule): boolean {
  if (!rule.pattern) return false
  const inline = parseInlineRegex(rule.pattern)
  const body = inline ? inline.body : rule.regex ? rule.pattern : null
  if (body === null) return false
  try {
    new RegExp(body, inline?.flags ?? 'g')
    return false
  } catch {
    return true
  }
}

function RuleTables({
  feature,
  back,
  sectionLabel,
  tableId,
}: {
  feature: ProcessingFeature
  back: string
  sectionLabel: string
  tableId?: string
}) {
  const { t } = useI18n()
  const base = textProcessingPath + '/config/' + feature.id
  const [legacy] = usePreviewSetting<FeatureOptions | null>('options:' + feature.id, null)
  const migrated = legacy?.rules ?? []
  const [tables, save] = usePreviewSetting<RuleTable[]>('tables:' + feature.id, migrated.length
    ? [{ id: 'default', name: t(feature.label), rules: migrated }] : [])
  const [nameDraft, setNameDraft] = useState<{ id?: string; name: string }>()
  const [deleting, setDeleting] = useState<RuleTable>()
  const table = tables.find(item => item.id === tableId)

  const breadcrumbs: BreadcrumbEntry[] = [
    { label: t('suite.textProcessing'), href: textProcessingPath },
    { label: sectionLabel, href: back },
    { label: t(feature.label), href: tableId ? base : undefined },
  ]

  if (tableId) {
    return table ? (
      <RuleEntries
        key={table.id}
        table={table}
        back={base}
        breadcrumbs={[...breadcrumbs, { label: table.name }]}
        onChange={rules => save(tables.map(item => item.id === table.id ? { ...item, rules } : item))}
      />
    ) : <ProcessingPageHeading title={t('suite.notFound')} back={base} breadcrumbs={breadcrumbs} />
  }

  function saveName() {
    if (!nameDraft?.name.trim()) return
    const name = nameDraft.name.trim()
    if (nameDraft.id) {
      save(tables.map(item => item.id === nameDraft.id ? { ...item, name } : item))
      setNameDraft(undefined)
      return
    }
    const id = crypto.randomUUID()
    save([...tables, { id, name, rules: [] }])
    setNameDraft(undefined)
    location.hash = base + '/' + id
  }

  return (
    <div className="settings-panel">
      <ProcessingPageHeading
        title={t(feature.label)}
        back={back}
        breadcrumbs={breadcrumbs}
        actions={
          <Button size="sm" onClick={() => setNameDraft({ name: '' })}>
            <Plus data-icon="inline-start" />{t('suite.textNewTable')}
          </Button>
        }
      />
      <Card>
        <CardContent>
          {tables.length ? (
            <Table aria-label={t('suite.textTables')}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('suite.textTableName')}</TableHead>
                  <TableHead scope="col" className="processing-fit">{t('suite.textRuleCount')}</TableHead>
                  <TableHead scope="col" className="processing-fit text-right">{t('suite.textActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="processing-text-cell">
                      <a className="processing-table-link font-medium" href={base + '/' + encodeURIComponent(item.id)}>
                        {item.name}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.rules.length}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-processing-actions">
                        <Tooltip>
                          <TooltipTrigger render={
                            <ProcessingIconButton label={t('suite.edit') + ' ' + item.name}
                              onClick={() => setNameDraft({ id: item.id, name: item.name })}>
                              <Pencil />
                            </ProcessingIconButton>
                          } />
                          <TooltipContent>{t('suite.edit')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger render={
                            <ProcessingIconButton label={t('suite.delete') + ' ' + item.name}
                              onClick={() => setDeleting(item)}>
                              <Trash2 />
                            </ProcessingIconButton>
                          } />
                          <TooltipContent>{t('suite.delete')}</TooltipContent>
                        </Tooltip>
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
                <EmptyTitle>{t('suite.textNoTables')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(nameDraft)} onOpenChange={open => { if (!open) setNameDraft(undefined) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(nameDraft?.id ? 'suite.textEditTable' : 'suite.textNewTable')}</DialogTitle>
            <DialogCloseButton />
          </DialogHeader>
          <form onSubmit={event => { event.preventDefault(); saveName() }}>
            <CardContent className="px-0 pb-4">
              <Field>
                <FieldLabel htmlFor="rule-table-name">{t('suite.textTableName')}</FieldLabel>
                <Input
                  id="rule-table-name"
                  placeholder={t('suite.textTableName')}
                  maxLength={100}
                  autoFocus
                  value={nameDraft?.name ?? ''}
                  onChange={event => nameDraft && setNameDraft({ ...nameDraft, name: event.target.value })}
                />
              </Field>
            </CardContent>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNameDraft(undefined)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!nameDraft?.name.trim()}>
                {t('suite.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('suite.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? t('suite.textDeleteTableConfirm', { name: deleting.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              if (deleting) save(tables.filter(item => item.id !== deleting.id))
              setDeleting(undefined)
            }}>
              {t('suite.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RuleEntries({
  table,
  back,
  breadcrumbs,
  onChange,
}: {
  table: RuleTable
  back: string
  breadcrumbs: readonly BreadcrumbEntry[]
  onChange: (rules: Rule[]) => void
}) {
  const { t } = useI18n()
  const fileId = useId()
  const [query, setQuery] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [importing, setImporting] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const rules = table.rules
  const search = query.trim().toLocaleLowerCase()
  const shown = rules.filter(rule => (rule.pattern + '\n' + rule.replacement)
    .toLocaleLowerCase().includes(search))
  const copy = () => encodeRules(rules)
  const canDrag = !search && !importing

  function updateRule(id: string, patch: Partial<Rule>) {
    onChange(rules.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  function addRule() {
    const next = blankRule()
    setQuery('')
    setFocusId(next.id)
    onChange([...rules, next])
  }

  function move(index: number, position: number) {
    if (index === position || index < 0 || position < 0 || position >= rules.length) return
    const next = [...rules]
    const [item] = next.splice(index, 1)
    next.splice(position, 0, item)
    onChange(next)
    setAnnouncement(t('suite.textMovedToPosition', { position: position + 1 }))
  }

  function handleDrop(targetId: string, position: 'before' | 'after') {
    if (!draggingId || draggingId === targetId) return
    const from = rules.findIndex(item => item.id === draggingId)
    const toBase = rules.findIndex(item => item.id === targetId)
    if (from === -1 || toBase === -1) return
    let to = position === 'after' ? toBase + 1 : toBase
    if (from < to) to -= 1
    move(from, to)
    setDraggingId(null)
    setDropTarget(null)
  }

  async function importText(read: () => Promise<string>) {
    setImporting(true)
    try {
      onChange([...rules, ...decodeRules(await read())])
      setQuery('')
    } catch {
      notifyError(t('suite.textInvalidImport'))
    } finally {
      setImporting(false)
    }
  }

  function exportRules() {
    const url = URL.createObjectURL(new Blob([copy()], { type: 'text/tab-separated-values;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = table.name + '.tsv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="settings-panel">
      <ProcessingPageHeading title={table.name} back={back} breadcrumbs={breadcrumbs} />
      <div className="sr-only" aria-live="polite">{announcement}</div>
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <InputGroup className="w-full max-w-xs">
          <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={t('suite.textRuleSearch')}
            placeholder={t('suite.textRuleSearch')}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </InputGroup>
        <div className="text-processing-actions">
          <Input id={fileId} hidden type="file" tabIndex={-1} accept=".csv,.tsv,.txt"
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              if (file) void importText(() => file.text())
              event.currentTarget.value = ''
            }} />
          <Tooltip>
            <TooltipTrigger render={
              <ProcessingIconButton label={t('suite.textImportFile')} disabled={importing}
                onClick={() => document.getElementById(fileId)?.click()}>
                <Upload />
              </ProcessingIconButton>
            } />
            <TooltipContent>{t('suite.textImportFile')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <ProcessingIconButton label={t('suite.textExportFile')} disabled={!rules.length} onClick={exportRules}>
                <Download />
              </ProcessingIconButton>
            } />
            <TooltipContent>{t('suite.textExportFile')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <ProcessingIconButton label={t('suite.textCopyRules')} disabled={!rules.length}
                onClick={() => void navigator.clipboard.writeText(copy()).catch(cause => notifyError(t('suite.actionFailed'), { cause }))}>
                <Copy />
              </ProcessingIconButton>
            } />
            <TooltipContent>{t('suite.textCopyRules')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <ProcessingIconButton label={t('suite.textPasteRules')} disabled={importing}
                onClick={() => void importText(() => navigator.clipboard.readText())}>
                <ClipboardPaste />
              </ProcessingIconButton>
            } />
            <TooltipContent>{t('suite.textPasteRules')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={
              <ProcessingIconButton label={t('suite.textClearRules')} disabled={!rules.length || importing}
                onClick={() => setConfirmClear(true)}>
                <Trash2 />
              </ProcessingIconButton>
            } />
            <TooltipContent>{t('suite.textClearRules')}</TooltipContent>
          </Tooltip>
          <Button size="sm" disabled={importing} onClick={addRule}>
            <Plus data-icon="inline-start" />{t('suite.textAddRule')}
          </Button>
        </div>
      </div>


      <Card>
        <CardContent>
          {shown.length ? (
            <Table aria-label={table.name}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="processing-fit"><span className="sr-only">{t('suite.textReorderHint')}</span></TableHead>
                  <TableHead scope="col">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{t('suite.textPattern')}</span>
                      <Tooltip>
                        <TooltipTrigger render={
                          <Button type="button" variant="bare" size="icon-xs" aria-label={t('suite.textPatternRegexHint')}>
                            <CircleHelp aria-hidden="true" />
                          </Button>
                        } />
                        <TooltipContent>{t('suite.textPatternRegexHint')}</TooltipContent>
                      </Tooltip>
                    </span>
                  </TableHead>
                  <TableHead scope="col">{t('suite.textReplacement')}</TableHead>
                  <TableHead scope="col" className="processing-fit text-right">{t('suite.textActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(rule => {
                  const index = rules.indexOf(rule)
                  const regexError = isRegexInvalid(rule)
                  const isDragging = draggingId === rule.id
                  const dropPos = dropTarget?.id === rule.id ? dropTarget.position : undefined
                  return (
                    <TableRow
                      key={rule.id}
                      draggable={canDrag}
                      data-dragging={isDragging || undefined}
                      data-drop-position={dropPos}
                      className="processing-sortable-row"
                      onDragStart={event => {
                        if (!canDrag) return
                        setDraggingId(rule.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', rule.id)
                      }}
                      onDragOver={event => {
                        if (!canDrag || !draggingId || draggingId === rule.id) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        const rect = event.currentTarget.getBoundingClientRect()
                        const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                        setDropTarget(current =>
                          current?.id === rule.id && current.position === position ? current : { id: rule.id, position },
                        )
                      }}
                      onDragLeave={() => {
                        setDropTarget(current => current?.id === rule.id ? null : current)
                      }}
                      onDrop={event => {
                        if (!canDrag) return
                        event.preventDefault()
                        const rect = event.currentTarget.getBoundingClientRect()
                        const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                        handleDrop(rule.id, position)
                      }}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setDropTarget(null)
                      }}
                    >
                      <TableCell className="processing-fit">
                        <button
                          type="button"
                          disabled={!canDrag}
                          className="processing-drag-handle"
                          aria-label={t('suite.textDragReorder') + ' ' + (rule.pattern || t('suite.textPattern'))}
                          onKeyDown={event => {
                            if (!canDrag) return
                            if (event.key === 'ArrowUp') {
                              event.preventDefault()
                              move(index, index - 1)
                            } else if (event.key === 'ArrowDown') {
                              event.preventDefault()
                              move(index, index + 1)
                            }
                          }}
                        >
                          <GripVertical aria-hidden="true" />
                        </button>
                      </TableCell>
                      <TableCell className="min-w-40">
                        <Textarea
                          rows={1}
                          className="min-h-9 py-1.5"
                          aria-label={t('suite.textPattern')}
                          placeholder={t('suite.textPattern')}
                          autoFocus={focusId === rule.id}
                          aria-invalid={regexError || undefined}
                          title={regexError ? t('suite.textInvalidRegex') : undefined}
                          value={rule.pattern}
                          onChange={event => updateRule(rule.id, { pattern: event.target.value })}
                        />
                      </TableCell>
                      <TableCell className="min-w-40">
                        <Textarea
                          rows={1}
                          className="min-h-9 py-1.5"
                          aria-label={t('suite.textReplacement')}
                          placeholder={t('suite.textEmptyReplacement')}
                          value={rule.replacement}
                          onChange={event => updateRule(rule.id, { replacement: event.target.value })}
                        />
                      </TableCell>
                      <TableCell className="processing-fit">
                        <div className="text-processing-actions">
                          <Tooltip>
                            <TooltipTrigger render={
                              <ProcessingIconButton label={t('suite.delete') + ' ' + (rule.pattern || t('suite.textPattern'))}
                                disabled={importing} onClick={() => onChange(rules.filter(item => item.id !== rule.id))}>
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
                <EmptyTitle>{t(rules.length ? 'suite.textNoMatches' : 'suite.textNoRules')}</EmptyTitle>
              </EmptyHeader>
              {rules.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setQuery('')}>
                  {t('suite.textClearSearch')}
                </Button>
              )}
            </Empty>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('suite.textClearRules')}</AlertDialogTitle>
            <AlertDialogDescription>{t('suite.textClearConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              onChange([])
              setConfirmClear(false)
            }}>
              {t('suite.textClearRules')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const PythonScriptForm = lazy(() => import('./PythonScriptForm'))

function FeatureForm({
  feature,
  back,
  sectionLabel,
}: {
  feature: ProcessingFeature
  back: string
  sectionLabel: string
}) {
  const { t } = useI18n()
  const [saved, save] = usePreviewSetting<FeatureOptions>('options:' + feature.id, {
    form: 'NFKC', count: '1', keepEnd: true, keepSingle: true, vndbId: '',
    vndbTargets: { replace: true, glossary: true },
  })
  const [draft, setDraft] = useState(saved)

  return (
    <div className="settings-panel">
      <ProcessingPageHeading
        title={t(feature.label)}
        back={back}
        breadcrumbs={[
          { label: t('suite.textProcessing'), href: textProcessingPath },
          { label: sectionLabel, href: back },
          { label: t(feature.label) },
        ]}
      />
      <FeatureOptionCard
        feature={feature}
        draft={draft}
        setDraft={setDraft}
        back={back}
        onSave={() => {
          void save(draft).then(saved => { if (saved) location.hash = back })
        }}
      />
    </div>
  )
}

export function TextProcessingEditor({
  feature,
  back,
  sectionLabel,
  tableId,
}: {
  feature: ProcessingFeature
  back: string
  sectionLabel: string
  tableId?: string
}) {
  if (feature.editor === 'script') return (
    <Suspense fallback={null}>
      <PythonScriptForm key={feature.id} feature={feature} back={back} sectionLabel={sectionLabel} />
    </Suspense>
  )
  return feature.editor === 'replace'
    ? <RuleTables key={feature.id} feature={feature} back={back} sectionLabel={sectionLabel} tableId={tableId} />
    : <FeatureForm key={feature.id} feature={feature} back={back} sectionLabel={sectionLabel} />
}
