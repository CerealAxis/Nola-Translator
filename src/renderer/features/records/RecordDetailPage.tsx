/**
 * Record detail: the two languages side by side, with a transport bar underneath.
 *
 * The reading-first screen — export is the only primary action, the transcript takes
 * the area, the type scales from 0.7 to 2.0, and three standing pills say where the
 * data came from and who wrote the translation. The route already supplies the page
 * frame, so this adds no max-width or padding; `flex-1` and `min-h-0` let the two
 * columns eat the remaining height.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Breadcrumbs, Button, Card, EmptyState, Skeleton } from '@heroui/react'
import { Download, Minus, Plus } from 'lucide-react'

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

/** Type-scale bounds: 0.7 is still readable, 2.0 suits projection and low vision. */
const SCALE_MIN = 0.7
const SCALE_MAX = 2
const SCALE_STEP = 0.1
const HEADER_ACTION_CLASS = 'w-24 justify-center rounded-[10px]'
/** Skeleton rows per column. */
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
        // The failure lands in store.error; the UI shows it by errorCode, not as a diagnostic dump.
    })
  }, [id])

  // Switching records resets the type scale and the playhead: a reading position should not carry over.
  useEffect(() => {
    setFontScale(1)
    setCurrentIndex(undefined)
  }, [id])

  const changeScale = useCallback((delta: number) => {
    setFontScale((previous) => {
      const next = previous + delta
      // Clamp to the range and keep one decimal, so 1.2000000000000002 never reaches the DOM.
      return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, next)) * 100) / 100
    })
  }, [])

  // Transcript rows for the dual column. The engine can return several translations, so prefer the target language.
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

  // The notes body. WorkspacePage debounces writes into `notes` in meeting.json and
  // this screen reads them back. Trimmed because setMeetingNotes stores a whitespace-only
  // value as undefined, but older files need not have gone through that path.
  const notes = detail?.meta.notes?.trim() ?? ''

  return (
    <ErrorBoundary resetKey={path}>
      <div className="nola-record-detail">
        <Breadcrumbs className="self-start" aria-label={t('nav.records')}>
          <Breadcrumbs.Item href={pathOf('records')}>{t('nav.records')}</Breadcrumbs.Item>
          <Breadcrumbs.Item>{title}</Breadcrumbs.Item>
        </Breadcrumbs>
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
                className={HEADER_ACTION_CLASS}
                onPress={() => setRenameOpen(true)}
              >
                {t('records.rename')}
              </Button>
              {/* The only primary action on this screen. */}
              <Button
                variant="primary"
                size="sm"
                className={HEADER_ACTION_CLASS}
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
         * Three standing declarations: where the data came from, where it is kept, and
         * who wrote the translation. They use `legal.*` because this record has already
         * finished, so nothing is being written.
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
              <Button variant="primary" size="sm" className="rounded-[10px]" onPress={back}>
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
                // Which sentence the playhead is on: the last one starting at or before now.
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
         * The notes written before the meeting ended, which is what
         * `workspaceUi.notesLocalHint` promises when it says they stay readable here.
         *
         * Read-only: editing happens on the quick-session screen. Markdown markers show as
         * the plain text they are — there is no renderer in the repo, and the panel that
         * writes them is plain text by design. The block only takes space when there are
         * notes, and its height is capped so a long one cannot squeeze out the columns.
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

/** Two-column skeleton, four rows a side, each row close to a real line box. */
function DualSkeleton({ t }: { t: TFn }): ReactNode {
  return (
    <div
      data-testid="dual-skeleton"
      // The skeleton mirrors the real view's column split, so the headers do not jump
      // sideways at the moment the data lands.
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

