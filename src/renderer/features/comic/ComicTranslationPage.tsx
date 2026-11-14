import { Children, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent, type ReactNode, type SetStateAction, type UIEvent } from 'react'
import { createPortal } from 'react-dom'
import { Menu } from '@base-ui/react/menu'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Eraser, Eye, EyeOff, FolderInput, GripVertical, Hand, ImageIcon, Keyboard, Languages, Lasso, Layers, LockKeyhole, MousePointer2, Paintbrush, PaintBucket, PanelRight, Pipette, Play, Plus, Minus, Redo2, RectangleHorizontal, Save, ScanLine, ScanText, Search, Settings2, Shield, Square, Type, Trash2, Undo2, UnlockKeyhole, X } from 'lucide-react'
import { Checkbox } from '@base-ui/react/checkbox'
import { useI18n, type TranslationKey } from '@/i18n'
import { actions, getBridge, stores, useStore } from '@/store'
import { formatBytes } from '../models/ModelCard'
import { useAvailableModels } from '@/available-models'
import { PageHeader } from '@/components/primitives'
import { LanguageDirectionSelect } from '@/components/primitives/LanguageDirectionSelect'
import { dismissNotice, notifyError, notifySuccess } from '@/components/primitives/notify'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '@/components/ui/combobox'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ColorPicker } from '@/components/ui/color-picker'
import { LANGUAGE_CODES } from '../../../shared/languages'
import { comicStyleSchema, DEFAULT_COMIC_MODEL } from '../../../shared/comic'
import type { ComicBridge, ComicConfig, ComicDrawingLayer, ComicDrawingStroke, ComicExportRequest, ComicFont, ComicImportRequest, ComicMaskStroke, ComicMutation, ComicPage, ComicProject, ComicProjectSummary, ComicRegion, ComicRunRequest, ComicRuntimeStatus, ComicExecutionProvider } from '../../../shared/comic'
import { clipComicPolygon, comicSelectionContains, comicSelectionParts, type ComicSelectionPart } from './comicSelection'
import { ComicCharacterControls, ComicPropertiesSection, ComicTypeOptions } from './ComicEditorProperties'
import { ComicLayerTree, type ComicLayerTreeNode } from './ComicLayerTree'
import { layoutComicArtboards } from './comicArtboards'
import { ComicTextPreview } from './ComicTextPreview'
import { ComicTextEditor, type ComicTextEditorHandle, type ComicTextSelection } from './ComicTextEditor'
import { ComicDrawingPreview } from './ComicDrawingPreview'
import { GlossarySelectionField } from '../settings/glossary/GlossarySelectionField'

type RegionDraft = { pageId: string; region: ComicRegion; revision: number }
const sessionDrafts = new Map<string, Record<string, RegionDraft>>()
const loadedComicFonts = new Set<string>()
type FontPreview = { image: string; width: number; height: number }

class ComicFontPreviews {
  private readonly images = new Map<string, FontPreview>()
  private readonly listeners = new Map<string, Set<() => void>>()
  private readonly priority = new Set<string>()
  private generation = 0
  constructor(private readonly api?: ComicBridge) {}

  get(family: string) { return this.images.get(family) ?? null }
  subscribe(family: string, listener: () => void) {
    const listeners = this.listeners.get(family) ?? new Set()
    listeners.add(listener)
    this.listeners.set(family, listeners)
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(family) }
  }
  prioritize(family: string) { this.priority.add(family) }
  start(fonts: ComicFont[]) {
    const generation = ++this.generation
    const families = new Set(fonts.map(font => font.family))
    let recent: string[] = []
    try { const saved: unknown = JSON.parse(localStorage.getItem('nola-comic-recent-fonts') ?? '[]'); if (Array.isArray(saved)) recent = saved.filter((name): name is string => typeof name === 'string' && families.has(name)) } catch {}
    const pending = new Set([...recent, ...families].filter(family => !this.images.has(family)))
    if (!this.api?.fontPreview) return () => { this.generation++ }
    const next = async () => {
      while (generation === this.generation && pending.size) {
        const family = [...this.priority].find(value => pending.has(value)) ?? pending.values().next().value!
        pending.delete(family)
        this.priority.delete(family)
        try {
          const preview = await this.api!.fontPreview(family)
          if (generation !== this.generation) return
          if (preview) {
            this.images.set(family, preview)
            this.listeners.get(family)?.forEach(listener => listener())
          }
        } catch { /* Keep the font selectable if its preview cannot be rendered. */ }
      }
    }
    void next()
    return () => { if (generation === this.generation) this.generation++ }
  }
}
type PendingStroke = { pageId: string; revision: number; stroke: ComicMaskStroke; pointerId?: number }
const sessionStrokes = new Map<string, PendingStroke>()
type PendingDrawing = { pointerId?: number; pageId: string; revision: number; layer: ComicDrawingLayer; stroke: ComicDrawingStroke }
const sessionDrawings = new Map<string, PendingDrawing>()
const importLabels = { auto: 'suite.comicFiles', images: 'suite.imageFiles', folder: 'suite.folder', archive: 'suite.archive', pdf: 'suite.comicPdf', ebook: 'suite.comicEbook' } as const
const stageLabels = {
  detect: 'suite.comicDetect', ocr: 'suite.recognizeText', translate: 'suite.translateText',
  repair: 'suite.repairPage', layout: 'suite.layoutPage',
} as const
const comicIssueKeys = {
  comicBusy: 'suite.comicBusy', encryptedBook: 'suite.encryptedBook', invalidPageRange: 'suite.invalidPageRange', imageTooLarge: 'suite.comicSizeLimit',
  importTooLarge: 'suite.comicSizeLimit', modelMissing: 'suite.inpaintDescription', modelCorrupt: 'suite.inpaintDescription',
  runtimeUnavailable: 'suite.torchNeeded', inpaintFailed: 'suite.inpaintFailed',
  repairRequired: 'suite.repairRequired', maskNeedsReview: 'suite.maskNeedsReview', textOverflow: 'suite.textOverflow', lockedRegions: 'suite.comicLocked',
  emptyTranslation: 'suite.comicEmptyTranslation', pageNotRendered: 'suite.layoutRequired', noRegions: 'suite.recognizeFirst', translationModelMissing: 'suite.modelsNeeded',
  mangaOcrMissing: 'suite.mangaOcrMissing', textTooLong: 'suite.textOverflow', translationNeedsReview: 'suite.comicTranslationNeedsReview', translationFailed: 'suite.comicTranslationFailed',
  ocrMissing: 'suite.ocrNeeded', ocrModelMissing: 'suite.ocrNeeded', ocrUnavailable: 'suite.ocrNeeded', ocrNotReady: 'suite.ocrNeeded', modelUnavailable: 'suite.modelsNeeded',
  detectorUnavailable: 'suite.comicDetectorUnavailable',
  fontMissing: 'suite.fontMissing', maskTooLarge: 'suite.maskTooLarge', resourceBusy: 'suite.resourceBusy',
  fontMatchUnavailable: 'suite.comicFontMatchUnavailable', comicTextLayoutMismatch: 'suite.comicTextLayoutMismatch',
} satisfies Record<string, TranslationKey>
export function comicIssueKey(error: unknown): TranslationKey {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (message.includes('conflict')) return 'suite.revisionConflict'
  return Object.entries(comicIssueKeys).find(([code]) => message.includes(code.toLowerCase()))?.[1] ?? 'suite.actionFailed'
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  if (sessionStrokes.size || sessionDrawings.size || [...sessionDrafts.values()].some(drafts => Object.keys(drafts).length)) event.preventDefault()
})

const defaultComicKeys = { select: 'v', pan: 'h', draw: 'b', drawErase: 'e', fill: 'g', eyedropper: 'i', rect: 'r', lasso: 'l', text: 't' } as const
type ComicKeys = { [K in keyof typeof defaultComicKeys]: string }
const comicToolIcons = { select: MousePointer2, pan: Hand, erase: Eraser, restore: Shield, draw: Paintbrush, drawErase: Eraser, fill: PaintBucket, rect: RectangleHorizontal, lasso: Lasso, eyedropper: Pipette } as const
const comicKeyLabels = { select: 'suite.selectPointer', pan: 'suite.comicPan', draw: 'suite.comicDraw', drawErase: 'suite.comicDrawErase', fill: 'suite.comicFill', eyedropper: 'suite.comicEyedropper', rect: 'suite.comicRect', lasso: 'suite.comicLasso', text: 'suite.addRegion' } as const

function ComicWorkspaceLayout({ editor, sidebarOpen, children }: { editor: boolean; sidebarOpen: boolean; children: ReactNode }) {
  const { t } = useI18n()
  const items = Children.toArray(children)
  const layout = useDefaultLayout({ id: 'nola-comic-dock', panelIds: sidebarOpen ? ['canvas', 'sidebar'] : ['canvas'], onlySaveAfterUserInteractions: true })
  return editor ? <ResizablePanelGroup className="comic-editor" orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
    <ResizablePanel id="canvas" minSize="20%">{items[0]}</ResizablePanel>
    {sidebarOpen && <><ResizableHandle aria-label={t('suite.comicResizeSidebar')} />
    <ResizablePanel id="sidebar" defaultSize={320} minSize={240} maxSize={480} groupResizeBehavior="preserve-pixel-size">{items[1]}</ResizablePanel></>}
  </ResizablePanelGroup> : <div className="comic-editor">{children}</div>
}

function ComicSidebarLayout({ collapsed, layoutOpen, layersOpen, colorOpen, onCollapsedChange, children }: { collapsed: boolean; layoutOpen: boolean; layersOpen: boolean; colorOpen: boolean; onCollapsedChange: (collapsed: boolean) => void; children: ReactNode }) {
  const { t } = useI18n()
  const items = Children.toArray(children)
  const typePanel = usePanelRef()
  const layout = useDefaultLayout({ id: 'nola-comic-pro-panels', panelIds: [...(colorOpen ? ['color'] : []), ...(layoutOpen ? ['type'] : []), ...(layersOpen ? ['layers'] : [])], onlySaveAfterUserInteractions: true })
  const previousPanel = useRef({ collapsed, layoutOpen })
  const typeMeasured = useRef(false)
  const typeWasHidden = useRef(!layoutOpen)
  const expandedTypeSize = useRef(350)
  useEffect(() => {
    const previous = previousPanel.current
    previousPanel.current = { collapsed, layoutOpen }
    if (!layoutOpen) { typeMeasured.current = false; typeWasHidden.current = true }
    if (!layoutOpen || !layersOpen || !previous.layoutOpen || previous.collapsed === collapsed) return
    if (collapsed) typePanel.current?.collapse(); else typePanel.current?.resize(expandedTypeSize.current)
  }, [collapsed, layoutOpen, layersOpen])
  return <ResizablePanelGroup className="comic-sidepanels" orientation="vertical" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
    {colorOpen && <ResizablePanel id="color" defaultSize="16%" minSize={76} maxSize={180} groupResizeBehavior="preserve-relative-size">{items[2]}</ResizablePanel>}
    {colorOpen && (layoutOpen || layersOpen) && <ResizableHandle aria-label={t('suite.comicResizePanels')} />}
    {layoutOpen && <ResizablePanel id="type" panelRef={typePanel} onResize={({ inPixels }) => {
      if (!layersOpen || inPixels <= 0) return
      if (!typeMeasured.current) {
        typeMeasured.current = true
        const reopening = typeWasHidden.current
        typeWasHidden.current = false
        // A reopened panel can expand only after the library registers its saved size.
        if (reopening && !collapsed && inPixels < 64) { typePanel.current?.resize(expandedTypeSize.current); return }
      }
      const nextCollapsed = inPixels < 64
      if (!nextCollapsed) expandedTypeSize.current = inPixels
      previousPanel.current.collapsed = nextCollapsed
      onCollapsedChange(nextCollapsed)
    }} defaultSize={layersOpen ? '36%' : '100%'} minSize={64} maxSize={layersOpen ? '65%' : '100%'} groupResizeBehavior="preserve-relative-size" collapsible={layersOpen} collapsedSize={28}>{items[1]}</ResizablePanel>}
    {layoutOpen && layersOpen && <ResizableHandle aria-label={t('suite.comicResizePanels')} />}
    {layersOpen && <ResizablePanel id="layers" minSize="40%">{items[0]}</ResizablePanel>}
  </ResizablePanelGroup>
}

function ComicFontOption({ family, previews }: { family: string; previews: ComicFontPreviews }) {
  const label = useRef<HTMLSpanElement>(null)
  const preview = useSyncExternalStore(listener => previews.subscribe(family, listener), () => previews.get(family), () => null)
  useEffect(() => {
    const element = label.current
    if (!element || preview) return
    if (typeof IntersectionObserver === 'undefined') { previews.prioritize(family); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) previews.prioritize(family)
    }, { root: element.closest('[data-slot="combobox-list"]') })
    observer.observe(element)
    return () => observer.disconnect()
  }, [family, previews, preview])
  return <span ref={label} className="min-w-0 truncate" title={family}>{preview
    ? <><span className="sr-only">{family}</span><span className="comic-font-preview" aria-hidden="true" style={{ width: `${preview.width / preview.height}em`, maskImage: `url("${preview.image}")` }} /></>
    : family}</span>
}

function ComicFontControl({ style, fonts, previews, disabled, onChange, slot }: {
  slot: 'toolbar' | 'properties'; style: ComicRegion['style']; fonts: ComicFont[]; previews: ComicFontPreviews; disabled: boolean; onChange: (style: ComicRegion['style']) => void
}) {
  const { t } = useI18n()
  const [recentFonts, setRecentFonts] = useState<string[]>(() => {
    try { const value: unknown = JSON.parse(localStorage.getItem('nola-comic-recent-fonts') ?? '[]'); if (Array.isArray(value)) return value.filter((name): name is string => typeof name === 'string').slice(0, 5) } catch {}
    return []
  })
  const families = [...new Set(fonts.map(font => font.family))]
  const fontChoices = [t('suite.auto'), ...new Set([...recentFonts.filter(name => families.includes(name)), ...families])]
  return <Combobox items={fontChoices} value={style.fontFamily ?? t('suite.auto')} disabled={disabled} modal={false} onValueChange={value => {
          if (!value) return
          onChange({ ...style, fontFamily: value === t('suite.auto') ? undefined : value })
          if (value !== t('suite.auto')) { const recent = [value, ...recentFonts.filter(name => name !== value)].slice(0, 5); setRecentFonts(recent); localStorage.setItem('nola-comic-recent-fonts', JSON.stringify(recent)) }
        }}>
          <ComboboxTrigger id={`comic-font-${slot}`} aria-label={t('suite.comicFontFamily')}><span className="select__value">{style.fontFamily ?? t('suite.auto')}</span></ComboboxTrigger>
          <ComboboxContent className="nola-language-popup" initialFocus={false}><ComboboxInput aria-label={t('suite.search')} placeholder={t('suite.search')} /><ComboboxEmpty className="nola-language-empty">{t('suite.comicFontsEmpty')}</ComboboxEmpty><ComboboxList className="nola-language-list">{(family: string) => <ComboboxItem key={family} value={family}>{family === t('suite.auto') ? family : <ComicFontOption family={family} previews={previews} />}</ComboboxItem>}</ComboboxList></ComboboxContent>
        </Combobox>
}

export function comicExportPages(input: string, count: number): number[] | null {
  if (!input.trim()) return []
  const pages: number[] = []
  for (const part of input.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!match) return null
    const start = Number(match[1]), end = Number(match[2] ?? match[1])
    if (start < 1 || end < start || end > count) return null
    for (let page = start; page <= end; page++) if (!pages.includes(page)) pages.push(page)
  }
  return pages
}

type ImageKind = Parameters<ComicBridge['image']>[2]

function ComicPageThumbnail({ api, projectId, pageId }: { api: ComicBridge; projectId: string; pageId: string }) {
  const [image, setImage] = useState<string>()
  useEffect(() => {
    let live = true
    if (api.thumbnail) void api.thumbnail(projectId, pageId).then(value => { if (live) setImage(value) }).catch(() => {})
    return () => { live = false }
  }, [api, projectId, pageId])
  return image ? <img src={image} alt="" draggable={false} /> : null
}

function ComicBookCover({ api, book, selected, selecting, onSelect }: { api: ComicBridge; book: ComicProjectSummary; selected: boolean; selecting: boolean; onSelect: (checked: boolean) => void }) {
  const { t } = useI18n()
  const [pageId, setPageId] = useState<string>()
  useEffect(() => {
    let live = true
    setPageId(undefined)
    void api.openProject(book.id).then(project => { if (live) setPageId(project.pages[0]?.id) }).catch(() => {})
    return () => { live = false }
  }, [api, book.id, book.updatedAt])
  return <div className="comic-book-item" data-selecting={selecting || undefined}>
    <Tooltip>
    <TooltipTrigger delay={250} render={<a href={`#/comic-translation/${encodeURIComponent(book.id)}/reader`} aria-label={book.title} className="comic-book-cover" draggable={false} onDragStart={event => event.preventDefault()}
      onClick={event => { if (selecting) { event.preventDefault(); onSelect(!selected) } }} />}>
      {pageId ? <ComicPageThumbnail api={api} projectId={book.id} pageId={pageId} /> : <BookOpen aria-hidden="true" />}
    </TooltipTrigger>
    <TooltipContent>{book.title}</TooltipContent>
  </Tooltip>
    <Checkbox.Root className="comic-book-select" checked={selected} onCheckedChange={onSelect} aria-label={t('suite.comicSelectBook', { name: book.title })}><Checkbox.Indicator><Check aria-hidden="true" /></Checkbox.Indicator></Checkbox.Root>
  </div>
}

function availableImage(page: ComicPage | undefined, preferred?: ImageKind): ImageKind {
  if (preferred === 'clean') return page?.hasClean ? 'clean' : 'source'
  if (preferred === 'source') return 'source'
  return page?.hasRendered ? 'rendered' : 'source'
}

function ComicPageImage({ api, projectId, revision, page, kind, renderScale = 1 }: {
  api: ComicBridge
  projectId: string
  revision: number
  page: ComicPage
  kind: ImageKind
  renderScale?: number
}) {
  const { t } = useI18n()
  const [image, setImage] = useState<string | null>()
  const [attempt, setAttempt] = useState(0)
  const imageRevision = kind === 'source' ? undefined : revision
  const maxPixels = renderScale < 1 ? Math.max(10000, Math.min(4000000, Math.ceil(page.width * page.height * renderScale ** 2))) : undefined
  useEffect(() => {
    let live = true
    const timer = window.setTimeout(() => {
      void (maxPixels === undefined ? api.image(projectId, page.id, kind) : api.image(projectId, page.id, kind, maxPixels)).then(value => {
        if (live) setImage(value || null)
      }).catch(() => { if (live) setImage(null) })
    }, maxPixels === undefined ? 0 : 120)
    return () => { live = false; window.clearTimeout(timer) }
  }, [api, projectId, imageRevision, page.id, kind, attempt, maxPixels])
  if (image) return <img src={image} alt={page.name} draggable={false} />
  return <div className="comic-canvas__placeholder">{image === null
    ? <Button variant="outline" size="sm" onClick={() => { setImage(undefined); setAttempt(value => value + 1) }}>{t('suite.retry')}</Button>
    : <Spinner />}</div>
}

