/**
 * HF 搜索。`SearchField` 通栏 + 兼容筛选 `TagGroup` + 结果网格 + 右侧 `Drawer` 详情。
 *
 * ==================== 「能不能装」由谁决定 ====================
 *
 * **引擎，每条命中一次。** `searchHuggingFace` 返回的每条 `HubModelSummary` 都带
 * `compatibility`：安装按钮的可用性读 `compatible`，禁用理由读 `reason`，
 * 详情抽屉里 `reasonCode`（机器码，配一句界面标签）与 `evidence`（架构、model_type、revision）
 * 都由它给。界面不再按仓库名推导任何东西。
 *
 * 这里**删掉**的那段推导曾经是这样的：把仓库名去掉 owner 段、去掉包装后缀
 * （gguf / hf / bin / safetensors / pt）、只留字母数字转小写，然后看它是不是某条本地记录
 * resourceId 的前缀。`facebook/m2m100_418M` 之所以能对上 `m2m100-418m`，
 * 靠的是"两边都去掉了下划线"这个约定，不是任何真实的兼容性声明；多档命中时它还会取目录
 * 顺序第一个，于是用户要 Q3 装到的是 Q4。引擎现在自己判定并把理由写在 `reason` 里，
 * 那套前缀匹配连同它的两条已知缺陷一起删掉了。
 *
 * =====================================================================
 *
 * 两条如实呈现的边界：
 *   · `candidates > hits.length` —— hub 列出的候选比引擎深检过的多（深检有硬上限 10，
 *     为的是守住匿名速率限制）。这不是全集，界面必须说出来。
 *   · `rateLimited` —— 深检途中被 429 打断，结果可能不完整。
 *
 * ==================== 搜索框是空的 ====================
 *
 * 空关键词**不是**「没搜」，是「浏览热门」：`search=` 传空时 Hugging Face 返回按下载量排的
 * 榜单。挂载时防抖 effect 就跑一次搜索（`query` 还是空串），所以进页面直接看到一屏模型，
 * 这是有意的默认内容，不是没加载完。
 *
 * 但它有个真实的副作用：一屏模型配上零说明，用户会以为这是搜出来的。`browsingHint` 那一句
 * 就是补这个说明的，而且只在**空关键词**时出现，一输入就消失。
 *
 * 空态**不**按 `browsing` 分叉：浏览态与搜索态共用一句普通的「没有匹配的记录」。热门榜装不上一条
 * 本来就是常态（见下面 compatible 过滤那段），给它单开一套"热门榜里没有能装的"文案，等于把
 * 同一个结果说成两件事，用户还得自己再翻译一次。
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Drawer, EmptyState, Label, SearchField, Tag, TagGroup, toast } from '@heroui/react'

import type { HubInspectResult, HubModelSummary, HubSearchResult, ResourceRecord } from '@/bridge'
import { actions, stores, useStore } from '@/store'
import type { HubKind } from '@/store'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { ModelCard, ModelCardSkeleton, formatBytes, factsOf } from './ModelCard'

/** 搜索防抖。与设置的 180ms 不同：这里是网络往返，250ms 才不至于每敲一下打一次。 */
const SEARCH_DEBOUNCE_MS = 250

const GRID = 'models-grid'

type Filter = 'all' | 'asr' | 'mt' | 'quant'

/** 量化档的字面量，纯 ASCII，所以不经过 i18n（i18n 存的是带中文的句子）。 */
const QUANT_TOKENS = ['q4_k_m', 'q3_k_m', 'ud-iq2_m', 'q4-k-m', 'q3-k-m', 'iq2-m', 'nf4', 'gguf']

/**
 * 引擎的判定码是机器码，给它配一句界面标签；表里没有的码原样显示 ——
 * 一个没见过的码本身就是"引擎比我们新"的信息，比编一句解释诚实。
 * 值写成字面量键（而不是拼字符串）是为了拼错时在编译期报错。
 */
