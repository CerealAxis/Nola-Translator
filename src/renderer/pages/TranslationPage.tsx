import { ArrowDownloadRegular, ShieldCheckmarkRegular } from '@fluentui/react-icons'

export function TranslationPage(): React.JSX.Element {
  return (
    <div className="page">
      <header className="page-heading">
        <div><h1>翻译</h1><p>Argos Translate 默认在本机运行，语言包按需安装。</p></div>
      </header>
      <section className="surface table-surface">
        <div className="card-heading-row">
          <div><h2>本地语言包</h2><p>直接翻译优先；中转路线会在选择时明确提示。</p></div>
          <span className="badge"><ShieldCheckmarkRegular aria-hidden /> Argos · 离线</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>语言方向</th><th>路径</th><th>大小</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr><td>English → 简体中文</td><td>直接翻译</td><td>87 MB</td><td><span className="badge">已安装</span></td><td><button className="text-button" type="button">管理</button></td></tr>
              <tr><td>简体中文 → English</td><td>直接翻译</td><td>79 MB</td><td><span className="badge">已安装</span></td><td><button className="text-button" type="button">管理</button></td></tr>
              <tr><td>日本語 → 简体中文</td><td>经 English 中转</td><td>126 MB</td><td>未安装</td><td><button className="button secondary-button compact-button" type="button"><ArrowDownloadRegular aria-hidden />下载</button></td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
