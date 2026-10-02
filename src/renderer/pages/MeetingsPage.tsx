import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DeleteRegular,
  EyeRegular,
  SearchRegular,
} from '@fluentui/react-icons'

import type { MeetingMeta } from '../../shared/contracts'
import { useI18n } from '../i18n'
import { isLive, meetingDurationLabel, meetingEndLabel, meetingTitleFor } from '../components/meeting-format'
import { ConfirmDialog } from '../components/ConfirmDialog'

const PAGE_SIZE = 10

type MeetingsPageProps = {
  onOpenMeeting: (meetingId: string) => void
}

type SortDirection = 'desc' | 'asc'

export function MeetingsPage({ onOpenMeeting }: MeetingsPageProps): React.JSX.Element {
  const { language, t } = useI18n()
  const [meetings, setMeetings] = useState<MeetingMeta[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const [renaming, setRenaming] = useState<MeetingMeta | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [pendingDelete, setPendingDelete] = useState<MeetingMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setMeetings(await window.nolaTranslator?.listMeetings() ?? [])
    } catch {
      setError(t('无法读取会议记录，请重试。'))
    }
  }, [t])

  useEffect(() => {
    let active = true
    void refresh()
    const api = window.nolaTranslator
    if (!api) return
    // A meeting is created and finalized by the engine, so the list has to follow the session.
    return api.onEngineEvent((event) => {
      if (event.type === 'sessionStarted' || event.type === 'sessionStopped' || event.type === 'caption') {
        if (active) void refresh()
      }
    })
  }, [refresh])

  // Captions arrive several times a second; re-listing on each one would flood the main process.
  useEffect(() => {
    if (!meetings.some(isLive)) return
    const timer = setInterval(() => void refresh(), 5000)
    return () => clearInterval(timer)
  }, [meetings, refresh])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? meetings.filter((meta) => meetingTitleFor(meta, language).toLowerCase().includes(needle))
      : meetings
    return filtered.sort((left, right) => {
      const leftEnd = left.endedAtMs ?? left.startedAtMs
      const rightEnd = right.endedAtMs ?? right.startedAtMs
      return sort === 'desc' ? rightEnd - leftEnd : leftEnd - rightEnd
    })
  }, [meetings, query, sort, language])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const rows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const remove = async (meta: MeetingMeta): Promise<void> => {
    setPendingDelete(null)
    try {
      await window.nolaTranslator?.deleteMeeting(meta.meetingId)
      setError(null)
    } catch {
      setError(t('删除会议失败，请重试。'))
    }
    await refresh()
  }

  const saveTitle = async (): Promise<void> => {
    const target = renaming
    if (!target) return
    const title = draftTitle.trim()
    setRenaming(null)
    if (!title || title === meetingTitleFor(target, language)) return
    try {
      await window.nolaTranslator?.renameMeeting(target.meetingId, title)
      setError(null)
    } catch {
      setError(t('重命名失败，请重试。'))
    }
    await refresh()
  }

  return (
    <section className="page meeting-page">
      <div className="page-header">
        <h1 className="page-title">{t('会议记录')}</h1>
        <div className="meeting-search">
          <SearchRegular aria-hidden />
          <input
            type="search"
            value={query}
            placeholder={t('请输入会议名称')}
            aria-label={t('请输入会议名称')}
            onChange={(event) => { setQuery(event.target.value); setPage(1) }}
          />
        </div>
      </div>
      {error && <p className="page-error" role="alert">{error}</p>}
      <div className="meeting-table-wrap">
        <table className="meeting-table">
          <thead>
            <tr>
              <th scope="col" className="meeting-col-index">{t('序号')}</th>
              <th scope="col">{t('会议名称')}</th>
              <th scope="col">
                <button
                  type="button"
                  className="meeting-sort"
                  onClick={() => setSort(sort === 'desc' ? 'asc' : 'desc')}
                  aria-label={t('按会议结束时间排序')}
                >
                  {t('会议结束时间')}
                  <ArrowUpRegular aria-hidden style={{ transform: sort === 'asc' ? 'rotate(180deg)' : 'none' }} />
                </button>
              </th>
              <th scope="col">{t('会议时长')}</th>
              <th scope="col" className="meeting-col-actions">{t('操作')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((meta, index) => (
              <tr key={meta.meetingId}>
                <td>{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                <td>
                  {renaming?.meetingId === meta.meetingId
                    ? <input
                        autoFocus
                        className="meeting-rename-input"
                        value={draftTitle}
                        maxLength={120}
                        aria-label={t('会议名称')}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onBlur={() => void saveTitle()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveTitle()
                          if (event.key === 'Escape') setRenaming(null)
                        }}
                      />
                    : <button
                        type="button"
                        className="meeting-title-button"
                        title={t('双击可重命名')}
                        onClick={() => onOpenMeeting(meta.meetingId)}
                        onDoubleClick={() => { setRenaming(meta); setDraftTitle(meetingTitleFor(meta, language)) }}
                      >{meetingTitleFor(meta, language)}</button>}
                  {isLive(meta) && <span className="meeting-live-tag">{t('记录中')}</span>}
                </td>
                <td>{meetingEndLabel(meta)}</td>
                <td>{meetingDurationLabel(meta, t)}</td>
                <td className="meeting-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('查看')}
                    title={t('查看')}
                    onClick={() => onOpenMeeting(meta.meetingId)}
                  ><EyeRegular aria-hidden /></button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={t('删除')}
                    title={t('删除')}
                    onClick={() => setPendingDelete(meta)}
                  ><DeleteRegular aria-hidden /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="meeting-empty">{t('暂无会议记录')}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="meeting-pagination">
        <span className="meeting-total">{t('共 {count} 条会议记录', { count: visible.length })}</span>
        <div className="meeting-pager">
          <button type="button" className="icon-button" aria-label={t('上一页')} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeftRegular aria-hidden /></button>
          {Array.from({ length: pageCount }, (_, value) => value + 1).map((value) => (
            <button
              key={value}
              type="button"
              className="pager-number"
              data-active={value === currentPage}
              aria-current={value === currentPage ? 'page' : undefined}
              onClick={() => setPage(value)}
            >{value}</button>
          ))}
          <button type="button" className="icon-button" aria-label={t('下一页')} disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRightRegular aria-hidden /></button>
          <label className="meeting-jump">
            {t('跳至')}
            <input
              type="number"
              min={1}
              max={pageCount}
              value={currentPage}
              aria-label={t('跳至页码')}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value)) setPage(Math.min(pageCount, Math.max(1, Math.floor(value))))
              }}
            />
            {t('页')}
          </label>
        </div>
      </div>
      {pendingDelete && (
        <ConfirmDialog
          title={t('删除会议')}
          message={t('确定删除"{title}"吗？该会议的字幕与录音都会被移除。', { title: meetingTitleFor(pendingDelete, language) })}
          confirmLabel={t('删除')}
          cancelLabel={t('取消')}
          variant="danger"
          onConfirm={() => void remove(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  )
}