export function ComicTranslationPage({ projectId, pageId, reader: readerProp = false, editor = false }: { projectId?: string; pageId?: string; reader?: boolean; editor?: boolean }) {
  const reader = readerProp || (!!projectId && !editor)
  const { t } = useI18n()
  const api = getBridge()?.comic
  const models = useAvailableModels().mt.filter(model => model.binding !== 'cloud:recognition')
  const [books, setBooks] = useState<ComicProjectSummary[]>()
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(() => new Set())
  const [fonts, setFonts] = useState<ComicFont[]>([])
  const fontPreviews = useMemo(() => new ComicFontPreviews(api), [api])
  useEffect(() => {
    let live = true
    if (api?.listFonts) void api.listFonts().then(value => { if (live) setFonts(value) }).catch(() => {})
    return () => { live = false }
  }, [api])
  useEffect(() => editor ? fontPreviews.start(fonts) : undefined, [editor, fontPreviews, fonts])
  const [runtime, setRuntime] = useState<ComicRuntimeStatus>()
  useEffect(() => {
    if (!projectId || !api?.runtimeStatus) return
    let live = true, inFlight = false
    let timer: ReturnType<typeof setInterval> | undefined
    const refresh = async () => {
      if (inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      try { const status = await api.runtimeStatus(); if (live && document.visibilityState === 'visible') setRuntime(status) } catch { if (live) setRuntime(undefined) } finally { inFlight = false }
    }
    const visibility = () => {
      if (timer) clearInterval(timer)
      timer = undefined
      if (document.visibilityState === 'visible') { void refresh(); timer = setInterval(() => void refresh(), 3000) }
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => { live = false; if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [api, projectId, reader])
  const [project, setProject] = useState<ComicProject>()
  const [selectedPage, setSelectedPage] = useState(pageId)
  const [imageKind, setImageKind] = useState<ImageKind>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState<number | 'page' | 'width'>('page')
  const [focusRequest, setFocusRequest] = useState(0)
  const initialFocus = useRef('')
  const viewportState = useRef({ width: 0, height: 0, x: 0, y: 0, scale: 1 })
  const worldAnchor = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | undefined>(undefined)
  const [objectKind, setObjectKind] = useState<'document' | 'artboard' | 'background'>('document')
  const [treeSelection, setTreeSelection] = useState<{ keys: string[]; active?: string }>({ keys: [] })
  const [deletingLayers, setDeletingLayers] = useState<string[]>([])
  const [boardPreview, setBoardPreview] = useState<{ pageId: string; x: number; y: number }>()
  const boardDrag = useRef<{ pageId: string; pointerId: number; x: number; y: number; clientX: number; clientY: number } | undefined>(undefined)
  const zoomAnchor = useRef<{ index: number; fraction: number; offset: number; fractionX?: number; offsetX?: number } | undefined>(undefined)
  const inspectorRef = useRef<HTMLElement>(null)
  const jumpOffset = useRef<number | undefined>(undefined)
  const movedPage = useRef<string | undefined>(undefined)
  const [nearPages, setNearPages] = useState<ReadonlySet<string>>(() => new Set())
  const [pageInput, setPageInput] = useState<string | null>(null)
  const [zoomInput, setZoomInput] = useState<string | null>(null)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [workspaceDialog, setWorkspaceDialog] = useState<'settings' | 'shortcuts'>()
  const [comicKeys, setComicKeys] = useState<ComicKeys>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nola-comic-shortcuts') ?? 'null')
      if (saved && Object.keys(defaultComicKeys).every(key => typeof saved[key] === 'string' && /^[a-z]$/.test(saved[key])) && new Set(Object.values(saved)).size === Object.keys(defaultComicKeys).length) return saved
    } catch {}
    return { ...defaultComicKeys }
  })
  const [workspaceMenu, setWorkspaceMenu] = useState<'stages' | 'batch'>()
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
  const [exportQuality, setExportQuality] = useState(90)
  const [exportPageSpec, setExportPageSpec] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string>()
  const [inlineEditing, setInlineEditing] = useState<string>()
  const [inlineComposing, setInlineComposing] = useState(false)
  const [inlineLayout, setInlineLayout] = useState<{ key: string; layout: NonNullable<ComicRegion['resolvedLayout']> }>()
  const inlineSnapshot = useRef<{ id: string; draft?: RegionDraft } | undefined>(undefined)
  const textEditor = useRef<ComicTextEditorHandle>(null)
  const [textSelection, setTextSelection] = useState<ComicTextSelection>({ start: 0, end: 0 })
  const [caretPoint, setCaretPoint] = useState<{ x: number; y: number }>()
  const [recognitionEditing, setRecognitionEditing] = useState(false)
  const [layerEditing, setLayerEditing] = useState(false)
  const [drafts, updateDrafts] = useState<Record<string, RegionDraft>>(() => projectId ? sessionDrafts.get(projectId) ?? {} : {})
  useLayoutEffect(() => {
    inlineSnapshot.current = inlineEditing ? { id: inlineEditing, draft: drafts[inlineEditing] } : undefined
  }, [inlineEditing])
  const [inspectorOpen, setInspectorOpen] = useState(() => editor || Object.keys(drafts).length > 0)
  const setDrafts = (value: SetStateAction<Record<string, RegionDraft>>) => updateDrafts(previous => {
    const next = typeof value === 'function' ? value(previous) : value
    if (projectId) {
      if (Object.keys(next).length) sessionDrafts.set(projectId, next)
      else sessionDrafts.delete(projectId)
    }
    return next
  })
  const [leaving, setLeaving] = useState<string>()
  const temporaryPan = useRef<typeof brushMode | undefined>(undefined)
  const [defaultStyle, setDefaultStyle] = useState<ComicRegion['style']>(() => {
    try { const parsed = comicStyleSchema.safeParse(JSON.parse(localStorage.getItem('nola-comic-type') ?? 'null')); if (parsed.success) return parsed.data } catch {}
    return { fontSize: 16, autoFontSize: true, color: '#000000', direction: 'horizontal', align: 'center' }
  })
  useEffect(() => { if (editor) localStorage.setItem('nola-comic-type', JSON.stringify(defaultStyle)) }, [editor, defaultStyle])
  const [showTextLayers, setShowTextLayers] = useState(true)
  const [stageMenu, setStageMenu] = useState<string>()
  const [brushMode, setBrushMode] = useState<'select' | 'pan' | 'erase' | 'restore' | 'draw' | 'drawErase' | 'fill' | 'rect' | 'lasso' | 'eyedropper' | 'text'>('select')
  const groupTransform = useRef<{ pointerId: number; mode: 'scale' | 'rotate'; x: number; y: number; centerX: number; centerY: number; startAngle: number; left: number; top: number; width: number; height: number; regions: ComicRegion[]; selection: ComicSelectionPart[]; pageId: string; revision: number } | undefined>(undefined)
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | undefined>(undefined)
  const regionDrag = useRef<{ pointerId: number; x: number; y: number; region: ComicRegion; pageId: string; revision: number; resize?: boolean; rotate?: { x: number; y: number; start: number }; moved?: boolean; group?: ComicRegion[]; selection?: ComicSelectionPart[] } | undefined>(undefined)
  const [brushSize, setBrushSize] = useState(20)
  const [drawingColor, setDrawingColor] = useState('#000000')
  const [fillTolerance, setFillTolerance] = useState(24)
  const [drawingOpacity, setDrawingOpacity] = useState(100)
  const [drawingHardness, setDrawingHardness] = useState(100)
  const [fillContiguous, setFillContiguous] = useState(true)
  const [selectedDrawing, setSelectedDrawing] = useState<string>()
  const [selectedRepair, setSelectedRepair] = useState<string>()
  const [selectedMask, setSelectedMask] = useState<string>()
  const [layerTab, setLayerTab] = useState('layers')
  const [typeCollapsed, setTypeCollapsed] = useState(false)
  const [editorPanels, setEditorPanels] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nola-comic-panels-visible') ?? 'null')
      return { layout: saved?.layout !== false, layers: saved?.layers !== false, color: saved?.color !== false }
    } catch { return { layout: true, layers: true, color: true } }
  })
  useEffect(() => { if (editor) localStorage.setItem('nola-comic-panels-visible', JSON.stringify(editorPanels)) }, [editor, editorPanels])
  const [selection, setSelection] = useState<ComicSelectionPart[]>()
  const [selectionPast, setSelectionPast] = useState<(ComicSelectionPart[] | undefined)[]>([])
  const [selectionFuture, setSelectionFuture] = useState<(ComicSelectionPart[] | undefined)[]>([])
  const commitSelection = (next?: ComicSelectionPart[]) => { setSelectionPast(previous => [...previous, selection].slice(-50)); setSelectionFuture([]); setSelection(next) }
  const clearSelection = () => { setSelection(undefined); setSelectionPast([]); setSelectionFuture([]) }
  const drawingRef = useRef<PendingDrawing | undefined>(projectId ? sessionDrawings.get(projectId) : undefined)
  const [drawingPreview, setDrawingPreview] = useState<PendingDrawing | undefined>(drawingRef.current)
  const updateDrawing = (value?: PendingDrawing) => { drawingRef.current = value; setDrawingPreview(value); if (projectId) { if (value) sessionDrawings.set(projectId, value); else sessionDrawings.delete(projectId) } }
  const selectionRef = useRef<{ pointerId: number; points: [number, number][]; modifier: 'add' | 'subtract' | 'replace'; overflow?: boolean } | undefined>(undefined)
  const [selectionPreview, setSelectionPreview] = useState<[number, number][]>()
  const [clearingMask, setClearingMask] = useState(false)
  const [deletingMask, setDeletingMask] = useState<ComicMaskStroke>()
  const [deletingRepair, setDeletingRepair] = useState<{ pageId: string; id: string; name: string; revision: number }>()
  const [deletingDrawing, setDeletingDrawing] = useState<ComicDrawingLayer>()
  const [deletingSelection, setDeletingSelection] = useState(false)
  const [deletingPage, setDeletingPage] = useState<ComicPage>()
  const [newChapter, setNewChapter] = useState<string>()
  const [deletingRegion, setDeletingRegion] = useState<{ pageId: string; regionId: string; revision: number; number: number }>()
  const strokeRef = useRef<PendingStroke | undefined>(projectId ? sessionStrokes.get(projectId) : undefined)
  const [strokePreview, setStrokePreview] = useState<PendingStroke | undefined>(strokeRef.current)
  const updateStroke = (value?: PendingStroke) => {
    strokeRef.current = value; setStrokePreview(value)
    if (projectId) { if (value) sessionStrokes.set(projectId, value); else sessionStrokes.delete(projectId) }
  }
  const guardNavigation = (event: MouseEvent, path: string) => {
    if (!Object.keys(drafts).length && !strokePreview && !drawingPreview) return
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
    const savedDrawing = projectId ? sessionDrawings.get(projectId) : undefined
    drawingRef.current = savedDrawing ? { ...savedDrawing, pointerId: undefined } : undefined
    setDrawingPreview(drawingRef.current)
    const dispose = api?.onChanged(event => { if (!projectId || event.projectId === projectId) void load() })
    return () => { loadGeneration.current++; dispose?.() }
  }, [api, projectId])
  const jobStates = useRef<{ projectId: string; states: Map<string, string>; notified: Set<string> } | undefined>(undefined)
  useEffect(() => {
    if (!project || project.id !== projectId) return
    if (jobStates.current?.projectId !== project.id) {
      jobStates.current = { projectId: project.id, states: new Map(project.jobs.map(job => [job.id, job.state])), notified: new Set() }
      return
    }
    const tracker = jobStates.current
    for (const job of project.jobs) {
      const previous = tracker.states.get(job.id)
      const error = job.error ?? job.issues?.[0]?.error
      if ((job.state === 'failed' || job.state === 'interrupted' || !!job.issues?.length) && !tracker.notified.has(job.id) && previous !== job.state) {
        notifyError(t(error ? comicIssueKey(error) : job.state === 'interrupted' ? 'suite.jobInterrupted' : 'suite.jobFailed'))
        tracker.notified.add(job.id)
      }
      tracker.states.set(job.id, job.state)
    }
  }, [project, projectId, t])
  useEffect(() => { setImageKind(undefined) }, [projectId, reader])
  useEffect(() => { setZoom('page') }, [projectId, reader])
  const readerHost = (node: HTMLElement) => reader ? node.closest<HTMLElement>('.nola-main') ?? node : node
  const canvasOffset = (node: HTMLElement, host: HTMLElement) => host === node ? 0 : node.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop
  const captureAnchor = (pointer?: { x: number; y: number }) => {
    const node = scrollRef.current
    if (!node || !node.children.length) return
    const host = readerHost(node)
    if (editor) {
      const state = viewportState.current
      const rect = node.getBoundingClientRect(), offsetX = pointer ? pointer.x - rect.left : node.clientWidth / 2, offsetY = pointer ? pointer.y - rect.top : node.clientHeight / 2
      worldAnchor.current = { x: (node.scrollLeft + offsetX - state.width / 2) / state.scale + state.x, y: (node.scrollTop + offsetY - state.height / 2) / state.scale + state.y, offsetX, offsetY }
      return
    }
    const offset = pointer ? pointer.y - host.getBoundingClientRect().top : host.clientHeight / 2
    const line = host.scrollTop + offset - canvasOffset(node, host)
    const children = Array.from(node.querySelectorAll<HTMLElement>('[data-page-id]'))
    let index = children.findIndex((child, i) => i === children.length - 1 || children[i + 1].offsetTop > line)
    index = Math.max(0, index)
    const child = children[index]
    const offsetX = pointer ? pointer.x - host.getBoundingClientRect().left : undefined
    zoomAnchor.current = { index, fraction: (line - child.offsetTop) / child.offsetHeight, offset,
      ...(offsetX !== undefined ? { fractionX: (host.scrollLeft + offsetX - child.offsetLeft) / child.offsetWidth, offsetX } : {}) }
  }
  const changeZoom = (value: typeof zoom) => { captureAnchor(); setZoom(value) }
  useEffect(() => {
    const node = scrollRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const style = getComputedStyle(node)
      const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-2')) || 0
      const host = readerHost(node)
      node.style.blockSize = editor || reader && host !== node ? 'auto' : `${Math.max(0, window.innerHeight - node.getBoundingClientRect().top - gap)}px`
      const width = node.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      const height = (reader && host !== node ? host.clientHeight : node.clientHeight) - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0)
      setViewport(previous => {
        if (previous.width === width && previous.height === height) return previous
        captureAnchor()
        return { width, height }
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node); if (readerHost(node) !== node) observer.observe(readerHost(node)); window.addEventListener('resize', measure); measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [project?.id, reader])
  useLayoutEffect(() => {
    const node = scrollRef.current, anchor = zoomAnchor.current
    const child = anchor && node?.querySelectorAll<HTMLElement>('[data-page-id]')[anchor.index] as HTMLElement | undefined
    if (node && anchor && child) {
      const host = readerHost(node)
      host.scrollTop = canvasOffset(node, host) + child.offsetTop + anchor.fraction * child.offsetHeight - anchor.offset
      if (anchor.fractionX !== undefined && anchor.offsetX !== undefined) host.scrollLeft = child.offsetLeft + anchor.fractionX * child.offsetWidth - anchor.offsetX
      jumpOffset.current = host.scrollTop
      zoomAnchor.current = undefined
    }
  }, [zoom, viewport])
  const pages = project?.pages
  const pageOrder = useMemo(() => pages?.map(item => item.id).join(','), [pages])
  const pageIndex = Math.max(0, pages?.findIndex(item => item.id === selectedPage) ?? -1)
  const page = pages?.[pageIndex]
  const region = page?.regions.find(item => item.id === selectedRegion) ?? (editor ? undefined : page?.regions[0])
  const regionIndex = page && region ? page.regions.indexOf(region) : -1
  const selectedRegions = selection && page ? page.regions.map(item => drafts[item.id]?.region ?? item).filter(item => item.visible !== false && !item.editLocked && comicSelectionContains(item.x + item.width / 2, item.y + item.height / 2, selection)) : []
  const draft = region && drafts[region.id]
  const editable = draft?.region ?? region
  const inlineLayoutKey = editable && inlineEditing === editable.id ? JSON.stringify({ ...editable, resolvedLayout: undefined }) : ''
  useEffect(() => { setInlineComposing(false) }, [inlineEditing])
  useEffect(() => {
    if (!api?.previewRegion || !project || !page || !editable || !inlineLayoutKey || inlineComposing) return
    let live = true
    const timer = window.setTimeout(() => {
      void api.previewRegion!(project.id, page.id, editable).then(result => {
        if (live && result.layout && result.layout.text === (editable.targetText ?? '')) setInlineLayout({ key: inlineLayoutKey, layout: result.layout })
      }).catch(() => { /* A transient edit may not fit; the committed preview reports errors. */ })
    }, 250)
    return () => { live = false; window.clearTimeout(timer) }
  }, [api, project?.id, page?.id, inlineLayoutKey, inlineComposing])
  const repairLayer = page?.repairLayers?.find(layer => layer.id === selectedRepair)
  const drawingLayer = page?.drawingLayers?.find(layer => layer.id === selectedDrawing)
  const typeStyle = editable ? { ...editable.style, ...(inlineEditing ? editable.textRuns?.find(run => run.start <= textSelection.start && run.end > textSelection.start)?.style : {}) } : defaultStyle
  useEffect(() => {
    if (!editable || !api?.readFont || typeof FontFace === 'undefined') return
    let live = true
    const styles = [editable.style, { ...editable.style, ...editable.resolvedLayout }, ...(inlineLayout?.key === inlineLayoutKey ? [{ ...editable.style, ...inlineLayout.layout }] : []), ...(editable.textRuns ?? []).map(run => ({ ...editable.style, ...run.style }))]
    const pending = new Set<string>()
    for (const style of styles) {
      const family = style.fontFamily, weight = style.fontWeight ?? 400, italic = style.fontStyle === 'italic'
      const key = `${family}:${weight}:${italic}`
      if (!family || loadedComicFonts.has(key) || pending.has(key)) continue
      pending.add(key)
      void api.readFont(family, weight, italic).then(data => new FontFace(family, `url(${data})`, { weight: String(weight), style: italic ? 'italic' : 'normal' }).load()).then(font => {
        if (live) { document.fonts.add(font); loadedComicFonts.add(key) }
      }).catch(error => { if (live) notifyError(t('suite.actionFailed'), { cause: error }) })
    }
    return () => { live = false }
  }, [api, editable?.style.fontFamily, editable?.style.fontWeight, editable?.style.fontStyle, editable?.resolvedLayout?.fontFamily, editable?.resolvedLayout?.fontWeight, editable?.resolvedLayout?.fontStyle, editable?.textRuns, inlineLayout?.key, inlineLayout?.layout.fontFamily, inlineLayout?.layout.fontWeight, inlineLayout?.layout.fontStyle, t])
  const validKind = imageKind ?? (editor ? 'rendered' : availableImage(page))
  const pageBounds = useMemo(() => pages?.reduce((bounds, item) => ({
    width: Math.max(bounds.width, item.width), height: Math.max(bounds.height, item.height),
  }), { width: 0, height: 0 }), [pages])
  const artboardLayout = useMemo(() => layoutComicArtboards(pages ?? []), [pages])
  const fitBounds = editor ? artboardLayout.bounds : pageBounds
  const fitWidth = fitBounds?.width && viewport.width ? viewport.width / fitBounds.width : 1
  const scale = zoom === 'page' && fitBounds?.height && viewport.height
    ? Math.min(fitWidth, viewport.height / fitBounds.height) : typeof zoom === 'number' ? zoom : fitWidth
  viewportState.current = { ...viewport, x: artboardLayout.bounds.x, y: artboardLayout.bounds.y, scale }
  useLayoutEffect(() => {
    const node = scrollRef.current, anchor = worldAnchor.current
    if (editor && node && anchor) { node.scrollLeft = (anchor.x - artboardLayout.bounds.x) * scale + viewport.width / 2 - anchor.offsetX; node.scrollTop = (anchor.y - artboardLayout.bounds.y) * scale + viewport.height / 2 - anchor.offsetY; worldAnchor.current = undefined }
  }, [scale, viewport, artboardLayout.bounds.x, artboardLayout.bounds.y, editor, focusRequest])
  useEffect(() => {
    const canvas = scrollRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        captureAnchor({ x: event.clientX, y: event.clientY })
        setZoom(Math.max(0.1, Math.min(64, scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2))))
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [reader, editor, project?.id, scale])
  const activatePage = (id: string | undefined) => { if (id !== page?.id) { clearSelection(); setSelectedDrawing(undefined); setSelectedRepair(undefined); setSelectedMask(undefined); setInlineEditing(undefined) }; setSelectedPage(id); setSelectedRegion(undefined) }
  const fitArtboard = (id: string) => {
    const board = artboardLayout.artboards.find(item => item.pageId === id)
    if (!board || viewport.width <= 60 || viewport.height <= 80) return
    worldAnchor.current = { x: board.x + board.width / 2, y: board.y + board.height / 2, offsetX: viewport.width / 2, offsetY: viewport.height / 2 }
    setZoom(Math.min((viewport.width - 60) / board.width, (viewport.height - 80) / board.height))
    activatePage(id); setObjectKind('artboard'); setFocusRequest(value => value + 1)
  }
  const showPage = (id: string) => {
    if (editor) { fitArtboard(id); return }
    const canvas = scrollRef.current
    const target = canvas?.querySelectorAll<HTMLElement>('[data-page-id]')[pages?.findIndex(item => item.id === id) ?? -1] as HTMLElement | undefined
    if (!canvas || !target) return
    const host = readerHost(canvas)
    if (host !== canvas && target === canvas.querySelector('[data-page-id]') && host.scrollTop === 0) { activatePage(id); return }
    host.scrollTop = (host === canvas ? 0 : canvasOffset(canvas, host)) + target.offsetTop - canvas.querySelector<HTMLElement>('[data-page-id]')!.offsetTop
    jumpOffset.current = host.scrollTop
    activatePage(id)
  }
  const showPageRef = useRef(showPage)
  showPageRef.current = showPage
  useEffect(() => {
    if (!editor || !api?.onEditorPageRequested) return
    return api.onEditorPageRequested(pageId => { void closeSave.current().then(() => showPageRef.current(pageId)).catch(error => notifyError(t(comicIssueKey(error)), { cause: error })) })
  }, [api, editor, t])
  const followScroll = (host: HTMLElement) => {
    if (editor) return
    const canvas = scrollRef.current
    if (!canvas || !pages?.length || strokeRef.current?.pointerId !== undefined || drawingRef.current?.pointerId !== undefined || regionDrag.current || groupTransform.current || selectionRef.current || jumpOffset.current === host.scrollTop) return
    jumpOffset.current = undefined
    // Find the page at the reading line without measuring every page on every scroll.
    const readingLine = host.scrollTop + host.clientHeight / 2 - canvasOffset(canvas, host)
    let first = 0, last = pages.length - 1
    if (host.scrollTop > 0 && Math.ceil(host.scrollTop + host.clientHeight) >= host.scrollHeight) first = last
    while (first < last) {
      const middle = Math.ceil((first + last) / 2)
      if (canvas.querySelectorAll<HTMLElement>('[data-page-id]')[middle].offsetTop <= readingLine) first = middle
      else last = middle - 1
    }
    if (pages[first].id !== page?.id) activatePage(pages[first].id)
  }
  useEffect(() => {
    const canvas = scrollRef.current
    if (!canvas || !reader) return
    const host = readerHost(canvas)
    if (host === canvas) return
    const handleScroll = () => followScroll(host)
    host.addEventListener('scroll', handleScroll, { passive: true })
    return () => host.removeEventListener('scroll', handleScroll)
  }, [reader, project?.id, pageOrder, page?.id])
  useLayoutEffect(() => {
    const key = `${project?.id}:${pageId ?? ''}:${reader}`
    if (!project || viewport.width <= 60 || viewport.height <= 80 || initialFocus.current === key) return
    initialFocus.current = key
    if (pageId || !editor && selectedPage) showPage((pageId ?? selectedPage)!)
    else if (editor) { worldAnchor.current = { x: artboardLayout.bounds.x + artboardLayout.bounds.width / 2, y: artboardLayout.bounds.y + artboardLayout.bounds.height / 2, offsetX: viewport.width / 2, offsetY: viewport.height / 2 }; setZoom('page'); setFocusRequest(value => value + 1) }
  }, [project?.id, pageId, reader, viewport.width, viewport.height])

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
    }), { root: readerHost(root), rootMargin: editor ? '50%' : '100% 0px' })
    for (const item of root.querySelectorAll('[data-page-id]')) observer.observe(item)
    return () => observer.disconnect()
  }, [project?.id, pageOrder, reader, editor])
  useLayoutEffect(() => {
    const inspector = inspectorRef.current
    const canvas = scrollRef.current
    if (inspector && canvas && inspector.getBoundingClientRect().top >= canvas.getBoundingClientRect().bottom) {
      inspector.scrollIntoView?.({ block: 'nearest' })
    }
  }, [inspectorOpen, reader])
  const act = async (operation: () => Promise<unknown>) => {
    if (pending.current) { notifyError(t('suite.comicBusy')); return false }
    pending.current = true; setBusy(true)
    try { await operation(); return true }
    catch (error) { notifyError(t(comicIssueKey(error)), { cause: error }); return false }
    finally { pending.current = false; setBusy(false) }
  }
  const edit = async (command: ComicMutation['command'], expectedRevision = project?.revision) => {
    if (!api || !project || expectedRevision === undefined) return
    setProject(await api.edit({ projectId: project.id, operationId: crypto.randomUUID(), expectedRevision, command }))
    setSelectionPast([]); setSelectionFuture([])
  }
  const closeSave = useRef<() => Promise<number | undefined>>(async () => undefined)
  closeSave.current = async () => {
    if (!api || !project) return
    if (pending.current) { await new Promise(resolve => setTimeout(resolve, 50)); return closeSave.current() }
    const entries = Object.values(drafts)
    const stroke = strokeRef.current, drawing = drawingRef.current
    if (stroke?.pointerId !== undefined || drawing?.pointerId !== undefined || regionDrag.current || groupTransform.current) throw new Error('comicBusy')
    if (entries.some(entry => entry.revision !== project.revision) || (stroke && stroke.revision !== project.revision) || (drawing && drawing.revision !== project.revision)) throw new Error('conflict')
    pending.current = true; setBusy(true)
    try {
    let revision = project.revision
    const save = async (command: ComicMutation['command']) => {
      const before = revision
      const next = await api.edit({ projectId: project.id, operationId: crypto.randomUUID(), expectedRevision: revision, command })
      revision = next.revision; setProject(next)
      // A partial save must leave the remaining drafts retryable at our own new revision.
      setDrafts(previous => Object.fromEntries(Object.entries(previous).map(([id, value]) => [id, value.revision === before ? { ...value, revision } : value])))
      if (strokeRef.current?.revision === before) updateStroke({ ...strokeRef.current, revision })
      if (drawingRef.current?.revision === before) updateDrawing({ ...drawingRef.current, revision })
    }
    for (const entry of entries) { await save({ action: 'saveRegion', pageId: entry.pageId, region: entry.region }); setDrafts(previous => { const next = { ...previous }; if (next[entry.region.id]?.region === entry.region) delete next[entry.region.id]; return next }) }
    if (stroke) { await save({ action: 'paintMask', pageId: stroke.pageId, stroke: stroke.stroke }); updateStroke(undefined) }
    if (drawing) { await save({ action: 'saveDrawingLayer', pageId: drawing.pageId, layer: { ...drawing.layer, strokes: [...drawing.layer.strokes, drawing.stroke] } }); updateDrawing(undefined) }
    return revision
    } finally { pending.current = false; setBusy(false) }
  }
  useEffect(() => {
    if (!editor || !api?.onEditorCloseRequested) return
    return api.onEditorCloseRequested(async () => { try { await closeSave.current() } catch (error) { notifyError(t(comicIssueKey(error)), { cause: error }); throw error } })
  }, [api, editor, t])
  useEffect(() => {
    if (!editor || !project || !Object.keys(drafts).length || strokePreview || drawingPreview || inlineEditing) return
    const timer = setInterval(() => {
      if (regionDrag.current || groupTransform.current || pending.current) return
      void closeSave.current().catch(error => notifyError(t(comicIssueKey(error)), { cause: error }))
    }, 1000)
    return () => clearInterval(timer)
  }, [editor, project?.id, drafts, strokePreview, drawingPreview, inlineEditing, t])
  const configure = (patch: Partial<ComicConfig>) => { if (project) void act(() => edit({ action: 'configure', config: { ...project.config, ...patch } })) }
  const runStage = (stage: ComicRunRequest['stage'], pageIds = page ? [page.id] : [], regionId?: string) => {
    if (!api || !project || !page || pending.current || activeJob) return
    pageIds = pageIds.filter(id => !project.pages.find(item => item.id === id)?.artboard?.locked)
    if (!pageIds.length) return
    setWorkspaceMenu(undefined)
    setInlineEditing(undefined)
    void closeSave.current().then(async revision => {
      if (revision === undefined) return
      await act(async () => { setProject(await api.run({ projectId: project.id, expectedRevision: revision, pageIds, stage, ...(regionId && { regionId, overwriteManual: true }) })); if (stage === 'full' || stage === 'layout') setImageKind('rendered') })
    }).catch(error => notifyError(t(comicIssueKey(error)), { cause: error }))
  }
  const addRegion = (bounds?: { x: number; y: number; width: number; height: number }) => {
    if (!project || !page || page.artboard?.locked) return
    const width = Math.max(1, Math.floor(page.width / 3)), height = Math.max(1, Math.floor(page.height / 5))
    const region: ComicRegion = { id: crypto.randomUUID(), x: bounds?.x ?? Math.floor((page.width - width) / 2), y: bounds?.y ?? Math.floor((page.height - height) / 2), width: bounds?.width ?? width, height: bounds?.height ?? height,
      sourceText: '', targetText: null, confidence: null, locked: false, ignored: false, qa: [], style: { ...defaultStyle } }
    void act(async () => { await edit({ action: 'saveRegion', pageId: page.id, region }); setSelectedDrawing(undefined); setSelectedRepair(undefined); setSelectedRegion(region.id); setInspectorOpen(true); if (brushMode === 'text') { setImageKind('rendered'); setCaretPoint(undefined); setInlineEditing(region.id) } })
  }
  const saveAllDrafts = () => {
    setInlineEditing(undefined)
    void closeSave.current().then(() => notifySuccess(t('suite.saved'))).catch(error => notifyError(t(comicIssueKey(error)), { cause: error }))
  }
  const repairSelection = () => {
    if (!selection || !api || !project || !page || !canRun) return
    const polygon = selection
    void act(async () => { setProject(await api.run({ projectId: project.id, expectedRevision: project.revision, pageIds: [page.id], stage: 'repair', selection: polygon })); clearSelection() })
  }
  const eraseSelectionRepair = () => {
    if (!selection || !page || !canEdit) return
    const polygon = selection
    void act(async () => { await edit({ action: 'eraseRepairArea', pageId: page.id, polygon }); clearSelection() })
  }
  const selectionToRegion = () => {
    if (!selection || !page || !project || !canEdit) return
    const points = selection.filter(part => part.op === 'add').flatMap(part => part.points)
    if (!points.length) return
    const x = Math.max(0, Math.floor(Math.min(...points.map(point => point[0]))))
    const y = Math.max(0, Math.floor(Math.min(...points.map(point => point[1]))))
    const right = Math.min(page.width, Math.ceil(Math.max(...points.map(point => point[0]))))
    const bottom = Math.min(page.height, Math.ceil(Math.max(...points.map(point => point[1]))))
    if (right <= x || bottom <= y) return
    const region: ComicRegion = { id: crypto.randomUUID(), x, y, width: right - x, height: bottom - y, sourceText: '', targetText: null, confidence: null, locked: false, ignored: false, qa: [], style: { ...defaultStyle } }
    void act(async () => { await edit({ action: 'saveRegion', pageId: page.id, region }); clearSelection(); setSelectedRegion(region.id); setInspectorOpen(true); setBrushMode('select') })
  }
  const duplicateRegion = () => {
    if (!page || !region || !canEdit) return
    const source = drafts[region.id]?.region ?? region
    const copy: ComicRegion = { ...source, id: crypto.randomUUID(), x: Math.min(page.width - source.width, source.x + 10), y: Math.min(page.height - source.height, source.y + 10), sourceQuad: undefined, sourceLines: undefined, repairPolygon: undefined, sourceStyle: undefined, resolvedLayout: undefined, fontMatch: undefined, manuallyEdited: true }
    void act(async () => { await edit({ action: 'saveRegion', pageId: page.id, region: copy }); setSelectedRegion(copy.id); setInspectorOpen(true) })
  }
  const editSelection = async (action: 'delete' | 'duplicate') => {
    if (!api || !project || !page || !selectedRegions.length) return
    await act(async () => {
      let revision = project.revision
      for (const item of selectedRegions) {
        const copy: ComicRegion = { ...item, id: crypto.randomUUID(), x: Math.min(page.width - item.width, item.x + 10), y: Math.min(page.height - item.height, item.y + 10), sourceQuad: undefined, sourceLines: undefined, repairPolygon: undefined, sourceStyle: undefined, resolvedLayout: undefined, fontMatch: undefined, manuallyEdited: true }
        const command: ComicMutation['command'] = action === 'delete' ? { action: 'deleteRegion', pageId: page.id, regionId: item.id } : { action: 'saveRegion', pageId: page.id, region: copy }
        const next = await api.edit({ projectId: project.id, operationId: crypto.randomUUID(), expectedRevision: revision, command })
        revision = next.revision; setProject(next)
      }
      clearSelection(); setDeletingSelection(false)
    })
  }
  const patchRegion = (patch: Partial<ComicRegion>) => {
    if (!region || !project || page?.artboard?.locked || (drafts[region.id]?.region ?? region).editLocked) return
    if (!page) return
    setDrafts(previous => ({ ...previous, [region.id]: { pageId: page.id, region: { ...(previous[region.id]?.region ?? region), ...patch, resolvedLayout: patch.resolvedLayout }, revision: previous[region.id]?.revision ?? project.revision } }))
  }
  const patchType = (style: ComicRegion['style']) => {
    if (!editable) { setDefaultStyle(style); return }
    const changed = Object.fromEntries(Object.entries(style).filter(([key, value]) => value !== typeStyle[key as keyof typeof style]))
    const characterKeys = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'strokeColor', 'strokeWidth']
    if (inlineEditing && Object.keys(changed).some(key => characterKeys.includes(key))) {
      textEditor.current?.applyStyle(Object.fromEntries(Object.entries(changed).filter(([key]) => characterKeys.includes(key))))
      const paragraph = Object.fromEntries(Object.entries(changed).filter(([key]) => !characterKeys.includes(key) && key !== 'autoFontSize'))
      if (Object.keys(paragraph).length) patchRegion({ style: { ...editable.style, ...paragraph } })
    } else patchRegion({ style })
  }
  const patchRecognition = (bounds: { x: number; y: number; width: number; height: number }) => {
    if (!page || !editable) return
    const x = Math.max(0, Math.min(page.width - 1, bounds.x)), y = Math.max(0, Math.min(page.height - 1, bounds.y))
    const width = Math.max(1, Math.min(page.width - x, bounds.width)), height = Math.max(1, Math.min(page.height - y, bounds.height))
    const quad: [number, number][] = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
    patchRegion({ sourceQuad: quad, sourceLines: [quad] })
  }
  const saveStroke = async (value: PendingStroke) => {
    const saved = await act(() => edit({ action: 'paintMask', pageId: value.pageId, stroke: value.stroke }, value.revision))
    if (saved && strokeRef.current?.stroke.id === value.stroke.id) updateStroke(undefined)
  }
  const point = (event: PointerEvent<HTMLDivElement>): [number, number] => {
    const page = project!.pages.find(item => item.id === event.currentTarget.dataset.pageId)!
    const bounds = event.currentTarget.getBoundingClientRect()
    return [Math.max(0, Math.min(page!.width - 1, Math.round((event.clientX - bounds.left) / bounds.width * page!.width))), Math.max(0, Math.min(page!.height - 1, Math.round((event.clientY - bounds.top) / bounds.height * page!.height)))]
  }
  const saveDrawing = async (value: NonNullable<typeof drawingRef.current>) => {
    const saved = await act(() => edit({ action: 'saveDrawingLayer', pageId: value.pageId, layer: { ...value.layer, strokes: [...value.layer.strokes, value.stroke] } }, value.revision))
    if (saved && drawingRef.current?.stroke.id === value.stroke.id) updateDrawing(undefined)
  }
  const drawingStart = (event: PointerEvent<HTMLDivElement>) => {
    const page = project?.pages.find(item => item.id === event.currentTarget.dataset.pageId)
    if (!page || !project || page.artboard?.locked || busy || activeJob || strokePreview || drawingPreview || Object.keys(drafts).length || event.button !== 0) return
    const position = point(event)
    if (brushMode === 'eyedropper') {
      const image = event.currentTarget.querySelector('img')
      if (!image || !image.complete) return
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, position[0], position[1], 1, 1, 0, 0, 1, 1)
      for (const overlay of event.currentTarget.querySelectorAll('canvas')) ctx.drawImage(overlay, position[0], position[1], 1, 1, 0, 0, 1, 1)
      const color = ctx.getImageData(0, 0, 1, 1).data
      setDrawingColor(`#${Array.from(color.slice(0, 3), byte => byte.toString(16).padStart(2, '0')).join('')}`); setBrushMode('draw'); return
    }
    if (brushMode === 'rect' || brushMode === 'lasso' || brushMode === 'text') {
      event.currentTarget.setPointerCapture(event.pointerId); selectionRef.current = { pointerId: event.pointerId, points: [position], modifier: event.altKey ? 'subtract' : event.shiftKey ? 'add' : 'replace' }; setSelectionPreview([position]); return
    }
    const layer = page.drawingLayers?.find(item => item.id === selectedDrawing) ?? (editor && brushMode !== 'drawErase' ? {
      id: crypto.randomUUID(), name: t('suite.comicDrawingName', { number: (page.drawingLayers?.length ?? 0) + 1 }),
      visible: true, locked: false, opacity: 1, strokes: [],
    } : undefined)
    if (!layer || layer.locked || !layer.visible || drawingRef.current) return
    setSelectedDrawing(layer.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    updateDrawing({ pointerId: event.pointerId, pageId: page.id, revision: project.revision, layer, stroke: { id: crypto.randomUUID(), mode: brushMode === 'drawErase' ? 'erase' : brushMode === 'fill' ? 'fill' : 'brush', color: drawingColor, size: brushSize, points: [position], ...(brushMode === 'fill' && { tolerance: fillTolerance, contiguous: fillContiguous }), opacity: drawingOpacity / 100, hardness: drawingHardness / 100, ...(selection && { clip: selection }) } })
  }
  const drawingMove = (event: PointerEvent<HTMLDivElement>) => {
    const selecting = selectionRef.current
    if (selecting?.pointerId === event.pointerId) {
      if (selecting.points.length < 1999) selecting.points.push(point(event)); else selecting.overflow = true
      const first = selecting.points[0], last = point(event)
      setSelectionPreview(brushMode === 'rect' || brushMode === 'text' ? [first, [last[0], first[1]], last, [first[0], last[1]]] : [...selecting.points])
      return
    }
    const current = drawingRef.current
    if (current?.pointerId !== event.pointerId || current.stroke.mode === 'fill' || current.stroke.points.length >= 20000) return
    updateDrawing({ ...current, stroke: { ...current.stroke, points: [...current.stroke.points, point(event)] } })
  }
  const drawingEnd = (event: PointerEvent<HTMLDivElement>) => {
    const selecting = selectionRef.current
    if (selecting?.pointerId === event.pointerId) {
      setSelectionPreview(undefined)
      const first = selecting.points[0], last = point(event)
      const points = brushMode === 'rect' || brushMode === 'text' ? [first, [last[0], first[1]], last, [first[0], last[1]]] as [number, number][] : [...selecting.points, last]
      const polygon = points.slice(0, 2000)
      const area = polygon.reduce((sum, [x, y], index) => { const next = polygon[(index + 1) % polygon.length]; return sum + x * next[1] - next[0] * y }, 0)
      if (brushMode === 'text') { const x = Math.min(first[0], last[0]), y = Math.min(first[1], last[1]); const width = Math.abs(last[0] - first[0]), height = Math.abs(last[1] - first[1]); if (width >= 2 && height >= 2) addRegion({ x, y, width, height }); selectionRef.current = undefined; return }
      if (selecting.overflow) notifyError(t('suite.maskTooLarge'))
      else if (polygon.length >= 3 && Math.abs(area) >= 2) {
        const next: ComicSelectionPart[] = selecting.modifier === 'replace' ? [{ op: 'add', points: polygon }] : [...(selection ?? []), { op: selecting.modifier, points: polygon }]
        if ((selecting.modifier !== 'subtract' || selection?.length) && next.length <= 64 && next.reduce((sum, part) => sum + part.points.length, 0) <= 8000) commitSelection(next)
        else if (next.length > 64 || next.reduce((sum, part) => sum + part.points.length, 0) > 8000) notifyError(t('suite.maskTooLarge'))
      } else if (selecting.modifier === 'subtract' && selection) {
        let index = selection.length - 1
        while (index >= 0 && (selection[index].op !== 'add' || !comicSelectionContains(last[0], last[1], [selection[index]]))) index--
        if (index >= 0) { const next = selection.filter((_, item) => item !== index); commitSelection(next.some(part => part.op === 'add') ? next : undefined) }
      }
      selectionRef.current = undefined; return
    }
    const current = drawingRef.current
    if (current?.pointerId !== event.pointerId) return
    const pending = { ...current, pointerId: undefined }; updateDrawing(pending); void saveDrawing(pending)
  }
  const paintStart = (event: PointerEvent<HTMLDivElement>) => {
    const page = project?.pages.find(item => item.id === event.currentTarget.dataset.pageId)
    if (!project || !page || page.artboard?.locked || reader || (brushMode !== 'erase' && brushMode !== 'restore') || busy || project.jobs.some(job => job.state === 'running') || strokeRef.current || event.button !== 0) return
    if (!event.currentTarget.querySelector('img')) return
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
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const canvas = scrollRef.current
      const toolKey = !event.ctrlKey && !event.metaKey && !event.altKey && [...Object.values(comicKeys), ' ', '[', ']', 'Delete', 'Escape'].includes(event.key.length === 1 ? event.key.toLowerCase() : event.key)
      const canvasCommand = (event.ctrlKey || event.metaKey) && ['z', 'y', 'd', '+', '=', '-', '0'].includes(event.key.toLowerCase())
      if (editor && canvas && !canvas.contains(target) && (toolKey || canvasCommand)
        && !target?.closest('input, textarea, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"]') && !event.isComposing) {
        const forwarded = new KeyboardEvent('keydown', { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey, repeat: event.repeat, bubbles: true, cancelable: true })
        canvas.dispatchEvent(forwarded)
        if (forwarded.defaultPrevented) event.preventDefault()
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.repeat) return
      const key = event.key.toLowerCase()
      if (!['o', 's', 'e'].includes(key)) return
      event.preventDefault()
      if (busy || project?.jobs.some(job => job.state === 'running')) return
      if (key === 'o' && !editor && api && !strokePreview && !drawingPreview && !Object.keys(drafts).length) importBook('auto')
      else if (key === 's' && !event.shiftKey) {
        if (drawingPreview && drawingPreview.pointerId === undefined) void saveDrawing(drawingPreview)
        else if (strokePreview && strokePreview.pointerId === undefined) void saveStroke(strokePreview)
        else if (Object.keys(drafts).length) saveAllDrafts()
      }
      else if (project && (key === 'e' || key === 's' && event.shiftKey)) {
        setExportKind(key === 's' ? 'project' : event.shiftKey ? 'psd' : 'png')
        setExportCurrentPage(key === 'e' && !event.shiftKey); setExportPageSpec(''); setExporting(true)
      }
    }
    const releasePan = (event: KeyboardEvent) => { if (event.key === ' ' && temporaryPan.current) { setBrushMode(temporaryPan.current); temporaryPan.current = undefined } }
    window.addEventListener('keydown', handle)
    window.addEventListener('keyup', releasePan)
    return () => { window.removeEventListener('keydown', handle); window.removeEventListener('keyup', releasePan) }
  })
  const importDialog = <Dialog open={importing} onOpenChange={open => { if (!busy) setImporting(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.importComic')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); importBook(importKind, true) }}><FieldGroup><Field><FieldLabel htmlFor="comic-import-title">{t('suite.title')}</FieldLabel><Input id="comic-import-title" maxLength={200} value={importTitle} disabled={busy} onChange={event => setImportTitle(event.target.value)} /></Field><Field><FieldLabel htmlFor="comic-import-kind">{t('suite.importKind')}</FieldLabel><Select value={importKind} disabled={busy} onValueChange={value => { if (value) setImportKind(value as ComicImportRequest['kind']) }}><SelectTrigger id="comic-import-kind"><SelectValue>{t(importLabels[importKind])}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(Object.keys(importLabels) as ComicImportRequest['kind'][]).map(kind => <SelectItem value={kind} key={kind}>{t(importLabels[kind])}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    {importKind === 'pdf' ? <>
      <Field><FieldLabel htmlFor="comic-dpi">{t('suite.pdfDpi')}</FieldLabel><Input id="comic-dpi" type="number" required min={72} max={600} value={pdfDpi} onChange={e => setPdfDpi(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="comic-first">{t('suite.firstPage')}</FieldLabel><Input id="comic-first" type="number" required min={1} value={firstPage} onChange={e => setFirstPage(e.target.value)} /></Field>
      <Field><FieldLabel htmlFor="comic-last">{t('suite.lastPage')}</FieldLabel><Input id="comic-last" type="number" min={Number(firstPage)} value={lastPage} onChange={e => setLastPage(e.target.value)} /></Field>
    </> : <Field><FieldLabel htmlFor="comic-first-frame">{t('suite.firstFrame')}</FieldLabel><Switch id="comic-first-frame" checked={firstFrame} onCheckedChange={setFirstFrame}><SwitchThumb /></Switch></Field>}
    </FieldGroup><Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{t('suite.importComic')}</Button></form></CardContent></DialogContent></Dialog>
  const importButtons = (disabled: boolean) => <div className="flex flex-wrap gap-2">
    <Button disabled={disabled} onClick={() => setImporting(true)}>
      <FolderInput data-icon="inline-start" />
      {t('suite.importComic')}
    </Button>
    {!projectId && selectedBooks.size > 0 && <Button variant="destructive" disabled={disabled} onClick={() => {
      if (!api) return
      const ids = [...selectedBooks]
      const selected = books?.filter(book => ids.includes(book.id)) ?? []
      void act(async () => {
        await api.deleteProjects(ids)
        setSelectedBooks(new Set())
        await load()
        const message = ids.length === 1 ? t('suite.comicBookDeleted', { name: selected[0]?.title ?? '' }) : t('suite.comicBooksDeleted', { count: ids.length })
        const noticeId = notifySuccess(message, { duration: 10000, action: { label: t('suite.comicUndoDelete'), onPress: () => {
          void act(async () => { await api.restoreProjects(ids); dismissNotice(noticeId); setBooks(await api.listProjects()) })
        } } })
      })
    }}><Trash2 data-icon="inline-start" />{t('suite.delete')}</Button>}
  </div>
  const deleteBook = (book: ComicProjectSummary) => {
    if (!api) return
    void act(async () => {
      await api.deleteProject(book.id)
      if (projectId === book.id) location.hash = '/comic-translation'
      else await load()
      const noticeId = notifySuccess(t('suite.comicBookDeleted', { name: book.title }), { duration: 10000, action: { label: t('suite.comicUndoDelete'), onPress: () => {
        void act(async () => { await api.restoreProject(book.id); dismissNotice(noticeId); setBooks(await api.listProjects()) })
      } } })
    })
  }
  if (!projectId) return <div className="comic-page"><PageHeader title={t('suite.comicTitle')} warning={t('suite.experimentalInDevelopment')} actions={importButtons(busy || !api)} />
    {failed ? <Alert><AlertDescription>{t('suite.actionFailed')}<Button variant="outline" size="sm" onClick={() => void load()}>{t('suite.retry')}</Button></AlertDescription></Alert> : !books ? <Spinner /> : <>
      {!!books.length && <InputGroup><InputGroupInput id="comic-search" aria-label={t('suite.search')} value={search} onChange={event => setSearch(event.target.value)} /><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon></InputGroup>}
      {!books.length && <Empty><EmptyHeader><EmptyTitle>{t('suite.emptyBookshelf')}</EmptyTitle></EmptyHeader><Button disabled={busy || !api} onClick={() => setImporting(true)}>{t('suite.importComic')}</Button></Empty>}
      <div className="comic-bookshelf">{api && books.filter(book => book.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(book => <ComicBookCover key={book.id} api={api} book={book} selected={selectedBooks.has(book.id)} selecting={selectedBooks.size > 0} onSelect={checked => setSelectedBooks(previous => { const next = new Set(previous); if (checked) next.add(book.id); else next.delete(book.id); return next })} />)}</div>
    </>}{importDialog}</div>
  if (!project && editor) return <div className="flex h-full items-center justify-center">{failed
    ? <div className="flex flex-col items-center gap-3" role="alert"><p>{t('suite.actionFailed')}</p><Button variant="outline" onClick={() => { setFailed(false); void load() }}>{t('suite.retry')}</Button></div>
    : <Spinner role="status" aria-label={t('common.loading')} />}</div>
  if (!project) return <div className="comic-page"><PageHeader title={t('suite.comicTitle')} warning={t('suite.experimentalInDevelopment')} /><Card><CardContent>{failed ? <div className="flex flex-col items-start gap-3"><p>{t('suite.actionFailed')}</p><Button variant="outline" onClick={() => void load()}>{t('suite.retry')}</Button><Button nativeButton={false} variant="outline" onClick={event => guardNavigation(event, '#/comic-translation')} render={<a href="#/comic-translation" />}>{t('suite.bookshelf')}</Button></div> : <Spinner />}</CardContent></Card></div>
  const exportFormats = { cbz: 'CBZ', directory: t('suite.pngFolder'), images: 'ZIP (PNG)', png: t('suite.singlePng'), jpg: 'JPEG', psd: t('suite.comicPsdPreview'), pdf: 'PDF', epub: 'EPUB',
    json: 'JSON', labelplus: 'LabelPlus (ZIP)', project: t('suite.projectArchive') }
  const exportImages = !['json', 'project', 'labelplus', 'psd'].includes(exportKind)
  const exportPages = comicExportPages(exportPageSpec, project.pages.length)
  const activeJob = project.jobs.find(job => job.state === 'running')
  const canRun = !!api && !!page && !page.artboard?.locked && !busy && !activeJob && !strokePreview && !drawingPreview && !Object.keys(drafts).length
  const chapterPages = project.pages.filter(item => item.chapterId === page?.chapterId)
  const stages = Object.keys(stageLabels) as (keyof typeof stageLabels)[]
  const canEdit = !page?.artboard?.locked && !busy && !activeJob && !strokePreview && !drawingPreview && !Object.keys(drafts).length
  const reorderPage = (id: string, index: number) => {
    const destination = project.pages[index]
    if (!canEdit || !destination || !project.pages.some(item => item.id === id) || id === destination.id) return
    setSelectedPage(page?.id)
    void act(() => edit({ action: 'movePage', pageId: id, chapterId: destination.chapterId, index }))
  }
  const saveCommands = (commands: ComicMutation['command'][]) => {
    void closeSave.current().then(async revision => {
      if (!api || revision === undefined) return
      await act(async () => { for (const command of commands) { const next = await api.edit({ projectId: project.id, operationId: crypto.randomUUID(), expectedRevision: revision!, command }); revision = next.revision; setProject(next) } })
    }).catch(error => notifyError(t(comicIssueKey(error)), { cause: error }))
  }
  const boardMetadata = (item: ComicPage) => { const rect = artboardLayout.artboards.find(board => board.pageId === item.id)!; return { x: rect.x, y: rect.y, ...item.artboard } }
  const treeNodes: ComicLayerTreeNode[] = project.pages.map((item, index) => ({
    key: `artboard:${item.id}`, id: item.id, pageId: item.id, kind: 'artboard', name: item.artboard?.name || t('suite.comicArtboardName', { number: index + 1 }), visible: item.artboard?.visible !== false, locked: item.artboard?.locked ?? false,
    children: layerTab === 'masks' ? (item.maskStrokes ?? []).map((stroke, index) => ({ key: `mask:${item.id}:${stroke.id}`, id: stroke.id, pageId: item.id, kind: 'mask', name: stroke.name || t('suite.comicMaskName', { number: index + 1 }), visible: stroke.visible !== false, opacity: stroke.opacity ?? 1 })) : [
      { key: `background:${item.id}`, id: item.id, pageId: item.id, kind: 'background', name: t('suite.comicBackground'), visible: item.backgroundVisible !== false },
      ...(item.repairLayers ?? []).map(layer => ({ key: `repair:${item.id}:${layer.id}`, id: layer.id, pageId: item.id, kind: 'repair' as const, name: layer.name, visible: layer.visible, opacity: layer.opacity })),
      ...(item.drawingLayers ?? []).map(layer => ({ key: `drawing:${item.id}:${layer.id}`, id: layer.id, pageId: item.id, kind: 'drawing' as const, name: layer.name, visible: layer.visible, locked: layer.locked, opacity: layer.opacity })),
      ...item.regions.map((source, index) => { const layer = drafts[source.id]?.region ?? source; return { key: `text:${item.id}:${layer.id}`, id: layer.id, pageId: item.id, kind: 'text' as const, name: layer.name || layer.targetText || layer.sourceText || `T${index + 1}`, visible: layer.visible !== false, locked: layer.editLocked ?? false, opacity: layer.opacity ?? 1 } }),
    ],
  }))
  const allTreeNodes = treeNodes.flatMap(node => [node, ...(node.children ?? [])])
  const activeTreeKey = selectedRegion ? `text:${page?.id}:${selectedRegion}` : selectedRepair ? `repair:${page?.id}:${selectedRepair}` : selectedDrawing ? `drawing:${page?.id}:${selectedDrawing}` : selectedMask ? `mask:${page?.id}:${selectedMask}` : objectKind !== 'document' && page ? `${objectKind}:${page.id}` : undefined
  const selectedTreeKeys = treeSelection.active === activeTreeKey ? treeSelection.keys : activeTreeKey ? [activeTreeKey] : []
  const selectTreeNodes = (keys: string[], active?: string) => {
    const node = allTreeNodes.find(item => item.key === active)
    setTreeSelection({ keys, active }); setInlineEditing(undefined); setRecognitionEditing(false); clearSelection()
    setSelectedPage(node?.pageId ?? page?.id); setSelectedRegion(node?.kind === 'text' ? node.id : undefined); setSelectedDrawing(node?.kind === 'drawing' ? node.id : undefined); setSelectedRepair(node?.kind === 'repair' ? node.id : undefined); setSelectedMask(node?.kind === 'mask' ? node.id : undefined)
    if (node && ['text', 'drawing', 'repair'].includes(node.kind)) setImageKind('rendered')
    setObjectKind(node?.kind === 'artboard' || node?.kind === 'background' ? node.kind : 'document'); setBrushMode(node?.kind === 'drawing' ? 'draw' : 'select'); setInspectorOpen(true)
  }
  const treeCommand = (key: string, patch: { name?: string; visible?: boolean; locked?: boolean; opacity?: number }): ComicMutation['command'] | undefined => {
    const node = allTreeNodes.find(item => item.key === key), item = project.pages.find(item => item.id === node?.pageId)
    if (!node || !item) return
    if (node.kind === 'artboard') return { action: 'setArtboard', pageId: item.id, artboard: { ...boardMetadata(item), ...patch } }
    if (item.artboard?.locked) return
    if (node.kind === 'background') return patch.visible === undefined ? undefined : { action: 'setBackground', pageId: item.id, visible: patch.visible }
    if (node.kind === 'text') { const region = drafts[node.id]?.region ?? item.regions.find(region => region.id === node.id)!; const { locked, ...rest } = patch; return { action: 'saveRegion', pageId: item.id, region: { ...region, ...rest, ...(locked === undefined ? {} : { editLocked: locked }) } } }
    if (node.kind === 'repair') { const layer = item.repairLayers!.find(layer => layer.id === node.id)!; return { action: 'setRepairLayer', pageId: item.id, layerId: layer.id, name: patch.name ?? layer.name, visible: patch.visible ?? layer.visible, opacity: patch.opacity ?? layer.opacity } }
    if (node.kind === 'drawing') return { action: 'saveDrawingLayer', pageId: item.id, layer: { ...item.drawingLayers!.find(layer => layer.id === node.id)!, ...patch } }
    return { action: 'saveMask', pageId: item.id, stroke: { ...item.maskStrokes!.find(stroke => stroke.id === node.id)!, ...patch } }
  }
  const patchTree = (key: string, patch: Parameters<typeof treeCommand>[1]) => { const command = treeCommand(key, patch); if (command) saveCommands([command]) }
  const toggleExpanded = (key: string, expanded: boolean, all: boolean) => saveCommands(project.pages.filter(item => all || key === `artboard:${item.id}`).map(item => ({ action: 'setArtboard', pageId: item.id, artboard: { ...boardMetadata(item), expanded } })))
  const deleteTreeSelection = () => {
    const selected = allTreeNodes.filter(node => deletingLayers.includes(node.key) && !node.locked && node.kind !== 'background' && (node.kind === 'artboard' || !deletingLayers.includes(`artboard:${node.pageId}`)))
    const commands = selected.filter(node => node.kind === 'artboard' || !project.pages.find(item => item.id === node.pageId)?.artboard?.locked).map((node): ComicMutation['command'] => node.kind === 'artboard' ? { action: 'deletePage', pageId: node.id } : node.kind === 'text' ? { action: 'deleteRegion', pageId: node.pageId, regionId: node.id } : node.kind === 'mask' ? { action: 'deleteMask', pageId: node.pageId, strokeId: node.id } : { action: node.kind === 'repair' ? 'deleteRepairLayer' : 'deleteDrawingLayer', pageId: node.pageId, layerId: node.id })
    saveCommands(commands); setDeletingLayers([]); selectTreeNodes([])
  }
  const fontControl = (slot: 'toolbar' | 'properties') => <ComicFontControl slot={slot} style={typeStyle} fonts={fonts} previews={fontPreviews} disabled={busy || !!activeJob || !!editable?.editLocked || !!page?.artboard?.locked} onChange={patchType} />
  const cancelInline = () => { const saved = inlineSnapshot.current; if (saved && saved.id === inlineEditing) setDrafts(previous => { const next = { ...previous }; if (saved.draft) next[saved.id] = saved.draft; else delete next[saved.id]; return next }); setInlineEditing(undefined) }
  const typeDisabled = busy || !!activeJob || !!editable?.editLocked || !!page?.artboard?.locked
  const viewRoute = '#/comic-translation/' + encodeURIComponent(project.id) + (reader ? '' : '/reader')
    + (page ? '/' + encodeURIComponent(page.id) : '')
  const showInspector = !reader && (editor || inspectorOpen)
  const editorMenu = <div className="comic-editor-menu">
    {[
      { label: t('suite.comicFileActions'), items: [
        { label: t('suite.save'), disabled: busy || !Object.keys(drafts).length, action: () => { void closeSave.current().catch(error => notifyError(t(comicIssueKey(error)), { cause: error })) } },
        { label: t('suite.export'), disabled: !canEdit, action: () => { setExportLayer('rendered'); setExporting(true) } },
      ] },
      { label: t('suite.edit'), items: [
        { label: t('suite.undo'), disabled: !canEdit || !project.canUndo, action: () => { void act(() => edit({ action: 'undo' })) } },
        { label: t('suite.redo'), disabled: !canEdit || !project.canRedo, action: () => { void act(() => edit({ action: 'redo' })) } },
        { label: t('suite.comicDuplicate'), disabled: !canEdit || !region, action: duplicateRegion },
        { label: t('suite.delete'), disabled: !canEdit || !region, action: () => { if (page && region) setDeletingRegion({ pageId: page.id, regionId: region.id, revision: project.revision, number: regionIndex + 1 }) } },
        { label: t('suite.layoutPage'), disabled: !canRun || !page?.hasClean, action: () => runStage('layout') },
        { label: t('suite.comicShortcuts'), disabled: false, action: () => setWorkspaceDialog('shortcuts') },
      ] },
    ].map(menu => <Menu.Root key={menu.label}><Menu.Trigger render={<Button variant="bare" size="sm" />}>{menu.label}</Menu.Trigger>
      <Menu.Portal><Menu.Positioner className="z-dropdown" sideOffset={4}><Menu.Popup className="rounded-nola-ui-xl bg-overlay p-1 text-overlay-foreground shadow-overlay"><Menu.List><Menu.Group>{menu.items.map(item => <Menu.Item key={item.label} disabled={item.disabled} className="nola-menu-item flex cursor-pointer items-center gap-3 rounded-nola-ui-md px-3 py-2 text-sm" onClick={item.action}>{item.label}</Menu.Item>)}</Menu.Group></Menu.List></Menu.Popup></Menu.Positioner></Menu.Portal>
    </Menu.Root>)}
    <Menu.Root><Menu.Trigger render={<Button variant="bare" size="sm" />}>{t('suite.comicWindowMenu')}</Menu.Trigger>
      <Menu.Portal><Menu.Positioner className="z-dropdown" sideOffset={4}><Menu.Popup className="rounded-nola-ui-xl bg-overlay p-1 text-overlay-foreground shadow-overlay"><Menu.List><Menu.Group>
        {([['layout', 'suite.comicProperties'], ['layers', 'suite.comicAllLayers'], ['color', 'suite.comicColor']] as const).map(([key, label]) => <Menu.CheckboxItem key={key} checked={editorPanels[key]} onCheckedChange={checked => { setEditorPanels(previous => ({ ...previous, [key]: checked })); if (key === 'layout' && checked) setTypeCollapsed(false) }} className="nola-menu-item flex cursor-pointer items-center gap-3 rounded-nola-ui-md px-3 py-2 text-sm"><span className="comic-menu-check"><Menu.CheckboxItemIndicator><Check /></Menu.CheckboxItemIndicator></span>{t(label)}</Menu.CheckboxItem>)}
        <Menu.Separator className="my-1 h-px bg-border" />
        <Menu.Item className="nola-menu-item flex cursor-pointer items-center gap-3 rounded-nola-ui-md px-3 py-2 text-sm" onClick={() => { setEditorPanels({ layout: true, layers: true, color: true }); setTypeCollapsed(false) }}>{t('suite.comicResetPanels')}</Menu.Item>
      </Menu.Group></Menu.List></Menu.Popup></Menu.Positioner></Menu.Portal>
    </Menu.Root>
  </div>
  const menuHost = editor && document.getElementById('comic-editor-menus')

  return <div className={`comic-page comic-page--workspace${editor ? ' comic-page--editor' : ''}`}>
    {editor && (menuHost ? createPortal(editorMenu, menuHost) : editorMenu)}
    {!editor && <header className="comic-workspace-header">
      <div className="comic-workspace-title">
        <Button nativeButton={false} variant="bare" size="icon-sm" aria-label={t('suite.bookshelf')}
          title={t('suite.bookshelf')} onClick={event => guardNavigation(event, '#/comic-translation')}
          render={<a href="#/comic-translation" />}><ArrowLeft /></Button>
        <h1 className="nola-title truncate" title={project.title}>{project.title}</h1>
      </div>
      <div className="comic-toolbar-group">
        <Button disabled={!page || busy} onClick={() => { if (api && page) void act(() => api.openEditor({ projectId: project.id, pageId: page.id })) }}><BookOpen data-icon="inline-start" />{t('suite.edit')}</Button>
        {<Button variant="bare" size="icon-sm" disabled={!canEdit}
          aria-label={t('suite.comicProcessingSettings')} title={t('suite.comicProcessingSettings')}
          onClick={() => setWorkspaceDialog('settings')}><Settings2 /></Button>}
      </div>
    </header>}
    {!editor && importDialog}
    <Dialog open={workspaceDialog === 'settings'} onOpenChange={open => { if (!open) setWorkspaceDialog(undefined) }}>
      <DialogContent className="comic-settings-dialog">
        <DialogHeader><DialogTitle>{t('suite.comicProcessingSettings')}</DialogTitle><DialogCloseButton /></DialogHeader>
        <CardContent><FieldGroup><LanguageDirectionSelect source={project.config.sourceLanguage} target={project.config.targetLanguage} sourceCodes={['auto', ...LANGUAGE_CODES]} targetCodes={[...LANGUAGE_CODES]} sourceLabel={t('screen.sourceLanguage')} targetLabel={t('screen.targetLanguage')} disabled={busy || !!activeJob} onSourceChange={value => configure({ sourceLanguage: value, ...(value !== 'ja' && value !== 'auto' && project.config.ocr === 'manga-ocr' ? { ocr: 'auto' } : {}) })} onTargetChange={value => configure({ targetLanguage: value })} />
      <Field><FieldLabel htmlFor="comic-model">{t('screen.model')}</FieldLabel><Select value={project.config.model || DEFAULT_COMIC_MODEL} disabled={busy || !!activeJob} onValueChange={value => { if (value) configure({ model: value }) }}><SelectTrigger id="comic-model"><SelectValue>{project.config.model ? models.find(model => model.binding === project.config.model)?.name ?? project.config.model : t('settings.providerIndexTranslate')}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{models.map(model => <SelectItem key={model.binding} value={model.binding}>{model.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="comic-repair-method">{t('suite.repairMethod')}</FieldLabel><Select value={project.config.repairMethod ?? 'auto'} disabled={busy || !!activeJob} onValueChange={value => { if (value === 'auto' || value === 'telea' || value === 'lama-manga' || value === 'lama') configure({ repairMethod: value, ...((value !== 'lama-manga' && project.config.executionProviders?.repair && project.config.executionProviders.repair !== 'cpu') || (value === 'lama-manga' && project.config.executionProviders?.repair === 'dml') ? { executionProviders: { ...project.config.executionProviders, repair: 'cpu' } } : {}) }) }}><SelectTrigger id="comic-repair-method"><SelectValue>{project.config.repairMethod === 'lama-manga' ? 'LaMa Manga' : project.config.repairMethod === 'telea' ? 'Telea' : project.config.repairMethod === 'lama' ? 'LaMa' : t('suite.auto')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="auto">{t('suite.auto')}</SelectItem><SelectItem value="telea">Telea</SelectItem><SelectItem value="lama-manga">LaMa Manga</SelectItem><SelectItem value="lama">LaMa</SelectItem></SelectGroup></SelectContent></Select></Field>
      <Field>
        <FieldLabel htmlFor="comic-detector">{t('suite.comicDetector')}</FieldLabel>
        <Select value={project.config.detector ?? 'auto'} disabled={busy || !!activeJob} onValueChange={value => {
          if (value === 'auto' || value === 'ppocr' || value === 'rtdetr' || value === 'rfdetr-seg') configure({ detector: value })
        }}>
          <SelectTrigger id="comic-detector"><SelectValue>{project.config.detector === 'rtdetr' ? 'RT-DETR v2' : project.config.detector === 'ppocr' ? 'PP-OCRv5' : project.config.detector === 'rfdetr-seg' ? 'RF-DETR Seg' : t('suite.auto')}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="auto">{t('suite.auto')}</SelectItem><SelectItem value="ppocr">PP-OCRv5</SelectItem><SelectItem value="rtdetr">RT-DETR v2</SelectItem><SelectItem value="rfdetr-seg">RF-DETR Seg</SelectItem></SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="comic-ocr">{t('suite.comicOcr')}</FieldLabel>
        <Select value={project.config.ocr ?? 'auto'} disabled={busy || !!activeJob} onValueChange={value => {
          if (value === 'auto' || value === 'ppocr' || value === 'manga-ocr' || value === 'baberu' || value === 'ppocrv6' || value === 'paddleocr-vl') configure({ ocr: value, ...(value === 'paddleocr-vl' && project.config.executionProviders?.ocr === 'dml' ? { executionProviders: { ...project.config.executionProviders, ocr: 'cpu' } } : {}) })
        }}>
          <SelectTrigger id="comic-ocr"><SelectValue>{project.config.ocr === 'manga-ocr' ? 'Manga OCR' : project.config.ocr === 'ppocr' ? 'PP-OCRv5' : project.config.ocr === 'baberu' ? 'Baberu OCR' : project.config.ocr === 'ppocrv6' ? 'PP-OCRv6' : project.config.ocr === 'paddleocr-vl' ? 'PaddleOCR-VL' : t('suite.comicOcrAuto')}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="auto">{t('suite.comicOcrAuto')}</SelectItem><SelectItem value="ppocr">PP-OCRv5</SelectItem><SelectItem value="manga-ocr" disabled={project.config.sourceLanguage !== 'ja' && project.config.sourceLanguage !== 'auto'}>Manga OCR</SelectItem><SelectItem value="baberu">Baberu OCR</SelectItem><SelectItem value="ppocrv6">PP-OCRv6</SelectItem><SelectItem value="paddleocr-vl">PaddleOCR-VL</SelectItem></SelectGroup></SelectContent>
        </Select>
      </Field>
      {(['detector', 'ocr', 'repair'] as const).map(stage => {
        const selected = project.config.executionProviders?.[stage] ?? 'cpu'
        const unavailable = (provider: ComicExecutionProvider) => provider !== 'cpu' && (!runtime?.availableProviders.includes(provider) || (stage === 'ocr' && project.config.ocr === 'paddleocr-vl' && provider === 'dml') || (stage === 'repair' && (project.config.repairMethod !== 'lama-manga' || provider !== 'cuda')))
        const label = stage === 'detector' ? t('suite.comicDetector') : stage === 'ocr' ? t('suite.comicOcr') : t('suite.repairMethod')
        return <Field key={stage}><FieldLabel htmlFor={`comic-device-${stage}`}>{label} · {t('suite.comicExecutionDevice')}</FieldLabel><Select value={selected} disabled={busy || !!activeJob} onValueChange={value => { if ((value === 'cpu' || value === 'cuda' || value === 'dml') && !unavailable(value)) configure({ executionProviders: { ...project.config.executionProviders, [stage]: value } }) }}><SelectTrigger id={`comic-device-${stage}`}><SelectValue>{selected === 'dml' ? 'DirectML' : selected.toUpperCase()}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{(['cpu', 'cuda', 'dml'] as const).map(provider => <SelectItem key={provider} value={provider} disabled={unavailable(provider)}>{provider === 'dml' ? 'DirectML' : provider.toUpperCase()}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      })}
      <GlossarySelectionField value={project.config.glossary} disabled={busy || !!activeJob || !!Object.keys(drafts).length || !!strokePreview} onChange={glossary => configure({ glossary })} />
        </FieldGroup></CardContent>
      </DialogContent>
    </Dialog>
    <Dialog open={workspaceDialog === 'shortcuts'} onOpenChange={open => { if (!open) setWorkspaceDialog(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.comicShortcuts')}</DialogTitle><DialogCloseButton /></DialogHeader><CardContent><FieldGroup>
      {(Object.keys(comicKeys) as (keyof ComicKeys)[]).map(action => <Field key={action}><FieldLabel htmlFor={`comic-key-${action}`}>{t(comicKeyLabels[action])}</FieldLabel><Input id={`comic-key-${action}`} readOnly value={comicKeys[action].toUpperCase()} onKeyDown={event => {
        event.preventDefault(); const key = event.key.toLowerCase()
        if (!/^[a-z]$/.test(key) || event.ctrlKey || event.metaKey || event.altKey) return
        if (Object.entries(comicKeys).some(([other, value]) => other !== action && value === key)) { notifyError(t('suite.comicKeyConflict')); return }
        const next = { ...comicKeys, [action]: key }; setComicKeys(next); localStorage.setItem('nola-comic-shortcuts', JSON.stringify(next))
      }} /></Field>)}
      <Button variant="outline" onClick={() => { const next = { ...defaultComicKeys }; setComicKeys(next); localStorage.removeItem('nola-comic-shortcuts') }}>{t('suite.comicResetShortcuts')}</Button>
    </FieldGroup></CardContent></DialogContent></Dialog>

    <ComicWorkspaceLayout editor={editor} sidebarOpen={editorPanels.layout || editorPanels.layers || editorPanels.color}>
      <section className="comic-canvas">
        {editor && <div className="comic-viewport-controls">
              <Button variant="bare" size="icon-sm" aria-label={t('suite.comicZoomOut')} onClick={() => changeZoom(Math.max(0.1, scale / 1.2))}><Minus /></Button>
              {zoomInput === null ? <Button variant="bare" size="sm" className="comic-toolbar-value" aria-label={t('suite.comicZoomValue')} onClick={() => setZoomInput(String(Math.round(scale * 100)))}>{Math.round(scale * 100)}%</Button> : <Input autoFocus className="comic-toolbar-edit" aria-label={t('suite.comicZoomValue')} inputMode="numeric" value={zoomInput} onFocus={event => event.currentTarget.select()} onChange={event => setZoomInput(event.target.value.replace(/[^0-9]/g, ''))} onBlur={event => { const value = event.currentTarget.value; if (value) changeZoom(Math.max(0.1, Math.min(editor ? 64 : 8, Number(value) / 100))); setZoomInput(null) }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = String(Math.round(scale * 100)); event.currentTarget.blur() } }} />}
              <Button variant="bare" size="icon-sm" aria-label={t('suite.comicZoomIn')} onClick={() => changeZoom(Math.min(editor ? 64 : 8, scale * 1.2))}><Plus /></Button>
              <Popover open={zoomMenuOpen} onOpenChange={setZoomMenuOpen}><PopoverTrigger aria-label={t('suite.comicZoomMode')} render={<Button variant="bare" size="sm" />}><PanelRight /><ChevronDown /></PopoverTrigger><PopoverContent className="comic-action-menu"><Button variant="bare" size="sm" onClick={() => { changeZoom('width'); setZoomMenuOpen(false) }}>{t('suite.comicFitWidth')}{zoom === 'width' && <Check data-icon="inline-end" />}</Button><Button variant="bare" size="sm" onClick={() => { if (editor) { worldAnchor.current = { x: artboardLayout.bounds.x + artboardLayout.bounds.width / 2, y: artboardLayout.bounds.y + artboardLayout.bounds.height / 2, offsetX: viewport.width / 2, offsetY: viewport.height / 2 }; setZoom('page'); setFocusRequest(value => value + 1) } else changeZoom('page'); setZoomMenuOpen(false) }}>{t(editor ? 'suite.comicFitAllArtboards' : 'suite.comicFitPage')}{zoom === 'page' && <Check data-icon="inline-end" />}</Button><Button variant="bare" size="sm" onClick={() => { changeZoom(1); setZoomMenuOpen(false) }}>{t('suite.comicOriginalScale')}{zoom === 1 && <Check data-icon="inline-end" />}</Button></PopoverContent></Popover>
            </div>}
        {editor && <div className="comic-editor-document" title={project.title}><BookOpen /><strong>{project.title}</strong><span>{Object.keys(drafts).length ? t('suite.unsaved') : t('suite.comicDraftSaved')}</span></div>}
        <div className="comic-canvas__toolbar">
          <div className="comic-toolbar-group">
            {!reader && !editor && <>
              <Button variant="bare" size="icon-sm" disabled={!canEdit || !project.canUndo} aria-label={t('suite.undo')} title={t('suite.undo')} onClick={() => void act(() => edit({ action: 'undo' }))}><Undo2 /></Button>
              <Button variant="bare" size="icon-sm" disabled={!canEdit || !project.canRedo} aria-label={t('suite.redo')} title={t('suite.redo')} onClick={() => void act(() => edit({ action: 'redo' }))}><Redo2 /></Button>
            </>}
            <ToggleGroup className="comic-layer-toggle" aria-label={t('suite.comicLayer')} value={[validKind]} onValueChange={value => {
              if (value[0]) { setInlineEditing(undefined); setImageKind(value[0] as typeof imageKind) }
            }}>
              <ToggleGroupItem value="source">{t('suite.sourceImage')}</ToggleGroupItem>
              <ToggleGroupItem value="clean" disabled={!page?.hasClean}>{t('suite.cleanImage')}</ToggleGroupItem>
              <ToggleGroupItem value="rendered" disabled={!page?.hasRendered && !page?.regions.some(region => region.targetText)}>{t('suite.translatedImage')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {!editor && <>          <div className="comic-toolbar-center">
            <div className="comic-toolbar-group comic-toolbar-controls">
              <Button variant="bare" size="icon-sm" aria-label={t('suite.comicZoomOut')} onClick={() => changeZoom(Math.max(0.1, scale / 1.2))}><Minus /></Button>
              {zoomInput === null ? <Button variant="bare" size="sm" className="comic-toolbar-value" aria-label={t('suite.comicZoomValue')} onClick={() => setZoomInput(String(Math.round(scale * 100)))}>{Math.round(scale * 100)}%</Button> : <Input autoFocus className="comic-toolbar-edit" aria-label={t('suite.comicZoomValue')} inputMode="numeric" value={zoomInput} onFocus={event => event.currentTarget.select()} onChange={event => setZoomInput(event.target.value.replace(/[^0-9]/g, ''))} onBlur={event => { const value = event.currentTarget.value; if (value) changeZoom(Math.max(0.1, Math.min(editor ? 64 : 8, Number(value) / 100))); setZoomInput(null) }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = String(Math.round(scale * 100)); event.currentTarget.blur() } }} />}
              <Button variant="bare" size="icon-sm" aria-label={t('suite.comicZoomIn')} onClick={() => changeZoom(Math.min(editor ? 64 : 8, scale * 1.2))}><Plus /></Button>
              <Popover open={zoomMenuOpen} onOpenChange={setZoomMenuOpen}><PopoverTrigger aria-label={t('suite.comicZoomMode')} render={<Button variant="bare" size="sm" />}><PanelRight /><ChevronDown /></PopoverTrigger><PopoverContent className="comic-action-menu"><Button variant="bare" size="sm" onClick={() => { changeZoom('width'); setZoomMenuOpen(false) }}>{t('suite.comicFitWidth')}{zoom === 'width' && <Check data-icon="inline-end" />}</Button><Button variant="bare" size="sm" onClick={() => { if (editor) { worldAnchor.current = { x: artboardLayout.bounds.x + artboardLayout.bounds.width / 2, y: artboardLayout.bounds.y + artboardLayout.bounds.height / 2, offsetX: viewport.width / 2, offsetY: viewport.height / 2 }; setZoom('page'); setFocusRequest(value => value + 1) } else changeZoom('page'); setZoomMenuOpen(false) }}>{t(editor ? 'suite.comicFitAllArtboards' : 'suite.comicFitPage')}{zoom === 'page' && <Check data-icon="inline-end" />}</Button><Button variant="bare" size="sm" onClick={() => { changeZoom(1); setZoomMenuOpen(false) }}>{t('suite.comicOriginalScale')}{zoom === 1 && <Check data-icon="inline-end" />}</Button></PopoverContent></Popover>
            </div>
            {!editor && <>            <Separator orientation="vertical" className="comic-toolbar-divider" />
            <div className="comic-toolbar-group comic-toolbar-controls">
              <Button variant="bare" size="icon-sm" aria-label={t('suite.previous')} disabled={!page || pageIndex === 0} onClick={() => showPage(project.pages[pageIndex - 1].id)}><ChevronLeft /></Button>
              {pageInput === null ? <Button variant="bare" size="sm" className="comic-toolbar-value" aria-label={t('suite.comicJumpToPage')} disabled={!page} onClick={() => setPageInput(String(pageIndex + 1))}>{page ? pageIndex + 1 : 0}/{project.pages.length}</Button> : <Input autoFocus className="comic-toolbar-edit" aria-label={t('suite.comicJumpToPage')} inputMode="numeric" value={pageInput} onFocus={event => event.currentTarget.select()} onChange={event => setPageInput(event.target.value.replace(/[^0-9]/g, ''))} onBlur={event => { const value = event.currentTarget.value; if (value && project.pages.length) showPage(project.pages[Math.max(1, Math.min(project.pages.length, Number(value))) - 1].id); setPageInput(null) }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = String(pageIndex + 1); event.currentTarget.blur() } }} />}
              <Button variant="bare" size="icon-sm" aria-label={t('suite.next')} disabled={!page || pageIndex >= project.pages.length - 1} onClick={() => showPage(project.pages[pageIndex + 1].id)}><ChevronRight /></Button>
            </div></>}
          </div></>}
          <div className="comic-toolbar-group comic-toolbar-end">
            {editor && <>
              <Popover open={stageMenu === 'steps'} onOpenChange={open => setStageMenu(open ? 'steps' : undefined)}><PopoverTrigger render={<Button variant="bare" size="sm" disabled={busy || !!activeJob} />}><ScanLine data-icon="inline-start" />{t('suite.comicProcess')}<ChevronDown /></PopoverTrigger><PopoverContent className="comic-action-menu">
                {stages.map(stage => <Button key={stage} variant="bare" size="sm" onClick={() => { runStage(stage); setStageMenu(undefined) }}>{t(stageLabels[stage])}</Button>)}
                <Button variant="bare" size="sm" onClick={() => { runStage('clean'); setStageMenu(undefined) }}>{t('suite.comicCleanOnly')}</Button>
                {region && <><Separator />{(['ocr', 'translate', 'repair', 'layout'] as const).map(stage => <Button key={stage} variant="bare" size="sm" onClick={() => { runStage(stage, [page!.id], region.id); setStageMenu(undefined) }}>{t('suite.comicApplySelection')} · {t(stageLabels[stage])}</Button>)}</>}
              </PopoverContent></Popover>
              <Button size="sm" disabled={busy || !!activeJob} onClick={() => runStage('full')}><Play data-icon="inline-start" />{t('suite.comicStageRunAll')}</Button>
              <Popover open={stageMenu === 'all'} onOpenChange={open => setStageMenu(open ? 'all' : undefined)}><PopoverTrigger aria-label={t('suite.comicBatch')} render={<Button variant="bare" size="icon-sm" disabled={busy || !!activeJob} />}><ChevronDown /></PopoverTrigger><PopoverContent className="comic-action-menu"><Button variant="bare" size="sm" onClick={() => { runStage('full'); setStageMenu(undefined) }}>{t('suite.comicTranslatePage')}</Button><Button variant="bare" size="sm" onClick={() => { runStage('full', project.pages.map(item => item.id)); setStageMenu(undefined) }}>{t('suite.comicTranslateBook', { count: project.pages.length })}</Button></PopoverContent></Popover>
            </>}
            {!reader && !editor && <>{activeJob && <Button variant="outline" size="sm" disabled={busy} onClick={() => { if (api) void act(async () => setProject(await api.cancel(project.id, activeJob.id))) }}><Square data-icon="inline-start" />{t('screen.cancel')}</Button>}
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
      </Popover></>}
          </div>
        </div>

        {!reader && <div className="comic-canvas__context">
          {editor && !editable && brushMode !== 'text' && objectKind !== 'artboard' && <div className="comic-tool-context"><span>{t(comicKeyLabels[brushMode === 'erase' ? 'draw' : brushMode === 'restore' ? 'drawErase' : brushMode])}</span></div>}
          {editor && (editable || brushMode === 'text') && <ComicTypeOptions style={typeStyle} onChange={patchType} disabled={typeDisabled} fontControl={fontControl} editing={!!inlineEditing} onCommit={() => setInlineEditing(undefined)} onCancel={cancelInline} />}

          {editor && recognitionEditing && selection && editable && <Button variant="outline" size="sm" onClick={() => { const points = selection.filter(part => part.op === 'add').flatMap(part => part.points); if (points.length) { const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1])); patchRecognition({ x, y, width: Math.max(...points.map(p => p[0])) - x, height: Math.max(...points.map(p => p[1])) - y }); clearSelection() } }}>{t('suite.comicApplySelection')}</Button>}
          {brushMode === 'select' && !editor ? <Button variant="bare" size="sm" disabled={!canRun} onClick={() => addRegion()}>
            <Plus data-icon="inline-start" />{t('suite.addRegion')}
          </Button> : brushMode !== 'select' && brushMode !== 'text' && brushMode !== 'pan' && brushMode !== 'rect' && brushMode !== 'lasso' && brushMode !== 'eyedropper' ? <>
            <Field className="comic-brush-size">
              <FieldLabel htmlFor="comic-brush-size">{t('suite.brushSize')}</FieldLabel>
              <Input id="comic-brush-size" type="number" min={1} max={200} value={brushSize} disabled={busy || !!strokePreview}
                onChange={event => { const size = Number(event.target.value); if (Number.isFinite(size)) setBrushSize(Math.min(200, Math.max(1, size))) }} />
            </Field>
            {!!page?.maskStrokes?.length && <Button variant="bare" size="sm" disabled={!canEdit}
              onClick={() => setClearingMask(true)}>{t('suite.clearMask')}</Button>}
          </> : null}
          {['draw', 'drawErase', 'fill'].includes(brushMode) && <Field className="comic-brush-size"><FieldLabel htmlFor="comic-drawing-opacity">{t('suite.comicOpacity')}</FieldLabel><Input id="comic-drawing-opacity" type="number" min={0} max={100} value={drawingOpacity} disabled={busy} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setDrawingOpacity(Math.max(0, Math.min(100, Math.round(value)))) }} /></Field>}
          {['draw', 'drawErase'].includes(brushMode) && <Field className="comic-brush-size"><FieldLabel htmlFor="comic-drawing-hardness">{t('suite.comicHardness')}</FieldLabel><Input id="comic-drawing-hardness" type="number" min={0} max={100} value={drawingHardness} disabled={busy} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setDrawingHardness(Math.max(0, Math.min(100, Math.round(value)))) }} /></Field>}
          {brushMode === 'fill' && <Field className="comic-brush-size"><FieldLabel htmlFor="comic-fill-contiguous">{t('suite.comicContiguous')}</FieldLabel><Switch id="comic-fill-contiguous" checked={fillContiguous} disabled={busy} onCheckedChange={setFillContiguous}><SwitchThumb /></Switch></Field>}
          {brushMode === 'fill' && <Field className="comic-brush-size"><FieldLabel htmlFor="comic-fill-tolerance">{t('suite.comicFillTolerance')}</FieldLabel><Input id="comic-fill-tolerance" type="number" min={0} max={255} value={fillTolerance} disabled={busy} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setFillTolerance(Math.max(0, Math.min(255, Math.round(value)))) }} /></Field>}
          {(brushMode === 'draw' || brushMode === 'fill') && <fieldset disabled={busy}><ColorPicker label={t('suite.textColor')} value={drawingColor} presets={[]} onChange={setDrawingColor} /></fieldset>}
          {selectedRegions.length > 1 && <><Button variant="bare" size="sm" disabled={!canEdit} onClick={() => void editSelection('duplicate')}>{t('suite.comicDuplicate')}</Button><Button variant="bare" size="sm" disabled={!canEdit} onClick={() => setDeletingSelection(true)}>{t('suite.delete')} ({selectedRegions.length})</Button></>}
          {selection && <><Button variant="bare" size="sm" disabled={!canRun} onClick={repairSelection}>{t('suite.comicRepairSelection')}</Button><Button variant="bare" size="sm" disabled={!canEdit || !page?.repairLayers?.length} onClick={eraseSelectionRepair}>{t('suite.comicEraseSelectionRepair')}</Button></>}
          {selection && <Button variant="bare" size="sm" disabled={!canEdit} onClick={selectionToRegion}>{t('suite.comicSelectionToText')}</Button>}
          {selection && <Button variant="bare" size="sm" onClick={() => commitSelection(undefined)}>{t('suite.comicClearSelection')}</Button>}
          {drawingPreview && drawingPreview.pointerId === undefined && <><Button size="sm" disabled={busy} onClick={() => void saveDrawing(drawingPreview)}>{t('suite.save')}</Button><Button variant="bare" size="sm" onClick={() => updateDrawing(undefined)}>{t('screen.cancel')}</Button></>}
          {strokePreview && strokePreview.pointerId === undefined && <>
            <Button size="sm" disabled={busy} onClick={() => void saveStroke(strokePreview)}>{t('suite.save')}</Button>
            <Button variant="bare" size="sm" disabled={busy} onClick={() => updateStroke(undefined)}>{t('screen.cancel')}</Button>
          </>}
          {!editor && <Button variant="bare" size="icon-sm" aria-label={t('suite.comicShortcuts')} onClick={() => setWorkspaceDialog('shortcuts')}><Keyboard /></Button>}
          {!editor && (region || showInspector) && <Button variant="bare" size="sm" aria-pressed={showInspector}
            onClick={() => setInspectorOpen(value => !value)}><PanelRight data-icon="inline-start" />{t('suite.edit')}</Button>}
        </div>}
        {!reader && <div className="comic-canvas__tools">
          <ToggleGroup orientation={editor ? 'vertical' : 'horizontal'} data-variant={editor ? 'line' : undefined} value={[editor && brushMode === 'erase' ? 'draw' : editor && brushMode === 'restore' ? 'drawErase' : brushMode]} disabled={busy || !!activeJob || !!strokePreview || !!drawingPreview}
            onValueChange={value => { if (value[0]) { const chosen = value[0] as typeof brushMode; const mode = editor && layerTab === 'masks' && chosen === 'draw' ? 'erase' : editor && layerTab === 'masks' && chosen === 'drawErase' ? 'restore' : chosen; setBrushMode(mode); if (['draw', 'drawErase', 'fill', 'eyedropper'].includes(mode)) setImageKind('rendered') } }}>
            {(editor ? (['select', 'lasso', 'rect', 'text', 'draw', 'drawErase', 'fill', 'eyedropper'] as const) : (['select', 'pan', 'erase', 'restore', 'draw', 'drawErase', 'fill', 'rect', 'lasso', 'eyedropper'] as const)).map(mode => {
              const label = t(mode === 'text' ? 'suite.addRegion' : mode === 'select' ? 'suite.selectPointer' : mode === 'pan' ? 'suite.comicPan' : mode === 'erase' ? 'suite.eraseMask' : mode === 'restore' ? 'suite.restoreMask' : mode === 'draw' ? 'suite.comicDraw' : mode === 'drawErase' ? 'suite.comicDrawErase' : mode === 'fill' ? 'suite.comicFill' : mode === 'rect' ? 'suite.comicRect' : mode === 'lasso' ? 'suite.comicLasso' : 'suite.comicEyedropper')
              const Icon = mode === 'text' ? Type : comicToolIcons[mode]
              return <ToggleGroupItem key={mode} value={mode} aria-label={label} title={label}><Icon aria-hidden="true" /></ToggleGroupItem>
            })}
          </ToggleGroup>
        </div>}
        <div ref={scrollRef} className="comic-canvas__scroll" data-reader={reader || undefined} role="region" aria-label={t('suite.comicCanvas')}
          tabIndex={0} onScroll={event => followScroll(event.currentTarget)} data-pan={brushMode === 'pan' || undefined}
          onKeyDown={event => {
            if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return
            if (editor && event.key === ' ' && !event.repeat) { event.preventDefault(); temporaryPan.current = brushMode; setBrushMode('pan') }
            else if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '0'].includes(event.key)) {
              event.preventDefault()
              changeZoom(event.key === '0' ? 'page' : event.key === '-' ? Math.max(0.1, scale / 1.2) : Math.min(editor ? 64 : 8, scale * 1.2))
            } else if (!reader && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && region && canEdit) {
              event.preventDefault(); if (selectedRegions.length > 1) void editSelection('duplicate'); else duplicateRegion()
            } else if (!reader && (event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
              const redo = event.key.toLowerCase() === 'y' || event.shiftKey
              const stack = redo ? selectionFuture : selectionPast
              if (stack.length) {
                event.preventDefault()
                const previous = stack[stack.length - 1]
                if (redo) { setSelectionFuture(stack.slice(0, -1)); setSelectionPast(history => [...history, selection]) }
                else { setSelectionPast(stack.slice(0, -1)); setSelectionFuture(history => [...history, selection]) }
                setSelection(previous)
              } else if (canEdit && (redo ? project.canRedo : project.canUndo)) { event.preventDefault(); void act(() => edit({ action: redo ? 'redo' : 'undo' })) }
            } else if (!reader && !event.ctrlKey && !event.metaKey && !event.altKey && !busy && !activeJob && !strokePreview && !drawingPreview) {
              if (['[', ']'].includes(event.key) && ['draw', 'drawErase', 'erase', 'restore', 'fill'].includes(brushMode)) { event.preventDefault(); setBrushSize(size => Math.max(1, Math.min(200, size + (event.key === '[' ? -1 : 1) * Math.max(1, Math.round(size / 10))))); return }
              const mode = (Object.keys(comicKeys) as (keyof ComicKeys)[]).find(key => comicKeys[key] === event.key.toLowerCase())
              if (mode === 'text' && canRun) { event.preventDefault(); setBrushMode('text') }
              else if (mode && mode !== 'text') { event.preventDefault(); const next = editor && layerTab === 'masks' && mode === 'draw' ? 'erase' : editor && layerTab === 'masks' && mode === 'drawErase' ? 'restore' : mode; setBrushMode(next); if (['draw', 'drawErase', 'fill', 'eyedropper'].includes(next)) setImageKind('rendered') }
              else if (event.key === 'Escape' && selection) { event.preventDefault(); commitSelection(undefined) }
              else if (event.key === 'Delete' && selectedRegions.length > 1 && canEdit) { event.preventDefault(); setDeletingSelection(true) }
              else if (event.key === 'Delete' && region && page && canEdit) { event.preventDefault(); setDeletingRegion({ pageId: page.id, regionId: region.id, revision: project.revision, number: regionIndex + 1 }) }
            }
          }}
          onKeyUp={event => { if (editor && event.key === ' ' && temporaryPan.current) { setBrushMode(temporaryPan.current); temporaryPan.current = undefined } }} onBlur={() => { if (temporaryPan.current) { setBrushMode(temporaryPan.current); temporaryPan.current = undefined } }}
          onPointerDown={event => {
            const background = !(event.target as HTMLElement).closest('.comic-canvas__region, .comic-canvas__inline-text, .comic-artboard-title')
            if (reader || !(event.button === 1 || event.button === 0 && (brushMode === 'pan' || editor && brushMode === 'select' && background))) return
            event.preventDefault()
            if (event.button === 0 && brushMode === 'select') { setSelectedRegion(undefined); setSelectedDrawing(undefined); setSelectedRepair(undefined); setInlineEditing(undefined); setLayerEditing(false); setObjectKind('document') }
            event.currentTarget.setPointerCapture(event.pointerId)
            panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
          }}
          onPointerMove={event => {
            const pan = panRef.current
            if (pan?.pointerId !== event.pointerId) return
            event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x)
            event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y)
          }}
          onPointerUp={event => { if (panRef.current?.pointerId === event.pointerId) panRef.current = undefined }}
          onPointerCancel={() => { panRef.current = undefined }}>
          <div className={editor ? "comic-artboard-scene" : undefined} style={editor ? { width: artboardLayout.bounds.width * scale + viewport.width, height: artboardLayout.bounds.height * scale + viewport.height } : { display: "contents" }}>
          {project.pages.map((item, index) => {
            const active = index === pageIndex
            const board = artboardLayout.artboards[index]
            const position = boardPreview?.pageId === item.id ? boardPreview : board
            const boardLocked = editor && item.artboard?.locked === true
            const painting = !reader && !boardLocked && (brushMode === 'erase' || brushMode === 'restore')
            const drawing = !reader && !boardLocked && ['draw', 'drawErase', 'fill', 'rect', 'lasso', 'eyedropper', 'text'].includes(brushMode)
            const kind = validKind
            const composite = editor && kind === 'rendered'
            const baseKind = composite ? (item.hasClean ? 'clean' : 'source') : kind
            const available = editor || kind === 'source' || (kind === 'clean' ? item.hasClean : item.hasRendered)
            const visible = (!editor || item.artboard?.visible !== false) && (Math.abs(index - pageIndex) <= 1 || nearPages.has(item.id))
            // Power-of-two preview levels avoid decoding every wheel-zoom increment.
            const previewScale = editor && !active ? Math.min(1, 2 ** Math.ceil(Math.log2(scale * (window.devicePixelRatio || 1)))) : 1
            const drawingLayers = (item.drawingLayers ?? []).map(layer => drawingPreview?.pageId === item.id && drawingPreview.layer.id === layer.id ? { ...layer, strokes: [...layer.strokes, drawingPreview.stroke] } : layer)
            if (drawingPreview?.pageId === item.id && !drawingLayers.some(layer => layer.id === drawingPreview.layer.id)) drawingLayers.push({ ...drawingPreview.layer, strokes: [...drawingPreview.layer.strokes, drawingPreview.stroke] })
            return <div key={item.id} data-page-id={item.id} data-active={active || undefined} data-artboard={editor ? item.artboard?.name || t('suite.comicArtboardName', { number: index + 1 }) : undefined} data-board-selected={editor && active && objectKind === 'artboard' && !selectedRegion || undefined} hidden={editor && item.artboard?.visible === false} className="comic-canvas__image"
              onPointerDownCapture={() => { if (editor && !active) activatePage(item.id) }}
              style={{ aspectRatio: `${item.width} / ${item.height}`, width: `${item.width * scale}px`, ...(editor ? { position: 'absolute', left: (position.x - artboardLayout.bounds.x) * scale + viewport.width / 2, top: (position.y - artboardLayout.bounds.y) * scale + viewport.height / 2 } : {}) }} data-brush={painting || drawing || undefined} data-transparent={item.backgroundVisible === false && kind !== 'source' || undefined}
              onPointerDown={painting ? paintStart : drawing ? drawingStart : undefined} onPointerMove={painting ? paintMove : drawing ? drawingMove : undefined}
              onPointerUp={painting ? paintEnd : drawing ? drawingEnd : undefined} onPointerCancel={painting ? paintEnd : drawing ? drawingEnd : undefined}>
              {editor && <button className="comic-artboard-title" type="button" aria-label={t('suite.comicSelectArtboard', { name: item.artboard?.name || t('suite.comicArtboardName', { number: index + 1 }) })}
                onPointerDown={event => { event.stopPropagation(); activatePage(item.id); setObjectKind('artboard'); if (event.button !== 0 || !canEdit || boardLocked) return; setZoom(scale); event.currentTarget.setPointerCapture(event.pointerId); boardDrag.current = { pageId: item.id, pointerId: event.pointerId, x: board.x, y: board.y, clientX: event.clientX, clientY: event.clientY } }}
                onPointerMove={event => { const drag = boardDrag.current; if (drag?.pointerId === event.pointerId) setBoardPreview({ pageId: drag.pageId, x: Math.max(-1e6, Math.min(1e6, drag.x + (event.clientX - drag.clientX) / scale)), y: Math.max(-1e6, Math.min(1e6, drag.y + (event.clientY - drag.clientY) / scale)) }) }}
                onPointerUp={event => { const drag = boardDrag.current; if (drag?.pointerId !== event.pointerId) return; boardDrag.current = undefined; if (boardPreview) { captureAnchor(); saveCommands([{ action: 'setArtboard', pageId: item.id, artboard: { ...item.artboard, x: boardPreview.x, y: boardPreview.y } }]) }; setBoardPreview(undefined) }} onPointerCancel={() => { boardDrag.current = undefined; setBoardPreview(undefined) }}
                onDoubleClick={() => fitArtboard(item.id)}>{item.artboard?.name || t('suite.comicArtboardName', { number: index + 1 })}</button>}
              {!available && <div className="comic-canvas__placeholder">{t('suite.comicLayerUnavailable')}</div>}
              {available && api && visible && <ComicPageImage key={baseKind} api={api} projectId={project.id} revision={project.revision} page={item} kind={baseKind} renderScale={previewScale} />}
              {composite && visible && !!drawingLayers.length && <ComicDrawingPreview layers={drawingLayers} width={item.width} height={item.height} preview={api ? { api, projectId: project.id, pageId: item.id, revision: project.revision, renderScale: previewScale } : undefined} />}
              {showTextLayers && composite && visible && api && <ComicTextPreview api={api} projectId={project.id} pageId={item.id} revision={project.revision} regions={item.regions} width={item.width} height={item.height} renderScale={previewScale} draft={active && !inlineEditing ? draft?.region : undefined} hiddenRegionId={active ? inlineEditing : undefined} onDraftLayout={(id, layout) => setDrafts(previous => { const entry = previous[id]; if (!entry || entry.region !== draft?.region || JSON.stringify(entry.region.resolvedLayout) === JSON.stringify(layout)) return previous; return { ...previous, [id]: { ...entry, region: { ...entry.region, resolvedLayout: layout } } } })} />}
              {recognitionEditing && active && editable && <svg className="comic-canvas__recognition" viewBox={`0 0 ${item.width} ${item.height}`} aria-hidden="true"><polygon points={(editable.sourceQuad ?? [[editable.x, editable.y], [editable.x + editable.width, editable.y], [editable.x + editable.width, editable.y + editable.height], [editable.x, editable.y + editable.height]]).map(point => point.join(',')).join(' ')} /></svg>}
              {selection && active && <svg className="comic-canvas__mask" viewBox={`0 0 ${item.width} ${item.height}`} aria-hidden="true">{selection.map((part, index) => <polygon key={index} points={part.points.map(point => point.join(',')).join(' ')} fill="none" stroke="currentColor" strokeDasharray={part.op === 'subtract' ? '2 4' : '8 4'} />)}</svg>}
              {selectionPreview && active && <svg className="comic-canvas__mask comic-canvas__selection-preview" viewBox={`0 0 ${item.width} ${item.height}`} aria-hidden="true"><polygon points={selectionPreview.map(point => point.join(',')).join(' ')} fill="none" stroke="currentColor" strokeDasharray="8 4" /></svg>}
              {(painting || (!reader && active && layerTab === 'masks')) && <svg className="comic-canvas__mask" viewBox={`0 0 ${item.width} ${item.height}`} aria-hidden="true">
                {[...(item.maskStrokes ?? []), ...(strokePreview?.pageId === item.id ? [strokePreview.stroke] : [])].filter(stroke => stroke.visible !== false).map(stroke =>
                  stroke.polygon ? <g key={stroke.id}><mask id={`mask-${stroke.id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={item.width} height={item.height}>
                    <rect width={item.width} height={item.height} fill="black" />
                    {comicSelectionParts(stroke.polygon).map((part, index) => <polygon key={index} points={part.points.map(point => point.join(',')).join(' ')} fill={part.op === 'add' ? 'white' : 'black'} />)}
                  </mask><rect width={item.width} height={item.height} mask={`url(#mask-${stroke.id})`} opacity={stroke.opacity ?? 1} fill={stroke.mode === 'restore' ? 'var(--success)' : 'var(--primary)'} /></g> :
                  <path key={stroke.id} d={stroke.points.length === 1 ? `M${stroke.points[0].join(',')}l0,0` :
                    stroke.points.map((point, index) => `${index ? 'L' : 'M'}${point.join(',')}`).join(' ')}
                    fill="none" strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.opacity ?? 1} data-mode={stroke.mode} />)}
              </svg>}
              {showTextLayers && !reader && visible && (brushMode === 'select' || brushMode === 'text') && !recognitionEditing && (validKind === 'rendered' || !editor) && item.regions.filter(regionItem => (drafts[regionItem.id]?.region ?? regionItem).visible !== false).map((regionItem, index) =>
                <button key={regionItem.id} type="button" className="comic-canvas__region" aria-label={t('suite.region', { number: index + 1 })}
                  aria-pressed={active && showInspector && region?.id === regionItem.id}
                  data-multi={selectedRegions.some(selected => selected.id === regionItem.id) || undefined}
                  style={{ left: `${(drafts[regionItem.id]?.region ?? regionItem).x / item.width * 100}%`, top: `${(drafts[regionItem.id]?.region ?? regionItem).y / item.height * 100}%`,
                    width: `${(drafts[regionItem.id]?.region ?? regionItem).width / item.width * 100}%`, height: `${(drafts[regionItem.id]?.region ?? regionItem).height / item.height * 100}%`,
                    transform: `rotate(${(drafts[regionItem.id]?.region ?? regionItem).style.angle ?? 0}deg)` }}
                  onPointerDown={event => {
                    if (busy || activeJob || strokePreview || drawingPreview || boardLocked || (drafts[regionItem.id]?.region ?? regionItem).editLocked || event.button !== 0) return
                    event.currentTarget.setPointerCapture(event.pointerId)
                    regionDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, region: drafts[regionItem.id]?.region ?? regionItem, pageId: item.id, revision: drafts[regionItem.id]?.revision ?? project.revision, ...(selection && selectedRegions.length > 1 && selectedRegions.some(selected => selected.id === regionItem.id) ? { group: selectedRegions, selection } : {}) }
                    event.stopPropagation(); setSelectedPage(item.id); setSelectedDrawing(undefined); setSelectedRepair(undefined); setSelectedRegion(regionItem.id); setInspectorOpen(true)
                  }}
                  onPointerMove={event => {
                    const drag = regionDrag.current
                    if (!drag || drag.pointerId !== event.pointerId) return
                    if (drag.rotate) {
                      const now = Math.atan2(event.clientY - drag.rotate.y, event.clientX - drag.rotate.x)
                      const raw = (drag.region.style.angle ?? 0) + (now - drag.rotate.start) * 180 / Math.PI
                      const angle = Math.round(((raw + 180) % 360 + 360) % 360 - 180)
                      if (angle === (drag.region.style.angle ?? 0) && !drag.moved) return
                      drag.moved = true
                      setDrafts(previous => ({ ...previous, [regionItem.id]: { pageId: drag.pageId, revision: drag.revision, region: { ...drag.region, style: { ...drag.region.style, angle } } } }))
                      return
                    }
                    const dx = (event.clientX - drag.x) / scale, dy = (event.clientY - drag.y) / scale
                    if (drag.group && drag.selection) {
                      const left = Math.min(...drag.group.map(region => region.x)), top = Math.min(...drag.group.map(region => region.y))
                      const right = Math.max(...drag.group.map(region => region.x + region.width)), bottom = Math.max(...drag.group.map(region => region.y + region.height))
                      const mx = Math.round(Math.max(-left, Math.min(item.width - right, dx))), my = Math.round(Math.max(-top, Math.min(item.height - bottom, dy)))
                      if (!mx && !my && !drag.moved) return
                      drag.moved = true
                      setDrafts(previous => {
                        const next = { ...previous }
                        for (const region of drag.group!) next[region.id] = { pageId: drag.pageId, revision: previous[region.id]?.revision ?? drag.revision, region: { ...region, x: region.x + mx, y: region.y + my } }
                        return next
                      })
                      setSelection(drag.selection.map(part => ({ ...part, points: clipComicPolygon(part.points.map(([x, y]) => [x + mx, y + my]), item.width, item.height) })).filter(part => part.points.length >= 3))
                      return
                    }
                    const x = drag.resize ? drag.region.x : Math.max(0, Math.min(item.width - drag.region.width, Math.round(drag.region.x + dx)))
                    const y = drag.resize ? drag.region.y : Math.max(0, Math.min(item.height - drag.region.height, Math.round(drag.region.y + dy)))
                    const width = drag.resize ? Math.max(1, Math.min(item.width - x, Math.round(drag.region.width + dx))) : drag.region.width
                    const height = drag.resize ? Math.max(1, Math.min(item.height - y, Math.round(drag.region.height + dy))) : drag.region.height
                    const changed = x !== drag.region.x || y !== drag.region.y || width !== drag.region.width || height !== drag.region.height
                    if (!changed && !drag.moved) return
                    drag.moved = true
                    setDrafts(previous => ({ ...previous, [regionItem.id]: { pageId: drag.pageId, revision: drag.revision, region: { ...drag.region, x, y, width, height } } }))
                  }}
                  onPointerUp={() => { regionDrag.current = undefined }} onPointerCancel={() => { regionDrag.current = undefined }}
                  onClick={event => { event.stopPropagation(); if (inlineEditing !== regionItem.id) setInlineEditing(undefined); setSelectedDrawing(undefined); setSelectedRepair(undefined); setSelectedRegion(regionItem.id); setInspectorOpen(true); if (brushMode === 'text') { setCaretPoint(undefined); setInlineEditing(regionItem.id) } }}
                  onDoubleClick={event => { if (!(drafts[regionItem.id]?.region ?? regionItem).editLocked) { const box = event.currentTarget.parentElement!.getBoundingClientRect(); setCaretPoint({ x: event.clientX - box.left, y: event.clientY - box.top }); setSelectedRegion(regionItem.id); setInspectorOpen(true); setInlineEditing(regionItem.id) } }}>
                  {showInspector && region?.id === regionItem.id && !(drafts[regionItem.id]?.region ?? regionItem).editLocked && <><span className="comic-canvas__rotate" aria-hidden="true" onPointerDown={event => {
                    if (busy || activeJob || strokePreview || drawingPreview || event.button !== 0) return
                    event.stopPropagation(); const parent = event.currentTarget.parentElement
                    if (!parent) return
                    const bounds = parent.getBoundingClientRect(), x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2
                    parent.setPointerCapture(event.pointerId)
                    regionDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, region: drafts[regionItem.id]?.region ?? regionItem, pageId: item.id, revision: drafts[regionItem.id]?.revision ?? project.revision, rotate: { x, y, start: Math.atan2(event.clientY - y, event.clientX - x) } }
                  }} /><span className="comic-canvas__resize" aria-hidden="true" onPointerDown={event => {
                    if (busy || activeJob || strokePreview || drawingPreview || event.button !== 0) return
                    event.stopPropagation(); event.currentTarget.parentElement?.setPointerCapture(event.pointerId)
                    regionDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, region: drafts[regionItem.id]?.region ?? regionItem, pageId: item.id, revision: drafts[regionItem.id]?.revision ?? project.revision, resize: true }
                  }} /></>}
                </button>)}
              {!reader && active && brushMode === 'select' && selectedRegions.length > 1 && selection && (() => {
                const left = Math.min(...selectedRegions.map(region => region.x)), top = Math.min(...selectedRegions.map(region => region.y))
                const right = Math.max(...selectedRegions.map(region => region.x + region.width)), bottom = Math.max(...selectedRegions.map(region => region.y + region.height))
                const start = (event: PointerEvent<HTMLButtonElement>, mode: 'scale' | 'rotate') => {
                  if (busy || activeJob || strokePreview || drawingPreview || event.button !== 0) return
                  event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
                  setSelectedRegion(selectedRegions[0].id); setInspectorOpen(true)
                  const bounds = event.currentTarget.parentElement!.getBoundingClientRect(), centerX = bounds.left + bounds.width / 2, centerY = bounds.top + bounds.height / 2
                  groupTransform.current = { pointerId: event.pointerId, mode, x: event.clientX, y: event.clientY, centerX, centerY,
                    startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX), left, top, width: right - left, height: bottom - top,
                    regions: selectedRegions, selection, pageId: item.id, revision: project.revision }
                }
                const move = (event: PointerEvent<HTMLButtonElement>) => {
                  const drag = groupTransform.current
                  if (!drag || drag.pointerId !== event.pointerId) return
                  const delta = drag.mode === 'rotate' ? Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) - drag.startAngle : 0
                  const cos = Math.cos(delta), sin = Math.sin(delta), cx = drag.left + drag.width / 2, cy = drag.top + drag.height / 2
                  const sx = drag.mode === 'scale' ? Math.max(1 / drag.width, Math.min((item.width - drag.left) / drag.width, 1 + (event.clientX - drag.x) / scale / drag.width)) : 1
                  const sy = drag.mode === 'scale' ? Math.max(1 / drag.height, Math.min((item.height - drag.top) / drag.height, 1 + (event.clientY - drag.y) / scale / drag.height)) : 1
                  const transform = ([x, y]: [number, number]): [number, number] => drag.mode === 'scale' ? [drag.left + (x - drag.left) * sx, drag.top + (y - drag.top) * sy] : [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]
                  const next = drag.regions.map(region => {
                    const [centerX, centerY] = transform([region.x + region.width / 2, region.y + region.height / 2])
                    const width = Math.max(1, Math.round(region.width * sx)), height = Math.max(1, Math.round(region.height * sy))
                    const x = Math.round(centerX - width / 2), y = Math.round(centerY - height / 2)
                    const angle = ((Math.round((region.style.angle ?? 0) + delta * 180 / Math.PI) + 180) % 360 + 360) % 360 - 180
                    return { ...region, x, y, width, height, style: { ...region.style, angle } }
                  })
                  if (next.some(region => region.x < 0 || region.y < 0 || region.x + region.width > item.width || region.y + region.height > item.height)) return
                  setDrafts(previous => { const updated = { ...previous }; for (const region of next) updated[region.id] = { pageId: drag.pageId, revision: previous[region.id]?.revision ?? drag.revision, region }; return updated })
                  setSelection(drag.selection.map(part => ({ ...part, points: clipComicPolygon(part.points.map(transform), item.width, item.height) })).filter(part => part.points.length >= 3))
                }
                return <div className="comic-canvas__group" style={{ left: `${left / item.width * 100}%`, top: `${top / item.height * 100}%`, width: `${(right - left) / item.width * 100}%`, height: `${(bottom - top) / item.height * 100}%` }}>
                  <button type="button" className="comic-canvas__rotate" aria-label={t('suite.comicRotateGroup')} onPointerDown={event => start(event, 'rotate')} onPointerMove={move} onPointerUp={() => { groupTransform.current = undefined }} onPointerCancel={() => { groupTransform.current = undefined }} />
                  <button type="button" className="comic-canvas__resize" aria-label={t('suite.comicResizeGroup')} onPointerDown={event => start(event, 'scale')} onPointerMove={move} onPointerUp={() => { groupTransform.current = undefined }} onPointerCancel={() => { groupTransform.current = undefined }} />
                </div>
              })()}
              {!reader && active && inlineEditing && editable && region?.id === inlineEditing && <ComicTextEditor key={inlineEditing} ref={textEditor} region={editable} scale={scale} runs={editable.textRuns} caretPoint={caretPoint} label={t('suite.translation')} liveLayout={inlineLayout?.key === inlineLayoutKey ? inlineLayout.layout : undefined} onCompositionChange={setInlineComposing}
                onChange={({ text, runs, baseStyle }) => patchRegion({ targetText: text, textRuns: runs, locked: true, ...(baseStyle ? { style: baseStyle } : {}) })}
                onSelectionChange={setTextSelection} onCommit={() => setInlineEditing(undefined)} onCancel={() => {
                  const saved = inlineSnapshot.current
                  if (saved && saved.id === inlineEditing) setDrafts(previous => { const next = { ...previous }; if (saved.draft) next[saved.id] = saved.draft; else delete next[saved.id]; return next })
                  setInlineEditing(undefined)
                }} />}
            </div>
          })}
          </div>
        </div>
      </section>
      {!reader && <ComicSidebarLayout onCollapsedChange={setTypeCollapsed} collapsed={typeCollapsed && editorPanels.layers} layoutOpen={editor && editorPanels.layout} layersOpen={!editor || editorPanels.layers} colorOpen={editor && editorPanels.color}>
        <nav className="comic-dock-layers" aria-label={t('suite.comicAllLayers')}>
          <div className="comic-dock-tabs"><Tabs value={layerTab} onValueChange={value => { if (value) { setLayerTab(value); setSelectedMask(undefined) } }}><TabsList variant="line"><TabsTrigger value="layers">{t('suite.comicAllLayers')}</TabsTrigger><TabsTrigger value="masks">{t('suite.comicMasks')}</TabsTrigger></TabsList></Tabs><Button variant="bare" size="icon-xs" aria-label={t('suite.comicClosePanel', { name: t('suite.comicAllLayers') })} onClick={() => setEditorPanels(previous => ({ ...previous, layers: false }))}><X /></Button></div>
          <ComicLayerTree nodes={treeNodes} expandedKeys={treeNodes.filter(node => project.pages.find(item => item.id === node.id)?.artboard?.expanded !== false).map(node => node.key)} selectedKeys={selectedTreeKeys} activeKey={activeTreeKey} disabled={busy || !!activeJob} onSelection={selectTreeNodes} onToggleExpanded={toggleExpanded}
            onVisibility={key => { const node = allTreeNodes.find(item => item.key === key); if (node) patchTree(key, { visible: !node.visible }) }} onLocked={key => { const node = allTreeNodes.find(item => item.key === key); if (node) patchTree(key, { locked: !node.locked }) }}
            onMove={(key, targetKey) => { const node = allTreeNodes.find(item => item.key === key), target = allTreeNodes.find(item => item.key === targetKey); if (!node || !target || node.locked) return; const item = project.pages.find(item => item.id === node.pageId)!; if (node.kind === 'artboard') saveCommands([{ action: 'movePage', pageId: node.id, chapterId: project.pages.find(item => item.id === target.id)!.chapterId, index: project.pages.findIndex(item => item.id === target.id) }]); else if (!item.artboard?.locked && node.pageId === target.pageId && node.kind === target.kind) { if (node.kind === 'text') saveCommands([{ action: 'moveRegion', pageId: item.id, regionId: node.id, index: item.regions.findIndex(region => region.id === target.id) }]); if (node.kind === 'drawing') saveCommands([{ action: 'moveDrawingLayer', pageId: item.id, layerId: node.id, index: item.drawingLayers!.findIndex(layer => layer.id === target.id) }]) } }}
            onRename={(key, name) => patchTree(key, { name })} onOpacity={(key, opacity) => patchTree(key, { opacity })} onFocusArtboard={fitArtboard} onDelete={keys => setDeletingLayers(keys)} onAddText={layerTab === 'layers' && !page?.artboard?.locked ? () => addRegion() : undefined}
            onAddDrawing={layerTab === 'layers' && !page?.artboard?.locked ? () => { if (page && !page.artboard?.locked) { const layer: ComicDrawingLayer = { id: crypto.randomUUID(), name: t('suite.comicDrawingName', { number: (page.drawingLayers?.length ?? 0) + 1 }), visible: true, locked: false, opacity: 1, strokes: [] }; saveCommands([{ action: 'saveDrawingLayer', pageId: page.id, layer }]); setSelectedDrawing(layer.id); setSelectedRegion(undefined); setSelectedRepair(undefined); setBrushMode('draw') } } : undefined} />
        </nav>
        <aside className="comic-dock-properties" aria-label={t('suite.comicProperties')}>
          <div className="comic-dock-tabs"><strong>{t('suite.comicProperties')}</strong><div>{editorPanels.layers && <Button variant="bare" size="icon-xs" aria-label={t('suite.comicProperties')} aria-expanded={!typeCollapsed} onClick={() => setTypeCollapsed(value => !value)}><ChevronDown /></Button>}<Button variant="bare" size="icon-xs" aria-label={t('suite.comicClosePanel', { name: t('suite.comicProperties') })} onClick={() => setEditorPanels(previous => ({ ...previous, layout: false }))}><X /></Button></div></div>
          {(!typeCollapsed || !editorPanels.layers) && <div className="comic-dock-properties__scroll">
            <div className="comic-object-heading">{editable ? <Type /> : repairLayer || drawingLayer ? <ImageIcon /> : <Layers />}<span>{editable ? editable.name || editable.targetText || editable.sourceText || t('suite.comicTextLayer') : repairLayer?.name || drawingLayer?.name || (objectKind === 'artboard' && page ? boardMetadata(page).name || t('suite.comicArtboardName', { number: pageIndex + 1 }) : project.title)}</span></div>
            {editable || brushMode === 'text' ? <>
              <ComicCharacterControls style={typeStyle} disabled={typeDisabled} onChange={patchType} fontControl={fontControl} childrenTransform={editable && <div className="comic-properties-grid">{(['width', 'height', 'x', 'y'] as const).map(key => <label className="comic-properties-field" key={key}><span>{key === 'width' ? 'W' : key === 'height' ? 'H' : key.toUpperCase()}</span><Input aria-label={key.toUpperCase()} type="number" min={key === 'width' || key === 'height' ? 1 : 0} value={Math.round(editable[key])} disabled={typeDisabled} onChange={event => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value) && page) { const max = key === 'x' ? page.width - editable.width : key === 'y' ? page.height - editable.height : key === 'width' ? page.width - editable.x : page.height - editable.y; patchRegion({ [key]: Math.min(max, Math.max(key === 'width' || key === 'height' ? 1 : 0, value)) }) } }} /></label>)}<label className="comic-properties-field"><span>∠</span><Input aria-label={t('suite.comicAngle')} type="number" min={-180} max={180} value={typeStyle.angle ?? 0} disabled={typeDisabled} onChange={event => { const angle = event.currentTarget.valueAsNumber; if (Number.isFinite(angle)) patchType({ ...typeStyle, angle: Math.max(-180, Math.min(180, angle)) }) }} /></label><Button variant="outline" size="sm" disabled={typeDisabled} onClick={() => patchType({ ...typeStyle, autoFontSize: true })}>{t('suite.comicAutoFit')}</Button></div>} />
              {editable && <ComicPropertiesSection title={t('suite.comicRecognitionRegion')} defaultOpen={false}><Button variant="outline" size="sm" aria-pressed={recognitionEditing} onClick={() => { setRecognitionEditing(value => !value); setInlineEditing(undefined); setImageKind(recognitionEditing ? 'rendered' : 'source') }}><ScanText />{t('suite.comicEditRecognition')}</Button><Textarea aria-label={t('suite.source')} value={editable.sourceText} disabled={typeDisabled} onChange={event => patchRegion({ sourceText: event.target.value })} />
                {(() => { const quad = editable.sourceQuad ?? [[editable.x, editable.y], [editable.x + editable.width, editable.y + editable.height]]; const x = Math.min(...quad.map(p => p[0])), y = Math.min(...quad.map(p => p[1])); const bounds = { x, y, width: Math.max(...quad.map(p => p[0])) - x, height: Math.max(...quad.map(p => p[1])) - y }; return <div className="comic-properties-grid">{(['x', 'y', 'width', 'height'] as const).map(key => <label className="comic-properties-field" key={key}><span>{key === 'width' ? 'W' : key === 'height' ? 'H' : key.toUpperCase()}</span><Input aria-label={`OCR ${key.toUpperCase()}`} type="number" value={Math.round(bounds[key])} disabled={typeDisabled} onChange={event => { if (Number.isFinite(event.currentTarget.valueAsNumber)) patchRecognition({ ...bounds, [key]: event.currentTarget.valueAsNumber }) }} /></label>)}</div> })()}
                <div className="comic-properties-grid"><Button variant="outline" size="sm" disabled={busy || !!activeJob} onClick={() => runStage('ocr', [page!.id], editable.id)}>{t('suite.recognizeText')}</Button><Button variant="outline" size="sm" disabled={busy || !!activeJob} onClick={() => runStage('translate', [page!.id], editable.id)}>{t('suite.translateText')}</Button></div>
              </ComicPropertiesSection>}
            </> : repairLayer && page ? <ComicPropertiesSection title={t('suite.comicTransform')}><div className="comic-properties-grid">{(['x', 'y', 'width', 'height'] as const).map(axis => <label key={axis} className="comic-properties-field"><span>{axis === 'width' ? 'W' : axis === 'height' ? 'H' : axis.toUpperCase()}</span><Input aria-label={`repair-${axis}`} key={`${repairLayer.id}-${repairLayer[axis]}`} type="number" min={0} defaultValue={repairLayer[axis]} disabled={typeDisabled || axis === 'width' || axis === 'height'} onBlur={event => { const value = Math.round(event.currentTarget.valueAsNumber); if ((axis === 'x' || axis === 'y') && Number.isFinite(value) && value !== repairLayer[axis]) saveCommands([{ action: 'setRepairLayer', pageId: page.id, layerId: repairLayer.id, name: repairLayer.name, opacity: repairLayer.opacity, visible: repairLayer.visible, [axis]: Math.max(0, Math.min(axis === 'x' ? page.width - repairLayer.width : page.height - repairLayer.height, value)) }]) }} /></label>)}</div></ComicPropertiesSection>
            : <ComicPropertiesSection title={t(objectKind === 'artboard' ? 'suite.comicArtboard' : 'suite.comicDocument')}><div className="comic-properties-grid">{page && (['width', 'height', ...(objectKind === 'artboard' ? ['x', 'y'] as const : [])] as const).map(key => <label className="comic-properties-field" key={key}><span>{key === 'width' ? 'W' : key === 'height' ? 'H' : key.toUpperCase()}</span><Input aria-label={`artboard-${key}`} key={`${page.id}-${key}-${key === 'x' || key === 'y' ? boardMetadata(page)[key] : page[key]}`} type="number" defaultValue={key === 'x' || key === 'y' ? boardMetadata(page)[key] : page[key]} disabled={busy || !!page.artboard?.locked || key === 'width' || key === 'height'} onBlur={event => { const value = event.currentTarget.valueAsNumber; if ((key === 'x' || key === 'y') && Number.isFinite(value)) { captureAnchor(); saveCommands([{ action: 'setArtboard', pageId: page.id, artboard: { ...boardMetadata(page), [key]: Math.max(-1e6, Math.min(1e6, value)) } }]) } }} /></label>)}</div></ComicPropertiesSection>}
          </div>}
        </aside>
        <aside className="comic-dock-color" aria-label={t('suite.comicColor')}><div className="comic-dock-tabs"><strong>{t('suite.comicColor')}</strong><Button variant="bare" size="icon-xs" aria-label={t('suite.comicClosePanel', { name: t('suite.comicColor') })} onClick={() => setEditorPanels(previous => ({ ...previous, color: false }))}><X /></Button></div><fieldset disabled={typeDisabled}><ColorPicker inline label={t('suite.comicColor')} value={editable ? typeStyle.color : drawingColor} presets={[]} onChange={color => editable ? patchType({ ...typeStyle, color }) : setDrawingColor(color)} /></fieldset></aside>
      </ComicSidebarLayout>}

    </ComicWorkspaceLayout>
    {editor && <div className="comic-editor-status nola-caption"><span>{Math.round(scale * 100)}%</span><span>{t(comicKeyLabels[brushMode === 'erase' ? 'draw' : brushMode === 'restore' ? 'drawErase' : brushMode])}</span><span>{page?.regions.length ?? 0} {t('suite.comicLayers')}</span><span className="comic-editor-status-file">{page?.name} ({page?.width} × {page?.height})</span>{activeJob && <><span>{t('suite.jobRunning')} · {t('suite.progress', { done: activeJob.completedPages, total: activeJob.totalPages })}</span><Button variant="bare" size="sm" disabled={busy} onClick={() => { if (api) void act(async () => setProject(await api.cancel(project.id, activeJob.id))) }}>{t('screen.cancel')}</Button></>}{runtime?.cpuPercent != null && <span>CPU {Math.round(runtime.cpuPercent)}%</span>}{runtime && runtime.memoryTotal > 0 && <span>RAM {formatBytes(runtime.memoryUsed)} / {formatBytes(runtime.memoryTotal)}</span>}{runtime?.gpuMemoryUsed != null && runtime.gpuMemoryTotal != null && <span>VRAM {formatBytes(runtime.gpuMemoryUsed)} / {formatBytes(runtime.gpuMemoryTotal)}</span>}</div>}
