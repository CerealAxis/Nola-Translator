import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type SetStateAction, type UIEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, ChevronDown, Download, Ellipsis, FolderInput, LockKeyhole, PanelRight, Plus, Redo2, Save, Settings2, Square, Trash2, Undo2, X } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ColorPicker } from '@/components/ui/color-picker'
import { LANGUAGE_CODES } from '../../../shared/languages'
import type { ComicBridge, ComicConfig, ComicExportRequest, ComicImportRequest, ComicMaskStroke, ComicMutation, ComicPage, ComicProject, ComicProjectSummary, ComicRegion, ComicRunRequest } from '../../../shared/comic'
import { GlossarySelectionField } from '../settings/glossary/GlossarySelectionField'

type RegionDraft = { pageId: string; region: ComicRegion; revision: number }
const sessionDrafts = new Map<string, Record<string, RegionDraft>>()
type PendingStroke = { pageId: string; revision: number; stroke: ComicMaskStroke; pointerId?: number }
const sessionStrokes = new Map<string, PendingStroke>()
const importLabels = { auto: 'suite.comicFiles', images: 'suite.imageFiles', folder: 'suite.folder', archive: 'suite.archive', pdf: 'suite.comicPdf', ebook: 'suite.comicEbook' } as const
const stageLabels = {
  detect: 'suite.comicDetect', ocr: 'suite.recognizeText', translate: 'suite.translateText',
  repair: 'suite.repairPage', layout: 'suite.layoutPage',
} as const
const comicIssueKeys = {
  encryptedBook: 'suite.encryptedBook', invalidPageRange: 'suite.invalidPageRange', imageTooLarge: 'suite.comicSizeLimit',
  importTooLarge: 'suite.comicSizeLimit', modelMissing: 'suite.inpaintDescription', modelCorrupt: 'suite.inpaintDescription',
  runtimeUnavailable: 'suite.torchNeeded', inpaintFailed: 'suite.inpaintFailed',
  repairRequired: 'suite.repairRequired', maskNeedsReview: 'suite.maskNeedsReview', textOverflow: 'suite.textOverflow', lockedRegions: 'suite.comicLocked',
  pageNotRendered: 'suite.layoutRequired', noRegions: 'suite.recognizeFirst', translationModelMissing: 'suite.modelsNeeded',
  ocrUnavailable: 'suite.ocrNeeded', ocrNotReady: 'suite.ocrNeeded', modelUnavailable: 'suite.modelsNeeded',
  detectorUnavailable: 'suite.comicDetectorUnavailable',
  fontMissing: 'suite.fontMissing', maskTooLarge: 'suite.maskTooLarge', resourceBusy: 'suite.resourceBusy',
} satisfies Record<string, TranslationKey>
export function comicIssueKey(error: unknown): TranslationKey {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (message.includes('conflict')) return 'suite.revisionConflict'
  return Object.entries(comicIssueKeys).find(([code]) => message.includes(code.toLowerCase()))?.[1] ?? 'suite.actionFailed'
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  if (sessionStrokes.size || [...sessionDrafts.values()].some(drafts => Object.keys(drafts).length)) event.preventDefault()
})

type ImageKind = Parameters<ComicBridge['image']>[2]

function availableImage(page: ComicPage | undefined, preferred?: ImageKind): ImageKind {
  if (preferred === 'clean') return page?.hasClean ? 'clean' : 'source'
  if (preferred === 'source') return 'source'
  return page?.hasRendered ? 'rendered' : 'source'
}

function ComicPageImage({ api, projectId, revision, page, kind }: {
  api: ComicBridge
  projectId: string
  revision: number
  page: ComicPage
  kind: ImageKind
}) {
  const { t } = useI18n()
  const [image, setImage] = useState<string | null>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    void api.image(projectId, page.id, kind).then(value => {
      if (live) setImage(value || null)
    }).catch(() => { if (live) setImage(null) })
    return () => { live = false }
  }, [api, projectId, revision, page.id, kind, attempt])
  if (image) return <img src={image} alt={page.name} draggable={false} />
  return <div className="comic-canvas__placeholder">{image === null
    ? <Button variant="outline" size="sm" onClick={() => { setImage(undefined); setAttempt(value => value + 1) }}>{t('suite.retry')}</Button>
    : <Spinner />}</div>
}

