import { useEffect, useMemo, useReducer, useState } from 'react'
import { ChevronDownRegular, ClosedCaptionRegular, PlayRegular, StopRegular } from '@fluentui/react-icons'

import type { AudioDevice, EngineEvent, SessionConfig } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type OverlaySettings, type RecognitionModelId, type TranslationSettings } from '../../shared/settings'
import { EMPTY_CAPTION, receiveCaption } from '../components/caption-state'
import { CaptionPreview } from '../components/CaptionPreview'
import { useI18n, type TranslationValues } from '../i18n'

type SessionState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error'

// 与引擎 resources.py 中 Qwen3-ASR / Hy-MT2 的 languages 清单保持一致。
const LANGUAGE_LABELS: Record<string, string> = {
  zh: '中文', en: 'English', ja: '日本語', ko: '한국어', yue: '粤语',
  fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский',
  ar: 'العربية', pt: 'Português', id: 'Indonesia', it: 'Italiano',
  th: 'ไทย', vi: 'Tiếng Việt', tr: 'Türkçe', ms: 'Melayu',
}
const SOURCE_LANGUAGE_OPTIONS = ['auto', 'zh', 'yue', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'ar', 'th', 'vi', 'tr', 'id']
const TARGET_LANGUAGE_OPTIONS = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'tr', 'ar', 'th', 'vi', 'ms', 'id']

type LiveCaptionsPageProps = {
  activeSessionId: string | null
  onSessionStarted: (sessionId: string) => void
  onStopSession: () => Promise<void>
  onOpenResources: () => void
}

