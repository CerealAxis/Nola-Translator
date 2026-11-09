import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type SetStateAction } from 'react'
import { ArrowLeft, BookOpen, Download, FolderInput, LockKeyhole, Play, Plus, Redo2, Save, Square, Trash2, Undo2 } from 'lucide-react'
import { useI18n, type TranslationKey } from '@/i18n'
import { getBridge } from '@/store'
import { useAvailableModels } from '@/available-models'
import { PageHeader } from '@/components/primitives'
import { LanguageDirectionSelect } from '@/components/primitives/LanguageDirectionSelect'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ColorPicker } from '@/components/ui/color-picker'
import { LANGUAGE_CODES } from '../../../shared/languages'
import type { ComicConfig, ComicExportRequest, ComicImportRequest, ComicMaskStroke, ComicMutation, ComicProject, ComicProjectSummary, ComicRegion, ComicRunRequest } from '../../../shared/comic'
import './comic.css'
import { GlossarySelectionField } from '../settings/glossary/GlossarySelectionField'

type RegionDraft = { pageId: string; region: ComicRegion; revision: number }
const sessionDrafts = new Map<string, Record<string, RegionDraft>>()
type PendingStroke = { pageId: string; revision: number; stroke: ComicMaskStroke; pointerId?: number }
const sessionStrokes = new Map<string, PendingStroke>()
const importLabels = { images: 'suite.imageFiles', folder: 'suite.folder', archive: 'suite.archive', pdf: 'suite.comicPdf', ebook: 'suite.comicEbook' } as const
const comicIssueKeys = {
  encryptedBook: 'suite.encryptedBook', invalidPageRange: 'suite.invalidPageRange', imageTooLarge: 'suite.comicSizeLimit',
  importTooLarge: 'suite.comicSizeLimit', modelMissing: 'suite.inpaintDescription', modelCorrupt: 'suite.inpaintDescription',
  runtimeUnavailable: 'suite.torchNeeded', inpaintFailed: 'suite.inpaintFailed',
  repairRequired: 'suite.repairRequired', maskNeedsReview: 'suite.maskNeedsReview', textOverflow: 'suite.textOverflow', lockedRegions: 'suite.comicLocked',
  pageNotRendered: 'suite.layoutRequired', noRegions: 'suite.recognizeFirst', translationModelMissing: 'suite.modelsNeeded',
  ocrUnavailable: 'suite.ocrNeeded', fontMissing: 'suite.fontMissing', maskTooLarge: 'suite.maskTooLarge', resourceBusy: 'suite.resourceBusy',
} satisfies Record<string, TranslationKey>
export function comicIssueKey(error: unknown): TranslationKey {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (message.includes('conflict')) return 'suite.revisionConflict'
  return Object.entries(comicIssueKeys).find(([code]) => message.includes(code.toLowerCase()))?.[1] ?? 'suite.actionFailed'
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  if (sessionStrokes.size || [...sessionDrafts.values()].some(drafts => Object.keys(drafts).length)) event.preventDefault()
})