export function ComicTranslationPage({ projectId, pageId, reader = false }: { projectId?: string; pageId?: string; reader?: boolean }) {
  const { t } = useI18n()
  const api = getBridge()?.comic
  const models = useAvailableModels().mt.filter(model => model.binding !== 'cloud:recognition')
  const [books, setBooks] = useState<ComicProjectSummary[]>()
  const [project, setProject] = useState<ComicProject>()
  const [selectedPage, setSelectedPage] = useState(pageId)
  const [imageKind, setImageKind] = useState<ImageKind>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inspectorRef = useRef<HTMLElement>(null)
  const jumpOffset = useRef<number | undefined>(undefined)
  const movedPage = useRef<string | undefined>(undefined)
  const [nearPages, setNearPages] = useState<ReadonlySet<string>>(() => new Set())
  const [jumpPage, setJumpPage] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [workspaceDialog, setWorkspaceDialog] = useState<'settings' | 'pages'>()
  const [workspaceMenu, setWorkspaceMenu] = useState<'file' | 'stages' | 'batch'>()
  const changeMenu = (menu: NonNullable<typeof workspaceMenu>, open: boolean) => {
    setWorkspaceMenu(current => open ? menu : current === menu ? undefined : current)
  }
  const [importTitle, setImportTitle] = useState('')
  const [importKind, setImportKind] = useState<ComicImportRequest['kind']>('auto')
  const [pdfDpi, setPdfDpi] = useState('200')
  const [firstPage, setFirstPage] = useState('1')
  const [lastPage, setLastPage] = useState('')
  const [firstFrame, setFirstFrame] = useState(false)
  const [exportLayer, setExportLayer] = useState<NonNullable<ComicExportRequest['layer']>>('rendered')
  const [exportCurrentPage, setExportCurrentPage] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportKind, setExportKind] = useState<ComicExportRequest['kind']>('cbz')
  const [selectedRegion, setSelectedRegion] = useState<string>()
  const [drafts, updateDrafts] = useState<Record<string, RegionDraft>>(() => projectId ? sessionDrafts.get(projectId) ?? {} : {})
  const [inspectorOpen, setInspectorOpen] = useState(() => Object.keys(drafts).length > 0)
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
    const savedDrafts = projectId ? sessionDrafts.get(projectId) ?? {} : {}
    setProject(undefined); setSelectedPage(pageId ?? Object.values(savedDrafts)[0]?.pageId); setSelectedRegion(undefined)
    updateDrafts(savedDrafts); setInspectorOpen(Object.keys(savedDrafts).length > 0)
    setNearPages(new Set()); jumpOffset.current = undefined; void load()
    const savedStroke = projectId ? sessionStrokes.get(projectId) : undefined
    strokeRef.current = savedStroke ? { ...savedStroke, pointerId: undefined } : undefined
    setStrokePreview(strokeRef.current)
    const dispose = api?.onChanged(event => { if (!projectId || event.projectId === projectId) void load() })
    return () => { loadGeneration.current++; dispose?.() }
  }, [api, projectId])
  useEffect(() => { setImageKind(undefined) }, [projectId, reader])
  const pages = project?.pages
  const pageOrder = useMemo(() => pages?.map(item => item.id).join(','), [pages])
  const pageIndex = Math.max(0, pages?.findIndex(item => item.id === selectedPage) ?? -1)
  const page = pages?.[pageIndex]
  const region = page?.regions.find(item => item.id === selectedRegion) ?? page?.regions[0]
  const regionIndex = page && region ? page.regions.indexOf(region) : -1
  const draft = region && drafts[region.id]
  const editable = draft?.region ?? region
  const validKind = availableImage(page, imageKind)
  const activatePage = (id: string) => { setSelectedPage(id); setSelectedRegion(undefined) }
  const showPage = (id: string) => {
    const canvas = scrollRef.current
    const target = canvas?.children[pages?.findIndex(item => item.id === id) ?? -1] as HTMLElement | undefined
    if (!canvas || !target) return
    canvas.scrollTop = target.offsetTop - (canvas.firstElementChild as HTMLElement).offsetTop
    jumpOffset.current = canvas.scrollTop
    activatePage(id)
  }
  const followScroll = ({ currentTarget: canvas }: UIEvent<HTMLDivElement>) => {
    if (!pages?.length || strokeRef.current?.pointerId !== undefined || jumpOffset.current === canvas.scrollTop) return
    jumpOffset.current = undefined
    // Find the page at the reading line without measuring every page on every scroll.
    const readingLine = canvas.scrollTop + canvas.clientHeight / 2
    let first = 0, last = pages.length - 1
    if (canvas.scrollTop > 0 && Math.ceil(canvas.scrollTop + canvas.clientHeight) >= canvas.scrollHeight) first = last
    while (first < last) {
      const middle = Math.ceil((first + last) / 2)
      if ((canvas.children[middle] as HTMLElement).offsetTop <= readingLine) first = middle
      else last = middle - 1
    }
    if (pages[first].id !== page?.id) activatePage(pages[first].id)
  }
  useLayoutEffect(() => {
    const initialPage = pageId ?? selectedPage
    if (project?.id && initialPage) showPage(initialPage)
  }, [project?.id, pageId, reader])
  useLayoutEffect(() => {
    if (!movedPage.current || !pages) return
    showPage(movedPage.current)
    movedPage.current = undefined
  }, [pages])
  useEffect(() => {
    const root = scrollRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => setNearPages(previous => {
      const next = new Set(previous)
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.pageId!
        if (entry.isIntersecting) next.add(id)
        else next.delete(id)
      }
      return next
    }), { root, rootMargin: '100% 0px' })
    for (const item of root.children) observer.observe(item)
    return () => observer.disconnect()
  }, [project?.id, pageOrder])
  useLayoutEffect(() => {
    const inspector = inspectorRef.current
    const canvas = scrollRef.current
    if (inspector && canvas && inspector.getBoundingClientRect().top >= canvas.getBoundingClientRect().bottom) {
      inspector.scrollIntoView?.({ block: 'nearest' })
    }
  }, [inspectorOpen, reader])
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
  const runStage = (stage: ComicRunRequest['stage'], pageIds = page ? [page.id] : [], regionId?: string) => {
    if (!api || !project || !page || strokePreview || Object.keys(drafts).length) return
    setWorkspaceMenu(undefined)
    void act(async () => {
      setProject(await api.run({ projectId: project.id, expectedRevision: project.revision, pageIds, stage, ...(regionId && { regionId }) }))
      if (stage === 'layout' || stage === 'full') setImageKind('rendered')
      else if (stage === 'repair' || stage === 'clean') setImageKind('clean')
      else if (stage === 'detect' || stage === 'ocr') setImageKind('source')
    })
  }
  const addRegion = () => {
    if (!project || !page) return
    const width = Math.max(1, Math.floor(page.width / 3)), height = Math.max(1, Math.floor(page.height / 5))
    const region: ComicRegion = { id: crypto.randomUUID(), x: Math.floor((page.width - width) / 2), y: Math.floor((page.height - height) / 2), width, height,
      sourceText: '', targetText: null, confidence: null, locked: false, ignored: false, qa: [], style: { fontSize: 16, color: '#000000', direction: 'horizontal', align: 'center' } }
    void act(async () => { await edit({ action: 'saveRegion', pageId: page.id, region }); setSelectedRegion(region.id); setInspectorOpen(true) })
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
    if (!(event.currentTarget.firstElementChild instanceof HTMLImageElement)) return
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
  const importBook = (kind: ComicImportRequest['kind'], options = false) => {
    if (!api) return
    setWorkspaceMenu(undefined)
    void act(async () => {
      const value = await api.importProject({ kind, ...(projectId && { projectId }),
        ...(options && importTitle.trim() && { title: importTitle.trim() }),
        ...(options && (kind === 'pdf'
          ? { pdfDpi: Number(pdfDpi), firstPage: Number(firstPage), lastPage: lastPage ? Number(lastPage) : undefined }
          : { firstFrame })) })
      if (value) { setImporting(false); location.hash = `/comic-translation/${encodeURIComponent(value.id)}` }
    })
  }
  const importDialog = <Dialog open={importing} onOpenChange={open => { if (!busy) setImporting(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.importComic')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); importBook(importKind, true) }}><FieldGroup><Field><FieldLabel htmlFor="comic-import-title">{t('suite.title')}</FieldLabel><Input id="comic-import-title" maxLength={200} value={importTitle} disabled={busy} onChange={event => setImportTitle(event.target.value)} /></Field><Field><FieldLabel htmlFor="comic-import-kind">{t('suite.importKind')}</FieldLabel><Select value={importKind} disabled={busy} onValueChange={value => { if (value) setImportKind(value as ComicImportRequest['kind']) }}><SelectTrigger id="comic-import-kind"><SelectValue>{t(importLabels[importKind])}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(Object.keys(importLabels) as ComicImportRequest['kind'][]).map(kind => <SelectItem value={kind} key={kind}>{t(importLabels[kind])}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    {importKind === 'pdf' ? <>
      <Field><FieldLabel htmlFor="comic-dpi">{t('suite.pdfDpi')}</FieldLabel><Input id="comic-dpi" type="number" required min={72} max={600} value={pdfDpi} onChange={e => setPdfDpi(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="comic-first">{t('suite.firstPage')}</FieldLabel><Input id="comic-first" type="number" required min={1} value={firstPage} onChange={e => setFirstPage(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="comic-last">{t('suite.lastPage')}</FieldLabel><Input id="comic-last" type="number" min={Number(firstPage)} value={lastPage} onChange={e => setLastPage(e.target.value)} /></Field>
    </> : <Field><FieldLabel htmlFor="comic-first-frame">{t('suite.firstFrame')}</FieldLabel><Switch id="comic-first-frame" checked={firstFrame} onCheckedChange={setFirstFrame}><SwitchThumb /></Switch></Field>}
    </FieldGroup><Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{t('suite.importComic')}</Button></form></CardContent></DialogContent></Dialog>
  const importButtons = (disabled: boolean) => <div className="flex flex-wrap gap-2">
    <Button variant={projectId ? 'outline' : 'default'} disabled={disabled} onClick={() => importBook('auto')}>
      {busy && !projectId ? <Spinner data-icon="inline-start" /> : <FolderInput data-icon="inline-start" />}
      {t('suite.importComic')}
    </Button>
    <Button variant="outline" disabled={disabled} onClick={() => setImporting(true)}>{t('suite.comicImportOptions')}</Button>
  </div>
  if (!projectId) return <div className="comic-page"><PageHeader title={t('suite.comicTitle')} actions={importButtons(busy || !api)} />
    {failed ? <Alert><AlertDescription>{t('suite.actionFailed')}<Button variant="outline" size="sm" onClick={() => void load()}>{t('suite.retry')}</Button></AlertDescription></Alert> : !books ? <Spinner /> : <>
      {!!books.length && <Field><FieldLabel htmlFor="comic-search">{t('suite.search')}</FieldLabel><Input id="comic-search" value={search} onChange={event => setSearch(event.target.value)} /></Field>}
      {!books.length && <Empty><EmptyHeader><EmptyTitle>{t('suite.emptyBookshelf')}</EmptyTitle></EmptyHeader><Button disabled={busy || !api} onClick={() => importBook('auto')}>{t('suite.importComic')}</Button></Empty>}
      <div className="comic-bookshelf">{books.filter(book => book.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(book => <Card key={book.id}><CardHeader><CardTitle>{book.title}</CardTitle></CardHeader><CardContent className="flex flex-col items-start gap-3"><p>{t('suite.pages', { count: book.pageCount })}</p><div className="flex gap-2"><Button nativeButton={false} variant="outline" render={<a href={`#/comic-translation/${encodeURIComponent(book.id)}`} />}>{t('suite.edit')}</Button><Button nativeButton={false} variant="outline" render={<a href={`#/comic-translation/${encodeURIComponent(book.id)}/reader`} />}><BookOpen data-icon="inline-start" />{t('suite.read')}</Button></div></CardContent></Card>)}</div>
    </>}{importDialog}</div>
  if (!project) return <div className="comic-page"><PageHeader title={t('suite.comicTitle')} /><Card><CardContent>{failed ? <div className="flex flex-col items-start gap-3"><p>{t('suite.actionFailed')}</p><Button variant="outline" onClick={() => void load()}>{t('suite.retry')}</Button><Button nativeButton={false} variant="outline" onClick={event => guardNavigation(event, '#/comic-translation')} render={<a href="#/comic-translation" />}>{t('suite.bookshelf')}</Button></div> : <Spinner />}</CardContent></Card></div>
  const exportFormats = { cbz: 'CBZ', directory: t('suite.pngFolder'), images: 'ZIP (PNG)', png: t('suite.singlePng'), pdf: 'PDF', epub: 'EPUB',
    json: 'JSON', labelplus: 'LabelPlus (ZIP)', project: t('suite.projectArchive') }
  const exportImages = !['json', 'project', 'labelplus'].includes(exportKind)
  const activeJob = project.jobs.find(job => job.state === 'running')
  const job = activeJob ?? project.jobs[0]
  const canRun = !!api && !!page && !busy && !activeJob && !strokePreview && !Object.keys(drafts).length
  const chapterPages = project.pages.filter(item => item.chapterId === page?.chapterId)
  const stages = Object.keys(stageLabels) as (keyof typeof stageLabels)[]
  const jobStage = job && stages.find(stage => stage === job.stage)
  const canEdit = !busy && !activeJob && !strokePreview && !Object.keys(drafts).length
  const viewRoute = '#/comic-translation/' + encodeURIComponent(project.id) + (reader ? '' : '/reader')
    + (page ? '/' + encodeURIComponent(page.id) : '')
  const showInspector = !reader && inspectorOpen
  const pageLabel = (id: string) => {
    const number = project.pages.findIndex(item => item.id === id) + 1
    return number ? t('suite.page', { number }) : undefined
  }
  const jumpTarget = project.pages[Number(jumpPage) - 1]
  const chapterStarts = project.chapters.flatMap(chapter => {
    const first = project.pages.find(item => item.chapterId === chapter.id)
    return first ? [{ ...chapter, pageId: first.id }] : []
  })

  return <div className="comic-page comic-page--workspace">
    <header className="comic-workspace-header">
      <div className="comic-workspace-title">
        <Button nativeButton={false} variant="bare" size="icon-sm" aria-label={t('suite.bookshelf')}
          title={t('suite.bookshelf')} onClick={event => guardNavigation(event, '#/comic-translation')}
          render={<a href="#/comic-translation" />}><ArrowLeft /></Button>
        <h1 className="nola-title truncate" title={project.title}>{project.title}</h1>
      </div>
      <div className="comic-toolbar-group">
        <Button nativeButton={false} variant="bare" size="sm" onClick={event => guardNavigation(event, viewRoute)}
          render={<a href={viewRoute} />}><BookOpen data-icon="inline-start" />{t(reader ? 'suite.edit' : 'suite.read')}</Button>
        {!reader && <Button variant="bare" size="icon-sm" disabled={!canEdit}
          aria-label={t('suite.comicProcessingSettings')} title={t('suite.comicProcessingSettings')}
          onClick={() => setWorkspaceDialog('settings')}><Settings2 /></Button>}
        <Popover open={workspaceMenu === 'file'} onOpenChange={open => changeMenu('file', open)}>
          <PopoverTrigger aria-label={t('suite.comicFileActions')} title={t('suite.comicFileActions')}
            render={<Button variant="bare" size="icon-sm" />}><Ellipsis /></PopoverTrigger>
          <PopoverContent className="comic-action-menu" align="end">
            {!reader && <>
              <Button variant="bare" disabled={!canEdit} onClick={() => importBook('auto')}>
                <FolderInput data-icon="inline-start" />{t('suite.importComic')}
              </Button>
              <Button variant="bare" disabled={!canEdit} onClick={() => {
                setWorkspaceMenu(undefined); setImporting(true)
              }}>{t('suite.comicImportOptions')}</Button>
            </>}
            <Button variant="bare" disabled={!canEdit} onClick={() => {
              setWorkspaceMenu(undefined); setExportLayer(validKind); setExporting(true)
            }}>
              <Download data-icon="inline-start" />{t('suite.export')}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </header>
    {importDialog}
    <Dialog open={workspaceDialog === 'settings'} onOpenChange={open => { if (!open) setWorkspaceDialog(undefined) }}>
      <DialogContent className="comic-settings-dialog">
        <DialogHeader><DialogTitle>{t('suite.comicProcessingSettings')}</DialogTitle><DialogCloseButton /></DialogHeader>
        <CardContent><FieldGroup><LanguageDirectionSelect source={project.config.sourceLanguage} target={project.config.targetLanguage} sourceCodes={['auto', ...LANGUAGE_CODES]} targetCodes={[...LANGUAGE_CODES]} sourceLabel={t('screen.sourceLanguage')} targetLabel={t('screen.targetLanguage')} disabled={busy || !!activeJob} onSourceChange={value => configure({ sourceLanguage: value })} onTargetChange={value => configure({ targetLanguage: value })} />
      <Field><FieldLabel htmlFor="comic-model">{t('screen.model')}</FieldLabel><Select value={project.config.model || null} disabled={busy || !!activeJob} onValueChange={value => { if (value) configure({ model: value }) }}><SelectTrigger id="comic-model"><SelectValue placeholder={t('session.followDefault')}>{models.find(model => model.binding === project.config.model)?.name}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{models.map(model => <SelectItem key={model.binding} value={model.binding}>{model.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="comic-repair-method">{t('suite.repairMethod')}</FieldLabel><Select value={project.config.repairMethod ?? 'telea'} disabled={busy || !!activeJob} onValueChange={value => { if (value === 'telea' || value === 'lama-manga') configure({ repairMethod: value }) }}><SelectTrigger id="comic-repair-method"><SelectValue>{project.config.repairMethod === 'lama-manga' ? 'LaMa Manga' : 'Telea'}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="telea">Telea</SelectItem><SelectItem value="lama-manga">LaMa Manga</SelectItem></SelectGroup></SelectContent></Select></Field>
      <Field>
        <FieldLabel htmlFor="comic-detector">{t('suite.comicDetector')}</FieldLabel>
        <Select value={project.config.detector ?? 'ppocr'} disabled={busy || !!activeJob} onValueChange={value => {
          if (value === 'ppocr' || value === 'rtdetr') configure({ detector: value })
        }}>
          <SelectTrigger id="comic-detector"><SelectValue>{project.config.detector === 'rtdetr' ? 'RT-DETR v2' : 'PP-OCRv5'}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="ppocr">PP-OCRv5</SelectItem><SelectItem value="rtdetr">RT-DETR v2</SelectItem></SelectGroup></SelectContent>
        </Select>
      </Field>
      {(project.config.repairMethod === 'lama-manga' || project.config.detector === 'rtdetr') &&
        <Button nativeButton={false} variant="outline" render={<a href="#/models" />}>{t('nav.models')}</Button>}
      <GlossarySelectionField value={project.config.glossary} disabled={busy || !!activeJob || !!Object.keys(drafts).length || !!strokePreview} onChange={glossary => configure({ glossary })} /><Button nativeButton={false} variant="outline" render={<a href="#/settings/glossary" />}>{t('suite.manageGlossary')}</Button>
        </FieldGroup></CardContent>
      </DialogContent>
    </Dialog>
    {job && <div className="comic-job nola-caption">
        <span role="status">
          {t(job.state === 'running' ? 'suite.jobRunning' : job.state === 'completed' ? 'suite.jobCompleted' :
            job.state === 'failed' ? 'suite.jobFailed' : job.state === 'interrupted' ? 'suite.jobInterrupted' : 'suite.jobCancelled')}
          {' · '}{t('suite.progress', { done: job.completedPages, total: job.totalPages })}
          {jobStage && <> · {t(stageLabels[jobStage])}</>}
          {job.pageId && pageLabel(job.pageId) && <> · {pageLabel(job.pageId)}</>}
        </span>
        {job.state === 'running' && <Button variant="outline" size="sm" disabled={busy} onClick={() => {
          if (api) void act(async () => setProject(await api.cancel(project.id, job.id)))
        }}><Square data-icon="inline-start" />{t('screen.cancel')}</Button>}
        {job.error && <span>{t(comicIssueKey(job.error))}</span>}
        {!!job.issues?.length && <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            {t('suite.comicReviewPages', { count: job.issues.length })}
          </PopoverTrigger>
          <PopoverContent className="flex max-h-80 flex-col items-start gap-2 overflow-auto">
            {job.issues.map(issue => <div key={issue.pageId}>
              <Button size="sm" variant="outline" onClick={() => showPage(issue.pageId)}>
                {pageLabel(issue.pageId) ?? issue.pageId}
              </Button>
              <p className="nola-caption">{t(comicIssueKey(issue.error))}</p>
            </div>)}
          </PopoverContent>
        </Popover>}
    </div>}
    <Dialog open={workspaceDialog === 'pages'} onOpenChange={open => { if (!open) setWorkspaceDialog(undefined) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('suite.comicJumpToPage')}</DialogTitle><DialogCloseButton /></DialogHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="comic-page-jump" onSubmit={event => {
            event.preventDefault()
            if (!jumpTarget) return
            showPage(jumpTarget.id)
            setWorkspaceDialog(undefined)
          }}>
            <Field>
              <FieldLabel htmlFor="comic-jump-page">{t('suite.comicPagePosition', { current: pageIndex + 1, total: project.pages.length })}</FieldLabel>
              <Input id="comic-jump-page" type="number" min={1} max={project.pages.length} required value={jumpPage}
                onChange={event => setJumpPage(event.target.value)} />
            </Field>
            <Button type="submit" disabled={!jumpTarget}>{t('suite.comicJumpToPage')}</Button>
          </form>
          {chapterStarts.length > 1 && <Field>
            <FieldLabel htmlFor="comic-jump-chapter">{t('suite.chapters')}</FieldLabel>
            <Select value={page?.chapterId} onValueChange={chapterId => {
              const chapter = chapterStarts.find(item => item.id === chapterId)
              if (chapter) { showPage(chapter.pageId); setWorkspaceDialog(undefined) }
            }}>
              <SelectTrigger id="comic-jump-chapter"><SelectValue>{chapterStarts.find(item => item.id === page?.chapterId)?.title}</SelectValue></SelectTrigger>
              <SelectContent><SelectGroup>{chapterStarts.map(chapter =>
                <SelectItem key={chapter.id} value={chapter.id}>{chapter.title}</SelectItem>,
              )}</SelectGroup></SelectContent>
            </Select>
          </Field>}
          {!reader && page && project.chapters.length > 1 && <Field>
            <FieldLabel htmlFor="comic-move-page">{t('suite.movePage')}</FieldLabel>
            <Select value={page.chapterId} disabled={!canEdit} onValueChange={chapterId => {
              if (chapterId && chapterId !== page.chapterId) void act(async () => {
                movedPage.current = page.id
                try { await edit({ action: 'movePage', pageId: page.id, chapterId, index: project.pages.length }) }
                catch (error) { movedPage.current = undefined; throw error }
              })
            }}>
              <SelectTrigger id="comic-move-page"><SelectValue>{project.chapters.find(chapter => chapter.id === page.chapterId)?.title}</SelectValue></SelectTrigger>
              <SelectContent><SelectGroup>{project.chapters.map(chapter =>
                <SelectItem key={chapter.id} value={chapter.id}>{chapter.title}</SelectItem>,
              )}</SelectGroup></SelectContent>
            </Select>
          </Field>}
          {!reader && <Button className="self-start" variant="outline" size="sm" disabled={!canEdit} onClick={() => {
            setWorkspaceDialog(undefined)
            setNewChapter('')
          }}><Plus data-icon="inline-start" />{t('suite.addChapter')}</Button>}
        </CardContent>
      </DialogContent>
    </Dialog>

    <div className="comic-editor" data-inspector={showInspector || undefined}>
      <section className="comic-canvas">
        <div className="comic-canvas__toolbar">
          <div className="comic-toolbar-group">
            <Button variant="outline" size="sm" aria-haspopup="dialog" disabled={!page}
              onClick={() => { setJumpPage(String(pageIndex + 1)); setWorkspaceDialog('pages') }}>
              {t('suite.comicPagePosition', { current: page ? pageIndex + 1 : 0, total: project.pages.length })}<ChevronDown data-icon="inline-end" />
            </Button>
            <ToggleGroup aria-label={t('suite.comicLayer')} value={[validKind]} onValueChange={value => {
              if (value[0]) setImageKind(value[0] as typeof imageKind)
            }}>
              <ToggleGroupItem value="source">{t('suite.sourceImage')}</ToggleGroupItem>
              <ToggleGroupItem value="clean" disabled={!page?.hasClean}>{t('suite.cleanImage')}</ToggleGroupItem>
              <ToggleGroupItem value="rendered" disabled={!page?.hasRendered}>{t('suite.translatedImage')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {!reader && <div className="comic-toolbar-group">
            <Button size="sm" disabled={!canRun} onClick={() => runStage('full')}>{t('suite.comicTranslatePage')}</Button>
            <Popover open={workspaceMenu === 'stages'} onOpenChange={open => changeMenu('stages', open)}>
              <PopoverTrigger render={<Button variant="outline" size="sm" disabled={!canRun} />}>
                {t('suite.comicStages')}<ChevronDown data-icon="inline-end" />
              </PopoverTrigger>
              <PopoverContent className="comic-action-menu" align="end">
      {stages.map(stage => <Button key={stage} variant="bare" size="sm" disabled={!canRun ||
        (stage === 'translate' && !page?.regions.some(item => item.sourceText.trim() && !item.locked && !item.ignored)) ||
        (stage === 'repair' && !page?.regions.length && !page?.maskStrokes?.length) ||
        (stage === 'layout' && !page?.hasClean)} onClick={() => runStage(stage)}>
        {t(stageLabels[stage])}
      </Button>)}
      <Button variant="bare" size="sm" disabled={!canRun} onClick={() => runStage('clean')}>{t('suite.comicCleanOnly')}</Button>
              </PopoverContent>
            </Popover>
      <Popover open={workspaceMenu === 'batch'} onOpenChange={open => changeMenu('batch', open)}>
        <PopoverTrigger render={<Button variant="outline" size="sm" disabled={!canRun || project.pages.length < 2} />}>
          {t('suite.comicBatch')}<ChevronDown data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent className="comic-action-menu" align="end">
          {chapterPages.length > 1 && chapterPages.length < project.pages.length && <Button variant="bare"
            onClick={() => runStage('full', chapterPages.map(item => item.id))}>
            {t('suite.comicTranslateChapter', { count: chapterPages.length })}
          </Button>}
          <Button variant="bare" onClick={() => runStage('full', project.pages.map(item => item.id))}>
            {t('suite.comicTranslateBook', { count: project.pages.length })}
          </Button>
        </PopoverContent>
      </Popover>
          </div>}
        </div>

        {!reader && <div className="comic-canvas__tools">
          <div className="comic-toolbar-group">
            <Button variant="bare" size="icon-sm" disabled={!canEdit || !project.canUndo} aria-label={t('suite.undo')}
              title={t('suite.undo')} onClick={() => void act(() => edit({ action: 'undo' }))}><Undo2 /></Button>
            <Button variant="bare" size="icon-sm" disabled={!canEdit || !project.canRedo} aria-label={t('suite.redo')}
              title={t('suite.redo')} onClick={() => void act(() => edit({ action: 'redo' }))}><Redo2 /></Button>
          </div>
          <ToggleGroup value={[brushMode]} disabled={busy || !!activeJob || !!strokePreview}
            onValueChange={value => { if (value[0]) setBrushMode(value[0] as typeof brushMode) }}>
            {(['select', 'erase', 'restore'] as const).map(mode => <ToggleGroupItem key={mode} value={mode}>
              {t(mode === 'select' ? 'suite.selectPointer' : mode === 'erase' ? 'suite.eraseMask' : 'suite.restoreMask')}
            </ToggleGroupItem>)}
          </ToggleGroup>
          {brushMode === 'select' ? <Button variant="bare" size="sm" disabled={!canRun} onClick={addRegion}>
            <Plus data-icon="inline-start" />{t('suite.addRegion')}
          </Button> : <>
            <Field className="comic-brush-size">
              <FieldLabel htmlFor="comic-brush-size">{t('suite.brushSize')}</FieldLabel>
              <Input id="comic-brush-size" type="number" min={1} max={200} value={brushSize} disabled={busy || !!strokePreview}
                onChange={event => { const size = Number(event.target.value); if (Number.isFinite(size)) setBrushSize(Math.min(200, Math.max(1, size))) }} />
            </Field>
            {!!page?.maskStrokes?.length && <Button variant="bare" size="sm" disabled={!canEdit}
              onClick={() => setClearingMask(true)}>{t('suite.clearMask')}</Button>}
          </>}
          {strokePreview && strokePreview.pointerId === undefined && <>
            <Button size="sm" disabled={busy} onClick={() => void saveStroke(strokePreview)}>{t('suite.save')}</Button>
            <Button variant="bare" size="sm" disabled={busy} onClick={() => updateStroke(undefined)}>{t('screen.cancel')}</Button>
          </>}
          {(region || showInspector) && <Button variant="bare" size="sm" aria-pressed={showInspector}
            onClick={() => setInspectorOpen(value => !value)}><PanelRight data-icon="inline-start" />{t('suite.edit')}</Button>}
        </div>}
        <div ref={scrollRef} className="comic-canvas__scroll" role="region" aria-label={t('suite.comicCanvas')}
          tabIndex={0} onScroll={followScroll}>
          {project.pages.map((item, index) => {
            const active = index === pageIndex
            const painting = !reader && active && brushMode !== 'select'
            const kind = availableImage(item, imageKind)
            return <div key={item.id} data-page-id={item.id} className="comic-canvas__image"
              style={{ aspectRatio: `${item.width} / ${item.height}` }} data-brush={painting || undefined}
              onPointerDown={painting ? paintStart : undefined} onPointerMove={painting ? paintMove : undefined}
              onPointerUp={painting ? paintEnd : undefined} onPointerCancel={painting ? paintEnd : undefined}>
              {api && (Math.abs(index - pageIndex) <= 1 || nearPages.has(item.id)) &&
                <ComicPageImage key={kind} api={api} projectId={project.id} revision={project.revision} page={item} kind={kind} />}
              {painting && <svg className="comic-canvas__mask" viewBox={`0 0 ${item.width} ${item.height}`} aria-hidden="true">
                {[...(item.maskStrokes ?? []), ...(strokePreview?.pageId === item.id ? [strokePreview.stroke] : [])].map(stroke =>
                  <path key={stroke.id} d={stroke.points.length === 1 ? `M${stroke.points[0].join(',')}l0,0` :
                    stroke.points.map((point, index) => `${index ? 'L' : 'M'}${point.join(',')}`).join(' ')}
                    fill="none" strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" data-mode={stroke.mode} />)}
              </svg>}
              {!reader && active && brushMode === 'select' && item.regions.map((regionItem, index) =>
                <button key={regionItem.id} type="button" className="comic-canvas__region" aria-label={t('suite.region', { number: index + 1 })}
                  aria-pressed={showInspector && region?.id === regionItem.id}
                  style={{ left: `${regionItem.x / item.width * 100}%`, top: `${regionItem.y / item.height * 100}%`,
                    width: `${regionItem.width / item.width * 100}%`, height: `${regionItem.height / item.height * 100}%` }}
                  onClick={() => { setSelectedRegion(regionItem.id); setInspectorOpen(true) }} />)}
            </div>
          })}
        </div>
      </section>
      {showInspector && <aside ref={inspectorRef} className="comic-inspector">
        <div className="comic-pane-header"><h2 className="nola-body-strong">{t('suite.edit')}</h2>
          {!!Object.keys(drafts).length && <span className="nola-caption">{t('suite.unsaved')}</span>}
          <Button variant="bare" size="icon-sm" aria-label={t('common.close')} onClick={() => setInspectorOpen(false)}><X /></Button>
        </div>
        {editable && region && page ? <>
        <div className="comic-region-picker"><Select value={region.id} onValueChange={value => { if (value) setSelectedRegion(value) }}><SelectTrigger aria-label={t('suite.edit')}><SelectValue>{t('suite.region', { number: page.regions.indexOf(region) + 1 })}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{page.regions.map((item, index) => <SelectItem value={item.id} key={item.id}>{t('suite.region', { number: index + 1 })}</SelectItem>)}</SelectGroup></SelectContent></Select>

          <Button variant="bare" size="icon-sm" aria-label={t('suite.comicRegionEarlier')}
            disabled={!canRun || regionIndex <= 0} onClick={() => void act(() => edit({
              action: 'moveRegion', pageId: page.id, regionId: region.id, index: regionIndex - 1,
            }))}><ArrowUp /></Button>
          <Button variant="bare" size="icon-sm" aria-label={t('suite.comicRegionLater')}
            disabled={!canRun || regionIndex >= page.regions.length - 1} onClick={() => void act(() => edit({
              action: 'moveRegion', pageId: page.id, regionId: region.id, index: regionIndex + 1,
            }))}><ArrowDown /></Button>
        </div>
        <Tabs defaultValue="text">
          <TabsList variant="line"><TabsTrigger value="text">{t('suite.comicTextTab')}</TabsTrigger>
            <TabsTrigger value="layout">{t('suite.comicLayoutTab')}</TabsTrigger></TabsList>
          <TabsContent value="text" className="comic-inspector-fields">
          <div className="comic-toolbar-group">
          <Button variant="outline" size="sm" disabled={!canRun || region.locked || region.ignored}
            onClick={() => runStage('ocr', [page.id], region.id)}>{t('suite.comicRecognizeRegion')}</Button>
          <Button variant="outline" size="sm" disabled={!canRun || region.locked || region.ignored || !region.sourceText.trim()}
            onClick={() => runStage('translate', [page.id], region.id)}>{t('suite.comicTranslateRegion')}</Button>
        </div>
        <Field><FieldLabel htmlFor="comic-source">{t('suite.source')}</FieldLabel><Textarea id="comic-source" value={editable.sourceText} maxLength={64000} disabled={busy} onChange={event => patchRegion({ sourceText: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="comic-target">{t('suite.translation')}</FieldLabel><Textarea id="comic-target" value={editable.targetText ?? ''} maxLength={64000} disabled={busy} onChange={event => patchRegion({ targetText: event.target.value, locked: true })} /></Field>
        <Field className="flex flex-row items-center justify-between"><FieldLabel htmlFor="comic-lock"><LockKeyhole className="inline size-4" /> {t('suite.lock')}</FieldLabel><Switch id="comic-lock" checked={editable.locked} disabled={busy} onCheckedChange={locked => patchRegion({ locked })}><SwitchThumb /></Switch></Field>
          </TabsContent>
          <TabsContent value="layout" className="comic-inspector-fields">
        <Field><FieldLabel htmlFor="comic-text-direction">{t('suite.direction')}</FieldLabel><Select value={editable.style.direction} disabled={busy} onValueChange={value => { if (value) patchRegion({ style: { ...editable.style, direction: value as 'horizontal' | 'vertical-rl' } }) }}><SelectTrigger id="comic-text-direction"><SelectValue>{t(editable.style.direction === 'horizontal' ? 'suite.horizontal' : 'suite.vertical')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="horizontal">{t('suite.horizontal')}</SelectItem><SelectItem value="vertical-rl">{t('suite.vertical')}</SelectItem></SelectGroup></SelectContent></Select></Field>
<Field><FieldLabel htmlFor="comic-text-size">{t('screen.fontSize')}</FieldLabel><Input id="comic-text-size" type="number" min={6} max={200} step={1} value={editable.style.fontSize} disabled={busy} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) patchRegion({ style: { ...editable.style, fontSize: Math.round(Math.min(200, Math.max(6, value))) } }) }} /></Field>
<Field><FieldLabel>{t('suite.textColor')}</FieldLabel><fieldset disabled={busy}><ColorPicker label={t('suite.textColor')} value={editable.style.color} presets={[]} onChange={color => patchRegion({ style: { ...editable.style, color } })} /></fieldset></Field>
<Field><FieldLabel htmlFor="comic-text-align">{t('suite.alignment')}</FieldLabel><Select value={editable.style.align} disabled={busy} onValueChange={value => { if (value) patchRegion({ style: { ...editable.style, align: value as 'left' | 'center' | 'right' } }) }}><SelectTrigger id="comic-text-align"><SelectValue>{t(editable.style.align === 'left' ? 'suite.alignLeft' : editable.style.align === 'right' ? 'suite.alignRight' : 'suite.alignCenter')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="left">{t('suite.alignLeft')}</SelectItem><SelectItem value="center">{t('suite.alignCenter')}</SelectItem><SelectItem value="right">{t('suite.alignRight')}</SelectItem></SelectGroup></SelectContent></Select></Field>
<div className="comic-region-geometry">{(['x', 'y', 'width', 'height'] as const).map(key => <Field key={key}><FieldLabel htmlFor={`comic-region-${key}`}>{t(key === 'x' ? 'suite.positionX' : key === 'y' ? 'suite.positionY' : key === 'width' ? 'suite.regionWidth' : 'suite.regionHeight')}</FieldLabel><Input id={`comic-region-${key}`} type="number" min={key === 'x' || key === 'y' ? 0 : 1} max={key === 'x' ? page.width - editable.width : key === 'y' ? page.height - editable.height : key === 'width' ? page.width - editable.x : page.height - editable.y} step={1} disabled={busy} value={editable[key]} onChange={event => { const value = Number(event.target.value), maximum = key === 'x' ? page.width - editable.width : key === 'y' ? page.height - editable.height : key === 'width' ? page.width - editable.x : page.height - editable.y; if (Number.isFinite(value)) patchRegion({ [key]: Math.min(maximum, Math.max(key === 'x' || key === 'y' ? 0 : 1, value)), sourceQuad: undefined, sourceLines: undefined }) }} /></Field>)}</div>
<Field className="flex flex-row items-center justify-between"><FieldLabel htmlFor="comic-ignore">{t('suite.ignoreRegion')}</FieldLabel><Switch id="comic-ignore" checked={editable.ignored} disabled={busy} onCheckedChange={ignored => patchRegion({ ignored })}><SwitchThumb /></Switch></Field>
          </TabsContent>
        </Tabs>
        <div className="comic-inspector-footer"><Button variant="outline" size="sm" disabled={busy || !!activeJob} onClick={() => setDeletingRegion({ pageId: page.id, regionId: region.id, revision: project.revision, number: page.regions.indexOf(region) + 1 })}><Trash2 data-icon="inline-start" />{t('suite.delete')}</Button>        <Button disabled={busy || !draft} onClick={() => { if (draft) void act(async () => { await edit({ action: 'saveRegion', pageId: page.id, region: draft.region }, draft.revision); setDrafts(previous => { const next = { ...previous }; delete next[region.id]; return next }); notifySuccess(t('suite.saved')) }) }}><Save data-icon="inline-start" />{t('suite.save')}</Button>{draft && <Button variant="outline" disabled={busy} onClick={() => setDrafts(previous => { const next = { ...previous }; delete next[region.id]; return next })}>{t('screen.cancel')}</Button>}
        </div>
      </> : <Empty><EmptyHeader><EmptyTitle>{t(page && page.status !== 'imported' ? 'suite.comicNoText' : 'suite.noRegions')}</EmptyTitle></EmptyHeader></Empty>}</aside>}
    </div>
<Dialog open={!!leaving} onOpenChange={open => { if (!open) setLeaving(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.unsaved')}</DialogTitle><DialogCloseButton /></DialogHeader><CardContent><Button variant="destructive" onClick={() => { if (leaving) { setDrafts({}); updateStroke(undefined); location.hash = leaving; setLeaving(undefined) } }}>{t('suite.discard')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={clearingMask} onOpenChange={open => { if (!busy) setClearingMask(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.clearMask')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy || !page} onClick={() => { if (page) void act(() => edit({ action: 'clearMask', pageId: page.id })).then(ok => { if (ok) setClearingMask(false) }) }}>{t('suite.clearMask')}</Button></CardContent></DialogContent></Dialog><Dialog open={newChapter !== undefined} onOpenChange={open => { if (!open && !busy) setNewChapter(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.addChapter')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (newChapter?.trim()) void act(() => edit({ action: 'addChapter', title: newChapter })).then(ok => { if (ok) setNewChapter(undefined) }) }}><Field><FieldLabel htmlFor="comic-chapter-title">{t('suite.title')}</FieldLabel><Input id="comic-chapter-title" maxLength={200} required value={newChapter ?? ''} disabled={busy} onChange={event => setNewChapter(event.target.value)} /></Field><Button type="submit" disabled={busy || !newChapter?.trim()}>{t('suite.addChapter')}</Button></form></CardContent></DialogContent></Dialog>
<Dialog open={!!deletingRegion} onOpenChange={open => { if (!open && !busy) setDeletingRegion(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: t('suite.region', { number: deletingRegion?.number ?? 0 }) })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => { if (deletingRegion) void act(async () => { await edit({ action: 'deleteRegion', pageId: deletingRegion.pageId, regionId: deletingRegion.regionId }, deletingRegion.revision); setDrafts(previous => { const next = { ...previous }; delete next[deletingRegion.regionId]; return next }); setSelectedRegion(undefined); setDeletingRegion(undefined) }) }}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>    <Dialog open={exporting} onOpenChange={open => { if (!busy) setExporting(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.export')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="comic-export-kind">{t('suite.exportFormat')}</FieldLabel><Select value={exportKind} disabled={busy} onValueChange={value => { if (value) setExportKind(value as ComicExportRequest['kind']) }}><SelectTrigger id="comic-export-kind"><SelectValue>{exportFormats[exportKind]}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{Object.entries(exportFormats).map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      {exportImages && <Field><FieldLabel htmlFor="comic-export-layer">{t('suite.comicLayer')}</FieldLabel><Select value={exportLayer} onValueChange={value => { if (value === 'source' || value === 'clean' || value === 'rendered') setExportLayer(value) }}><SelectTrigger id="comic-export-layer"><SelectValue>{t(exportLayer === 'source' ? 'suite.sourceImage' : exportLayer === 'clean' ? 'suite.cleanImage' : 'suite.translatedImage')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="source">{t('suite.sourceImage')}</SelectItem><SelectItem value="clean">{t('suite.cleanImage')}</SelectItem><SelectItem value="rendered">{t('suite.translatedImage')}</SelectItem></SelectGroup></SelectContent></Select></Field>}
      {exportKind !== 'project' && exportKind !== 'png' && <Field className="flex flex-row items-center justify-between">
        <FieldLabel htmlFor="comic-export-current">{t('suite.comicExportCurrentPage')}</FieldLabel>
        <Switch id="comic-export-current" checked={exportCurrentPage} disabled={busy} onCheckedChange={setExportCurrentPage}><SwitchThumb /></Switch>
      </Field>}
      <Button disabled={busy || !page} onClick={() => { if (api && page) void act(async () => {
        if (await api.exportProject({ projectId: project.id, kind: exportKind, ...(exportImages && { layer: exportLayer }),
          ...((exportKind === 'png' || exportKind !== 'project' && exportCurrentPage) && { pageIds: [page.id] }) })) setExporting(false)
      }) }}>{t('suite.export')}</Button></CardContent></DialogContent></Dialog>
  </div>
}
