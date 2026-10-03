/**
 * 同传记录详情。原文 / 译文双栏 + 底部播放条。
 *
 * 这是"阅读优先"原则最完整的一屏：页面上唯一的主 CTA 是"导出"，
 * 正文占据绝大部分面积，字号可调（A+ / A-，0.7 到 2.0），
 * 顶栏三枚常驻声明胶囊交代数据的来源与去向。
 *
 * `Routes` 已经承担了页面框，本页不再套 max-w 或外层 padding。
 * 本页要撑满可用高度，所以用 `flex-1` + `min-h-0` 让双栏自己吃掉剩余空间。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Card, EmptyState, Skeleton } from '@heroui/react'
import { ArrowLeft, Download, Minus, Plus } from 'lucide-react'

import { AudioPlayerBar, DualColumnView } from '@/components/reading'
import type { DualColumnSegment } from '@/components/reading'
import { ErrorBoundary, PageHeader, StatusPill } from '@/components/primitives'
import { useI18n } from '@/i18n'
import { pathOf, useRoute } from '@/routes'
import { actions, stores, useStore } from '@/store'
import { ExportDialog } from './ExportDialog'
import { RenameDialog } from './RenameDialog'
import { formatDateTime, formatClock } from './recordLogic'
import '../home/home-records.css'

/** 字号缩放区间。0.7 到 2.0：0.7 仍可读，2.0 适合投屏与视力不佳的场景。 */
const SCALE_MIN = 0.7
const SCALE_MAX = 2
const SCALE_STEP = 0.1
/** 骨架行数。DESIGN 第 10.2 节记录详情是 8 对句段，本页取 4 对（两栏各 4 行）。 */
const SKELETON_PAIRS = 4