const REASON_LABEL_KEY: Record<string, TranslationKey> = {
  adapterMatched: 'models.reasonCode.adapterMatched',
  llamaCppTranslationModel: 'models.reasonCode.llamaCppTranslationModel',
  noRegisteredAdapter: 'models.reasonCode.noRegisteredAdapter',
  unsupportedArchitecture: 'models.reasonCode.unsupportedArchitecture',
  llamaCppUnsupportedArchitecture: 'models.reasonCode.llamaCppUnsupportedArchitecture',
  ggufArchitectureUnknown: 'models.reasonCode.ggufArchitectureUnknown',
  slotUnsupportedForLoader: 'models.reasonCode.slotUnsupportedForLoader',
  ggufFileMissing: 'models.reasonCode.ggufFileMissing',
  hubNoPublishedDigest: 'models.reasonCode.hubNoPublishedDigest',
  whisperCppFormat: 'models.reasonCode.whisperCppFormat',
  hubGated: 'models.reasonCode.hubGated',
  hubPrivate: 'models.reasonCode.hubPrivate',
  repositoryInstallsDependencies: 'models.reasonCode.repositoryInstallsDependencies',
  missingRequiredFiles: 'models.reasonCode.missingRequiredFiles',
  missingWeights: 'models.reasonCode.missingWeights',
}

// -- 纯函数：命中 → 界面 --------------------------------------------------------

/** 一条命中 + 它是被哪次搜索带回来的。`kind` 只是安装 slot 的兜底，不是判定依据。 */
export interface HubHit {
  summary: HubModelSummary
  kind: HubKind
}

/**
 * 「全部」档要打两次搜索（asr + mt），这里把两个 `HubSearchResult` 并成一条列表。
 *
 * 同一条仓库可能被两次搜索各带一次（pipeline_tag 缺席时两边都会收），按 repo 去重。
 * `candidates` 相加、`rateLimited` 取或：截断与限流是"这次搜索没看全"，不能被平均掉。
 */
export function mergeHubResults(
  entries: readonly { kind: HubKind; result: HubSearchResult }[],
): { hits: HubHit[]; candidates: number; rateLimited: boolean } {
  const hits: HubHit[] = []
  const seen = new Set<string>()
  let candidates = 0
  let rateLimited = false
  for (const { kind, result } of entries) {
    candidates += result.candidates
    if (result.rateLimited) rateLimited = true
    for (const summary of result.models) {
      if (seen.has(summary.repo)) continue
      seen.add(summary.repo)
      hits.push({ summary, kind })
    }
  }
  return { hits, candidates, rateLimited }
}

/**
 * 安装时给的 slot。引擎判定里带了 `slot` 就用它；没带时按这条命中是被哪次搜索带回来的兜底 ——
 * 搜索 kind 是我们自己发出去的请求，比"猜"可靠。
 */
export function installSlotOf(hit: HubHit): 'recognition' | 'translation' {
  return hit.summary.compatibility.slot ?? (hit.kind === 'mt' ? 'translation' : 'recognition')
}

/** 仓库名去掉 owner 段。`facebook/m2m100_418M` → `m2m100_418M`。 */
function repoName(repo: string): string {
  return repo.includes('/') ? repo.slice(repo.indexOf('/') + 1) : repo
}

/**
 * 把一条命中映成 `ModelCard` 吃的那条记录，这样搜索结果不必另写一套卡片。
 *
 * `description` 用引擎的 `reason`：装不了时它就是禁用理由，装得了时它说明"用谁来跑"。
 * `provider` 走适配器 id / 加载器，读不到才落到通用值 —— `ModelMark` 认 `hub:` 前缀，
 * 所以品牌图标是按仓库名解析的，不依赖这个字段。
 */
export function hubCardRecord(hit: HubHit): ResourceRecord {
  const { summary } = hit
  const compatibility = summary.compatibility
  const translation = compatibility.slot === 'translation' || hit.kind === 'mt'
  return {
    resourceId: summary.resourceId,
    kind: translation ? 'translationModel' : 'recognitionModel',
    provider: compatibility.adapterId ?? compatibility.loader ?? 'huggingface',
    name: repoName(summary.repo),
    description: compatibility.reason,
    languages: compatibility.languages,
    installed: summary.installed,
    installedBytes: 0,
    downloadBytes: summary.downloadBytes,
    state: 'idle',
    cancellable: false,
  }
}

// -- 组件 ---------------------------------------------------------------------

