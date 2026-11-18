import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { Checkbox } from '@base-ui/react/checkbox'
import { Progress } from '@base-ui/react/progress'
import {
  Columns2,
  Rows2,
  PanelRight,
  Type,
  List,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Eye,
  Files,
  Frame,
  FolderInput,
  Languages,
  Link2,
  Minus,
  MousePointer2,
  Paintbrush,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  ScanText,
  Settings2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAvailableModels } from '@/available-models'
import {
  callableModels,
  installedPlaygroundModels,
} from '../workbench/installed-models'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ColorPicker } from '@/components/ui/color-picker'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import {
  dismissNotice,
  notifyError,
  notifyLoading,
  notifySuccess,
  notifyInfo,
  notifyUpdate,
  notifyWarning,
} from '@/components/primitives/notify'
import { GlossarySelectionField } from '../settings/glossary/GlossarySelectionField'
import { WordRuleSelectionField } from '../settings/word-rules/WordRuleSelectionField'
import { LanguageDirectionSelect } from '@/components/primitives/LanguageDirectionSelect'
import { getBridge, stores, useStore } from '@/store'
import type {
  ComicConfig,
  ComicExportRequest,
  ComicRegion,
  ComicWorkflow,
  ComicRenderSettings,
} from '../../../shared/comic'
import { validComicQuad } from '../../../shared/comic'
import {
  ComicBubbleCanvas,
  ComicFrontendImage,
  type ComicCanvasTool,
} from './ComicBubbleCanvas'
import { ComicProjectLoading } from './ComicLoading'
import { ComicChoiceField } from './ComicChoiceField'
import {
  comicApi,
  comicSaveError,
  discardComicSaves,
  flushComicSaves,
  loadComicBook,
  controlComicTask,
  exportComicBook,
  failedComicPages,
  historyComicBook,
  importComicFiles,
  saveQuickComicToLibrary,
  saveComicBook,
  startComicTask,
  updateComicRegion,
  useComicBooks,
  useComicTasks,
  applyComicProof,
  parseComicPageNumbers,
  prefetchComicImage,
  comicTextQuad,
  comicWithTextQuad,
} from './comic-data'
import {
  useComicPrototypeText,
  type ComicPrototypeText,
} from './comic-prototype-copy'
import { comicErrorMessage } from './comic-errors'

type WorkspaceDialog =
  'settings' | 'export' | 'tasks' | 'style' | 'proof' | 'discard' | null
const workflows = ['normal', 'visual', 'proof', 'erase'] as const
const exportKinds = [
  'png',
  'jpg',
  'images',
  'cbz',
  'pdf',
  'json',
  'labelplus',
] as const

