export function DiagnosticsPage(): React.JSX.Element {
  return (
    <div className="page">
      <header className="page-heading"><div><h1>诊断</h1><p>查看运行状态，不记录字幕正文。</p></div><button className="button secondary-button" type="button">复制诊断信息</button></header>
      <div className="diagnostic-grid">
        <section className="surface diagnostic-card"><span>Python 引擎</span><strong>等待接入</strong><small>将使用本机 Conda Python 3.13</small></section>
        <section className="surface diagnostic-card"><span>识别后端</span><strong>尚未启动</strong><small>sherpa-onnx / faster-whisper</small></section>
        <section className="surface diagnostic-card"><span>翻译后端</span><strong>尚未启动</strong><small>Argos Translate · 本地</small></section>
      </div>
    </div>
  )
}
