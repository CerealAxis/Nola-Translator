import { useEffect, useState } from 'react'
import { DeleteRegular, ShieldCheckmarkRegular } from '@fluentui/react-icons'

import type { CaptionSegment } from '../../shared/contracts'

export function HistoryPage(): React.JSX.Element {
  const [segments, setSegments] = useState<CaptionSegment[]>([])
  const [enabled, setEnabled] = useState(false)
  const [notice, setNotice] = useState('本次运行的字幕只保留在内存中。')
  const api = window.fluentCaptions

  const refresh = async (): Promise<void> => {
    if (!api) return
    const [history, settings] = await Promise.all([api.listHistory(), api.getSettings()])
    setSegments(history)
    setEnabled(settings.historyEnabled)
  }
  useEffect(() => {
    void refresh()
    if (!api) return
    return api.onEngineEvent((event) => {
      if (event.type === 'caption' && event.segment.isFinal) void refresh()
    })
  }, [api])

  const togglePersistence = async (): Promise<void> => {
    if (!api) return
    const next = !enabled
    await api.updateSettings({ historyEnabled: next })
    setEnabled(next)
    setNotice(next ? '已开启持久化；现有内存字幕也已写入应用数据目录。' : '已停止写入磁盘；内存字幕会保留到退出。')
  }
  const clear = async (): Promise<void> => {
    await api?.clearHistory()
    setSegments([])
    setNotice('历史字幕已清除。')
  }

  return (
    <div className="page">
      <header className="page-heading"><div><h1>历史记录</h1><p>{enabled ? '已明确开启保存，可随时关闭。' : '默认不保存任何字幕内容。'}</p></div><div className="button-row"><button className="button secondary-button" onClick={() => void togglePersistence()} type="button">{enabled ? '关闭保存' : '开启保存'}</button><button className="button secondary-button" disabled={!segments.length} onClick={() => void clear()} type="button"><DeleteRegular aria-hidden />清空</button></div></header>
      {segments.length === 0 ? <section className="surface empty-state"><span className="empty-icon"><ShieldCheckmarkRegular aria-hidden /></span><h2>暂无字幕记录</h2><p>{notice}</p></section> : <section className="surface table-surface"><div className="card-heading-row"><div><h2>本次会话 · {segments.length} 条</h2><p>{notice}</p></div><div className="button-row"><button className="button secondary-button compact-button" onClick={() => void api?.exportHistory('txt')} type="button">TXT</button><button className="button secondary-button compact-button" onClick={() => void api?.exportHistory('srt')} type="button">SRT</button><button className="button secondary-button compact-button" onClick={() => void api?.exportHistory('vtt')} type="button">WebVTT</button></div></div><div className="history-list">{segments.map((segment) => <article className="history-item" key={segment.segmentId}><time>{new Date(segment.startedAtMs).toISOString().slice(14, 19)}</time><div><strong>{segment.sourceText}</strong>{segment.translations.filter((item) => item.state === 'complete').map((item) => <p key={item.targetLanguage}>{item.text}</p>)}</div></article>)}</div></section>}
    </div>
  )
}
