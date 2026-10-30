import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'

import { AlertTriangle, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyTitle } from '@/components/ui/empty'

import { configurationOf } from '../../../shared/model-capabilities'
import { ModelConfigurationDialog } from './ModelConfigurationDialog'
import { DownloadSourceDialog } from './DownloadSourceDialog'
/** Hub metadata hits arrive before the README card or any runtime inspection finishes. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { HubModelSummary, HubSearchResult, ModelDownloadSource, ResourceRecord } from '@/bridge'
import { actions, stores, useStore } from '@/store'
import type { HubKind } from '@/store'
import { useI18n } from '@/i18n'
import { dismissNotice, notifyError, notifyRetryableFailure, notifySuccess } from '@/components/primitives/notify'
import type { NotifyAction } from '@/components/primitives/notify'
import { ModelCard, ModelCardSkeleton, formatBytes } from './ModelCard'
import { notifyModelDownloadFailure } from './ModelDownloadNotice'

const SEARCH_DEBOUNCE_MS = 250
const searchCache = new Map<string, { expires: number; request: Promise<HubSearchResult> }>()
/**
 * The notice that is on screen. It lives outside the tab: every search that fails raises
 * a notice, and an error notice never leaves on its own, so the one that is on screen is
 * taken down first and a hub that stays unreachable leaves one notice instead of a stack.
 */
let searchNotice: string | null = null
type Filter = 'all' | 'asr' | 'mt' | 'quant'
export interface HubHit { summary: HubModelSummary; kind: HubKind }

/**
 * Takes the failure notice off the screen. A search the user asked for again has either
 * replaced the results or failed again, and a notice that never leaves would then describe
 * a screen that no longer shows the failure.
 */
function clearFailureNotice() {
  if (!searchNotice) return
  dismissNotice(searchNotice)
  searchNotice = null
}

export function mergeHubResults(entries: readonly { kind: HubKind; result: HubSearchResult }[]) {
  const hits: HubHit[] = []
  const seen = new Set<string>()
  let candidates = 0
  let rateLimited = false
  for (const { kind, result } of entries) {
    candidates += result.candidates
    rateLimited ||= result.rateLimited
    for (const summary of result.models) {
      if (seen.has(summary.repo)) continue
      seen.add(summary.repo)
      hits.push({ summary, kind })
    }
  }
  return { hits, candidates, rateLimited }
}

export function installSlotOf(hit: HubHit): 'recognition' | 'translation' {
  return hit.summary.compatibility?.slot
    ?? (hit.summary.pipelineTag === 'automatic-speech-recognition' || hit.kind === 'asr'
      ? 'recognition' : 'translation')
}

function repoName(repo: string) { return repo.slice(repo.indexOf('/') + 1) }

export function hubCardRecord(hit: HubHit): ResourceRecord {
  const { summary } = hit
  return {
    resourceId: summary.resourceId,
    kind: installSlotOf(hit) === 'translation' ? 'translationModel' : 'recognitionModel',
    provider: summary.compatibility?.adapterId ?? summary.libraryName ?? 'huggingface',
    name: repoName(summary.repo),
    description: summary.description ?? '',
    languages: summary.compatibility?.languages ?? [],
    installed: summary.installed,
    installedBytes: 0,
    downloadBytes: summary.downloadBytes,
    state: 'idle',
    cancellable: false,
  }
}

function searchKey(query: string, kind: HubKind, cursor?: string) {
  return JSON.stringify([kind, query.trim(), cursor ?? ''])
}

function search(query: string, kind: HubKind, cursor?: string): Promise<HubSearchResult> {
  const key = searchKey(query, kind, cursor)
  const saved = searchCache.get(key)
  if (saved && saved.expires > Date.now()) return saved.request
  const request = cursor
    ? actions.models.searchHub(query.trim(), kind, cursor)
    : actions.models.searchHub(query.trim(), kind)
  searchCache.set(key, { expires: Date.now() + 60_000, request })
  if (searchCache.size > 24) searchCache.delete(searchCache.keys().next().value!)
  request.catch(() => { if (searchCache.get(key)?.request === request) searchCache.delete(key) })
  return request
}