<Dialog open={!!deletingLayers.length} onOpenChange={open => { if (!open && !busy) setDeletingLayers([]) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: allTreeNodes.filter(node => deletingLayers.includes(node.key)).map(node => node.name).join(', ') })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={deleteTreeSelection}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={!!deletingPage} onOpenChange={open => { if (!open && !busy) setDeletingPage(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: deletingPage?.name ?? '' })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => { if (deletingPage) void act(async () => { await edit({ action: 'deletePage', pageId: deletingPage.id }); if (deletingPage.id === page?.id) { const remaining = project.pages.filter(item => item.id !== deletingPage.id); activatePage(remaining[Math.min(pageIndex, remaining.length - 1)]?.id) }; setDeletingPage(undefined) }) }}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={!!leaving} onOpenChange={open => { if (!open) setLeaving(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.unsaved')}</DialogTitle><DialogCloseButton /></DialogHeader><CardContent><Button variant="destructive" onClick={() => { if (leaving) { setDrafts({}); updateStroke(undefined); updateDrawing(undefined); location.hash = leaving; setLeaving(undefined) } }}>{t('suite.discard')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={clearingMask} onOpenChange={open => { if (!busy) setClearingMask(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.clearMask')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy || !page} onClick={() => { if (page) void act(() => edit({ action: 'clearMask', pageId: page.id })).then(ok => { if (ok) setClearingMask(false) }) }}>{t('suite.clearMask')}</Button></CardContent></DialogContent></Dialog><Dialog open={newChapter !== undefined} onOpenChange={open => { if (!open && !busy) setNewChapter(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.addChapter')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (newChapter?.trim()) void act(() => edit({ action: 'addChapter', title: newChapter })).then(ok => { if (ok) setNewChapter(undefined) }) }}><Field><FieldLabel htmlFor="comic-chapter-title">{t('suite.title')}</FieldLabel><Input id="comic-chapter-title" maxLength={200} required value={newChapter ?? ''} disabled={busy} onChange={event => setNewChapter(event.target.value)} /></Field><Button type="submit" disabled={busy || !newChapter?.trim()}>{t('suite.addChapter')}</Button></form></CardContent></DialogContent></Dialog>
<Dialog open={deletingSelection} onOpenChange={open => { if (!busy) setDeletingSelection(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: t('suite.comicSelectedRegions', { count: selectedRegions.length }) })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => void editSelection('delete')}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={!!deletingDrawing} onOpenChange={open => { if (!open && !busy) setDeletingDrawing(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: deletingDrawing?.name ?? '' })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => { if (deletingDrawing && page) void act(async () => { await edit({ action: 'deleteDrawingLayer', pageId: page.id, layerId: deletingDrawing.id }); setDeletingDrawing(undefined) }) }}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={!!deletingRepair} onOpenChange={open => { if (!open && !busy) setDeletingRepair(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: deletingRepair?.name ?? '' })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => { if (deletingRepair) void act(async () => { await edit({ action: 'deleteRepairLayer', pageId: deletingRepair.pageId, layerId: deletingRepair.id }, deletingRepair.revision); setSelectedRepair(undefined); setDeletingRepair(undefined) }) }}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={!!deletingMask} onOpenChange={open => { if (!open && !busy) setDeletingMask(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: deletingMask?.name ?? t('suite.comicMasks') })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => { if (deletingMask && page) void act(async () => { await edit({ action: 'deleteMask', pageId: page.id, strokeId: deletingMask.id }); setDeletingMask(undefined) }) }}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>
<Dialog open={!!deletingRegion} onOpenChange={open => { if (!open && !busy) setDeletingRegion(undefined) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.deleteConfirm', { name: t('suite.region', { number: deletingRegion?.number ?? 0 }) })}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent><Button variant="destructive" disabled={busy} onClick={() => { if (deletingRegion) void act(async () => { await edit({ action: 'deleteRegion', pageId: deletingRegion.pageId, regionId: deletingRegion.regionId }, deletingRegion.revision); setDrafts(previous => { const next = { ...previous }; delete next[deletingRegion.regionId]; return next }); setSelectedRegion(undefined); setDeletingRegion(undefined) }) }}>{t('suite.delete')}</Button></CardContent></DialogContent></Dialog>    <Dialog open={exporting} onOpenChange={open => { if (!busy) setExporting(open) }}><DialogContent><DialogHeader><DialogTitle>{t('suite.export')}</DialogTitle><DialogCloseButton disabled={busy} /></DialogHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="comic-export-kind">{t('suite.exportFormat')}</FieldLabel><Select value={exportKind} disabled={busy} onValueChange={value => { if (value) setExportKind(value as ComicExportRequest['kind']) }}><SelectTrigger id="comic-export-kind"><SelectValue>{exportFormats[exportKind]}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{Object.entries(exportFormats).map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      {exportImages && <Field><FieldLabel htmlFor="comic-export-layer">{t('suite.comicLayer')}</FieldLabel><Select value={exportLayer} onValueChange={value => { if (value === 'source' || value === 'clean' || value === 'rendered') setExportLayer(value) }}><SelectTrigger id="comic-export-layer"><SelectValue>{t(exportLayer === 'source' ? 'suite.sourceImage' : exportLayer === 'clean' ? 'suite.cleanImage' : 'suite.translatedImage')}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="source">{t('suite.sourceImage')}</SelectItem><SelectItem value="clean">{t('suite.cleanImage')}</SelectItem><SelectItem value="rendered">{t('suite.translatedImage')}</SelectItem></SelectGroup></SelectContent></Select></Field>}
      {exportKind === 'jpg' && <Field><FieldLabel htmlFor="comic-export-quality">{t('suite.comicJpegQuality')}</FieldLabel><Input id="comic-export-quality" type="number" min={1} max={100} value={exportQuality} disabled={busy} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setExportQuality(Math.max(1, Math.min(100, Math.round(value)))) }} /></Field>}
      {!['project', 'png'].includes(exportKind) && <Field className="flex flex-row items-center justify-between">
        <FieldLabel htmlFor="comic-export-current">{t('suite.comicExportCurrentPage')}</FieldLabel>
        <Switch id="comic-export-current" checked={exportCurrentPage} disabled={busy} onCheckedChange={setExportCurrentPage}><SwitchThumb /></Switch>
      </Field>}
      {exportKind !== 'project' && exportKind !== 'png' && !exportCurrentPage && <Field>
        <FieldLabel htmlFor="comic-export-pages">{t('suite.comicExportPages')}</FieldLabel>
        <Input id="comic-export-pages" value={exportPageSpec} aria-invalid={exportPages === null} placeholder="1, 3-5" onChange={event => setExportPageSpec(event.target.value)} />
        {exportPages === null ? <span role="alert">{t('suite.invalidPageRange')}</span> : !!exportPages.length && <p className="comic-export-preview">{exportPages.map(number => `${number}. ${project.pages[number - 1].name}`).join(' · ')}</p>}
      </Field>}
      <Button disabled={busy || !page || (exportKind !== 'project' && exportKind !== 'png' && !exportCurrentPage && exportPages === null)} onClick={() => { if (api && page) void act(async () => {
        if (await api.exportProject({ projectId: project.id, kind: exportKind, ...(exportImages && { layer: exportLayer }), ...(exportKind === 'jpg' && { quality: exportQuality }),
          ...((exportKind === 'png' || exportKind !== 'project' && exportCurrentPage) ? { pageIds: [page.id] } : exportKind !== 'project' && exportPages?.length ? { pageIds: exportPages.map(number => project.pages[number - 1].id) } : {}) })) setExporting(false)
      }) }}>{t('suite.export')}</Button></CardContent></DialogContent></Dialog>
  </div>
}
