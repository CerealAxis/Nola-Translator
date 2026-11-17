import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Checkbox } from '@base-ui/react/checkbox'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Languages,
  Minus,
  PanelRight,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useI18n } from '@/i18n'
import { PageHeader } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  dismissNotice,
  notifyError,
  notifySuccess,
} from '@/components/primitives/notify'
import type {
  ComicBridge,
  ComicImportRequest,
  ComicPage,
  ComicProject,
  ComicProjectSummary,
} from '../../../shared/comic'
import { comicApi, useComicImage } from './comic-data'
import { useComicPrototypeText } from './comic-prototype-copy'
import { comicErrorMessage } from './comic-errors'

const importLabels = {
  auto: 'suite.comicFiles',
  images: 'suite.imageFiles',
  folder: 'suite.folder',
  archive: 'suite.archive',
  pdf: 'suite.comicPdf',
  ebook: 'suite.comicEbook',
} as const

function BookCover({
  book,
  selected,
  selecting,
  onSelect,
  api,
}: {
  book: ComicProjectSummary
  selected: boolean
  selecting: boolean
  onSelect: (checked: boolean) => void
  api: ComicBridge
}) {
  const { t } = useI18n()
  const [image, setImage] = useState<string>()
  useEffect(() => {
    let active = true
    setImage(undefined)
    if (book.coverPageId)
      void api
        .thumbnail(book.id, book.coverPageId)
        .then((src) => {
          if (active) setImage(src)
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [api, book.id, book.coverPageId, book.updatedAt])
  return (
    <div className="comic-book-item" data-selecting={selecting || undefined}>
      <Tooltip>
        <TooltipTrigger
          delay={250}
          render={
            <a
              href={`#/comic-translation/${book.id}/reader`}
              aria-label={book.title}
              className="comic-book-cover"
              draggable={false}
              onClick={(event) => {
                if (selecting) {
                  event.preventDefault()
                  onSelect(!selected)
                }
              }}
            />
          }
        >
          {image ? (
            <img src={image} alt={book.title} draggable={false} />
          ) : (
            <BookOpen aria-hidden="true" />
          )}
        </TooltipTrigger>
        <TooltipContent>{book.title}</TooltipContent>
      </Tooltip>
      <Checkbox.Root
        className="comic-book-select"
        checked={selected}
        onCheckedChange={onSelect}
        aria-label={t('suite.comicSelectBook', { name: book.title })}
      >
        <Checkbox.Indicator>
          <Check />
        </Checkbox.Indicator>
      </Checkbox.Root>
    </div>
  )
}

function ReaderImage({
  projectId,
  page,
  kind,
  visible,
}: {
  projectId: string
  page: ComicPage
  kind: 'source' | 'rendered'
  visible: boolean
}) {
  if (!visible) return null
  return <LoadedReaderImage projectId={projectId} page={page} kind={kind} />
}
function LoadedReaderImage({
  projectId,
  page,
  kind,
}: {
  projectId: string
  page: ComicPage
  kind: 'source' | 'rendered'
}) {
  const image = useComicImage(
    projectId,
    page,
    kind === 'rendered' && !page.hasRendered && page.hasClean ? 'clean' : kind,
    4_000_000,
  )
  if (image.failed) return null
  return image.src ? (
    <img src={image.src} alt={page.name} draggable={false} />
  ) : (
    <Spinner />
  )
}

function ComicReader({
  projectId,
  pageId,
  api,
}: {
  projectId: string
  pageId?: string
  api: ComicBridge
}) {
  const { t } = useI18n(),
    p = useComicPrototypeText()
  const [project, setProject] = useState<ComicProject>()
  const [failed, setFailed] = useState(false)
  const [current, setCurrent] = useState(
    pageId ?? localStorage.getItem(`nola-comic-current-page:${projectId}`),
  )
  const [kind, setKind] = useState<'source' | 'rendered'>('source')
  const [zoom, setZoom] = useState<number | 'page' | 'width'>('page')
  const [zoomMenu, setZoomMenu] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [visible, setVisible] = useState(new Set<string>())
  const host = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const load = () =>
    api
      .openProject(projectId)
      .then((value) => {
        setProject(value)
        setFailed(false)
      })
      .catch((error) => {
        setFailed(true)
        notifyError(t('suite.actionFailed'), {
          cause: error,
          action: { label: t('suite.retry'), onPress: () => void load() },
        })
      })
  useEffect(() => {
    initialized.current = false
    void load()
    return api.onChanged((event) => {
      if (!event.projectId || event.projectId === projectId) void load()
    })
  }, [api, projectId])
  useLayoutEffect(() => {
    const node = host.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () =>
      setViewport({
        width: Math.max(0, node.clientWidth - 32),
        height: Math.max(0, node.clientHeight - 32),
      })
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [project?.id])
  const pageIndex = Math.max(
    0,
    project?.pages.findIndex((page) => page.id === current) ?? 0,
  )
  const page = project?.pages[pageIndex]
  const width = Math.max(
    1,
    ...(project?.pages.map((item) => item.width) ?? [1]),
  )
  const height = Math.max(
    1,
    ...(project?.pages.map((item) => item.height) ?? [1]),
  )
  const scale =
    typeof zoom === 'number'
      ? zoom
      : zoom === 'width'
        ? viewport.width / width
        : Math.min(viewport.width / width, viewport.height / height)
  const jump = (index: number) => {
    const item =
      project?.pages[
        Math.max(0, Math.min((project?.pages.length ?? 1) - 1, index))
      ]
    if (!item) return
    setCurrent(item.id)
    localStorage.setItem(`nola-comic-current-page:${projectId}`, item.id)
    const node = host.current?.querySelector<HTMLElement>(
      `[data-page-id="${item.id}"]`,
    )
    if (node && host.current)
      host.current.scrollTop =
        node.offsetTop -
        (host.current.querySelector<HTMLElement>('[data-page-id]')?.offsetTop ??
          0)
  }
  useLayoutEffect(() => {
    if (project && scale > 0 && !initialized.current) {
      initialized.current = true
      jump(pageIndex)
    }
  }, [project, scale])
  useEffect(() => {
    const node = host.current
    if (!node || !project || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible((previous) => {
          const next = new Set(previous)
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.pageId!
            if (entry.isIntersecting) next.add(id)
            else next.delete(id)
          }
          return next
        }),
      { root: node, rootMargin: '100% 0px' },
    )
    node
      .querySelectorAll('[data-page-id]')
      .forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [project?.id, project?.pages.length])
  if (failed && !project) return null
  if (!project)
    return <Spinner role="status" aria-label={t('common.loading')} />
  return (
    <div className="comic-page comic-page--workspace comic-page--reader">
      <section className="comic-canvas">
        <div className="comic-canvas__toolbar">
          <div className="comic-toolbar-group">
            <Button
              variant="bare"
              size="icon-sm"
              aria-label={t('suite.bookshelf')}
              onClick={() => {
                location.hash = '/comic-translation'
              }}
            >
              <ArrowLeft />
            </Button>
            <ToggleGroup
              className="comic-layer-toggle"
              aria-label={t('suite.comicLayer')}
              value={[kind]}
              onValueChange={(values) => {
                if (values[0]) setKind(values[0] as typeof kind)
              }}
            >
              <ToggleGroupItem value="source">
                {t('suite.sourceImage')}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="rendered"
                disabled={
                  !project.pages.some(
                    (item) => item.hasRendered || item.hasClean,
                  )
                }
              >
                {t('suite.translatedImage')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="comic-toolbar-center">
            <div className="comic-toolbar-group comic-toolbar-controls">
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.comicZoomOut')}
                onClick={() => setZoom(Math.max(0.1, scale / 1.2))}
              >
                <Minus />
              </Button>
              <Input
                className="comic-toolbar-edit"
                aria-label={t('suite.comicZoomValue')}
                type="number"
                min={10}
                max={800}
                value={Math.max(10, Math.round(scale * 100))}
                onChange={(event) => {
                  if (event.target.value)
                    setZoom(
                      Math.min(
                        8,
                        Math.max(0.1, event.target.valueAsNumber / 100),
                      ),
                    )
                }}
              />
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.comicZoomIn')}
                onClick={() => setZoom(Math.min(8, scale * 1.2))}
              >
                <Plus />
              </Button>
              <Popover open={zoomMenu} onOpenChange={setZoomMenu}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="bare"
                      size="icon-sm"
                      aria-label={t('suite.comicZoomMode')}
                    />
                  }
                >
                  <PanelRight />
                </PopoverTrigger>
                <PopoverContent className="comic-action-menu">
                  {(['width', 'page', 1] as const).map((value) => (
                    <Button
                      key={value}
                      variant="bare"
                      size="sm"
                      onClick={() => {
                        setZoom(value)
                        setZoomMenu(false)
                      }}
                    >
                      {t(
                        value === 'width'
                          ? 'suite.comicFitWidth'
                          : value === 'page'
                            ? 'suite.comicFitPage'
                            : 'suite.comicOriginalScale',
                      )}
                    </Button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <div className="comic-toolbar-group comic-toolbar-controls">
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.previous')}
                disabled={pageIndex === 0}
                onClick={() => jump(pageIndex - 1)}
              >
                <ChevronLeft />
              </Button>
              <Input
                className="comic-toolbar-edit"
                type="number"
                min={1}
                max={project.pages.length}
                value={pageIndex + 1}
                aria-label={t('suite.comicJumpToPage')}
                onChange={(event) => {
                  if (event.target.value) jump(event.target.valueAsNumber - 1)
                }}
              />
              <span className="nola-caption">/{project.pages.length}</span>
              <Button
                variant="bare"
                size="icon-sm"
                aria-label={t('suite.next')}
                disabled={pageIndex >= project.pages.length - 1}
                onClick={() => jump(pageIndex + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="comic-toolbar-group comic-toolbar-end">
            <Button
              size="sm"
              disabled={!page}
              onClick={() => {
                if (page)
                  localStorage.setItem(
                    `nola-comic-current-page:${project.id}`,
                    page.id,
                  )
                location.hash = `/comic-translation/${project.id}`
              }}
            >
              <BookOpen data-icon="inline-start" />
              {p('startTranslation')}
            </Button>
          </div>
        </div>
        <div
          ref={host}
          className="comic-canvas__scroll"
          data-reader
          data-contained-reader
          role="region"
          aria-label={t('suite.comicCanvas')}
          tabIndex={0}
          onKeyDown={(event) => {
            if ((event.target as HTMLElement).closest('input')) return
            if (event.key === 'ArrowRight') jump(pageIndex + 1)
            if (event.key === 'ArrowLeft') jump(pageIndex - 1)
          }}
          onScroll={() => {
            const node = host.current
            if (!node) return
            const children = Array.from(
              node.querySelectorAll<HTMLElement>('[data-page-id]'),
            )
            const line = node.scrollTop + node.clientHeight / 2
            const item =
              children.find(
                (child) => child.offsetTop + child.offsetHeight > line,
              ) ?? children.at(-1)
            if (item?.dataset.pageId && item.dataset.pageId !== current) {
              setCurrent(item.dataset.pageId)
              localStorage.setItem(
                `nola-comic-current-page:${projectId}`,
                item.dataset.pageId,
              )
            }
          }}
        >
          {project.pages.map((item, index) => (
            <div
              key={item.id}
              className="comic-canvas__image"
              data-page-id={item.id}
              style={{
                aspectRatio: `${item.width} / ${item.height}`,
                width: `${item.width * Math.max(0.01, scale)}px`,
              }}
            >
              <ReaderImage
                projectId={projectId}
                page={item}
                kind={kind}
                visible={
                  visible.has(item.id) || Math.abs(index - pageIndex) <= 1
                }
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function ComicTranslationPage({
  projectId,
  pageId,
  onQuick,
  api: suppliedApi,
}: {
  projectId?: string
  pageId?: string
  reader?: boolean
  onQuick?: () => void
  api?: ComicBridge
}) {
  const { t } = useI18n(),
    p = useComicPrototypeText()
  const api = suppliedApi ?? comicApi()
  const [books, setBooks] = useState<ComicProjectSummary[]>()
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false),
    [busy, setBusy] = useState(false)
  const [title, setTitle] = useState(''),
    [kind, setKind] = useState<ComicImportRequest['kind']>('auto')
  const [dpi, setDpi] = useState('200'),
    [first, setFirst] = useState('1'),
    [last, setLast] = useState(''),
    [firstFrame, setFirstFrame] = useState(false)
  const load = () =>
    api
      .listProjects()
      .then((value) => {
        setBooks(value)
        setFailed(false)
      })
      .catch((error) => {
        setFailed(true)
        notifyError(t('suite.actionFailed'), {
          cause: error,
          action: { label: t('suite.retry'), onPress: () => void load() },
        })
      })
  useEffect(() => {
    if (projectId) return
    void load()
    return api.onChanged(() => {
      void load()
    })
  }, [api, projectId])
  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      notifyError(comicErrorMessage(error, p) || t('suite.actionFailed'), {
        cause: error,
      })
    } finally {
      setBusy(false)
    }
  }
  if (projectId)
    return <ComicReader projectId={projectId} pageId={pageId} api={api} />
  return (
    <div className="comic-page">
      <PageHeader
        title={t('suite.comicTitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            {onQuick && (
              <Button variant="outline" onClick={onQuick}>
                <Languages data-icon="inline-start" />
                {p('preview')}
              </Button>
            )}
            <Button disabled={busy} onClick={() => setImporting(true)}>
              <FolderInput data-icon="inline-start" />
              {t('suite.importComic')}
            </Button>
            {!!selected.length && (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const ids = [...selected]
                    await api.deleteProjects(ids)
                    setSelected([])
                    await load()
                    const notice = notifySuccess(
                      t('suite.comicBooksDeleted', { count: ids.length }),
                      {
                        duration: 10000,
                        action: {
                          label: t('suite.comicUndoDelete'),
                          onPress: () => {
                            void act(async () => {
                              await api.restoreProjects(ids)
                              await load()
                              dismissNotice(notice)
                            })
                          },
                        },
                      },
                    )
                  })
                }
              >
                <Trash2 data-icon="inline-start" />
                {t('suite.delete')}
              </Button>
            )}
          </div>
        }
      />
      {failed && !books ? null : !books ? (
        <Spinner />
      ) : (
        <>
          {!!books.length && (
            <InputGroup>
              <InputGroupInput
                aria-label={t('suite.search')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
            </InputGroup>
          )}
          {!books.length && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('suite.emptyBookshelf')}</EmptyTitle>
              </EmptyHeader>
              <Button onClick={() => setImporting(true)}>
                {t('suite.importComic')}
              </Button>
            </Empty>
          )}
          <div className="comic-bookshelf">
            {books
              .filter((book) =>
                book.title
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
              )
              .map((book) => (
                <BookCover
                  key={book.id}
                  book={book}
                  api={api}
                  selected={selected.includes(book.id)}
                  selecting={!!selected.length}
                  onSelect={(checked) =>
                    setSelected((previous) =>
                      checked
                        ? [...previous, book.id]
                        : previous.filter((id) => id !== book.id),
                    )
                  }
                />
              ))}
          </div>
        </>
      )}
      <Dialog
        open={importing}
        onOpenChange={(open) => {
          if (!busy) setImporting(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('suite.importComic')}</DialogTitle>
            <DialogCloseButton disabled={busy} />
          </DialogHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void act(async () => {
                  const result = await api.importProject({
                    kind,
                    ...(title.trim() && { title: title.trim() }),
                    ...(kind === 'pdf'
                      ? {
                          pdfDpi: Number(dpi),
                          firstPage: Number(first),
                          ...(last && { lastPage: Number(last) }),
                        }
                      : { firstFrame }),
                  })
                  if (result) {
                    setImporting(false)
                    location.hash = `/comic-translation/${result.id}`
                  }
                })
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="comic-import-title">
                    {t('suite.title')}
                  </FieldLabel>
                  <Input
                    id="comic-import-title"
                    value={title}
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="comic-import-kind">
                    {t('suite.importKind')}
                  </FieldLabel>
                  <Select
                    value={kind}
                    onValueChange={(value) => {
                      if (value) setKind(value as typeof kind)
                    }}
                  >
                    <SelectTrigger id="comic-import-kind">
                      <SelectValue>{t(importLabels[kind])}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(
                          Object.keys(
                            importLabels,
                          ) as ComicImportRequest['kind'][]
                        ).map((value) => (
                          <SelectItem value={value} key={value}>
                            {t(importLabels[value])}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {kind === 'pdf' ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="comic-dpi">
                        {t('suite.pdfDpi')}
                      </FieldLabel>
                      <Input
                        id="comic-dpi"
                        type="number"
                        required
                        min={72}
                        max={600}
                        value={dpi}
                        onChange={(event) => setDpi(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="comic-first">
                        {t('suite.firstPage')}
                      </FieldLabel>
                      <Input
                        id="comic-first"
                        type="number"
                        required
                        min={1}
                        value={first}
                        onChange={(event) => setFirst(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="comic-last">
                        {t('suite.lastPage')}
                      </FieldLabel>
                      <Input
                        id="comic-last"
                        type="number"
                        min={Number(first)}
                        value={last}
                        onChange={(event) => setLast(event.target.value)}
                      />
                    </Field>
                  </>
                ) : (
                  <Field>
                    <FieldLabel htmlFor="comic-first-frame">
                      {t('suite.firstFrame')}
                    </FieldLabel>
                    <Switch
                      id="comic-first-frame"
                      checked={firstFrame}
                      onCheckedChange={setFirstFrame}
                    >
                      <SwitchThumb />
                    </Switch>
                  </Field>
                )}
              </FieldGroup>
              <Button type="submit" disabled={busy}>
                {busy && <Spinner data-icon="inline-start" />}
                {t('suite.importComic')}
              </Button>
            </form>
          </CardContent>
        </DialogContent>
      </Dialog>
    </div>
  )
}