/** Fill the viewport using the actual grid columns and card height. */
function SearchSkeletons() {
  const grid = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(12)
  useEffect(() => {
    const element = grid.current
    if (!element) return
    const measure = () => {
      const style = getComputedStyle(element)
      const columns = style.gridTemplateColumns.split(' ').filter(Boolean).length || 3
      const height = element.firstElementChild?.getBoundingClientRect().height || 270
      const gap = Number.parseFloat(style.rowGap) || 16
      const visibleHeight = Math.max(height, window.innerHeight - element.getBoundingClientRect().top)
      setCount(columns * Math.max(2, Math.ceil(visibleHeight / (height + gap))))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  return <div ref={grid} className="models-grid" aria-busy="true">
    {Array.from({ length: count }, (_, index) => <ModelCardSkeleton key={index} withDetails />)}
  </div>
}

export interface HubSearchTabProps {
  onGoRecommended: () => void
}

export function HubSearchTab({ onGoRecommended }: HubSearchTabProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [configuring, setConfiguring] = useState<ResourceRecord | null>(null)
  const [downloadTarget, setDownloadTarget] = useState<HubHit | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [hits, setHits] = useState<HubHit[]>([])
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})
  const [refresh, setRefresh] = useState(0)
  const [detail, setDetail] = useState<HubHit | null>(null)
  const [awaiting, setAwaiting] = useState(true)
  const [failed, setFailed] = useState(false)
  const [nextCursor, setNextCursor] = useState<string>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const pagingRequest = useRef<number | null>(null)
  const resources = useStore(stores.models, (state) => state.resources)
  const busyIds = useStore(stores.models, (state) => state.busyIds)
  const kind: HubKind = filter === 'quant' ? 'quant' : filter
  /*
   * The translator changes with the interface language, and a search that is running
   * again because of it would replace the results the user is reading. The notice a
   * failure raises is written in the language of that moment, so the translator is
   * read through a ref instead.
   */
  const translate = useRef(t)
  useLayoutEffect(() => {
    translate.current = t
  }, [t])
  /*
   * Every search that fails raises a notice, and an error notice never leaves on its
   * own. The one that is on screen is taken down first, so a hub that stays unreachable
   * leaves one notice instead of a stack of them.
   */
  const reportFailure = useCallback((message: string, description: string, cause: unknown, action: NotifyAction) => {
    if (searchNotice) dismissNotice(searchNotice)
    searchNotice = notifyRetryableFailure(message, { cause, description, action })
  }, [])

  /*
   * A search the user asked for by hand — the retry in the failure notice. The search that
   * runs because the page opened or because the text changed puts its result in plain
   * sight, so only the one the user pressed a button for is announced.
   */
  const requested = useRef(false)
  const announceSuccess = useCallback(() => {
    clearFailureNotice()
    notifySuccess(t('common.refreshed'))
  }, [t])

  useEffect(() => {
    let cancelled = false
    const asked = requested.current
    requested.current = false
    generation.current += 1
    pagingRequest.current = null
    setAwaiting(true)
    setFailed(false)
    setNextCursor(undefined)
    setLoadingMore(false)
    setMoreFailed(false)
    const timer = setTimeout(() => {
      void search(query, kind).then((result) => {
        if (!cancelled) {
          setHits(mergeHubResults([{ kind, result }]).hits)
          setNextCursor(result.nextCursor)
          if (asked) {
            clearFailureNotice()
            notifySuccess(translate.current('common.refreshed'))
          }
        }
      }).catch((cause: unknown) => {
        if (cancelled) return
        setHits([])
        setFailed(true)
        reportFailure(translate.current('errors.searchFailed'), translate.current('errors.searchFailedDescription'), cause, {
          label: translate.current('errors.searchFailedAction'),
          onPress: () => { requested.current = true; setRefresh((value) => value + 1) },
        })
      }).finally(() => { if (!cancelled) setAwaiting(false) })
    }, SEARCH_DEBOUNCE_MS)
    return () => { cancelled = true; generation.current += 1; clearTimeout(timer) }
  }, [query, kind, refresh, reportFailure])

  // The notice that offers another page reaches the loader through a ref, so it always
  // asks for the page the list is on now.
  const loadMoreRef = useRef<() => void>(() => undefined)
  /*
   * `announce` is passed by the callers the user drives by hand: the button and the retry
   * in the failure notice. The pages the observer pulls in pass nothing and stay quiet.
   */
  const loadMore = useCallback((announce?: () => void) => {
    if (awaiting || failed || !nextCursor || pagingRequest.current !== null) return
    const currentGeneration = generation.current
    pagingRequest.current = currentGeneration
    setLoadingMore(true)
    setMoreFailed(false)
    void search(query, kind, nextCursor).then((result) => {
      if (generation.current !== currentGeneration) return
      setHits((previous) => {
        const seen = new Set(previous.map((hit) => hit.summary.repo))
        return [...previous, ...result.models.filter((summary) => {
          if (seen.has(summary.repo)) return false
          seen.add(summary.repo)
          return true
        }).map((summary) => ({ summary, kind }))]
      })
      setNextCursor(result.nextCursor === nextCursor ? undefined : result.nextCursor)
      announce?.()
    }).catch((cause: unknown) => {
      if (generation.current !== currentGeneration) return
      setMoreFailed(true)
      reportFailure(translate.current('models.loadMoreFailed'), translate.current('models.loadMoreFailedDescription'), cause, {
        label: translate.current('models.retry'),
        onPress: () => loadMoreRef.current(),
      })
    }).finally(() => {
      if (generation.current !== currentGeneration) return
      pagingRequest.current = null
      setLoadingMore(false)
    })
  }, [awaiting, failed, query, kind, nextCursor, reportFailure])
  useEffect(() => { loadMoreRef.current = () => loadMore(announceSuccess) }, [loadMore, announceSuccess])

  useEffect(() => {
    const element = bottom.current
    if (!element || awaiting || loadingMore || moreFailed || !nextCursor) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore()
    }, { root: element.closest('.nola-main'), rootMargin: '0px 0px 400px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [awaiting, loadingMore, moreFailed, nextCursor, loadMore])

  // Load introductions after cards are visible; old searches stop scheduling requests.
  useEffect(() => {
    if (awaiting) return
    let cancelled = false
    let cursor = 0
    const worker = async () => {
      while (!cancelled && cursor < hits.length) {
        const { summary } = hits[cursor++]
        if (summary.description || descriptions[summary.repo] !== undefined) continue
        try {
          const description = await actions.models.loadHubModelCard(summary.repo, summary.revision)
          if (!cancelled) setDescriptions((previous) => ({ ...previous, [summary.repo]: description }))
        } catch {
          if (!cancelled) setDescriptions((previous) => ({ ...previous, [summary.repo]: '' }))
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(4, hits.length) }, worker))
    return () => { cancelled = true }
  }, [hits, awaiting])

  const visible = useMemo(() => filter === 'quant'
    ? hits.filter(({ summary }) => summary.hasGguf || summary.formats?.includes('gguf'))
    : hits, [hits, filter])
  const filters = [
    { id: 'all', label: t('models.filterAll') },
    { id: 'asr', label: t('models.filterAsr') },
    { id: 'mt', label: t('models.filterMt') },
    { id: 'quant', label: t('models.filterQuant') },
  ]
  const install = (hit: HubHit) => {
    setDownloadTarget(hit)
  }
  /*
   * A failed install keeps its own way out: the retry in the notice starts the very
   * same download again, and a retry that fails reports itself the same way.
   */
  const installHub = (target: HubHit, source: ModelDownloadSource) => {
    void actions.models.installHubModel(target.summary.repo, installSlotOf(target), source).catch((cause: unknown) => {
      console.error('[models] hub install failed', cause)
      notifyModelDownloadFailure(
        t('models.downloadFailed'),
        t('errors.downloadFailed'),
        t('errors.downloadFailedAction'),
        () => installHub(target, source),
      )
    })
  }
  const descriptionOf = (summary: HubModelSummary) => summary.description
    ?? descriptions[summary.repo] ?? ''

  return <div className="flex flex-col gap-4">
    <DownloadSourceDialog record={downloadTarget ? {
      resourceId: `hub:${downloadTarget.summary.repo}`,
      name: downloadTarget.summary.repo,
    } : null} onClose={() => setDownloadTarget(null)} onSelect={source => {
      const target = downloadTarget
      setDownloadTarget(null)
      if (target) installHub(target, source)
    }} />
    {configuring ? <ModelConfigurationDialog key={configuring.resourceId} record={configuring} onClose={() => setConfiguring(null)} /> : null}
    <InputGroup>
      <InputGroupInput type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t('models.searchPlaceholder')} placeholder={t('models.searchPlaceholder')} />
      <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
    </InputGroup>
    <Alert variant="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{t('models.experimentalNoticeTitle')}</AlertTitle>
      <AlertDescription>
        {t('models.experimentalNoticeBody')}
        <Button variant="tertiary" size="sm" onClick={onGoRecommended}>{t('models.experimentalNoticeAction')}</Button>
      </AlertDescription>
    </Alert>
    <TabsRoot value={filter} onValueChange={value => { if (value) setFilter(value as Filter) }}>
      <TabsList className="model-search-filters" aria-label={t('modelsSettingsUi.filtersLabel')}>
        {filters.map(item => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
      </TabsList>
    </TabsRoot>
    {failed && !awaiting ? <p className="nola-caption text-muted">{t('errors.searchFailed')}</p> : null}
    {awaiting ? <SearchSkeletons /> : null}
    {!awaiting && !failed && !nextCursor && visible.length === 0 ? <Empty>
      <EmptyTitle>{t('models.noResults')}</EmptyTitle>
    </Empty> : null}
    {!awaiting && !failed && visible.length > 0 ? <div className="models-grid">
      {visible.map((hit) => {
        const summary = hit.summary
        const live = resources.find((item) => item.resourceId === summary.resourceId)
        const record = { ...(live ?? hubCardRecord(hit)), description: descriptionOf(summary) }
        const loadingDescription = !summary.description && descriptions[summary.repo] === undefined
        const liveId = live?.resourceId ?? summary.resourceId
        return <ModelCard key={summary.repo} record={record} className="models-card--hub"
          supportedEngines={summary.compatibility?.compatible
            ? [summary.compatibility.loader === 'llama.cpp' ? 'llama' : 'pytorch'] : undefined}
          descriptionLoading={loadingDescription}
          descriptionFallback={t('models.noDescription')}
          metadata={`${summary.author ?? summary.repo.split('/')[0]} · ${summary.formats?.includes('gguf') || summary.hasGguf ? 'GGUF' : 'PyTorch'}`}
          busy={busyIds.includes(liveId) || busyIds.includes(summary.repo)}
          isDefault={false} canBeDefault={false} onInstall={() => install(hit)}
          onCancel={() => { void actions.models.manageResource(liveId, 'cancel').catch((cause: unknown) => {
            notifyError(t('errors.engineOperationFailed'), { cause })
          }) }}
          onRemove={() => { void actions.models.manageResource(liveId, 'remove').catch((cause: unknown) => {
            notifyError(t('modelsSettingsUi.removeFailed'), { cause })
          }) }}
          onSetDefault={() => undefined}
          footer={<div className="flex flex-wrap gap-[var(--space-1)]">{live?.installed ? <Button variant="secondary" onClick={() => setConfiguring(live)}>{t(configurationOf(live) ? 'modelConfig.edit' : 'modelConfig.configure')}</Button> : null}<Button variant="secondary" size="sm" onClick={() => setDetail(hit)}>
            {t('models.openDetails')}
          </Button></div>} />
      })}
    </div> : null}
    {!awaiting && !failed ? <div ref={bottom} className="models-search__pagination" aria-live="polite">
      {nextCursor ? <Button disabled={loadingMore} aria-busy={loadingMore} variant="tertiary"  onClick={() => loadMore(announceSuccess)}>{loadingMore ? <Spinner /> : null}
        {loadingMore ? t('common.loading') : moreFailed ? t('models.retry') : t('models.loadMore')}
      </Button> : visible.length > 0 ? <p className="nola-caption text-muted">{t('models.noMoreResults')}</p> : null}
    </div> : null}
    <DetailDrawer hit={detail} description={detail ? descriptionOf(detail.summary) : ''}
      onClose={() => setDetail(null)} onInstall={install} />
  </div>
}

export function DetailDrawer({ hit, description, onClose, onInstall }: {
  hit: HubHit | null; description: string; onClose: () => void; onInstall: (hit: HubHit) => void
}) {
  const { t } = useI18n()
  const summary = hit?.summary
  return <Dialog open={hit !== null} onOpenChange={(open) => !open && onClose()}>

      <DialogContent className="model-detail-drawer">
        <DialogHeader>
          <DialogTitle>{summary ? repoName(summary.repo) : t('models.details')}</DialogTitle>
        </DialogHeader>
        <DialogCloseButton aria-label={t('common.close')} />
        <div className="nola-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {summary ? <>
            <p className="nola-body text-muted">{description || t('models.noDescription')}</p>
            {summary.author ? <Row label={t('models.author')} value={summary.author} /> : null}
            {summary.pipelineTag ? <Row label={t('models.taskType')} value={summary.pipelineTag} /> : null}
            {summary.libraryName ? <Row label={t('models.loader')} value={summary.libraryName} /> : null}
            {summary.downloadBytes !== undefined ? <Row label={t('models.size')} value={formatBytes(summary.downloadBytes)} /> : null}
            <Row label={t('models.fileCount')} value={String(summary.fileCount)} />
            <a className="text-accent underline" href={`https://huggingface.co/${summary.repo}`} target="_blank" rel="noreferrer">
              {t('models.viewOnHub')}
            </a>
          </> : null}
        </div>
        <DialogFooter>{hit ? <Button variant="default" onClick={() => onInstall(hit)}>
          {t('models.install')}
        </Button> : null}</DialogFooter>
      </DialogContent>

  </Dialog>
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-4 border-b border-separator pb-2">
    <span className="nola-caption text-muted">{label}</span>
    <span className="nola-body-strong text-foreground tabular">{value}</span>
  </div>
}