export function LiveCaptionsPage({ activeSessionId, onSessionStarted, onStopSession, onOpenResources }: LiveCaptionsPageProps): React.JSX.Element {
  const { t } = useI18n()
  const [state, setState] = useState<SessionState>('idle')
  const [settingsReady, setSettingsReady] = useState(false)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [audioSource, setAudioSource] = useState('defaultOutput')
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguages, setTargetLanguages] = useState<string[]>(['zh'])
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [translationSettings, setTranslationSettings] = useState<TranslationSettings>(DEFAULT_SETTINGS.translation)
  const [recognitionModelId, setRecognitionModelId] = useState<RecognitionModelId>(DEFAULT_SETTINGS.recognition.modelId)
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(DEFAULT_SETTINGS.overlay)
  const sourceVisible = overlaySettings.showSource
  const translationVisible = overlaySettings.showTranslation
  const [currentCaption, dispatchCaption] = useReducer(receiveCaption, { ...EMPTY_CAPTION, sessionId: activeSessionId })
  const caption = currentCaption.caption
  const [modelProgress, setModelProgress] = useState<number | null>(null)
  const [notice, setNotice] = useState('正在连接本地引擎…')
  const [noticeValues, setNoticeValues] = useState<TranslationValues>({})
  const [missingResource, setMissingResource] = useState(false)

  const api = window.nolaTranslator
  useEffect(() => {
    if (!api) {
      setState('error')
      setNotice('本地引擎接口不可用，请使用 npm run dev 启动 Electron。')
      return
    }
    let active = true
    void Promise.all([api.listDevices(), api.getSettings()]).then(([items, settings]) => {
      if (active) {
        setDevices(items)
        setTranslationSettings(settings.translation)
        setOverlaySettings(settings.overlay)
        setRecognitionModelId(settings.recognition.modelId)
        setSettingsReady(true)
        setNotice((current) => current === '正在连接本地引擎…' ? '准备就绪' : current)
      }
    }).catch((error: unknown) => {
      if (active) {
        setState('error')
        setNotice(error instanceof Error ? error.message : '无法读取音频设备')
      }
    })
    const unsubscribeSettings = api.onSettingsChanged((settings) => {
      if (!active) return
      setTranslationSettings(settings.translation)
      setOverlaySettings(settings.overlay)
      setRecognitionModelId(settings.recognition.modelId)
    })
    const unsubscribe = api.onEngineEvent((event: EngineEvent) => {
      if (event.type === 'caption' || event.type === 'sessionStarted') {
        dispatchCaption(event)
      } else if (event.type === 'modelProgress') {
        setModelProgress(event.progress)
        if (event.state === 'complete') setNotice('模型已准备完成')
        else {
          setNotice('正在准备 {model}')
          setNoticeValues({ model: event.modelId })
        }
      } else if (event.type === 'error') {
        const reason = typeof event.details?.reason === 'string' ? event.details.reason : ''
        setNotice(reason ? '引擎错误：{code}（{reason}）' : '引擎错误：{code}')
        setNoticeValues({ code: event.code, reason })
        if (!event.recoverable) setState('error')
      }
    })
    return () => {
      active = false
      unsubscribe()
      unsubscribeSettings()
    }
  }, [api])

  useEffect(() => {
    if (activeSessionId) {
      if (currentCaption.sessionId !== activeSessionId) dispatchCaption({ protocolVersion: 1, type: 'sessionStarted', requestId: '', sessionId: activeSessionId })
      setState('listening')
      setNotice('正在监听音频')
    } else {
      setState((current) => current === 'listening' || current === 'stopping' ? 'idle' : current)
    }
  }, [activeSessionId])

  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === audioSource),
    [audioSource, devices]
  )

  const start = async (): Promise<void> => {
    if (!api || !settingsReady) return
    setState('starting')
    dispatchCaption({ protocolVersion: 1, type: 'sessionStarted', requestId: '', sessionId: '' })
    setModelProgress(null)
    setMissingResource(false)
    setNotice('正在启动本地字幕引擎…')
    const effectiveTargets = translationVisible ? targetLanguages : []
    const config: SessionConfig = {
      audioSource: selectedDevice
        ? { kind: selectedDevice.kind, deviceId: selectedDevice.deviceId }
        : { kind: 'defaultOutput' },
      recognitionMode: 'realtime',
      recognitionModelId: recognitionModelId,
      sourceLanguage,
      targetLanguages: effectiveTargets,
      allowIntermediateTranslation: translationSettings.translateIntermediate,
      translationProvider: translationSettings.provider,
      translationOptions: translationSettings.provider === 'microsoft'
        ? { endpoint: translationSettings.microsoftEndpoint, region: translationSettings.microsoftRegion }
        : translationSettings.provider === 'openai'
          ? { endpoint: translationSettings.openaiEndpoint, model: translationSettings.openaiModel }
          : translationSettings.provider === 'ollama'
            ? { endpoint: translationSettings.ollamaEndpoint, model: translationSettings.ollamaModel }
            : undefined,
    }
    try {
      const snapshot = await api.listResources()
      const translationResourceId = effectiveTargets.length > 0
        ? translationSettings.provider === 'hymt2' ? 'hy-mt2-1.8b-q4-k-m'
          : translationSettings.provider === 'm2m100' ? 'm2m100-418m' : null
        : null
      const requiredIds = [recognitionModelId, ...(translationResourceId ? [translationResourceId] : [])]
      const missing = requiredIds
        .map((id) => snapshot.resources.find((item) => item.resourceId === id))
        .find((item) => !item?.installed)
      if (missing || requiredIds.some((id) => !snapshot.resources.some((item) => item.resourceId === id))) {
        setState('error')
        setMissingResource(true)
        setNotice('{name}模型尚未安装，请先到“模型与资源”页面安装。')
        setNoticeValues({ name: missing?.name ?? '所选识别' })
        return
      }
      setNotice(effectiveTargets.length > 0 ? '正在加载识别和翻译模型…' : '正在加载所选识别模型…')
      const result = await api.startSession(config)
      onSessionStarted(result.sessionId)
      setState('listening')
      setNotice('正在监听音频')
    } catch (error) {
      setState('error')
      const message = error instanceof Error ? error.message : '字幕会话启动失败'
      const unavailable = message.includes('resourceUnavailable') || message.includes('modelUnavailable')
      setMissingResource(unavailable)
      setNotice(unavailable ? '所选模型不可用，请到“模型与资源”页面检查或重新安装。' : message)
    }
  }

  const saveSettings = async (patch: Parameters<NonNullable<typeof api>['updateSettings']>[0]): Promise<void> => {
    if (!api) return
    try {
      const saved = await api.updateSettings(patch)
      setOverlaySettings(saved.overlay)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '设置保存失败')
    }
  }

  const stop = async (): Promise<void> => {
    if (!api || !activeSessionId) return
    setState('stopping')
    setNotice('正在停止并整理最后一句字幕…')
    try {
      await onStopSession()
      setState('idle')
      setNotice('准备就绪')
    } catch (error) {
      setState('error')
      setNotice(error instanceof Error ? error.message : '停止字幕失败')
    }
  }

  const listening = Boolean(activeSessionId) || state === 'listening'
  const busy = state === 'starting' || state === 'stopping'
  const languageLabel = (code: string): string => t(LANGUAGE_LABELS[code] ?? code)
  const translationBadge = !translationVisible ? t('仅识别')
    : translationSettings.provider === 'hymt2'
      ? t('翻译 · Hy-MT2 本地')
      : translationSettings.provider === 'm2m100'
        ? t('翻译 · M2M100 本地')
        : `${t('翻译')} · ${translationSettings.provider}`

  const displayNoticeValues: TranslationValues = { ...noticeValues }
  if (typeof displayNoticeValues.name === 'string') {
    displayNoticeValues.name = displayNoticeValues.name.split(' → ').map((part) => t(part)).join(' → ')
  }

  return (
    <div className="page live-page">
      {state === 'starting' && <div className="session-loading" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><strong>{t('正在加载会话模型…')}</strong><span>{t(notice, displayNoticeValues)}</span></div>}
      <header className="page-heading">
        <div><h1>{t('实时字幕')}</h1><p>{t('捕获本机音频，显示原文并进行本地翻译。')}</p></div>
        <button className="button secondary-button" onClick={() => { void api?.showOverlay().catch((error: unknown) => setNotice(error instanceof Error ? error.message : '显示浮层失败')) }} type="button">
          <ClosedCaptionRegular aria-hidden /> {t('字幕浮层')}
        </button>
      </header>

      <div className="live-layout">
        <section className="surface session-card">
          <div className="card-heading-row">
            <h2>{t('新建字幕会话')}</h2>
            <span className="badge">{translationBadge}</span>
          </div>

          <div className="form-grid">
            <label><span>{t('音频来源')}</span>
              <select aria-label={t('音频来源')} value={audioSource} onChange={(event) => setAudioSource(event.target.value)}>
                <option value="defaultOutput">{t('系统声音（Windows 默认输出）')}</option>
                {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.name}{device.isDefault ? t('（默认）') : ''}</option>)}
              </select>
            </label>
            <label><span>{t('源语言')}</span>
              <select aria-label={t('源语言')} value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
                {SOURCE_LANGUAGE_OPTIONS.map((code) => (
                  <option key={code} value={code}>{code === 'auto' ? t('自动识别') : languageLabel(code)}</option>
                ))}
              </select>
            </label>
            <div
              aria-label={t('目标语言（可多选）')}
              className="multi-select"
              onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setTargetsOpen(false) }}
              onKeyDown={(event) => { if (event.key === 'Escape' && targetsOpen) { setTargetsOpen(false); event.currentTarget.querySelector('button')?.focus() } }}
              role="group"
            >
              <span className="multi-select-label" id="target-languages-label">{t('目标语言（可多选）')}</span>
              <button
                aria-expanded={targetsOpen}
                aria-haspopup="listbox"
                aria-labelledby="target-languages-label"
                className="multi-select-trigger"
                onClick={() => setTargetsOpen((current) => !current)}
                type="button"
              >
                <span className="multi-select-value" data-empty={targetLanguages.length === 0}>
                  {targetLanguages.length === 0 ? t('选择目标语言') : targetLanguages.map(languageLabel).join('、')}
                </span>
                <ChevronDownRegular aria-hidden className="multi-select-caret" />
              </button>
              {targetsOpen && (
                <div aria-multiselectable="true" className="multi-select-menu" role="listbox">
                  {TARGET_LANGUAGE_OPTIONS.map((code) => (
                    <label className="multi-select-option" key={code} role="option" aria-selected={targetLanguages.includes(code)}>
                      <input
                        checked={targetLanguages.includes(code)}
                        onChange={(event) => setTargetLanguages((current) => event.target.checked ? [...new Set([...current, code])] : current.filter((item) => item !== code))}
                        type="checkbox"
                      />
                      {languageLabel(code)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <fieldset className="display-options"><legend>{t('显示内容')}</legend>
            <label className="checkbox-label"><input checked={sourceVisible} onChange={(event) => void saveSettings({ overlay: { showSource: event.target.checked } })} type="checkbox" />{t('原文')}</label>
            <label className="checkbox-label"><input checked={translationVisible} onChange={(event) => void saveSettings({ overlay: { showTranslation: event.target.checked } })} type="checkbox" />{t('译文')}</label>
          </fieldset>

          <footer className="session-footer">
            <div className={`audio-level ${listening ? 'is-active' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="session-status" role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{t(notice, displayNoticeValues)}</div>
            {missingResource && <button className="text-button" onClick={onOpenResources} type="button">{t('打开模型管理')}</button>}
            <button
              className={`button ${listening ? 'secondary-button' : 'primary-button'} start-button`}
              disabled={busy || !api || !settingsReady}
              onClick={() => void (listening ? stop() : start())}
              type="button"
            >
              {listening ? <StopRegular aria-hidden /> : <PlayRegular aria-hidden />}
              {state === 'starting' ? t('正在启动') : state === 'stopping' ? t('正在停止') : listening ? t('停止字幕') : t('开始字幕')}
            </button>
          </footer>
        </section>

        <CaptionPreview caption={caption} listening={listening} modelProgress={modelProgress} overlay={overlaySettings} sourceVisible={sourceVisible} translationVisible={translationVisible} />
      </div>
    </div>
  )
}