export function ComicTranslationWorkspace({
  projectId,
  pageId,
  onBook,
}: {
  projectId: string
  pageId?: string
  onBook: () => void
}) {
  const { t } = useI18n(),
    p = useComicPrototypeText()
  const books = useComicBooks(projectId),
    jobs = useComicTasks()
  const book = books.find((item) => item.id === projectId)
  const available = useAvailableModels()
  const settings = useStore(stores.settings, (state) => state.settings)
  const resources = useStore(stores.models, (state) => state.resources)
  const credentials = useStore(stores.models, (state) => state.credentials)
  const installed = installedPlaygroundModels(
    resources,
    settings,
    credentials,
    t,
  )
  const callable = callableModels(available, installed)
  const models = [
    ...callable,
    ...installed.filter(
      (model) =>
        model.id.startsWith('resource:') &&
        resources.some(
          (resource) =>
            `resource:${resource.resourceId}` === model.id &&
            resource.kind === 'translationModel',
        ) &&
        !callable.some(
          (item) => item.id === model.id && item.kind === model.kind,
        ),
    ),
  ].filter((model) => model.kind === 'mt' || model.kind === 'llm')
  const [currentId, setCurrentId] = useState(
    () =>
      pageId ??
      localStorage.getItem(`nola-comic-current-page:${projectId}`) ??
      book?.pages[0]?.id,
  )
  const page =
    book?.pages.find((item) => item.id === currentId) ?? book?.pages[0]
  useEffect(() => {
    if (!book || !page) return
    const index = book.pages.findIndex((item) => item.id === page.id)
    for (const neighbor of [book.pages[index - 1], book.pages[index + 1]]) {
      if (!neighbor) continue
      void prefetchComicImage(projectId, neighbor, 'source').catch(() => {})
      if (neighbor.hasRendered || neighbor.hasClean)
        void prefetchComicImage(
          projectId,
          neighbor,
          neighbor.hasRendered ? 'rendered' : 'clean',
        ).catch(() => {})
    }
  }, [projectId, page?.id, book?.revision])
  const [editing, setEditing] = useState(!!pageId)
  const [fontFamilies, setFontFamilies] = useState<string[]>(['Noto Sans SC'])
  useEffect(() => {
    let active = true
    const api = getBridge()?.comic
    if (api?.listFonts)
      void api
        .listFonts()
        .then((fonts) => {
          if (active)
            setFontFamilies([
              ...new Set(['Noto Sans SC', ...fonts.map((font) => font.family)]),
            ])
        })
        .catch((error) => {
          if (active) notifyError(t('suite.actionFailed'), { cause: error })
        })
    return () => {
      active = false
    }
  }, [t])
  const [selected, setSelected] = useState<string[]>(
    page?.regions[0] ? [page.regions[0].id] : [],
  )
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [tool, setTool] = useState<ComicCanvasTool>('select')
  const [view, setView] = useState('translated')
  const [layout, setLayout] = useState('horizontal')
  const [sync, setSync] = useState(true)
  const [scale, setScale] = useState(100)
  const [fitWidth, setFitWidth] = useState<number | null>(null)
  const [dialog, setDialog] = useState<WorkspaceDialog>(null)
  const [workflow, setWorkflow] = useState<ComicWorkflow>('normal')
  const [range, setRange] = useState('all')
  const [pageNumbers, setPageNumbers] = useState('')
  const renderSettings = book?.config.renderSettings
  const updateConfig = (patch: Partial<ComicConfig>) => {
    if (book) saveComicBook({ ...book, config: { ...book.config, ...patch } })
  }
  const updateRender = (patch: Partial<ComicRenderSettings>) => {
    if (renderSettings)
      updateConfig({ renderSettings: { ...renderSettings, ...patch } })
  }
  const fillColor = renderSettings?.fillColor ?? '#ffffff'
  const setFillColor = (fillColor: string) => updateRender({ fillColor })
  const blockAlign = renderSettings?.autoBlockAlign
    ? 'auto'
    : (renderSettings?.blockAlign ?? 'center')
  const setBlockAlign = (blockAlign: string) =>
    updateRender({
      autoBlockAlign: blockAlign === 'auto',
      ...(blockAlign !== 'auto' && {
        blockAlign: blockAlign as ComicRenderSettings['blockAlign'],
      }),
    })
  const [format, setFormat] = useState<ComicExportRequest['kind']>('pdf')
  const [exporting, setExporting] = useState(false)
  const [brushSize, setBrushSize] = useState(24)
  const rounds = String(book?.config.rounds ?? 2)
  const setRounds = (value: string) => updateConfig({ rounds: Number(value) })
  const [proofId, setProofId] = useState<string | null>(null)
  const taskNotices = useRef(
    new Map<string, { status: string; progress: number; notice?: string }>(),
  )
  const saveFailure = comicSaveError(projectId)
  const reportedSaveFailure = useRef<unknown>(undefined)
  const reviewedProofs = useRef(new Set<string>())
  const [batchFont, setBatchFont] = useState(true)
  const [batchColor, setBatchColor] = useState(true)
  const [batchDirection, setBatchDirection] = useState(true)
  const [kana, setKana] = useState(false)
  const ocrEngine = book?.config.ocr ?? 'auto'
  const setOcrEngine = (ocr: string) =>
    updateConfig({ ocr: ocr as ComicConfig['ocr'] })
  const detector = book?.config.detector ?? 'auto'
  const setDetector = (detector: string) =>
    updateConfig({ detector: detector as ComicConfig['detector'] })
  const iconTooltip = (
    label: string,
    element: ReactElement,
    side: 'right' | 'bottom' = 'bottom',
  ) => (
    <Tooltip>
      <TooltipTrigger render={element} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
  const repairMethod = book?.config.repairMethod ?? 'auto'
  const setRepairMethod = (repairMethod: string) =>
    updateConfig({ repairMethod: repairMethod as ComicConfig['repairMethod'] })
  useEffect(() => {
    if (
      page &&
      (!currentId ||
        !selected.some((id) => page.regions.some((region) => region.id === id)))
    ) {
      setCurrentId(page.id)
      setSelected(page.regions[0] ? [page.regions[0].id] : [])
    }
  }, [page?.id, currentId])
  const canvasRegion = useRef<HTMLDivElement>(null)
  const originalScroll = useRef<HTMLDivElement>(null),
    translatedScroll = useRef<HTMLDivElement>(null)
  const region = page?.regions.find((item) => item.id === selected[0])
  const pageIndex = book?.pages.findIndex((item) => item.id === page?.id) ?? 0
  const regionIndex =
    page?.regions.findIndex((item) => item.id === region?.id) ?? -1
  const queueJobs = jobs.filter(
    (job) => !['completed', 'cancelled'].includes(job.status),
  )
  const failedPages = failedComicPages(projectId, jobs)
  let pageNumberError = false
  let parsedPages: string[] = []
  if (range === 'pages' && book) {
    try {
      parsedPages = parseComicPageNumbers(pageNumbers, book.pages)
    } catch {
      pageNumberError = true
    }
  }
  const targetPages =
    range === 'current'
      ? page
        ? [page.id]
        : []
      : range === 'selected'
        ? selectedPages
        : range === 'failed'
          ? failedPages.filter((id) =>
              book?.pages.some((page) => page.id === id),
            )
          : range === 'pages'
            ? parsedPages
            : (book?.pages ?? []).map((item) => item.id)
  const setPage = async (id: string) => {
    try {
      await flushComicSaves(projectId)
    } catch (error) {
      notifyError(t('suite.actionFailed'), { cause: error })
      return
    }
    const next = book?.pages.find((item) => item.id === id)
    setCurrentId(id)
    setSelected(next?.regions[0] ? [next.regions[0].id] : [])
    setTool('select')
    setKana(false)
  }
  const navigatePage = (delta: number) => {
    const next = book?.pages[pageIndex + delta]
    if (next) setPage(next.id)
  }
  const selectRegion = (id: string, multiple = false) =>
    setSelected((previous) =>
      multiple
        ? previous.includes(id)
          ? previous.filter((item) => item !== id)
          : [...previous, id]
        : [id],
    )
  const changeRegion = (next: ComicRegion) => {
    if (book && page)
      updateComicRegion(book.id, page.id, { ...next, manuallyEdited: true })
  }
  const style = (patch: Partial<ComicRegion['style']>) => {
    if (region)
      changeRegion({ ...region, style: { ...region.style, ...patch } })
  }
  const rotation = region?.textQuad
    ? (Math.atan2(
        region.textQuad[1][1] - region.textQuad[0][1],
        region.textQuad[1][0] - region.textQuad[0][0],
      ) *
        180) /
      Math.PI
    : (region?.style.angle ?? 0)
  const rotateRegion = (angle: number) => {
    if (!region || !page) return
    if (!region.textQuad) {
      style({ angle })
      return
    }
    const quad = comicTextQuad(region),
      delta = ((angle - rotation) * Math.PI) / 180
    const cx = quad.reduce((sum, point) => sum + point[0], 0) / 4,
      cy = quad.reduce((sum, point) => sum + point[1], 0) / 4
    const changed = quad.map(([x, y]): [number, number] => [
      Math.max(
        0,
        Math.min(
          page.width,
          cx + (x - cx) * Math.cos(delta) - (y - cy) * Math.sin(delta),
        ),
      ),
      Math.max(
        0,
        Math.min(
          page.height,
          cy + (x - cx) * Math.sin(delta) + (y - cy) * Math.cos(delta),
        ),
      ),
    ])
    if (validComicQuad(changed))
      changeRegion(comicWithTextQuad(region, changed))
  }
  const removeRegion = () => {
    if (book && page && selected.length) {
      saveComicBook({
        ...book,
        pages: book.pages.map((item) =>
          item.id === page.id
            ? {
                ...item,
                regions: item.regions.filter(
                  (item) => !selected.includes(item.id),
                ),
              }
            : item,
        ),
      })
      setSelected([])
    }
  }
  const report = (error: unknown) =>
    notifyError(comicErrorMessage(error, p) || t('suite.actionFailed'), {
      cause: error,
    })
  const run = (
    kind: ComicWorkflow = workflow,
    ids = targetPages,
    regionIds?: string[],
  ) => {
    if (ids.length)
      void startComicTask(projectId, kind, ids, regionIds).catch(report)
  }
  const modeTitle = (kind: ComicWorkflow) =>
    p(
      (
        {
          detect: 'redraw',
          ocr: 'reocr',
          repair: 'repair',
          translate: 'retranslate',
        } as const
      )[kind as 'detect' | 'ocr' | 'repair' | 'translate'] ??
        (kind as ComicPrototypeText),
    )
  const taskStatus = (status: string) =>
    status === 'failed'
      ? t('suite.actionFailed')
      : status === 'completed'
        ? t('suite.jobCompleted')
        : status === 'cancelled'
          ? t('suite.jobCancelled')
          : status === 'paused'
            ? t('suite.pause')
            : status === 'queued'
              ? p('ready')
              : p('processing')
  useEffect(() => {
    for (const job of jobs) {
      if (job.bookId !== projectId) continue
      const previous = taskNotices.current.get(job.id)
      const active = ['queued', 'running', 'pausing', 'cancelling'].includes(
        job.status,
      )
      if (!previous && !active && job.status !== 'paused') continue
      if (previous?.status === job.status && previous.progress === job.progress)
        continue
      const options = {
        action: { label: p('tasks'), onPress: () => setDialog('tasks') },
      }
      const message = `${modeTitle(job.kind)} · ${taskStatus(job.status)}${active ? ` · ${Math.round(job.progress)}%` : ''}`
      if (
        active &&
        previous?.notice &&
        ['queued', 'running', 'pausing', 'cancelling'].includes(previous.status)
      ) {
        notifyUpdate(previous.notice, message, {
          ...options,
          variant: 'loading',
        })
        taskNotices.current.set(job.id, {
          ...previous,
          status: job.status,
          progress: job.progress,
        })
        continue
      }
      if (previous?.notice) dismissNotice(previous.notice)
      let notice: string
      if (job.status === 'completed') notice = notifySuccess(message, options)
      else if (job.status === 'failed')
        notice = notifyError(
          `${modeTitle(job.kind)} · ${comicErrorMessage(job.error, p) || t('suite.actionFailed')}`,
          options,
        )
      else
        notice = active
          ? notifyLoading(message, options)
          : notifyInfo(message, options)
      if (['completed', 'failed', 'cancelled'].includes(job.status))
        taskNotices.current.delete(job.id)
      else
        taskNotices.current.set(job.id, {
          status: job.status,
          progress: job.progress,
          notice,
        })
    }
  }, [jobs, projectId, t, p])
  useEffect(() => {
    if (!saveFailure) {
      reportedSaveFailure.current = undefined
      return
    }
    if (reportedSaveFailure.current === saveFailure) return
    reportedSaveFailure.current = saveFailure
    notifyError(book ? p('saveFailed') : t('suite.actionFailed'), {
      cause: saveFailure,
      action: {
        label: t('suite.retry'),
        onPress: () => {
          void (
            book ? flushComicSaves(projectId) : loadComicBook(projectId)
          ).catch(() => {})
        },
      },
    })
  }, [saveFailure, book, projectId, t, p])
  const selectedIssues =
    region?.qa
      .filter((issue) => issue === 'textOverflow' || issue === 'missingGlyph')
      .join(',') ?? ''
  useEffect(() => {
    if (!editing || !selectedIssues) return
    for (const issue of selectedIssues.split(','))
      notifyWarning(
        `${p('bubble')} ${regionIndex + 1} · ${p(issue as 'textOverflow' | 'missingGlyph')}`,
      )
  }, [editing, region?.id, selectedIssues, p])
  useEffect(
    () => () => {
      for (const item of taskNotices.current.values())
        if (item.notice) dismissNotice(item.notice)
      taskNotices.current.clear()
    },
    [projectId],
  )
  useEffect(() => {
    if (!page || typeof ResizeObserver === 'undefined') return
    const panels = [originalScroll.current, translatedScroll.current].filter(
      (node): node is HTMLDivElement => !!node,
    )
    const measure = () => {
      const sizes = panels
        .map((node) => {
          const css = getComputedStyle(node)
          const width =
            node.clientWidth -
            parseFloat(css.paddingLeft) -
            parseFloat(css.paddingRight)
          const height =
            node.clientHeight -
            parseFloat(css.paddingTop) -
            parseFloat(css.paddingBottom)
          return Math.min(width, (height * page.width) / page.height)
        })
        .filter((size) => size > 0)
      setFitWidth(sizes.length ? Math.min(...sizes) : null)
    }
    const observer = new ResizeObserver(measure)
    panels.forEach((node) => observer.observe(node))
    measure()
    return () => observer.disconnect()
  }, [editing, view, layout, page?.id])
  useEffect(() => {
    if (page) {
      try {
        localStorage.setItem(`nola-comic-current-page:${projectId}`, page.id)
      } catch {
        /* Editing remains available when storage is full. */
      }
    }
  }, [projectId, page?.id])
  useEffect(() => {
    const completed = jobs.find(
      (job) =>
        job.bookId === projectId &&
        job.kind === 'proof' &&
        job.status === 'completed' &&
        !reviewedProofs.current.has(job.id),
    )
    if (completed) {
      reviewedProofs.current.add(completed.id)
      setProofId(completed.id)
      setDialog('proof')
    }
  }, [jobs, projectId])

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        !editing ||
        dialog ||
        event.isComposing ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, [contenteditable="true"], [role="listbox"], [role="dialog"]',
          ))
      )
        return
      const key = event.key.toLowerCase(),
        modifier = event.ctrlKey || event.metaKey
      if (modifier && key === 'z') {
        event.preventDefault()
        void historyComicBook(
          projectId,
          event.shiftKey ? 'redo' : 'undo',
        ).catch(report)
      } else if (modifier && key === 'enter') {
        event.preventDefault()
        navigatePage(1)
      } else if (!modifier && key === 'a') navigatePage(-1)
      else if (!modifier && key === 'd') navigatePage(1)
      else if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        removeRegion()
      } else if (key === 'escape') setTool('select')
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  })

  if (book && !page && book.quick)
    return (
      <div
        className="comic-workflow"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          void importComicFiles(Array.from(event.dataTransfer.files), {
            projectId,
          }).catch(report)
        }}
      >
        <header className="comic-workflow__header">
          <Button
            variant="bare"
            size="icon"
            aria-label={t('suite.bookshelf')}
            onClick={() => {
              location.hash = '/comic-translation'
            }}
          >
            <ArrowLeft />
          </Button>
          <div className="comic-workflow__title">
            <strong>{p('preview')}</strong>
          </div>
        </header>
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>{p('quickEmpty')}</EmptyTitle>
          </EmptyHeader>
          <Button
            onClick={() => {
              void flushComicSaves(projectId)
                .then(() =>
                  comicApi().importProject({ projectId, kind: 'auto' }),
                )
                .then((result) => result && loadComicBook(projectId))
                .catch(report)
            }}
          >
            <FolderInput data-icon="inline-start" />
            {t('suite.importComic')}
          </Button>
        </Empty>
      </div>
    )
  if (!book) return saveFailure ? null : <ComicProjectLoading comparison />
  if (!book || !page || !renderSettings)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('suite.emptyBookshelf')}</EmptyTitle>
        </EmptyHeader>
        <Button
          onClick={() => {
            void flushComicSaves(projectId)
              .then(() => {
                location.hash = '/comic-translation'
              })
              .catch(report)
          }}
        >
          {t('suite.bookshelf')}
        </Button>
      </Empty>
    )
  const activePage = page
  const selectedRangeItems = [
    { value: 'current', label: p('current') },
    { value: 'all', label: p('all') },
    { value: 'selected', label: `${p('selected')} (${selectedPages.length})` },
    { value: 'pages', label: p('pageNumbers') },
    { value: 'failed', label: `${p('retryFailed')} (${failedPages.length})` },
  ]
  const numericField = (
    name: string,
    value: number,
    change: (next: number) => void,
    min: number,
    max: number,
    step = 1,
    automatic?: {
      enabled: boolean
      change: (enabled: boolean, next?: number) => void
    },
  ) => (
    <Field>
      <FieldLabel htmlFor={`comic-${name}`}>{name}</FieldLabel>
      <Input
        id={`comic-${name}`}
        type="number"
        value={automatic?.enabled ? '' : value}
        placeholder={automatic ? p('automatic') : undefined}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          if (automatic) {
            const next = event.target.valueAsNumber
            automatic.change(
              event.target.value === '',
              Number.isFinite(next)
                ? Math.max(min, Math.min(max, next))
                : undefined,
            )
            return
          }
          if (event.target.value !== '') {
            const next = event.target.valueAsNumber
            if (Number.isFinite(next))
              change(Math.max(min, Math.min(max, next)))
          }
        }}
      />
    </Field>
  )
  const fontField = (
    id: string,
    value: string,
    onChange: (fontFamily: string) => void,
  ) => {
    const choices = [...new Set(['auto', value, ...fontFamilies])]
    return (
      <Field>
        <FieldLabel htmlFor={id}>{p('font')}</FieldLabel>
        <Combobox
          items={choices}
          value={value}
          modal={false}
          onValueChange={(font) => {
            if (font) onChange(font)
          }}
        >
          <ComboboxTrigger id={id} aria-label={p('font')}>
            <span className="select__value">
              {value === 'auto' ? p('automatic') : value}
            </span>
          </ComboboxTrigger>
          <ComboboxContent className="nola-language-popup" initialFocus={false}>
            <ComboboxInput
              aria-label={t('suite.search')}
              placeholder={t('suite.search')}
            />
            <ComboboxEmpty className="nola-language-empty">
              {t('suite.comicFontsEmpty')}
            </ComboboxEmpty>
            <ComboboxList className="nola-language-list">
              {(font: string) => (
                <ComboboxItem key={font} value={font}>
                  <span style={{ fontFamily: JSON.stringify(font) }}>
                    {font === 'auto' ? p('automatic') : font}
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>
    )
  }
  const canvas = (original: boolean) => (
    <section className="comic-workflow__image-panel">
      <div className="comic-workflow__panel-heading">
        <span className="shrink-0 whitespace-nowrap">
          {original ? p('source') : p('result')}
        </span>
      </div>
      <div
        ref={original ? originalScroll : translatedScroll}
        className="comic-workflow__image-scroll"
        onScroll={(event) => {
          if (!sync) return
          const other = original
            ? translatedScroll.current
            : originalScroll.current
          if (
            other &&
            Math.abs(other.scrollTop - event.currentTarget.scrollTop) > 1
          )
            other.scrollTop = event.currentTarget.scrollTop
          if (
            other &&
            Math.abs(other.scrollLeft - event.currentTarget.scrollLeft) > 1
          )
            other.scrollLeft = event.currentTarget.scrollLeft
        }}
      >
        <div
          className="comic-workflow__paper"
          style={
            {
              '--comic-zoom': scale / 100,
              ...(fitWidth && { width: (fitWidth * scale) / 100 }),
            } as CSSProperties
          }
        >
          <ComicBubbleCanvas
            key={`${page.id}-${original}`}
            projectId={projectId}
            page={activePage}
            original={original}
            editable={editing}
            selected={selected}
            tool={tool}
            brushSize={brushSize}
            onSelect={selectRegion}
            onRegion={(next) => {
              changeRegion(next)
              selectRegion(next.id)
              if (tool !== 'perspective') setTool('select')
            }}
            onMask={(stroke) =>
              saveComicBook({
                ...book,
                pages: book.pages.map((item) =>
                  item.id === page.id
                    ? {
                        ...item,
                        maskStrokes: [...(item.maskStrokes ?? []), stroke],
                      }
                    : item,
                ),
              })
            }
          />
        </div>
      </div>
    </section>
  )

  const textStyleFields = region && (
    <FieldGroup className="comic-workflow__fields">
      {fontField(
        'comic-font',
        region.style.autoFont
          ? 'auto'
          : (region.style.fontFamily ?? 'Noto Sans SC'),
        (fontFamily) =>
          style({
            autoFont: fontFamily === 'auto',
            ...(fontFamily !== 'auto' && { fontFamily }),
          }),
      )}
      {numericField(
        p('fontSize'),
        region.style.fontSize,
        (fontSize) => style({ fontSize: Math.round(fontSize) }),
        6,
        200,
        1,
        {
          enabled: !!region.style.autoFontSize,
          change: (autoFontSize, fontSize) =>
            style({
              autoFontSize,
              ...(fontSize !== undefined && { fontSize }),
            }),
        },
      )}
      <ComicChoiceField
        id="comic-direction"
        label={t('suite.direction')}
        value={region.style.direction}
        items={[
          { value: 'vertical-rl', label: t('suite.vertical') },
          { value: 'horizontal', label: t('suite.horizontal') },
        ]}
        onChange={(direction) =>
          style({ direction: direction as ComicRegion['style']['direction'] })
        }
      />
      <Field>
        <FieldLabel>{t('suite.textColor')}</FieldLabel>
        <ColorPicker
          label={t('suite.textColor')}
          value={region.style.color}
          presets={[]}
          onChange={(color) => style({ color })}
        />
      </Field>
      {numericField(
        p('strokeWidth'),
        region.style.strokeWidth ?? 0,
        (strokeWidth) => style({ strokeWidth }),
        0,
        10,
        0.5,
      )}
      <Field>
        <FieldLabel>{p('strokeColor')}</FieldLabel>
        <ColorPicker
          label={p('strokeColor')}
          value={region.style.strokeColor ?? '#ffffff'}
          presets={[]}
          onChange={(strokeColor) => style({ strokeColor })}
        />
      </Field>
      {numericField(
        p('lineSpacing'),
        region.style.lineSpacing ?? 1.4,
        (lineSpacing) => style({ lineSpacing }),
        0.5,
        3,
        0.1,
        {
          enabled: !!region.style.autoLineSpacing,
          change: (autoLineSpacing, lineSpacing) =>
            style({
              autoLineSpacing,
              ...(lineSpacing !== undefined && { lineSpacing }),
            }),
        },
      )}
      {numericField(
        p('rotation'),
        Math.round(rotation),
        rotateRegion,
        -180,
        180,
      )}
      <Button
        variant="outline"
        disabled={!region.textQuad && !region.style.angle}
        onClick={() => {
          const { textQuad: _quad, ...plain } = region
          changeRegion({ ...plain, style: { ...plain.style, angle: 0 } })
        }}
      >
        <RotateCcw data-icon="inline-start" />
        {p('resetPerspective')}
      </Button>
    </FieldGroup>
  )

  const exportNow = async () => {
    setExporting(true)
    try {
      const exported = await exportComicBook({
        projectId,
        kind: format,
        layer: 'rendered',
        pageIds: ['png', 'jpg'].includes(format) ? [page.id] : targetPages,
      })
      if (!exported) return
      notifySuccess(t('suite.export'))
    } catch (error) {
      notifyError(t('suite.actionFailed'), { cause: error })
    } finally {
      setExporting(false)
    }
  }
  return (
    <div
      className="comic-workflow"
      data-editing={editing}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        void importComicFiles(Array.from(event.dataTransfer.files), {
          projectId,
          chapterId: page.chapterId,
        }).catch(report)
      }}
    >
      <header className="comic-workflow__header">
        <Button
          variant="bare"
          size="icon"
          aria-label={t('suite.bookshelf')}
          onClick={() => {
            void flushComicSaves(projectId)
              .then(() => {
                location.hash = '/comic-translation'
              })
              .catch(report)
          }}
        >
          <ArrowLeft />
        </Button>
        <div className="comic-workflow__title">
          <button
            type="button"
            onClick={() => {
              void flushComicSaves(projectId).then(onBook).catch(report)
            }}
          >
            {book.title}
          </button>
          <span>
            {book.chapters.find((item) => item.id === page.chapterId)?.title}
          </span>
        </div>
        <div className="comic-workflow__actions">
          {Boolean(saveFailure) && (
            <Button variant="outline" size="sm" onClick={() => setDialog('discard')}>
              {t('suite.discard')}
            </Button>
          )}
          {book.quick && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void saveQuickComicToLibrary(projectId)
                  .then((saved) => {
                    location.hash = `/comic-translation/${saved.id}`
                  })
                  .catch(report)
              }}
            >
              <BookOpen data-icon="inline-start" />
              {p('saveToShelf')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog('tasks')}
          >
            <Files data-icon="inline-start" />
            {p('tasks')}
            {jobs.filter((item) => ['running', 'queued'].includes(item.status))
              .length > 0 && (
              <Badge>
                {
                  jobs.filter((item) =>
                    ['running', 'queued'].includes(item.status),
                  ).length
                }
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog('settings')}
          >
            <Settings2 data-icon="inline-start" />
            {p('settings')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDialog('export')
            }}
          >
            <Download data-icon="inline-start" />
            {t('suite.export')}
          </Button>
          <Button
            variant={editing ? 'destructive' : 'default'}
            size="sm"
            onClick={() => {
              void flushComicSaves(projectId)
                .then(() => {
                  setEditing((value) => !value)
                  setView('dual')
                  setTool('select')
                })
                .catch(report)
            }}
          >
            {editing ? p('exit') : p('edit')}
          </Button>
        </div>
      </header>

      {editing && (
        <div
          className="comic-workflow__editor-bar"
          role="toolbar"
          aria-label={p('edit')}
        >
          <div className="comic-workflow__control-group">
            {iconTooltip(
              t('suite.previous'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.previous')}
                disabled={pageIndex === 0}
                onClick={() => navigatePage(-1)}
              >
                <ChevronLeft />
              </Button>,
            )}
            <span className="comic-workflow__counter">
              {p('page')} {pageIndex + 1} / {book.pages.length}
            </span>
            {iconTooltip(
              t('suite.next'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.next')}
                disabled={pageIndex === book.pages.length - 1}
                onClick={() => navigatePage(1)}
              >
                <ChevronRight />
              </Button>,
            )}
          </div>
          <Separator orientation="vertical" />
          <div className="comic-workflow__control-group">
            {iconTooltip(
              t('suite.undo'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.undo')}
                disabled={!book.canUndo}
                onClick={() => {
                  void historyComicBook(projectId, 'undo').catch(report)
                }}
              >
                <Undo2 />
              </Button>,
            )}
            {iconTooltip(
              t('suite.redo'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.redo')}
                disabled={!book.canRedo}
                onClick={() => {
                  void historyComicBook(projectId, 'redo').catch(report)
                }}
              >
                <Redo2 />
              </Button>,
            )}
          </div>
          <div className="comic-workflow__view-controls">
            {['repair', 'restore'].includes(tool) && (
              <Input
                className="comic-workflow__brush-size"
                aria-label={p('brushSize')}
                title={p('brushSize')}
                type="number"
                min={2}
                max={100}
                value={brushSize}
                onChange={(event) =>
                  setBrushSize(
                    Math.max(
                      2,
                      Math.min(100, event.target.valueAsNumber || 24),
                    ),
                  )
                }
              />
            )}
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="bare" size="sm" aria-label={p('compare')} />
                }
              >
                <PanelRight data-icon="inline-start" />
                {view === 'dual' ? p('compare') : p('result')}
              </PopoverTrigger>
              <PopoverContent className="comic-workflow__view-menu">
                <ToggleGroup
                  value={[view]}
                  onValueChange={(values) => {
                    if (values[0]) setView(values[0])
                  }}
                  aria-label={p('compare')}
                >
                  <ToggleGroupItem value="dual">{p('compare')}</ToggleGroupItem>
                  <ToggleGroupItem value="translated">
                    {p('result')}
                  </ToggleGroupItem>
                </ToggleGroup>
                <ToggleGroup
                  value={[layout]}
                  onValueChange={(values) => {
                    if (values[0]) setLayout(values[0])
                  }}
                  aria-label={p('sideBySide')}
                >
                  <ToggleGroupItem value="horizontal">
                    <Columns2 />
                    {p('sideBySide')}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="vertical">
                    <Rows2 />
                    {p('stacked')}
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button
                  variant={sync ? 'secondary' : 'outline'}
                  size="sm"
                  aria-pressed={sync}
                  onClick={() => setSync((value) => !value)}
                >
                  <Link2 data-icon="inline-start" />
                  {p('sync')}
                </Button>
              </PopoverContent>
            </Popover>
            <Separator orientation="vertical" />
            {iconTooltip(
              t('suite.comicZoomOut'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.comicZoomOut')}
                disabled={scale <= 50}
                onClick={() => setScale((value) => Math.max(50, value - 25))}
              >
                <Minus />
              </Button>,
            )}
            <span className="comic-workflow__counter">{scale}%</span>
            {iconTooltip(
              t('suite.comicZoomIn'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.comicZoomIn')}
                disabled={scale >= 300}
                onClick={() => setScale((value) => Math.min(300, value + 25))}
              >
                <Plus />
              </Button>,
            )}
          </div>
        </div>
      )}

      <div className="comic-workflow__body">
        {editing && (
          <aside
            className="comic-workflow__tool-rail"
            aria-label={p('selection')}
          >
            <ToggleGroup
              className="comic-workflow__tool-selection"
              orientation="vertical"
              value={[tool]}
              onValueChange={(values) => {
                if (values[0]) setTool(values[0] as ComicCanvasTool)
              }}
              aria-label={p('selection')}
            >
              {iconTooltip(
                p('selection'),
                <ToggleGroupItem value="select" aria-label={p('selection')}>
                  <MousePointer2 />
                </ToggleGroupItem>,
                'right',
              )}
              {iconTooltip(
                p('add'),
                <ToggleGroupItem value="add" aria-label={p('add')}>
                  <Plus />
                </ToggleGroupItem>,
                'right',
              )}
              {iconTooltip(
                p('perspective'),
                <ToggleGroupItem
                  value="perspective"
                  aria-label={p('perspective')}
                >
                  <Frame />
                </ToggleGroupItem>,
                'right',
              )}
              {iconTooltip(
                p('repairBrush'),
                <ToggleGroupItem value="repair" aria-label={p('repairBrush')}>
                  <Paintbrush />
                </ToggleGroupItem>,
                'right',
              )}
              {iconTooltip(
                p('restoreBrush'),
                <ToggleGroupItem value="restore" aria-label={p('restoreBrush')}>
                  <Eraser />
                </ToggleGroupItem>,
                'right',
              )}
            </ToggleGroup>
            <Separator />
            {iconTooltip(
              p('redraw'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={p('redraw')}
                onClick={() => run('detect', [page.id])}
              >
                <ScanText />
              </Button>,
              'right',
            )}
            {iconTooltip(
              p('batchDetect'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={p('batchDetect')}
                onClick={() =>
                  run(
                    'detect',
                    book.pages.map((item) => item.id),
                  )
                }
              >
                <Files />
              </Button>,
              'right',
            )}
            {iconTooltip(
              p('retranslate'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={p('retranslate')}
                onClick={() => run('translate', [page.id])}
              >
                <Languages />
              </Button>,
              'right',
            )}
            <Separator />
            {iconTooltip(
              t('suite.delete'),
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.delete')}
                disabled={!selected.length}
                onClick={removeRegion}
              >
                <Trash2 />
              </Button>,
              'right',
            )}
          </aside>
        )}
        {!editing && (
          <aside className="comic-workflow__settings">
            <h2>{p('translation')}</h2>
            <FieldGroup>
              <LanguageDirectionSelect
                source={book.config.sourceLanguage}
                target={book.config.targetLanguage}
                sourceCodes={['auto', 'ja', 'en', 'ko', 'zh', 'zh-Hant']}
                targetCodes={['zh', 'zh-Hant', 'en', 'ja', 'ko']}
                onSourceChange={(sourceLanguage) =>
                  saveComicBook({
                    ...book,
                    config: { ...book.config, sourceLanguage },
                  })
                }
                onTargetChange={(targetLanguage) =>
                  saveComicBook({
                    ...book,
                    config: { ...book.config, targetLanguage },
                  })
                }
              />
              <ComicChoiceField
                id="comic-workflow-mode"
                label={p('mode')}
                value={workflow}
                items={workflows.map((value) => ({ value, label: p(value) }))}
                onChange={(value) => setWorkflow(value as ComicWorkflow)}
              />
              <ComicChoiceField
                id="comic-workflow-range"
                label={p('range')}
                value={range}
                items={selectedRangeItems}
                onChange={setRange}
              />
              {range === 'pages' && (
                <Field data-invalid={pageNumberError || undefined}>
                  <FieldLabel htmlFor="comic-page-numbers">
                    {p('pageNumbers')}
                  </FieldLabel>
                  <Input
                    id="comic-page-numbers"
                    value={pageNumbers}
                    aria-invalid={pageNumberError}
                    onChange={(event) => setPageNumbers(event.target.value)}
                    onBlur={() => {
                      if (pageNumberError)
                        notifyError(t('suite.invalidPageRange'))
                    }}
                  />
                </Field>
              )}
              <GlossarySelectionField
                value={book.config.glossary ?? { mode: 'auto' }}
                onChange={(glossary) =>
                  saveComicBook({
                    ...book,
                    config: { ...book.config, glossary },
                  })
                }
              />
              <WordRuleSelectionField
                value={book.config.excludedSelection}
                showSettings={false}
                onChange={(excludedSelection) =>
                  updateConfig({ excludedSelection })
                }
              />
            </FieldGroup>
            <Separator />
            <h3>{p('style')}</h3>
            <FieldGroup className="comic-workflow__fields">
              {fontField(
                'comic-default-font',
                renderSettings.autoFont ? 'auto' : renderSettings.fontFamily,
                (fontFamily) =>
                  updateRender({
                    autoFont: fontFamily === 'auto',
                    ...(fontFamily !== 'auto' && { fontFamily }),
                  }),
              )}
              <Field>
                <FieldLabel htmlFor="comic-default-size">
                  {p('fontSize')}
                </FieldLabel>
                <Input
                  id="comic-default-size"
                  type="number"
                  min={6}
                  max={200}
                  placeholder={p('automatic')}
                  value={renderSettings.autoSize ? '' : renderSettings.fontSize}
                  onChange={(event) => {
                    const value = event.target.value
                    updateRender(
                      value === ''
                        ? { autoSize: true }
                        : {
                            autoSize: false,
                            fontSize: Math.max(1, Math.min(200, Number(value))),
                          },
                    )
                  }}
                  onBlur={() => {
                    if (!renderSettings.autoSize && renderSettings.fontSize < 6)
                      updateRender({ fontSize: 6 })
                  }}
                />
              </Field>
              <ComicChoiceField
                id="comic-default-direction"
                label={t('suite.direction')}
                value={renderSettings.direction}
                items={[
                  { value: 'auto', label: p('automatic') },
                  { value: 'vertical-rl', label: t('suite.vertical') },
                  { value: 'horizontal', label: t('suite.horizontal') },
                ]}
                onChange={(direction) =>
                  updateRender({
                    direction: direction as ComicRenderSettings['direction'],
                  })
                }
              />
              {numericField(
                p('lineSpacing'),
                renderSettings.lineSpacing,
                (lineSpacing) => updateRender({ lineSpacing }),
                0.5,
                3,
                0.1,
                {
                  enabled: renderSettings.autoLineSpacing,
                  change: (autoLineSpacing, lineSpacing) =>
                    updateRender({
                      autoLineSpacing,
                      ...(lineSpacing !== undefined && { lineSpacing }),
                    }),
                },
              )}
              <ComicChoiceField
                id="comic-default-align"
                label={p('lineAlign')}
                value={renderSettings.autoAlign ? 'auto' : renderSettings.align}
                items={(['auto', 'left', 'center', 'right'] as const).map(
                  (value) => ({
                    value,
                    label: value === 'auto' ? p('automatic') : p(value),
                  }),
                )}
                onChange={(align) =>
                  updateRender({
                    autoAlign: align === 'auto',
                    ...(align !== 'auto' && {
                      align: align as ComicRenderSettings['align'],
                    }),
                  })
                }
              />
              <ComicChoiceField
                id="comic-block-align"
                label={p('blockAlign')}
                value={blockAlign}
                items={(['auto', 'left', 'center', 'right'] as const).map(
                  (value) => ({
                    value,
                    label: value === 'auto' ? p('automatic') : p(value),
                  }),
                )}
                onChange={setBlockAlign}
              />
              <ComicChoiceField
                id="comic-fill-method"
                label={p('fillMethod')}
                value={repairMethod}
                items={[
                  { value: 'auto', label: p('automatic') },
                  { value: 'lama-manga', label: 'LaMa Manga' },
                  { value: 'telea', label: 'Telea' },
                  { value: 'solid', label: p('solidFill') },
                ]}
                onChange={setRepairMethod}
              />
              {repairMethod === 'solid' && (
                <Field>
                  <FieldLabel>{p('fillColor')}</FieldLabel>
                  <ColorPicker
                    label={p('fillColor')}
                    value={fillColor}
                    presets={[]}
                    onChange={setFillColor}
                  />
                </Field>
              )}
              <Field>
                <FieldLabel>{p('strokeColor')}</FieldLabel>
                <ColorPicker
                  label={p('strokeColor')}
                  value={renderSettings.strokeColor}
                  presets={[]}
                  onChange={(strokeColor) => updateRender({ strokeColor })}
                />
              </Field>
              {numericField(
                p('strokeWidth'),
                renderSettings.strokeWidth,
                (strokeWidth) => updateRender({ strokeWidth }),
                0,
                10,
                0.5,
              )}
            </FieldGroup>
            <Button
              variant="outline"
              onClick={() => {
                saveComicBook({
                  ...book,
                  pages: book.pages.map((item) => ({
                    ...item,
                    regions: item.regions.map((bubble) => ({
                      ...bubble,
                      style: {
                        ...bubble.style,
                        fontFamily: renderSettings.fontFamily,
                        autoFont: renderSettings.autoFont,
                        autoLineSpacing: renderSettings.autoLineSpacing,
                        autoAlign: renderSettings.autoAlign,
                        autoBlockAlign: renderSettings.autoBlockAlign,
                        autoFontSize: renderSettings.autoSize,
                        blockAlign: renderSettings.blockAlign,
                        ...(!renderSettings.autoSize && {
                          fontSize: renderSettings.fontSize,
                        }),
                        ...(renderSettings.direction !== 'auto' && {
                          direction: renderSettings.direction,
                        }),
                        lineSpacing: renderSettings.lineSpacing,
                        align: renderSettings.align,
                        strokeColor: renderSettings.strokeColor,
                        strokeWidth: renderSettings.strokeWidth,
                      },
                    })),
                  })),
                })
              }}
            >
              {p('applyAll')}
            </Button>
            <Button disabled={!targetPages.length} onClick={() => run()}>
              <Play data-icon="inline-start" />
              {range === 'failed' ? p('retryFailed') : modeTitle(workflow)}
            </Button>
          </aside>
        )}

        <main className="comic-workflow__main" ref={canvasRegion}>
          {!editing && (
            <div className="comic-workflow__preview-toolbar">
              <ToggleGroup
                value={[view]}
                onValueChange={(values) => {
                  if (values[0]) setView(values[0])
                }}
                aria-label={p('compare')}
              >
                <ToggleGroupItem value="original">
                  {p('source')}
                </ToggleGroupItem>
                <ToggleGroupItem value="translated">
                  {p('result')}
                </ToggleGroupItem>
                <ToggleGroupItem value="dual">{p('compare')}</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          <div
            className="comic-workflow__comparison"
            data-dual={view === 'dual'}
            data-layout={layout}
          >
            {view !== 'translated' && canvas(true)}
            {view !== 'original' && canvas(false)}
          </div>
        </main>

        {editing ? (
          <aside className="comic-workflow__inspector">
            {!region ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{p('noSelection')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <div className="comic-workflow__inspector-heading">
                  {iconTooltip(
                    p('previousBubble'),
                    <Button
                      variant="bare"
                      size="icon-sm"
                      aria-label={p('previousBubble')}
                      disabled={regionIndex <= 0}
                      onClick={() =>
                        selectRegion(page.regions[regionIndex - 1].id)
                      }
                    >
                      <ChevronLeft />
                    </Button>,
                  )}
                  <h2>
                    {p('bubble')} {regionIndex + 1} / {page.regions.length}
                  </h2>
                  {iconTooltip(
                    p('nextBubble'),
                    <Button
                      variant="bare"
                      size="icon-sm"
                      aria-label={p('nextBubble')}
                      disabled={
                        regionIndex < 0 ||
                        regionIndex >= page.regions.length - 1
                      }
                      onClick={() =>
                        selectRegion(page.regions[regionIndex + 1].id)
                      }
                    >
                      <ChevronRight />
                    </Button>,
                  )}
                </div>
                <Tabs
                  defaultValue="text"
                  className="comic-workflow__inspector-tabs"
                >
                  <TabsList>
                    <TabsTrigger value="text">
                      <Type />
                      {p('text')}
                    </TabsTrigger>
                    <TabsTrigger value="style">
                      <Settings2 />
                      {p('style')}
                    </TabsTrigger>
                    <TabsTrigger value="bubbles">
                      <List />
                      {p('bubble')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="text">
                    <FieldGroup>
                      <Field>
                        <div className="comic-workflow__field-heading">
                          <FieldLabel htmlFor="comic-source-text">
                            {p('originalText')}
                          </FieldLabel>
                          {iconTooltip(
                            p('reocr'),
                            <Button
                              variant="bare"
                              size="icon-sm"
                              aria-label={p('reocr')}
                              onClick={() => run('ocr', [page.id], [region.id])}
                            >
                              <ScanText />
                            </Button>,
                          )}
                        </div>
                        <Textarea
                          id="comic-source-text"
                          value={region.sourceText}
                          onChange={(event) =>
                            changeRegion({
                              ...region,
                              sourceText: event.target.value,
                              manuallyEdited: true,
                            })
                          }
                          rows={3}
                          maxLength={20000}
                        />
                        <Button
                          variant="bare"
                          size="sm"
                          className="comic-workflow__kana-toggle"
                          aria-expanded={kana}
                          onClick={() => setKana((value) => !value)}
                        >
                          あ · 50
                        </Button>
                        {kana && (
                          <div className="comic-workflow__kana">
                            {[
                              ...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんっゃゅょー',
                            ].map((char, index) => (
                              <Button
                                variant="outline"
                                size="sm"
                                key={`${char}${index}`}
                                onClick={() =>
                                  changeRegion({
                                    ...region,
                                    sourceText: region.sourceText + char,
                                  })
                                }
                              >
                                {char}
                              </Button>
                            ))}
                          </div>
                        )}
                      </Field>
                      <Field>
                        <div className="comic-workflow__field-heading">
                          <FieldLabel htmlFor="comic-target-text">
                            {t('suite.translation')}
                          </FieldLabel>
                          {iconTooltip(
                            p('retranslate'),
                            <Button
                              variant="bare"
                              size="icon-sm"
                              aria-label={p('retranslate')}
                              onClick={() =>
                                run('translate', [page.id], [region.id])
                              }
                            >
                              <Languages />
                            </Button>,
                          )}
                        </div>
                        <Textarea
                          id="comic-target-text"
                          value={region.targetText ?? ''}
                          onChange={(event) =>
                            changeRegion({
                              ...region,
                              targetText: event.target.value,
                              manuallyEdited: true,
                            })
                          }
                          rows={3}
                          maxLength={20000}
                        />
                      </Field>
                    </FieldGroup>
                  </TabsContent>
                  <TabsContent value="style">
                    <section
                      className="comic-workflow__geometry"
                      aria-label={p('position')}
                    >
                      <h3>{p('position')}</h3>
                      <FieldGroup className="comic-workflow__geometry-fields">
                        {numericField(
                          'X',
                          region.x,
                          (x) => changeRegion({ ...region, x }),
                          0,
                          page.width - region.width,
                        )}
                        {numericField(
                          'Y',
                          region.y,
                          (y) => changeRegion({ ...region, y }),
                          0,
                          page.height - region.height,
                        )}
                        {numericField(
                          'W',
                          region.width,
                          (width) => changeRegion({ ...region, width }),
                          24,
                          page.width - region.x,
                        )}
                        {numericField(
                          'H',
                          region.height,
                          (height) => changeRegion({ ...region, height }),
                          24,
                          page.height - region.y,
                        )}
                      </FieldGroup>
                    </section>
                    <Separator />
                    {textStyleFields}
                    <div className="comic-workflow__actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => run('repair', [page.id], [region.id])}
                      >
                        {p('repair')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDialog('style')}
                      >
                        {p('batchStyle')}
                      </Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="bubbles">
                    <ol className="comic-workflow__bubble-list">
                      {page.regions.map((item, index) => (
                        <li key={item.id}>
                          <Button
                            variant={
                              selected.includes(item.id)
                                ? 'secondary'
                                : 'outline'
                            }
                            size="sm"
                            onClick={(event) =>
                              selectRegion(item.id, event.shiftKey)
                            }
                          >
                            {index + 1}.{' '}
                            {item.targetText || item.sourceText || '…'}
                          </Button>
                          <Button
                            variant="bare"
                            size="icon-sm"
                            aria-label={`${p('bubble')} ${index + 1} ↑`}
                            disabled={index === 0}
                            onClick={() => {
                              const regions = [...page.regions]
                              ;[regions[index - 1], regions[index]] = [
                                regions[index],
                                regions[index - 1],
                              ]
                              saveComicBook({
                                ...book,
                                pages: book.pages.map((item) =>
                                  item.id === page.id
                                    ? { ...item, regions }
                                    : item,
                                ),
                              })
                            }}
                          >
                            <ArrowUp />
                          </Button>
                        </li>
                      ))}
                    </ol>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </aside>
        ) : (
          <aside className="comic-workflow__thumbnails">
            <h2>{p('overview')}</h2>
            <div className="comic-workflow__thumbnail-list">
              {book.pages.map((item) => (
                <div
                  key={item.id}
                  className="comic-workflow__thumbnail"
                  data-selected={page.id === item.id}
                >
                  <button
                    type="button"
                    onClick={() => setPage(item.id)}
                    aria-label={`${p('page')} ${book.pages.indexOf(item) + 1}`}
                    aria-pressed={page.id === item.id}
                  >
                    <ComicFrontendImage
                      projectId={projectId}
                      page={item}
                      kind={item.hasRendered ? 'rendered' : 'source'}
                    />
                    <span>{book.pages.indexOf(item) + 1}</span>
                  </button>
                  <label>
                    <Checkbox.Root
                      className="comic-workflow__checkbox"
                      checked={selectedPages.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelectedPages((previous) =>
                          checked
                            ? [...previous, item.id]
                            : previous.filter((id) => id !== item.id),
                        )
                      }
                      aria-label={`${p('selectPage')} ${book.pages.indexOf(item) + 1}`}
                    >
                      <Checkbox.Indicator>
                        <Check />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <span>
                      {item.hasRendered ? t('suite.jobCompleted') : p('ready')}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open && !exporting) {
            setDialog(null)
          }
        }}
      >
        <DialogContent
          className={
            dialog === 'tasks'
              ? 'comic-workflow__dialog comic-workflow__queue-dialog'
              : 'comic-workflow__dialog'
          }
        >
          <DialogHeader>
            <DialogTitle>
              {dialog === 'discard' ? t('suite.discard') : dialog === 'settings'
                ? p('settings')
                : dialog === 'tasks'
                  ? p('tasks')
                  : dialog === 'style'
                    ? p('batchStyle')
                    : dialog === 'proof'
                      ? p('proofResult')
                      : t('suite.export')}
            </DialogTitle>
            <DialogCloseButton disabled={exporting} />
          </DialogHeader>
          <CardContent className="comic-workflow__dialog-content">
            {dialog === 'discard' && (
              <div className="comic-workflow__actions">
                <Button variant="outline" onClick={() => setDialog(null)}>{p('keep')}</Button>
                <Button variant="destructive" onClick={() => {
                  void discardComicSaves(projectId).then(() => setDialog(null)).catch(report)
                }}>{t('suite.discard')}</Button>
              </div>
            )}
            {dialog === 'settings' && (
              <Tabs defaultValue="translate">
                <TabsList>
                  <TabsTrigger value="translate">{p('normal')}</TabsTrigger>
                  <TabsTrigger value="vision">{p('visual')}</TabsTrigger>
                  <TabsTrigger value="proof">{p('proof')}</TabsTrigger>
                  <TabsTrigger value="ocr">{p('other')}</TabsTrigger>
                </TabsList>
                {['translate', 'vision', 'proof'].map((tab) => {
                  const modelKind = tab === 'translate' ? 'mt' : 'llm'
                  const modelKey =
                    tab === 'translate'
                      ? 'normalModel'
                      : tab === 'vision'
                        ? 'visualModel'
                        : 'proofModel'
                  const options = models.filter(
                    (model) => model.kind === modelKind,
                  )
                  return (
                    <TabsContent key={tab} value={tab}>
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor={`comic-model-${tab}`}>
                            {p('model')}
                          </FieldLabel>
                          <Select
                            items={[
                              { value: '', label: p('noModel') },
                              ...options.map((model) => ({
                                value: model.id,
                                label: model.name,
                              })),
                            ]}
                            value={
                              options.some(
                                (model) => model.id === book.config[modelKey],
                              )
                                ? book.config[modelKey]
                                : ''
                            }
                            onValueChange={(model) => {
                              if (model !== null)
                                saveComicBook({
                                  ...book,
                                  config: {
                                    ...book.config,
                                    [modelKey]: model,
                                  },
                                })
                            }}
                          >
                            <SelectTrigger id={`comic-model-${tab}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="">{p('noModel')}</SelectItem>
                              </SelectGroup>
                              <SelectGroup>
                                <SelectLabel>
                                  {t(`workbench.${modelKind}`)}
                                </SelectLabel>
                                {options.map((model) => {
                                  const isAvailable = callable.some(
                                    (item) =>
                                      item.id === model.id &&
                                      item.kind === modelKind,
                                  )
                                  return (
                                    <SelectItem
                                      key={model.id}
                                      value={model.id}
                                      disabled={!isAvailable}
                                    >
                                      <span className="flex w-full items-center justify-between gap-3">
                                        <span className="truncate">
                                          {model.name}
                                        </span>
                                        <Badge
                                          variant={
                                            isAvailable
                                              ? 'success'
                                              : 'secondary'
                                          }
                                        >
                                          {t(
                                            isAvailable
                                              ? 'workbench.modelAvailable'
                                              : 'workbench.modelNotStarted',
                                          )}
                                        </Badge>
                                      </span>
                                    </SelectItem>
                                  )
                                })}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        {tab === 'proof' && (
                          <ComicChoiceField
                            id="comic-rounds"
                            label={p('rounds')}
                            value={rounds}
                            items={['1', '2', '3'].map((value) => ({
                              value,
                              label: value,
                            }))}
                            onChange={setRounds}
                          />
                        )}
                      </FieldGroup>
                    </TabsContent>
                  )
                })}
                <TabsContent value="ocr">
                  <FieldGroup>
                    <ComicChoiceField
                      id="comic-ocr-engine"
                      label="OCR"
                      value={ocrEngine}
                      items={[
                        { value: 'auto', label: p('automatic') },
                        { value: 'manga-ocr', label: 'Manga OCR' },
                        { value: 'ppocr', label: 'PP-OCR' },
                      ]}
                      onChange={setOcrEngine}
                    />
                    <ComicChoiceField
                      id="comic-detector"
                      label={p('redraw')}
                      value={detector}
                      items={[
                        { value: 'auto', label: p('automatic') },
                        { value: 'ppocr', label: 'PP-OCR' },
                        { value: 'rtdetr', label: 'RT-DETR' },
                        { value: 'rfdetr-seg', label: 'RF-DETR Seg' },
                      ]}
                      onChange={setDetector}
                    />
                    <ComicChoiceField
                      id="comic-repair-method"
                      label={p('repair')}
                      value={repairMethod}
                      items={[
                        { value: 'auto', label: p('automatic') },
                        { value: 'lama-manga', label: 'LaMa Manga' },
                        { value: 'telea', label: 'Telea' },
                        { value: 'solid', label: p('solidFill') },
                      ]}
                      onChange={setRepairMethod}
                    />
                  </FieldGroup>
                </TabsContent>
              </Tabs>
            )}
            {dialog === 'export' && (
              <FieldGroup>
                <ComicChoiceField
                  id="comic-export-format"
                  label={t('suite.exportFormat')}
                  value={format}
                  items={exportKinds.map((value) => ({
                    value,
                    label:
                      value === 'images' ? 'ZIP · PNG' : value.toUpperCase(),
                  }))}
                  onChange={(value) => {
                    setFormat(value as ComicExportRequest['kind'])
                  }}
                />
                <ComicChoiceField
                  id="comic-export-range"
                  label={p('range')}
                  value={range}
                  items={selectedRangeItems}
                  onChange={setRange}
                />
                <div className="comic-workflow__export-summary">
                  <ComicFrontendImage projectId={projectId} page={page} />
                  <div>
                    <strong>{book.title}</strong>
                    <p>
                      {format.toUpperCase()} ·{' '}
                      {['png', 'jpg'].includes(format) ? 1 : targetPages.length}{' '}
                      {p('page')}
                    </p>
                  </div>
                </div>
                <Button
                  disabled={exporting || !targetPages.length}
                  onClick={() => void exportNow()}
                >
                  <Download data-icon="inline-start" />
                  {t('suite.export')}
                </Button>
              </FieldGroup>
            )}
            {dialog === 'tasks' &&
              (queueJobs.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{p('noTasks')}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="comic-workflow__queue" aria-label={p('tasks')}>
                  {queueJobs.map((job) => (
                    <li className="comic-workflow__queue-item" key={job.id}>
                      <Card size="sm" className="comic-workflow__queue-card">
                        <CardHeader className="comic-workflow__queue-heading">
                          <span
                            className="comic-workflow__queue-icon"
                            aria-hidden="true"
                          >
                            {job.status === 'failed' ? (
                              <RotateCcw />
                            ) : job.status === 'paused' ? (
                              <Pause />
                            ) : (
                              <Spinner />
                            )}
                          </span>
                          <div className="comic-workflow__queue-title">
                            <CardTitle>{modeTitle(job.kind)}</CardTitle>
                            <CardDescription>
                              {job.error
                                ? `${taskStatus(job.status)} · ${comicErrorMessage(job.error, p)}`
                                : taskStatus(job.status)}
                              {job.status !== 'failed' &&
                                ` · ${Math.round(job.progress)}%`}
                            </CardDescription>
                          </div>
                          <CardAction className="comic-workflow__queue-actions">
                            {['running', 'queued', 'paused'].includes(
                              job.status,
                            ) && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      variant="bare"
                                      size="icon-sm"
                                      aria-label={t(
                                        job.status === 'paused'
                                          ? 'suite.resume'
                                          : 'suite.pause',
                                      )}
                                      onClick={() => {
                                        void controlComicTask(
                                          job.id,
                                          job.status === 'paused'
                                            ? 'resume'
                                            : 'pause',
                                        ).catch(report)
                                      }}
                                    />
                                  }
                                >
                                  {job.status === 'paused' ? (
                                    <Play />
                                  ) : (
                                    <Pause />
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t(
                                    job.status === 'paused'
                                      ? 'suite.resume'
                                      : 'suite.pause',
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {job.status === 'failed' && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      variant="bare"
                                      size="icon-sm"
                                      aria-label={t('suite.retry')}
                                      onClick={() => {
                                        void controlComicTask(
                                          job.id,
                                          'retry',
                                        ).catch(report)
                                      }}
                                    />
                                  }
                                >
                                  <RotateCcw />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t('suite.retry')}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    variant="bare"
                                    size="icon-sm"
                                    aria-label={p('cancel')}
                                    onClick={() => {
                                      void controlComicTask(
                                        job.id,
                                        'cancel',
                                      ).catch(report)
                                    }}
                                  />
                                }
                              >
                                <X />
                              </TooltipTrigger>
                              <TooltipContent>{p('cancel')}</TooltipContent>
                            </Tooltip>
                          </CardAction>
                        </CardHeader>
                        {job.status !== 'failed' && (
                          <CardContent>
                            <Progress.Root
                              value={job.progress}
                              min={0}
                              max={100}
                              aria-label={modeTitle(job.kind)}
                              className="comic-workflow__queue-progress"
                            >
                              <Progress.Track className="comic-workflow__queue-track">
                                <Progress.Indicator className="comic-workflow__queue-indicator" />
                              </Progress.Track>
                            </Progress.Root>
                          </CardContent>
                        )}
                      </Card>
                    </li>
                  ))}
                </ul>
              ))}
            {dialog === 'style' && (
              <FieldGroup>
                <ComicChoiceField
                  id="comic-style-range"
                  label={p('range')}
                  value={range}
                  items={selectedRangeItems}
                  onChange={setRange}
                />
                {[
                  [p('font'), batchFont, setBatchFont],
                  [t('suite.textColor'), batchColor, setBatchColor],
                  [t('suite.direction'), batchDirection, setBatchDirection],
                ].map(([label, checked, setter]) => (
                  <Field key={label as string}>
                    <FieldLabel>{label as string}</FieldLabel>
                    <Switch
                      checked={checked as boolean}
                      onCheckedChange={setter as (value: boolean) => void}
                    >
                      <SwitchThumb />
                    </Switch>
                  </Field>
                ))}
                <Button
                  disabled={!region || !targetPages.length}
                  onClick={() => {
                    if (!region) return
                    saveComicBook({
                      ...book,
                      pages: book.pages.map((item) =>
                        !targetPages.includes(item.id)
                          ? item
                          : {
                              ...item,
                              regions: item.regions.map((bubble) => ({
                                ...bubble,
                                style: {
                                  ...bubble.style,
                                  ...(batchFont && {
                                    autoFont: region.style.autoFont,
                                    autoFontSize: region.style.autoFontSize,
                                    fontFamily: region.style.fontFamily,
                                    fontSize: region.style.fontSize,
                                  }),
                                  ...(batchColor && {
                                    color: region.style.color,
                                    strokeColor: region.style.strokeColor,
                                    strokeWidth: region.style.strokeWidth,
                                  }),
                                  ...(batchDirection && {
                                    autoAlign: region.style.autoAlign,
                                    autoBlockAlign: region.style.autoBlockAlign,
                                    autoLineSpacing:
                                      region.style.autoLineSpacing,
                                    direction: region.style.direction,
                                    align: region.style.align,
                                    lineSpacing: region.style.lineSpacing,
                                  }),
                                },
                              })),
                            },
                      ),
                    })
                    setDialog(null)
                  }}
                >
                  {p('batchStyle')}
                </Button>
              </FieldGroup>
            )}
            {dialog === 'proof' && (
              <div className="comic-workflow__task-list">
                {jobs
                  .find((job) => job.id === proofId)
                  ?.changes?.filter((change) => change.from !== change.to)
                  .map((change) => (
                    <div
                      key={change.id}
                      className="comic-workflow__proof-change"
                    >
                      <p>
                        <del>{change.from}</del>
                      </p>
                      <p>{change.to}</p>
                    </div>
                  ))}
                <div className="comic-workflow__actions">
                  <Button variant="outline" onClick={() => setDialog(null)}>
                    {p('keep')}
                  </Button>
                  <Button
                    onClick={() => {
                      if (proofId) {
                        const regions = book.pages.flatMap(
                          (item) => item.regions,
                        )
                        const conflicts = jobs
                          .find((job) => job.id === proofId)
                          ?.changes?.some(
                            (change) =>
                              change.from !== change.to &&
                              regions.find((region) => region.id === change.id)
                                ?.targetText !== change.from,
                          )
                        if (conflicts) {
                          notifyError(t('suite.revisionConflict'))
                          return
                        }
                        void applyComicProof(projectId, proofId)
                          .then(() => setDialog(null))
                          .catch(report)
                      }
                    }}
                  >
                    {p('adopt')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </DialogContent>
      </Dialog>
    </div>
  )
}