export function ComicTranslationPage({ projectId, pageId, reader = false }: { projectId?: string; pageId?: string; reader?: boolean }) {
  const { t } = useI18n()
  const api = getBridge()?.comic
  const models = useAvailableModels().mt.filter(model => model.binding !== 'cloud:recognition')
  const [books, setBooks] = useState<ComicProjectSummary[]>()
  const [project, setProject] = useState<ComicProject>()
  const [selectedPage, setSelectedPage] = useState(pageId)
  const [imageKind, setImageKind] = useState<'source' | 'clean' | 'rendered'>('source')
  const [image, setImage] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importTitle, setImportTitle] = useState('')
  const [importKind, setImportKind] = useState<ComicImportRequest['kind']>('images')
  const [pdfDpi, setPdfDpi] = useState('200')
  const [firstPage, setFirstPage] = useState('1')
  const [lastPage, setLastPage] = useState('')
  const [firstFrame, setFirstFrame] = useState(false)
  const [exportLayer, setExportLayer] = useState<'rendered' | 'source'>('rendered')
  const [exporting, setExporting] = useState(false)
  const [exportKind, setExportKind] = useState<ComicExportRequest['kind']>('cbz')
  const [selectedRegion, setSelectedRegion] = useState<string>()
  const [drafts, updateDrafts] = useState<Record<string, RegionDraft>>(() => projectId ? sessionDrafts.get(projectId) ?? {} : {})
  const setDrafts = (value: SetStateAction<Record<string, RegionDraft>>) => updateDrafts(previous => {
    const next = typeof value === 'function' ? value(previous) : value
    if (projectId) {
      if (Object.keys(next).length) sessionDrafts.set(projectId, next)
      else sessionDrafts.delete(projectId)
    }
    return next
  })
  const [leaving, setLeaving] = useState<string>()
  const [brushMode, setBrushMode] = useState<'select' | 'erase' | 'restore'>('select')
  const [brushSize, setBrushSize] = useState(20)
  const [clearingMask, setClearingMask] = useState(false)
  const [newChapter, setNewChapter] = useState<string>()
  const [deletingRegion, setDeletingRegion] = useState<{ pageId: string; regionId: string; revision: number; number: number }>()
  const strokeRef = useRef<PendingStroke | undefined>(projectId ? sessionStrokes.get(projectId) : undefined)
  const [strokePreview, setStrokePreview] = useState<PendingStroke | undefined>(strokeRef.current)
  const updateStroke = (value?: PendingStroke) => {
    strokeRef.current = value; setStrokePreview(value)
    if (projectId) { if (value) sessionStrokes.set(projectId, value); else sessionStrokes.delete(projectId) }
  }
  const guardNavigation = (event: MouseEvent, path: string) => {
    if (!Object.keys(drafts).length && !strokePreview) return
    event.preventDefault(); setLeaving(path)
  }
  const loadGeneration = useRef(0)
  const load = async () => {
    const generation = ++loadGeneration.current
    if (!api) { setFailed(true); return }
    try {
      if (projectId) {
        const value = await api.openProject(projectId)
        if (generation !== loadGeneration.current) return
        setProject(previous => !previous || previous.id !== value.id || value.revision >= previous.revision ? value : previous)
      } else {
        const value = await api.listProjects()
        if (generation === loadGeneration.current) setBooks(value)
      }
      setFailed(false)
    } catch { if (generation === loadGeneration.current) setFailed(true) }
  }
  useEffect(() => {
    setProject(undefined); setSelectedPage(pageId); setSelectedRegion(undefined); updateDrafts(projectId ? sessionDrafts.get(projectId) ?? {} : {}); void load()
    const savedStroke = projectId ? sessionStrokes.get(projectId) : undefined
    strokeRef.current = savedStroke ? { ...savedStroke, pointerId: undefined } : undefined
    setStrokePreview(strokeRef.current)
    const dispose = api?.onChanged(event => { if (!projectId || event.projectId === projectId) void load() })
    return () => { loadGeneration.current++; dispose?.() }
  }, [api, projectId])
  useEffect(() => { if (pageId) setSelectedPage(pageId) }, [pageId])
  const page = project?.pages.find(item => item.id === selectedPage) ?? project?.pages[0]
  const region = page?.regions.find(item => item.id === selectedRegion) ?? page?.regions[0]
  const draft = region && drafts[region.id]
  const editable = draft?.region ?? region
  const validKind = imageKind === 'rendered' && !page?.hasRendered || imageKind === 'clean' && !page?.hasClean ? 'source' : imageKind
  useEffect(() => {
    setImage('')
    if (!api || !project || !page) return
    let live = true
    void api.image(project.id, page.id, validKind).then(value => { if (live) setImage(value) }).catch(error => { if (live) notifyError(t('suite.actionFailed'), { cause: error }) })
    return () => { live = false }
  }, [api, project?.id, project?.revision, page?.id, validKind])
  const act = async (operation: () => Promise<unknown>) => {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try { await operation(); return true }
    catch (error) { notifyError(t(comicIssueKey(error)), { cause: error }); return false }
    finally { pending.current = false; setBusy(false) }
  }
  const edit = async (command: ComicMutation['command'], expectedRevision = project?.revision) => {
    if (!api || !project || expectedRevision === undefined) return
    setProject(await api.edit({ projectId: project.id, operationId: crypto.randomUUID(), expectedRevision, command }))
  }
  const configure = (patch: Partial<ComicConfig>) => { if (project) void act(() => edit({ action: 'configure', config: { ...project.config, ...patch } })) }
  const runStage = (stage: ComicRunRequest['stage'], all = false) => {
    if (!api || !project || !page || strokePreview || Object.keys(drafts).length) return
    void act(async () => {
      setProject(await api.run({ projectId: project.id, expectedRevision: project.revision, pageIds: all ? project.pages.map(item => item.id) : [page.id], stage }))
      if (stage === 'layout' || stage === 'full') setImageKind('rendered')
      else if (stage === 'repair') setImageKind('clean')
    })
  }
  const addRegion = () => {
    if (!project || !page) return
    const width = Math.max(1, Math.floor(page.width / 3)), height = Math.max(1, Math.floor(page.height / 5))
    const region: ComicRegion = { id: crypto.randomUUID(), x: Math.floor((page.width - width) / 2), y: Math.floor((page.height - height) / 2), width, height,
      sourceText: '', targetText: null, confidence: null, locked: false, ignored: false, qa: [], style: { fontSize: 16, color: '#000000', direction: 'horizontal', align: 'center' } }
    void act(async () => { await edit({ action: 'saveRegion', pageId: page.id, region }); setSelectedRegion(region.id) })
  }
  const patchRegion = (patch: Partial<ComicRegion>) => {
    if (!region || !project) return
    if (!page) return
    setDrafts(previous => ({ ...previous, [region.id]: { pageId: page.id, region: { ...(previous[region.id]?.region ?? region), ...patch }, revision: previous[region.id]?.revision ?? project.revision } }))
  }
  const saveStroke = async (value: PendingStroke) => {
    const saved = await act(() => edit({ action: 'paintMask', pageId: value.pageId, stroke: value.stroke }, value.revision))
    if (saved && strokeRef.current?.stroke.id === value.stroke.id) updateStroke(undefined)
  }
  const point = (event: PointerEvent<HTMLDivElement>): [number, number] => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return [Math.max(0, Math.min(page!.width - 1, Math.round((event.clientX - bounds.left) / bounds.width * page!.width))), Math.max(0, Math.min(page!.height - 1, Math.round((event.clientY - bounds.top) / bounds.height * page!.height)))]
  }
  const paintStart = (event: PointerEvent<HTMLDivElement>) => {
    if (!project || !page || reader || brushMode === 'select' || busy || project.jobs.some(job => job.state === 'running') || strokeRef.current || event.button !== 0) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    updateStroke({ pageId: page.id, revision: project.revision, pointerId: event.pointerId, stroke: { id: crypto.randomUUID(), mode: brushMode, size: brushSize, points: [point(event)] } })
  }
  const paintMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = strokeRef.current
    // The persisted stroke protocol bounds each gesture to 2,000 pointer samples.
    if (current?.pointerId !== event.pointerId || !page || current.stroke.points.length >= 2000) return
    const next = point(event), previous = current.stroke.points.at(-1)!
    if (next[0] === previous[0] && next[1] === previous[1]) return
    updateStroke({ ...current, stroke: { ...current.stroke, points: [...current.stroke.points, next] } })
  }
  const paintEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = strokeRef.current
    if (current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const value = { ...current, pointerId: undefined }; updateStroke(value); void saveStroke(value)
  }
  const importBook = () => {
    if (!api) return
    void act(async () => {
      const value = await api.importProject({ title: importTitle, kind: importKind, ...(projectId && { projectId }),
        ...(importKind === 'pdf' ? { pdfDpi: Number(pdfDpi), firstPage: Number(firstPage), lastPage: lastPage ? Number(lastPage) : undefined } : { firstFrame }) })
      if (value) { setImporting(false); location.hash = `/comic-translation/${encodeURIComponent(value.id)}` }
    })
  }
  const importDialog = <Dialog open={importing} onOpenChange={open => { if (!busy) setImporting(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.importComic')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); importBook() }}><FieldGroup><Field><FieldLabel htmlFor="comic-import-title">{t('suite.title')}</FieldLabel><Input id="comic-import-title" required maxLength={200} value={importTitle} disabled={busy} onChange={event => setImportTitle(event.target.value)} /></Field><Field><FieldLabel htmlFor="comic-import-kind">{t('suite.importKind')}</FieldLabel><Select value={importKind} disabled={busy} onValueChange={value => { if (value) setImportKind(value as ComicImportRequest['kind']) }}><SelectTrigger id="comic-import-kind"><SelectValue>{t(importLabels[importKind])}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(['images', 'folder', 'archive', 'pdf', 'ebook'] as const).map(kind => <SelectItem value={kind} key={kind}>{t(importLabels[kind])}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    {importKind === 'pdf' ? <>
      <Field><FieldLabel htmlFor="comic-dpi">{t('suite.pdfDpi')}</FieldLabel><Input id="comic-dpi" type="number" required min={72} max={600} value={pdfDpi} onChange={e => setPdfDpi(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="comic-first">{t('suite.firstPage')}</FieldLabel><Input id="comic-first" type="number" required min={1} value={firstPage} onChange={e => setFirstPage(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="comic-last">{t('suite.lastPage')}</FieldLabel><Input id="comic-last" type="number" min={Number(firstPage)} value={lastPage} onChange={e => setLastPage(e.target.value)} /></Field>
    </> : <Field><FieldLabel htmlFor="comic-first-frame">{t('suite.firstFrame')}</FieldLabel><Switch id="comic-first-frame" checked={firstFrame} onCheckedChange={setFirstFrame}><SwitchThumb /></Switch></Field>}
    </FieldGroup><Button type="submit" disabled={busy || !importTitle.trim()}>{busy && <Spinner data-icon="inline-start" />}{t('suite.importComic')}</Button></form></CardContent></DialogContent></Dialog>
  if (!projectId) return <div className="comic-page"><PageHeader warning={t('suite.experimentalUnavailable')} title={t('suite.comicTitle')} actions={<Button disabled={busy || !api} onClick={() => setImporting(true)}><FolderInput data-icon="inline-start" />{t('suite.importComic')}</Button>} />
    {failed ? <Alert><AlertDescription>{t('suite.actionFailed')}<Button variant="outline" size="sm" onClick={() => void load()}>{t('suite.retry')}</Button></AlertDescription></Alert> : !books ? <Spinner /> : <>
      {!!books.length && <Field><FieldLabel htmlFor="comic-search">{t('suite.search')}</FieldLabel><Input id="comic-search" value={search} onChange={event => setSearch(event.target.value)} /></Field>}
      {!books.length && <Empty><EmptyHeader><EmptyTitle>{t('suite.emptyBookshelf')}</EmptyTitle></EmptyHeader><Button disabled={busy || !api} onClick={() => setImporting(true)}>{t('suite.importComic')}</Button></Empty>}
      <div className="comic-bookshelf">{books.filter(book => book.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(book => <Card key={book.id}><CardHeader><CardTitle>{book.title}</CardTitle></CardHeader><CardContent className="flex flex-col items-start gap-3"><p>{t('suite.pages', { count: book.pageCount })}</p><div className="flex gap-2"><Button nativeButton={false} variant="outline" render={<a href={`#/comic-translation/${encodeURIComponent(book.id)}`} />}>{t('suite.edit')}</Button><Button nativeButton={false} variant="outline" render={<a href={`#/comic-translation/${encodeURIComponent(book.id)}/reader`} />}><BookOpen data-icon="inline-start" />{t('suite.read')}</Button></div></CardContent></Card>)}</div>
    </>}{importDialog}</div>
  if (!project) return <div className="comic-page"><PageHeader warning={t('suite.experimentalUnavailable')} title={t('suite.comicTitle')} /><Card><CardContent>{failed ? <div className="flex flex-col items-start gap-3"><p>{t('suite.actionFailed')}</p><Button variant="outline" onClick={() => void load()}>{t('suite.retry')}</Button><Button nativeButton={false} variant="outline" onClick={event => guardNavigation(event, '#/comic-translation')} render={<a href="#/comic-translation" />}>{t('suite.bookshelf')}</Button></div> : <Spinner />}</CardContent></Card></div>
  const exportFormats = { cbz: 'CBZ', directory: t('suite.pngFolder'), images: 'ZIP (PNG)', png: t('suite.singlePng'), pdf: 'PDF', epub: 'EPUB',
    json: 'JSON', labelplus: 'LabelPlus (ZIP)', project: t('suite.projectArchive') }
  const exportImages = !['json', 'project', 'labelplus'].includes(exportKind)
  const activeJob = project.jobs.find(job => job.state === 'running')
  return <div className="comic-page"><PageHeader warning={t('suite.experimentalUnavailable')} title={project.title} actions={<div className="flex flex-wrap gap-2"><Button nativeButton={false} variant="outline" onClick={event => guardNavigation(event, '#/comic-translation')} render={<a href="#/comic-translation" />}><ArrowLeft data-icon="inline-start" />{t('suite.bookshelf')}</Button><Button nativeButton={false} variant="outline" onClick={event => guardNavigation(event, `#/comic-translation/${encodeURIComponent(project.id)}${reader ? '' : '/reader'}`)} render={<a href={`#/comic-translation/${encodeURIComponent(project.id)}${reader ? '' : '/reader'}`} />}><BookOpen data-icon="inline-start" />{t(reader ? 'suite.edit' : 'suite.read')}</Button><Button variant="outline" disabled={busy || !!strokePreview || !!Object.keys(drafts).length} onClick={() => setExporting(true)}><Download data-icon="inline-start" />{t('suite.export')}</Button>{!reader && <Button disabled={busy || !!activeJob || !page || !!strokePreview || !!Object.keys(drafts).length} onClick={() => runStage('full', true)}><Play data-icon="inline-start" />{t('suite.translate')}</Button>}</div>} />
    {importDialog}
    {!reader && <Card><CardContent className="comic-config"><Button variant="outline" disabled={busy || !!activeJob || !!strokePreview || !!Object.keys(drafts).length} onClick={() => setImporting(true)}><FolderInput data-icon="inline-start" />{t('suite.importComic')}</Button><LanguageDirectionSelect source={project.config.sourceLanguage} target={project.config.targetLanguage} sourceCodes={['auto', ...LANGUAGE_CODES]} targetCodes={[...LANGUAGE_CODES]} sourceLabel={t('screen.sourceLanguage')} targetLabel={t('screen.targetLanguage')} disabled={busy || !!activeJob} onSourceChange={value => configure({ sourceLanguage: value })} onTargetChange={value => configure({ targetLanguage: value })} />
      <Field><FieldLabel htmlFor="comic-model">{t('screen.model')}</FieldLabel><Select value={project.config.model || null} disabled={busy || !!activeJob} onValueChange={value => { if (value) configure({ model: value }) }}><SelectTrigger id="comic-model"><SelectValue placeholder={t('session.followDefault')}>{models.find(model => model.binding === project.config.model)?.name}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{models.map(model => <SelectItem key={model.binding} value={model.binding}>{model.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="comic-repair-method">{t('suite.repairMethod')}</FieldLabel><Select value={project.config.repairMethod ?? 'telea'} disabled={busy || !!activeJob} onValueChange={value => { if (value === 'telea' || value === 'lama-manga') configure({ repairMethod: value }) }}><SelectTrigger id="comic-repair-method"><SelectValue>{project.config.repairMethod === 'lama-manga' ? 'LaMa Manga' : 'Telea'}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="telea">Telea</SelectItem><SelectItem value="lama-manga">LaMa Manga</SelectItem></SelectGroup></SelectContent></Select></Field>
      {project.config.repairMethod === 'lama-manga' && <Button nativeButton={false} variant="outline" render={<a href="#/models" />}>{t('nav.models')}</Button>}
      <GlossarySelectionField value={project.config.glossary} disabled={busy || !!activeJob || !!Object.keys(drafts).length || !!strokePreview} onChange={glossary => configure({ glossary })} /><Button nativeButton={false} variant="outline" render={<a href="#/settings/glossary" />}>{t('suite.manageGlossary')}</Button>
    </CardContent></Card>}
    {project.jobs.slice(-1).map(job => <Card key={job.id}><CardContent className="flex flex-wrap items-center gap-3"><span role="status">{t(job.state === 'running' ? 'suite.jobRunning' : job.state === 'completed' ? 'suite.jobCompleted' : job.state === 'failed' ? 'suite.jobFailed' : job.state === 'interrupted' ? 'suite.jobInterrupted' : 'suite.jobCancelled')} · {t('suite.progress', { done: job.completedPages, total: job.totalPages })}</span>{job.state === 'running' && <Button variant="outline" size="sm" onClick={() => { if (api) void act(async () => setProject(await api.cancel(project.id, job.id))) }}><Square data-icon="inline-start" />{t('screen.cancel')}</Button>}{job.state === 'failed' && <span>{t(comicIssueKey(job.error))}</span>}</CardContent></Card>)}
    <div className={`comic-editor${reader ? ' comic-editor--reader' : ''}`}>
      <Card className="comic-pages"><CardHeader><CardTitle>{t('suite.chapters')}</CardTitle>{!reader && <Button variant="outline" size="icon-sm" disabled={busy || !!activeJob || !!strokePreview || !!Object.keys(drafts).length} aria-label={t('suite.addChapter')} onClick={() => setNewChapter('')}><Plus /></Button>}</CardHeader><CardContent className="flex flex-col gap-2">{project.chapters.map(chapter => <section key={chapter.id} className="flex flex-col gap-2"><h2 className="nola-body-strong">{chapter.title}</h2>{project.pages.filter(item => item.chapterId === chapter.id).map(item => <Button key={item.id} variant={page?.id === item.id ? 'secondary' : 'outline'} size="sm" aria-pressed={page?.id === item.id} onClick={() => { setSelectedPage(item.id); setSelectedRegion(undefined) }}>{item.name}</Button>)}</section>)}{!reader && page && <Field><FieldLabel htmlFor="comic-move-page">{t('suite.movePage')}</FieldLabel><Select value={page.chapterId} disabled={busy || !!activeJob || !!strokePreview || !!Object.keys(drafts).length} onValueChange={chapterId => { if (chapterId && chapterId !== page.chapterId) void act(() => edit({ action: 'movePage', pageId: page.id, chapterId, index: project.pages.length })) }}><SelectTrigger id="comic-move-page"><SelectValue>{project.chapters.find(item => item.id === page.chapterId)?.title}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{project.chapters.map(chapter => <SelectItem value={chapter.id} key={chapter.id}>{chapter.title}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>}</CardContent></Card>
      <Card className="comic-canvas"><CardHeader><ToggleGroup value={[validKind]} onValueChange={value => { if (value[0]) setImageKind(value[0] as typeof imageKind) }}><ToggleGroupItem value="source">{t('suite.sourceImage')}</ToggleGroupItem><ToggleGroupItem value="clean" disabled={!page?.hasClean}>{t('suite.cleanImage')}</ToggleGroupItem><ToggleGroupItem value="rendered" disabled={!page?.hasRendered}>{t('suite.translatedImage')}</ToggleGroupItem></ToggleGroup>{!reader && <div className="flex gap-2"><Button variant="outline" size="icon-sm" disabled={busy || !!strokePreview || !!Object.keys(drafts).length || !project.canUndo} aria-label={t('suite.undo')} onClick={() => void act(() => edit({ action: 'undo' }))}><Undo2 /></Button><Button variant="outline" size="icon-sm" disabled={busy || !!strokePreview || !!Object.keys(drafts).length || !project.canRedo} aria-label={t('suite.redo')} onClick={() => void act(() => edit({ action: 'redo' }))}><Redo2 /></Button></div>}</CardHeader>{!reader && <div className="comic-canvas__tools"><ToggleGroup value={[brushMode]} disabled={busy || !!activeJob || !!strokePreview} onValueChange={value => { if (value[0]) setBrushMode(value[0] as typeof brushMode) }}>{(['select', 'erase', 'restore'] as const).map(mode => <ToggleGroupItem key={mode} value={mode}>{t(mode === 'select' ? 'suite.selectPointer' : mode === 'erase' ? 'suite.eraseMask' : 'suite.restoreMask')}</ToggleGroupItem>)}</ToggleGroup>{brushMode !== 'select' && <Field><FieldLabel htmlFor="comic-brush-size">{t('suite.brushSize')}</FieldLabel><Input id="comic-brush-size" type="number" min={1} max={200} value={brushSize} disabled={busy || !!strokePreview} onChange={event => { const size = Number(event.target.value); if (Number.isFinite(size)) setBrushSize(Math.min(200, Math.max(1, size))) }} /></Field>}<Button variant="outline" size="sm" disabled={busy || !!activeJob || !page?.maskStrokes?.length || !!strokePreview} onClick={() => setClearingMask(true)}>{t('suite.clearMask')}</Button><Popover><PopoverTrigger render={<Button variant="outline" size="sm" disabled={busy || !!activeJob || !page || !!strokePreview || !!Object.keys(drafts).length} />}>{t('suite.pageActions')}</PopoverTrigger><PopoverContent className="flex flex-col gap-2"><Button variant="outline" size="sm" onClick={() => runStage('ocr')}>{t('suite.recognizeText')}</Button><Button variant="outline" size="sm" disabled={!page?.regions.length} onClick={() => runStage('translate')}>{t('suite.translateText')}</Button><Button variant="outline" size="sm" disabled={!page?.regions.length} onClick={() => runStage('repair')}>{t('suite.repairPage')}</Button><Button variant="outline" size="sm" disabled={!page?.hasClean} onClick={() => runStage('layout')}>{t('suite.layoutPage')}</Button></PopoverContent></Popover><Button variant="outline" size="sm" disabled={busy || !!activeJob || !page || !!strokePreview || !!Object.keys(drafts).length} onClick={addRegion}><Plus data-icon="inline-start" />{t('suite.addRegion')}</Button>{strokePreview && strokePreview.pointerId === undefined && <><Button size="sm" disabled={busy} onClick={() => void saveStroke(strokePreview)}>{t('suite.save')}</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => updateStroke(undefined)}>{t('screen.cancel')}</Button></>}</div>}<CardContent className="comic-canvas__scroll">{image && page ? <div className="comic-canvas__image" data-brush={brushMode !== 'select' || undefined} onPointerDown={paintStart} onPointerMove={paintMove} onPointerUp={paintEnd} onPointerCancel={paintEnd}><img src={image} alt={page.name} />{!reader && brushMode !== 'select' && <svg className="comic-canvas__mask" viewBox={`0 0 ${page.width} ${page.height}`} aria-hidden="true">{[...(page.maskStrokes ?? []), ...(strokePreview?.pageId === page.id ? [strokePreview.stroke] : [])].map(stroke => <path key={stroke.id} d={stroke.points.length === 1 ? `M${stroke.points[0].join(',')}l0,0` : stroke.points.map((point, index) => `${index ? 'L' : 'M'}${point.join(',')}`).join(' ')} fill="none" strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" data-mode={stroke.mode} />)}</svg>}{!reader && brushMode === 'select' && page.regions.map((item, index) => <button key={item.id} type="button" className="comic-canvas__region" aria-label={t('suite.region', { number: index + 1 })} aria-pressed={region?.id === item.id} style={{ left: `${item.x / page.width * 100}%`, top: `${item.y / page.height * 100}%`, width: `${item.width / page.width * 100}%`, height: `${item.height / page.height * 100}%` }} onClick={() => setSelectedRegion(item.id)} />)}</div> : <Spinner />}</CardContent></Card>
      {!reader && <Card className="comic-inspector"><CardHeader><CardTitle>{t('suite.edit')}</CardTitle>{!!Object.keys(drafts).length && <span className="text-muted">{t('suite.unsaved')}</span>}</CardHeader><CardContent className="flex flex-col gap-4">{editable && region && page ? <>
        <Select value={region.id} onValueChange={value => { if (value) setSelectedRegion(value) }}><SelectTrigger aria-label={t('suite.edit')}><SelectValue>{t('suite.region', { number: page.regions.indexOf(region) + 1 })}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{page.regions.map((item, index) => <SelectItem value={item.id} key={item.id}>{t('suite.region', { number: index + 1 })}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <Field><FieldLabel htmlFor="comic-source">{t('suite.source')}</FieldLabel><Textarea id="comic-source" value={editable.sourceText} maxLength={64000} disabled={busy} onChange={event => patchRegion({ sourceText: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="comic-target">{t('suite.translation')}</FieldLabel><Textarea id="comic-target" value={editable.targetText ?? ''} maxLength={64000} disabled={busy} onChange={event => patchRegion({ targetText: event.target.value, locked: true })} /></Field>
        <Field className="flex flex-row items-center justify-between"><FieldLabel htmlFor="comic-lock"><LockKeyhole className="inline size-4" /> {t('suite.lock')}</FieldLabel><Switch id="comic-lock" checked={editable.locked} disabled={busy} onCheckedChange={locked => patchRegion({ locked })}><SwitchThumb /></Switch></Field>
        <Field><FieldLabel htmlFor="comic-text-direction">{t('suite.direction')}</FieldLabel><Select value={editable.style.direction} disabled={busy} onValueChange={value => { if (value) patchRegion({ style: { ...editable.style, direction: value as 'horizontal' | 'vertical-rl' } }) }}><SelectTrigger id="comic-text-direction"><SelectValue>{t(editable.style.direction === 'horizontal' ? 'suite.horizontal' : 'suite.vertical')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="horizontal">{t('suite.horizontal')}</SelectItem><SelectItem value="vertical-rl">{t('suite.vertical')}</SelectItem></SelectGroup></SelectContent></Select></Field>
<Field><FieldLabel htmlFor="comic-text-size">{t('screen.fontSize')}</FieldLabel><Input id="comic-text-size" type="number" min={6} max={200} step={1} value={editable.style.fontSize} disabled={busy} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) patchRegion({ style: { ...editable.style, fontSize: Math.round(Math.min(200, Math.max(6, value))) } }) }} /></Field>
<Field><FieldLabel>{t('suite.textColor')}</FieldLabel><fieldset disabled={busy}><ColorPicker label={t('suite.textColor')} value={editable.style.color} presets={[]} onChange={color => patchRegion({ style: { ...editable.style, color } })} /></fieldset></Field>
<Field><FieldLabel htmlFor="comic-text-align">{t('suite.alignment')}</FieldLabel><Select value={editable.style.align} disabled={busy} onValueChange={value => { if (value) patchRegion({ style: { ...editable.style, align: value as 'left' | 'center' | 'right' } }) }}><SelectTrigger id="comic-text-align"><SelectValue>{t(editable.style.align === 'left' ? 'suite.alignLeft' : editable.style.align === 'right' ? 'suite.alignRight' : 'suite.alignCenter')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="left">{t('suite.alignLeft')}</SelectItem><SelectItem value="center">{t('suite.alignCenter')}</SelectItem><SelectItem value="right">{t('suite.alignRight')}</SelectItem></SelectGroup></SelectContent></Select></Field>
<div className="comic-region-geometry">{(['x', 'y', 'width', 'height'] as const).map(key => <Field key={key}><FieldLabel htmlFor={`comic-region-${key}`}>{t(key === 'x' ? 'suite.positionX' : key === 'y' ? 'suite.positionY' : key === 'width' ? 'suite.regionWidth' : 'suite.regionHeight')}</FieldLabel><Input id={`comic-region-${key}`} type="number" min={key === 'x' || key === 'y' ? 0 : 1} max={key === 'x' ? page.width - editable.width : key === 'y' ? page.height - editable.height : key === 'width' ? page.width - editable.x : page.height - editable.y} step={1} disabled={busy} value={editable[key]} onChange={event => { const value = Number(event.target.value), maximum = key === 'x' ? page.width - editable.width : key === 'y' ? page.height - editable.height : key === 'width' ? page.width - editable.x : page.height - editable.y; if (Number.isFinite(value)) patchRegion({ [key]: Math.min(maximum, Math.max(key === 'x' || key === 'y' ? 0 : 1, value)), sourceQuad: undefined }) }} /></Field>)}</div>
<Field className="flex flex-row items-center justify-between"><FieldLabel htmlFor="comic-ignore">{t('suite.ignoreRegion')}</FieldLabel><Switch id="comic-ignore" checked={editable.ignored} disabled={busy} onCheckedChange={ignored => patchRegion({ ignored })}><SwitchThumb /></Switch></Field>
<Button variant="outline" size="sm" disabled={busy || !!activeJob} onClick={() => setDeletingRegion({ pageId: page.id, regionId: region.id, revision: project.revision, number: page.regions.indexOf(region) + 1 })}><Trash2 data-icon="inline-start" />{t('suite.delete')}</Button>        <Button disabled={busy || !draft} onClick={() => { if (draft) void act(async () => { await edit({ action: 'saveRegion', pageId: page.id, region: draft.region }, draft.revision); setDrafts(previous => { const next = { ...previous }; delete next[region.id]; return next }); notifySuccess(t('suite.saved')) }) }}><Save data-icon="inline-start" />{t('suite.save')}</Button>{draft && <Button variant="outline" disabled={busy} onClick={() => setDrafts(previous => { const next = { ...previous }; delete next[region.id]; return next })}>{t('screen.cancel')}</Button>}
      </> : <Empty><EmptyHeader><EmptyTitle>{t('suite.noRegions')}</EmptyTitle></EmptyHeader></Empty>}</CardContent></Card>}
    </div>
<Dialog open={!!leaving} onOpenChange={open => { if (!open) setLeaving(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.unsaved')}</DialogTitle><DialogCloseButton /></DialogHeader><CardContent><Button variant="destructive" onClick={() => { if (leaving) { setDrafts({}); updateStroke(undefined); location.hash = leaving; setLeaving(undefined) } }}>{t('suite.discard')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={clearingMask} onOpenChange={open => { if (!busy) setClearingMask(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.clearMask')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy || !page} onClick={() => { if (page) void act(() => edit({ action: 'clearMask', pageId: page.id })).then(ok => { if (ok) setClearingMask(false) }) }}>{t('suite.clearMask')}</Button></CardContent></DialogContent></Dialog><Dialog open={newChapter !== undefined} onOpenChange={open => { if (!open && !busy) setNewChapter(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.addChapter')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (newChapter?.trim()) void act(() => edit({ action: 'addChapter', title: newChapter })).then(ok => { if (ok) setNewChapter(undefined) }) }}><Field><FieldLabel htmlFor="comic-chapter-title">{t('suite.title')}</FieldLabel><Input id="comic-chapter-title" maxLength={200} required value={newChapter ?? ''} disabled={busy} onChange={event => setNewChapter(event.target.value)} /></Field><Button type="submit" disabled={busy || !newChapter?.trim()}>{t('suite.addChapter')}</Button></form></CardContent></DialogContent></Dialog>
<Dialog open={!!deletingRegion} onOpenChange={open => { if (!open && !busy) setDeletingRegion(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: t('suite.region', { number: deletingRegion?.number ?? 0 }) })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => { if (deletingRegion) void act(async () => { await edit({ action: 'deleteRegion', pageId: deletingRegion.pageId, regionId: deletingRegion.regionId }, deletingRegion.revision); setDrafts(previous => { const next = { ...previous }; delete next[deletingRegion.regionId]; return next }); setSelectedRegion(undefined); setDeletingRegion(undefined) }) }}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>    <Dialog open={exporting} onOpenChange={open => { if (!busy) setExporting(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.export')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="comic-export-kind">{t('suite.exportFormat')}</FieldLabel><Select value={exportKind} disabled={busy} onValueChange={value => { if (value) setExportKind(value as ComicExportRequest['kind']) }}><SelectTrigger id="comic-export-kind"><SelectValue>{exportFormats[exportKind]}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{Object.entries(exportFormats).map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      {exportImages && <Field><FieldLabel htmlFor="comic-export-layer">{t('suite.comicLayer')}</FieldLabel><Select value={exportLayer} onValueChange={value => { if (value === 'source' || value === 'rendered') setExportLayer(value) }}><SelectTrigger id="comic-export-layer"><SelectValue>{t(exportLayer === 'source' ? 'suite.sourceImage' : 'suite.translatedImage')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="source">{t('suite.sourceImage')}</SelectItem><SelectItem value="rendered">{t('suite.translatedImage')}</SelectItem></SelectGroup></SelectContent></Select></Field>}
      <Button disabled={busy || !page} onClick={() => { if (api) void act(async () => { if (await api.exportProject({ projectId: project.id, kind: exportKind, ...(exportImages && { layer: exportLayer }), ...(exportKind === 'png' && page && { pageIds: [page.id] }) })) setExporting(false) }) }}>{t('suite.export')}</Button></CardContent></DialogContent></Dialog>
  </div>
}
