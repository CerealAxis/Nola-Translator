import { ShieldCheckmarkRegular } from '@fluentui/react-icons'

export function HistoryPage(): React.JSX.Element {
  return (
    <div className="page">
      <header className="page-heading"><div><h1>历史记录</h1><p>默认不保存任何字幕内容。</p></div><button className="button secondary-button" type="button">导出</button></header>
      <section className="surface empty-state">
        <span className="empty-icon"><ShieldCheckmarkRegular aria-hidden /></span>
        <h2>历史记录已关闭</h2>
        <p>字幕只保留在本次会话的内存中。开启保存前，应用不会把原文或译文写入磁盘。</p>
        <button className="button secondary-button" type="button">前往隐私设置</button>
      </section>
    </div>
  )
}
