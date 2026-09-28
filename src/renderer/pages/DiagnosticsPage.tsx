import { useI18n } from '../i18n'
import { useEffect, useState } from 'react'

export function DiagnosticsPage(): React.JSX.Element {
  const { t } = useI18n()
  const [diagnostics, setDiagnostics] = useState<Record<string, string | number>>({})
  const [copied, setCopied] = useState(false)
  const api = window.nolaTranslator
  useEffect(() => { void api?.getDiagnostics().then(setDiagnostics) }, [api])
  return (
    <div className="page">
      <header className="page-heading"><div><h1>{t("诊断")}</h1><p>{t("只显示运行环境与引擎状态，不包含字幕正文。")}</p></div><button className="button secondary-button" onClick={() => void api?.copyDiagnostics().then(() => setCopied(true))} type="button">{t(copied ? '已复制' : '复制诊断信息')}</button></header>
      <div className="diagnostic-grid">{Object.entries(diagnostics).map(([label, value]) => <section className="surface diagnostic-card" key={label}><span>{t(label)}</span><strong>{value}</strong></section>)}</div>
    </div>
  )
}