export function RecordDetailPage(): ReactNode {
  const { t } = useI18n()
  const { id, navigate, path } = useRoute()

  const detail = useStore(stores.meetings, (state) => state.detail)
  const detailLoading = useStore(stores.meetings, (state) => state.detailLoading)

  const [fontScale, setFontScale] = useState(1)
  const [currentIndex, setCurrentIndex] = useState<number | undefined>(undefined)
  const [exportOpen, setExportOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    void actions.meetings.loadMeetingDetail(id).catch(() => {
      // 失败写进 store.error，界面按 errorCode 显示，不在这里渲染诊断串。
    })
  }, [id])

  // 换一条记录时字号与播放头回到默认：上一条的阅读位置不该继承过来。
  useEffect(() => {
    setFontScale(1)
    setCurrentIndex(undefined)
  }, [id])

  const changeScale = useCallback((delta: number) => {
    setFontScale((previous) => {
      const next = previous + delta
      // 夹到区间并保留一位小数，避免 1.2000000000000002 这种值进 DOM。
      return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, next)) * 100) / 100
    })
  }, [])

  // 段 -> 双栏的句段。译文取目标语言那一条；引擎可能返回多条翻译，按目标语言优先。
  const segments = useMemo<DualColumnSegment[]>(() => {
    if (!detail) return []
    return detail.segments.map((segment) => {
      const target =
        segment.translations.find((item) => item.targetLanguage === detail.meta.targetLanguage) ??
        segment.translations.find((item) => item.text !== undefined) ??
        segment.translations[0]
      return {
        id: segment.segmentId,
        source: segment.sourceText,
        target: target?.text ?? '',
        interim: !segment.isFinal,
      }
    })
  }, [detail])

  const back = useCallback(() => navigate(pathOf('records')), [navigate])

  const title = detail?.meta.title || t('records.title')

  // 笔记正文。写入侧是 WorkspacePage 的防抖 `setMeetingNotes`（落盘到 meeting.json 的
  // `notes`），读取侧就是这一屏。trim 一下是因为 setMeetingNotes 只会把纯空白存成
  // undefined，但历史文件不一定都经过那条路径。
  const notes = detail?.meta.notes?.trim() ?? ''

  return (
    <ErrorBoundary resetKey={path}>
      <div className="nola-record-detail">
        <Button variant="ghost" className="nola-record-detail__back" onPress={back}><ArrowLeft size={18} aria-hidden="true" />{t('homeRecordsUi.back')}</Button>
        <PageHeader
          title={title}
          className="nola-record-detail__header"
          subtitle={detail ? formatDateTime(detail.meta.startedAtMs) + ' · ' + formatClock(detail.meta.durationMs) : undefined}
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={() => changeScale(-SCALE_STEP)}
                isDisabled={fontScale <= SCALE_MIN}
                aria-label={t('workspace.fontSmaller')}
                className="rounded-[10px]"
              >
                <Minus aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={() => changeScale(SCALE_STEP)}
                isDisabled={fontScale >= SCALE_MAX}
                aria-label={t('workspace.fontLarger')}
                className="rounded-[10px]"
              >
                <Plus aria-hidden="true" />
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                className="rounded-[10px]"
                onPress={() => setRenameOpen(true)}
              >
                {t('records.rename')}
              </Button>
              {/* 详情页唯一的主 CTA。 */}
              <Button
                variant="primary"
                size="md"
                className="rounded-full px-5"
                onPress={() => setExportOpen(true)}
                isDisabled={!detail}
              >
                <Download aria-hidden="true" />
                {t('records.export')}
              </Button>
            </>
          }
        />

        {/*
          * 三枚常驻声明：数据怎么来的、存在哪、译文是谁写的。走 legal.*。
          *
          * 之前这里抄了 workspace.* 的那两条，是错的：`workspace.statusAutosave`
          * 说的是"字幕逐句自动保存"，那描述的是**正在进行的**同传；这一页是一条**已经结束**
          * 的记录，没有任何东西在存，用 `legal.statusAutosave`（"记录自动保存"）才对。
          */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={t('legal.statusAutosave')} tone="neutral" size="sm" dot={false} />
          <StatusPill label={t('legal.statusDataSafe')} tone="neutral" size="sm" dot={false} />
          <StatusPill label={t('legal.aiGeneratedRecord')} tone="neutral" size="sm" dot={false} />
        </div>

        <Card className="nola-record-card nola-record-detail__reading"><Card.Content>
          {detailLoading && !detail ? (
            <DualSkeleton t={t} />
          ) : segments.length === 0 ? (
            <EmptyState className="flex flex-col items-start gap-4 p-6">
              <h2 className="nola-body-strong text-foreground">{t('workspace.nothingYet')}</h2>
              <p className="nola-caption text-muted">{t('workspace.nothingYetHint')}</p>
              <Button variant="primary" size="md" className="rounded-full px-5" onPress={back}>
                {t('nav.records')}
              </Button>
            </EmptyState>
          ) : (
            <DualColumnView
              segments={segments}
              sourceLabel={t('records.detailSource')}
              targetLabel={t('records.detailTranslation')}
              fontScale={fontScale}
              currentIndex={currentIndex}
              // 播放头同步给双栏做焦点衰减。关掉时双栏就是静态阅读。
              onSplitChange={undefined}
              className="min-h-0 flex-1 p-5"
            />
          )}

          <div className="border-t border-separator">
            <AudioPlayerBar
              audioUrl={detail?.audioUrl ?? null}
              durationMs={detail?.meta.audioDurationMs ?? null}
              isPending={detailLoading && !detail}
              unavailableLabel={t('records.audioUnavailable')}
              onTimeChange={(ms) => {
                if (!detail) return
                // 播放头落在哪一句：取最后一条 startedAtMs <= 当前时间的句段。
                let index = 0
                for (let i = 0; i < detail.segments.length; i += 1) {
                  if (detail.segments[i].startedAtMs <= ms) index = i
                  else break
                }
                setCurrentIndex(index)
              }}
            />
          </div>
        </Card.Content></Card>

        {/*
         * 笔记。会议结束前写的东西在这里找回来 —— `workspaceUi.notesLocalHint`
         * ("停止后可在记录详情里继续看") 承诺的就是这个位置，缺了它那句话就是假的。
         *
         * 只读不回写：这一屏是"读"的地方，要改笔记回快速同传那一屏。
         * `**加粗**` 这类快捷标记按纯文本原样显示，仓库里没有 Markdown 渲染器，
         * 引入一个只为装饰笔记的依赖不划算（NotesPanel 也是按"纯文本 + 快捷标记"设计的）。
         *
         * 只在真的有笔记时占位：没写过笔记的记录不塞一个空块进来，
         * 双栏才是这一屏的主体（见文件头的"阅读优先"）。高度封顶 + 内部滚动，
         * 长笔记不会把双栏挤没。
         */}
        {notes ? (
          <Card className="nola-record-card">
            <Card.Content>
              <div className="flex flex-col gap-3">
                <h2 className="nola-subtitle text-foreground">{t('homeRecordsUi.notes')}</h2>
                <p className="nola-body max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-foreground">{notes}</p>
              </div>
            </Card.Content>
          </Card>
        ) : null}
      </div>

      <ExportDialog
        meetingId={id ?? null}
        isOpen={exportOpen}
        onOpenChange={setExportOpen}
      />

      <RenameDialog
        meetingId={renameOpen ? (id ?? null) : null}
        initialTitle={detail?.meta.title ?? ''}
        onClose={() => setRenameOpen(false)}
      />
    </ErrorBoundary>
  )
}

type TFn = (
  key: Parameters<ReturnType<typeof useI18n>['t']>[0],
  vars?: Record<string, string | number>,
) => string

/** 双栏骨架：两栏各 4 行。行高贴近真实行（1.65 行高的文字条）。 */
function DualSkeleton({ t }: { t: TFn }): ReactNode {
  return (
    <div
      data-testid="dual-skeleton"
      // 骨架照抄 `DualColumnView` 的三列几何与栏头留白（`pr-3` / `pl-3`）。
      // 否则加载完成的瞬间栏头会横向跳一下：骨架原本是两栏 + 24px gap，
      // 真视图是三栏 + 1px 分隔线，两侧的留白对不上。
      style={{ gridTemplateColumns: 'var(--dual-split, 50%) 1px minmax(0, 1fr)' }}
      className="grid min-h-0 flex-1 p-4"
    >
      <div className="flex flex-col gap-2 pr-3">
        <span className="nola-subtitle text-foreground">{t('records.detailSource')}</span>
        {Array.from({ length: SKELETON_PAIRS }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full rounded-[10px]" />
        ))}
      </div>
      <div aria-hidden="true" className="self-stretch bg-separator" />
      <div className="flex flex-col gap-2 pl-3">
        <span className="nola-subtitle text-foreground">{t('records.detailTranslation')}</span>
        {Array.from({ length: SKELETON_PAIRS }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full rounded-[10px]" />
        ))}
      </div>
    </div>
  )
}

