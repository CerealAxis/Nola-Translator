import { useI18n } from '../i18n'
import { useEffect, useState } from 'react'
import { ArrowDownloadRegular, ShieldCheckmarkRegular } from '@fluentui/react-icons'

import { DEFAULT_SETTINGS, type TranslationSettings } from '../../shared/settings'

type TranslationPageProps = { onOpenResources: () => void }

export function TranslationPage({ onOpenResources }: TranslationPageProps): React.JSX.Element {
  const { t } = useI18n()
  const [settings, setSettings] = useState<TranslationSettings>(DEFAULT_SETTINGS.translation)
  const [credential, setCredential] = useState('')
  const [hasCredential, setHasCredential] = useState(false)
  const [notice, setNotice] = useState('Argos 默认在本机运行。')
  const api = window.fluentCaptions

  useEffect(() => {
    if (!api) return
    let active = true
    void api.getSettings().then((value) => active && setSettings(value.translation))
    return () => { active = false }
  }, [api])

  useEffect(() => {
    if (!api || (settings.provider !== 'microsoft' && settings.provider !== 'openai')) {
      setHasCredential(false)
      return
    }
    void api.hasTranslationCredential(settings.provider).then(setHasCredential)
  }, [api, settings.provider])

  const update = async (patch: Partial<TranslationSettings>): Promise<void> => {
    if (!api) return
    const next = { ...settings, ...patch }
    setSettings(next)
    setSettings((await api.updateSettings({ translation: patch })).translation)
    setNotice('翻译设置已保存，将从下一次字幕会话开始生效。')
  }
  const saveCredential = async (): Promise<void> => {
    if (!api || (settings.provider !== 'microsoft' && settings.provider !== 'openai')) return
    await api.setTranslationCredential(settings.provider, credential)
    setHasCredential(Boolean(credential))
    setCredential('')
    setNotice(credential ? 'API 密钥已使用 Windows 加密存储。' : '已删除保存的 API 密钥。')
  }

  return (
    <div className="page">
      <header className="page-heading"><div><h1>{t("翻译")}</h1><p>{t(notice)}</p></div><span className="badge"><ShieldCheckmarkRegular aria-hidden />{t(settings.provider === 'argos' ? '离线' : '用户主动联网')}</span></header>
      <div className="translation-layout">
        <section className="surface settings-surface">
          <h2>{t("翻译后端")}</h2>
          <label><span>Provider</span><select aria-label={t("翻译后端")} value={settings.provider} onChange={(event) => void update({ provider: event.target.value as TranslationSettings['provider'] })}><option value="argos">{t("Argos Translate · 本地")}</option><option value="microsoft">Microsoft Translator</option><option value="openai">{t("OpenAI 兼容接口")}</option><option value="ollama">{t("Ollama · 本地")}</option></select></label>
          {settings.provider === 'argos' && <><p>{t("请先在“模型与语言包”页面安装所需方向；开始字幕不会自动下载。")}</p><label className="setting-toggle-row"><span><strong>{t("允许经 English 中转")}</strong><small>{t("没有直译包时，依次使用源语言 → English 和 English → 目标语言。")}</small></span><input aria-label={t("允许经 English 中转")} checked={settings.allowIntermediate} onChange={(event) => void update({ allowIntermediate: event.target.checked })} type="checkbox" /></label></>}
          {settings.provider === 'microsoft' && <><label><span>{t("服务地址")}</span><input className="text-input" value={settings.microsoftEndpoint} onChange={(event) => setSettings({ ...settings, microsoftEndpoint: event.target.value })} onBlur={() => void update({ microsoftEndpoint: settings.microsoftEndpoint })} /></label><label><span>{t("资源区域（全局资源可留空）")}</span><input className="text-input" value={settings.microsoftRegion} onChange={(event) => setSettings({ ...settings, microsoftRegion: event.target.value })} onBlur={() => void update({ microsoftRegion: settings.microsoftRegion })} /></label></>}
          {settings.provider === 'openai' && <><label><span>{t("兼容接口根地址")}</span><input className="text-input" value={settings.openaiEndpoint} onChange={(event) => setSettings({ ...settings, openaiEndpoint: event.target.value })} onBlur={() => void update({ openaiEndpoint: settings.openaiEndpoint })} /></label><label><span>{t("模型")}</span><input className="text-input" value={settings.openaiModel} onChange={(event) => setSettings({ ...settings, openaiModel: event.target.value })} onBlur={() => void update({ openaiModel: settings.openaiModel })} /></label></>}
          {settings.provider === 'ollama' && <><label><span>{t("Ollama 地址")}</span><input className="text-input" value={settings.ollamaEndpoint} onChange={(event) => setSettings({ ...settings, ollamaEndpoint: event.target.value })} onBlur={() => void update({ ollamaEndpoint: settings.ollamaEndpoint })} /></label><label><span>{t("模型")}</span><input className="text-input" value={settings.ollamaModel} onChange={(event) => setSettings({ ...settings, ollamaModel: event.target.value })} onBlur={() => void update({ ollamaModel: settings.ollamaModel })} /></label></>}
          {(settings.provider === 'microsoft' || settings.provider === 'openai') && <label><span>{t("API 密钥 · ")}{t(hasCredential ? '已保存' : '未保存')}</span><div className="credential-row"><input className="text-input" type="password" autoComplete="off" placeholder={t(hasCredential ? '输入新密钥以替换；留空并保存可删除' : '输入 API 密钥')} value={credential} onChange={(event) => setCredential(event.target.value)} /><button className="button secondary-button" onClick={() => void saveCredential()} type="button">{t("保存密钥")}</button></div></label>}
        </section>
        <section className="surface resource-shortcut"><span className="summary-icon"><ArrowDownloadRegular aria-hidden /></span><div><h2>{t("Argos 本地语言包")}</h2><p>{t("查看每个有向语言包的真实安装状态，并手动安装或删除。")}</p></div><button className="button secondary-button" onClick={onOpenResources} type="button">{t("打开模型与语言包")}</button></section>
      </div>
    </div>
  )
}
