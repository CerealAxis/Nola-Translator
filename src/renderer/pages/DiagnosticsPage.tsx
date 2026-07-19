import { useEffect, useState } from 'react'

export function DiagnosticsPage(): React.JSX.Element {
  const [diagnostics, setDiagnostics] = useState<Record<string, string | number>>({})
  const [copied, setCopied] = useState(false)
  const api = window.fluentCaptions
  useEffect(() => { void api?.getDiagnostics().then(setDiagnostics) }, [api])
  return (
    <div className="page">
      <header className="page-heading"><div><h1>诊断</h1><p>只显示运行环境与引擎状态，不包含字幕正文。</p></div><button className="button secondary-button" onClick={() => void api?.copyDiagnostics().then(() => setCopied(true))} type="button">{copied ? '已复制' : '复制诊断信息'}</button></header>
      <div className="diagnostic-grid">{Object.entries(diagnostics).map(([label, value]) => <section className="surface diagnostic-card" key={label}><span>{label}</span><strong>{value}</strong></section>)}</div>
    </div>
  )
}