export function HubSearchTab() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [hits, setHits] = useState<HubHit[]>([])
  const [candidates, setCandidates] = useState(0)
  const [rateLimited, setRateLimited] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [detail, setDetail] = useState<HubHit | null>(null)
  /*
   * 这一轮搜索（防抖 + 两次并发合并）还没 settle。初值是 true：挂载首帧搜索就已经在途，
   * 先渲染一次空态再切骨架屏，用户会看到一闪而过的「没有匹配的记录」。
   */
  const [awaiting, setAwaiting] = useState(true)

  /*
   * 浏览态 = 搜索框为空。空关键词走 HF 的热门榜，是期望行为，所以这里只决定"说不说"。
   * 用 trim 判：全空格不是用户想搜的东西，界面已经这么判了，主进程原样转发即可。
   */
  const browsing = query.trim().length === 0

  const loading = useStore(stores.models, (state) => state.hub.loading)
  const failed = useStore(stores.models, (state) => state.hub.failed)
  const resources = useStore(stores.models, (state) => state.resources)
  const busyIds = useStore(stores.models, (state) => state.busyIds)

  /*
   * store 的 `hub.loading` 会被并发的两次搜索里先返回的那次提前清掉（见下面 effect 的注释），
   * 拿来当渲染判据会在两次搜索之间插进一段假空态。取两者的并：本轮在飞（awaiting）
   * 或 store 认为在飞，都算在飞。
   */
  const busy = loading || awaiting

  /*
   * 每次输入都往 bridge 打一次请求是没必要的。`searchHub` 自己会把 query / kind / loading
   * 写进 store，界面只需要等它 settle。
   *
   * 但 `hub.loading` **不能**直接当"这一次搜索还在飞"用，两个原因，都是实测出来的：
   *   1. 「全部」档并发两次 `searchHub`，而它们共用 store 里那一个布尔。先 settle 的那次
   *      （asr 通常快一点）把它置回 false，可第二次（mt）还在深检 —— 实测这段时间有 12 秒，
   *      界面已经不在 loading，而 `hits` 要等 `Promise.all` 才写，于是中间渲染出一句
   *      「没有匹配的记录」。那是假的：搜没完，是两次没合并。
   *   2. 挂载后有 `SEARCH_DEBOUNCE_MS` 的防抖，期间请求还没发，`hub.loading` 是 false 而
   *      `hits` 也是空，同样会闪一下假空态。
   * 所以在飞与否由这里自己的 `awaiting` 说了算：effect 一进入就是 true，`Promise.all`
   * settle 才回 false，整段生命周期都盖住。store 那个标志留给别处判断"最近一次请求的状态"。
   */
  useEffect(() => {
    let cancelled = false
    setAwaiting(true)
    const timer = setTimeout(() => {
      const kinds: HubKind[] = filter === 'asr' ? ['asr'] : filter === 'mt' ? ['mt'] : ['asr', 'mt']
      const request = Promise.all(
        kinds.map(async (kind) => ({ kind, result: await actions.models.searchHub(query, kind) })),
      )
      request
        .then((entries) => {
          if (cancelled) return
          const merged = mergeHubResults(entries)
          setHits(merged.hits)
          setCandidates(merged.candidates)
          setRateLimited(merged.rateLimited)
        })
        .catch(() => {
          // 失败已经写进 store 的 hub.failed，界面走下面的 Alert。
        })
        .finally(() => {
          // 被 cleanup 取消的那一轮不去改状态：新的一轮已经把自己标成在飞了。
          if (!cancelled) setAwaiting(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, filter, refresh])

  /*
   * 两种模式用**同一个判据**：都按 hub 给的顺序摆出来，**不按 `compatible` 过滤**。
   *
   * 引擎的判定一个字都没动 —— 它照样每条给 `compatible` / `reason`，`ModelCard` 照样据此
   * 禁用安装按钮并把理由写在卡片描述里。这里去掉的只是"把装不了的从列表里拿掉"这一步。
   *
   * 为什么先摆出来而不是只留能装的：HF 的 ASR 热门榜是 whisper / wav2vec2，MT 热门榜是
   * t5 / opus-mt，全是 encoder-decoder，而引擎只有 decoder-only 加载器，实测 20 条里 0 条能装。
   * 按 `compatible` 过滤的结果是"浏览态恒为空态" —— 打开搜索 Tab 等十几秒，看到的是
   * 「没有匹配的记录」。**先能显示**，代价是一屏禁用按钮；这个取舍是明知的，不是遗漏。
   *
   * 装不了的数量不靠"顺便也显示一下"解释，而是由截断提示里的"其中 N 个当前版本能安装"
   * 交代 —— 那个数取自 `hits`（全部判定过的条目），与列表是否过滤无关。
   */
  const visible = useMemo(() => {
    if (filter !== 'quant') return hits
    return hits.filter((hit) => {
      const { summary } = hit
      const haystack = `${summary.repo} ${summary.compatibility.reason} ${summary.ggufArchitecture ?? ''}`.toLowerCase()
      return QUANT_TOKENS.some((token) => haystack.includes(token))
    })
  }, [hits, filter])

  /*
   * 截断提示里要的那个数：**判定过**的条目里装得上的条数。它取自 `hits` 而不是 `visible` ——
   * 量化档会再砍一刀，但砍掉的是"符合量化档"而不是"装不装得上"，报装得上的真实条数才不撒谎。
   */
  const installable = useMemo(
    () => hits.filter((hit) => hit.summary.compatibility.compatible).length,
    [hits],
  )

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('models.filterAll') },
    { id: 'asr', label: t('models.filterAsr') },
    { id: 'mt', label: t('models.filterMt') },
    { id: 'quant', label: t('models.filterQuant') },
  ]

  /*
   * 已经装上（或正在装）的那个仓库，引擎会给它一条真实的 `ResourceRecord`，
   * id 与命中里的 `resourceId` 完全一致。找到它就把卡片换成那一条：进度、取消、卸载
   * 都由它自己的 state 驱动。这里是**按 id 相等**查表，不是按名字猜。
   */
  const liveRecordOf = (hit: HubHit): ResourceRecord | null =>
    resources.find((item) => item.resourceId === hit.summary.resourceId) ?? null

  const install = (hit: HubHit) => {
    if (!hit.summary.compatibility.compatible) return
    void actions.models.installHubModel(hit.summary.repo, installSlotOf(hit)).catch((error: unknown) => {
      // 失败原文是诊断串（主进程给的是中文说明），不直接上屏。
      console.error('[models] hub install failed', error)
      toast.danger(t('errors.downloadFailed'))
    })
  }

  const truncated = candidates > hits.length

  return (
    <div className="flex flex-col gap-4">
      <SearchField
        value={query}
        onChange={setQuery}
        fullWidth
        aria-label={t('models.searchPlaceholder')}
      >
        <Label className="models-search__label">{t('modelsSettingsUi.searchLabel')}</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={t('models.searchPlaceholder')} />
        </SearchField.Group>
      </SearchField>

      {/*
        TagGroup 的选中态给 input；Tag 上的 textValue 是中文 typeahead 的数据源，
        少了它按拼音搜不出来。
      */}
      <TagGroup
        aria-label={t('modelsSettingsUi.filtersLabel')}
        selectionMode="single"
        selectedKeys={new Set([filter])}
        onSelectionChange={(keys) => {
          const next = [...keys][0]
          if (typeof next === 'string') setFilter(next as Filter)
        }}
      >
        <TagGroup.List items={filters}>
          {(item) => <Tag id={item.id} textValue={item.label}>{item.label}</Tag>}
        </TagGroup.List>
      </TagGroup>

      {failed ? (
        <Card className="flex flex-row items-center gap-3 border border-border p-4">
          {/* 搜索失败不是下载失败：复用 errors.downloadFailed 会让用户以为问题出在下载上，
              而真正发生的事是「根本没搜到结果」——那会把「搜不了」读成「hub 上没有」。 */}
          <p className="nola-caption text-muted">{t('errors.searchFailed')}</p>
          <Button
            variant="tertiary"
            size="sm"
            className="rounded-[6px]"
            onPress={() => {
              setRefresh((value) => value + 1)
            }}
          >
            {t('errors.searchFailedAction')}
          </Button>
        </Card>
      ) : null}

      {/*
        截断与限流都摆在结果上面，而不是藏在详情里：把"只精检了 10 条"说成
        「没有匹配的记录」，用户会得到一个关于 Hugging Face 内容的错误结论。

        截断那句要带"其中几个能装"，因为列表已经按 compatible 过滤过：只报"检查了 20 个"，
        屏幕上却只有 2 张卡，这个差额没人能解释。
      */}
      {!failed && (truncated || rateLimited) ? (
        <Card className="flex flex-col gap-1 border border-border p-4">
          {truncated ? (
            <p className="nola-caption text-muted">
              {t('models.searchTruncated', { inspected: hits.length, installable, candidates })}
            </p>
          ) : null}
          {rateLimited ? <p className="nola-caption text-muted">{t('models.searchRateLimited')}</p> : null}
        </Card>
      ) : null}

      {busy ? (
        <div className="flex flex-col gap-3">
          {/*
            浏览态要多等十几秒（两次列表请求 + 最多二十次详情判定，逐个来），只给四个
            骨架屏不解释，用户会以为卡死了。说清楚"正在检查能不能装"和大概耗时，
            比一个转圈更实在。
          */}
          {browsing ? <p className="nola-caption text-muted">{t('models.browsingLoading')}</p> : null}
          <div className={GRID}>
            {[0, 1, 2, 3].map((index) => (
              <ModelCardSkeleton key={index} />
            ))}
          </div>
        </div>
      ) : null}

      {/* failed 时不给「没有匹配的记录」：搜索失败和「搜到了但是零结果」是两件事，
          把前者画成后者，用户会得到一个关于 Hugging Face 内容的错误结论。

          空态不分浏览态与搜索态，一套「没有匹配的记录」共用：浏览态的热门榜装不上一条是常态，
          单开一套"热门榜里没有能装的"文案只是把同一个结果说成两件事。

          「清空搜索」仍然只在带关键词时出现：浏览态输入框本来就是空的，那个按钮点了没反应，
          留着就是个坏按钮。
      */}
      {!busy && !failed && visible.length === 0 ? (
        <EmptyState className="flex flex-col items-start gap-4 py-8">
          <p className="nola-title text-foreground">{t('records.noResults')}</p>
          <p className="nola-caption text-muted">{t('records.noResultsHint')}</p>
          {browsing ? null : (
            <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => setQuery('')}>
              {t('records.clearSearch')}
            </Button>
          )}
        </EmptyState>
      ) : null}

      {!busy && visible.length > 0 ? (
        <>
          {/*
            只在浏览态出现。搜索态再讲"这是热门榜"是废话，而浏览态不讲就是撒谎：
            一屏模型没有任何出处标注，用户会默认它是"搜出来的"。
          */}
          {browsing ? (
            <p className="nola-caption text-muted">{t('models.browsingHint')}</p>
          ) : null}
          <div className={GRID}>
            {visible.map((hit) => {
              const live = liveRecordOf(hit)
              const record = live ?? hubCardRecord(hit)
              const compatible = hit.summary.compatibility.compatible
              /*
               * 取消/卸载发给引擎的 id：优先用目录里那条真实记录，退回命中自带的
               * `resourceId`（引擎给的"装上之后就叫这个"，不是界面拼的）。所以已经装上的
               * 命中不会给出一个按了没反应的卸载按钮。
               */
              const liveId = live?.resourceId ?? hit.summary.resourceId
              return (
                <ModelCard
                  key={hit.summary.repo}
                  record={record}
                  /* 请求还在飞时还没有 id，busy 键是 repo；之后两个键都认。 */
                  busy={busyIds.includes(liveId) || busyIds.includes(hit.summary.repo)}
                  isDefault={false}
                  canBeDefault={false}
                  installable={compatible}
                  onInstall={() => install(hit)}
                  onCancel={() => {
                    void actions.models.manageResource(liveId, 'cancel').catch(() => undefined)
                  }}
                  onRemove={() => {
                    void actions.models.manageResource(liveId, 'remove').catch(() => undefined)
                  }}
                  onSetDefault={() => undefined}
                  footer={
                    <Button
                      variant="tertiary"
                      size="sm"
                      className="rounded-[6px]"
                      onPress={() => setDetail(hit)}
                    >
                      {t('models.openDetails')}
                    </Button>
                  }
                />
              )
            })}
          </div>
        </>
      ) : null}

      <DetailDrawer hit={detail} onClose={() => setDetail(null)} onInstall={install} />
    </div>
  )
}

// -- 详情抽屉 -----------------------------------------------------------------

interface DetailDrawerProps {
  hit: HubHit | null
  onClose: () => void
  onInstall: (hit: HubHit) => void
}

function DetailDrawer({ hit, onClose, onInstall }: DetailDrawerProps) {
  const { t } = useI18n()
  const [inspected, setInspected] = useState<HubInspectResult | null>(null)
  const [checking, setChecking] = useState(false)

  const repo = hit?.summary.repo ?? null

  // 换一条命中就丢掉上一条的复查结果，别把 A 的判定画在 B 的抽屉里。
  useEffect(() => {
    setInspected(null)
    setChecking(false)
  }, [repo])

  const summary = hit?.summary ?? null
  const verdict = inspected?.compatibility ?? summary?.compatibility ?? null
  const reasonKey = verdict ? REASON_LABEL_KEY[verdict.reasonCode] : undefined
  const record = hit ? hubCardRecord(hit) : null

  const recheck = () => {
    if (!repo) return
    setChecking(true)
    void actions.models
      .inspectHubModel(repo)
      .then((result) => setInspected(result))
      .catch((error: unknown) => {
        console.error('[models] hub inspect failed', error)
        toast.danger(t('models.recheckFailed'))
      })
      .finally(() => setChecking(false))
  }

  return (
    <Drawer isOpen={hit !== null} onOpenChange={(open) => !open && onClose()}>
      {/*
        抽屉而不是弹窗：详情比弹窗长，而且用户要一边看详情一边看列表里别的条目。
        打开是隐式的，所以没有触发器，标题栏里那个 CloseTrigger 就是全部的出口。
      */}
      <Drawer.Backdrop>
        <Drawer.Content placement="right" className="w-[360px]">
          <Drawer.Dialog className="flex h-full flex-col gap-4 p-4">
            <Drawer.Header className="flex items-start justify-between gap-4">
              <Drawer.Heading className="nola-title text-foreground">
                {summary ? repoName(summary.repo) : t('models.details')}
              </Drawer.Heading>
              <Drawer.CloseTrigger className="rounded-[6px]" />
            </Drawer.Header>

            <Drawer.Body className="nola-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {summary === null || verdict === null || record === null ? null : (
                <>
                  <Row label={t('models.size')} value={formatBytes(record.downloadBytes ?? record.installedBytes)} />
                  <Row label={t('models.quantization')} value={factsOf(record).slice(1).join(' · ')} />
                  {summary.author ? <Row label={t('models.author')} value={summary.author} /> : null}
                  {summary.pipelineTag ? <Row label={t('models.taskType')} value={summary.pipelineTag} /> : null}
                  {summary.ggufArchitecture ? (
                    <Row label={t('models.architecture')} value={summary.ggufArchitecture} />
                  ) : null}
                  {verdict.loader ? <Row label={t('models.loader')} value={verdict.loader} /> : null}
                  <Row label={t('models.fileCount')} value={String(summary.fileCount)} />
                  <Row label={t('models.verdictCode')} value={reasonKey ? t(reasonKey) : verdict.reasonCode} />

                  {/*
                    装不了时这里重复一遍 reason 是有意的：卡片上那句解释被省略过，
                    抽屉是用户点进来确认的地方，理由必须在这里也能看到。
                  */}
                  <p className="nola-body text-muted">{verdict.reason}</p>

                  {/*
                    判定依据是引擎读到的那几个原始值（架构、model_type、revision）。
                    键名保持机器原样：它们是证据，不是界面文案。
                  */}
                  {Object.keys(verdict.evidence).length === 0 ? null : (
                    <div className="flex flex-col gap-2">
                      <span className="nola-caption text-muted">{t('models.evidence')}</span>
                      {Object.entries(verdict.evidence).map(([key, value]) => (
                        <Row key={key} label={key} value={value} />
                      ))}
                    </div>
                  )}

                  <Button
                    variant="tertiary"
                    size="sm"
                    className="rounded-[6px]"
                    isPending={checking}
                    onPress={recheck}
                  >
                    {t('models.recheck')}
                  </Button>
                </>
              )}
            </Drawer.Body>

            <Drawer.Footer className="flex items-center gap-2">
              {hit && verdict?.compatible ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-[6px]"
                  onPress={() => onInstall(hit)}
                >
                  {t('models.install')}
                </Button>
              ) : null}
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-separator pb-2">
      <span className="nola-caption text-muted">{label}</span>
      <span className="nola-body-strong text-foreground tabular">{value}</span>
    </div>
  )
}
