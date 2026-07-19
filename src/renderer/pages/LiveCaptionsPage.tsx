import { useEffect, useMemo, useState } from 'react'
import { ClosedCaptionRegular, PlayRegular, StopRegular } from '@fluentui/react-icons'

import type { AudioDevice, CaptionSegment, EngineEvent, SessionConfig } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type TranslationSettings } from '../../shared/settings'
import { CaptionPreview } from '../components/CaptionPreview'

type SessionState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error'

export function LiveCaptionsPage(): React.JSX.Element {
  const [state, setState] = useState<SessionState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [audioSource, setAudioSource] = useState('defaultOutput')
  const [recognitionMode, setRecognitionMode] = useState<'realtime' | 'accurate'>('realtime')
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguages, setTargetLanguages] = useState<string[]>(['zh'])
  const [translationSettings, setTranslationSettings] = useState<TranslationSettings>(DEFAULT_SETTINGS.translation)
  const [sourceVisible, setSourceVisible] = useState(true)
  const [translationVisible, setTranslationVisible] = useState(true)
  const [caption, setCaption] = useState<CaptionSegment | null>(null)
  const [modelProgress, setModelProgress] = useState<number | null>(null)
  const [notice, setNotice] = useState('正在连接本地引擎…')

  const api = window.fluentCaptions
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
        setNotice((current) => current === '正在连接本地引擎…' ? '准备就绪' : current)
      }
    }).catch((error: unknown) => {
      if (active) {
        setState('error')
        setNotice(error instanceof Error ? error.message : '无法读取音频设备')
      }
    })
    const unsubscribe = api.onEngineEvent((event: EngineEvent) => {
      if (event.type === 'caption') {
        setCaption((current) => {
          if (!current || current.segmentId !== event.segment.segmentId) return event.segment
          return event.segment.revision >= current.revision ? event.segment : current
        })
      } else if (event.type === 'modelProgress') {
        setModelProgress(event.progress)
        setNotice(event.state === 'complete' ? '模型已准备完成' : `正在准备 ${event.modelId}`)
      } else if (event.type === 'error') {
        setNotice(`引擎错误：${event.code}`)
        if (!event.recoverable) setState('error')
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [api])

  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === audioSource),
    [audioSource, devices]
  )

  const start = async (): Promise<void> => {
    if (!api) return
    setState('starting')
    setCaption(null)
    setModelProgress(null)
    setNotice('正在启动本地字幕引擎…')
    const config: SessionConfig = {
      audioSource: selectedDevice
        ? { kind: selectedDevice.kind, deviceId: selectedDevice.deviceId }
        : { kind: 'defaultOutput' },
      recognitionMode,
      sourceLanguage,
      targetLanguages: translationVisible ? targetLanguages : [],
      allowIntermediateTranslation: translationSettings.allowIntermediate,
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
      const result = await api.startSession(config)
      setSessionId(result.sessionId)
      setState('listening')
      setNotice('正在监听音频')
    } catch (error) {
      setState('error')
      setNotice(error instanceof Error ? error.message : '字幕会话启动失败')
    }
  }

  const stop = async (): Promise<void> => {
    if (!api || !sessionId) return
    setState('stopping')
    setNotice('正在停止并整理最后一句字幕…')
    try {
      await api.stopSession(sessionId)
      setSessionId(null)
      setState('idle')
      setNotice('准备就绪')
    } catch (error) {
      setState('error')
      setNotice(error instanceof Error ? error.message : '停止字幕失败')
    }
  }

  const listening = state === 'listening'
  const busy = state === 'starting' || state === 'stopping'

  return (
    <div className="page live-page">
      <header className="page-heading">
        <div><h1>实时字幕</h1><p>捕获本机音频，显示原文并进行本地翻译。</p></div>
        <button className="button secondary-button" onClick={() => void api?.showOverlay()} type="button">
          <ClosedCaptionRegular aria-hidden /> 字幕浮层
        </button>
      </header>

      <div className="live-layout">
        <section className="surface session-card">
          <div className="card-heading-row">
            <div><h2>新建字幕会话</h2><p>模型安装完成后可完全离线运行。</p></div>
            <span className="badge">翻译 · {translationSettings.provider === 'argos' ? 'Argos 本地' : translationSettings.provider}</span>
          </div>

          <div className="form-grid">
            <label><span>音频来源</span>
              <select aria-label="音频来源" value={audioSource} onChange={(event) => setAudioSource(event.target.value)}>
                <option value="defaultOutput">系统声音（Windows 默认输出）</option>
                {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.name}{device.isDefault ? '（默认）' : ''}</option>)}
              </select>
            </label>
            <label><span>识别模式</span>
              <select aria-label="识别模式" value={recognitionMode} onChange={(event) => { const mode = event.target.value as 'realtime' | 'accurate'; setRecognitionMode(mode); if (mode === 'realtime' && !['auto', 'zh', 'en'].includes(sourceLanguage)) setSourceLanguage('auto') }}>
                <option value="realtime">实时模式 · sherpa-onnx</option>
                <option value="accurate">高精度模式 · Whisper</option>
              </select>
            </label>
            <label><span>源语言</span>
              <select aria-label="源语言" value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
                <option value="auto">自动识别</option><option value="zh">中文</option><option value="en">English</option>
                <option value="ja" disabled={recognitionMode === 'realtime'}>日本語（高精度模式）</option>
                <option value="ko" disabled={recognitionMode === 'realtime'}>한국어（高精度模式）</option>
                <option value="fr" disabled={recognitionMode === 'realtime'}>Français（高精度模式）</option>
                <option value="de" disabled={recognitionMode === 'realtime'}>Deutsch（高精度模式）</option>
                <option value="es" disabled={recognitionMode === 'realtime'}>Español（高精度模式）</option>
                <option value="ru" disabled={recognitionMode === 'realtime'}>Русский（高精度模式）</option>
              </select>
            </label>
            <fieldset className="language-targets"><legend>目标语言（可多选）</legend>
              {[['zh', '中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['ru', 'Русский']].map(([code, label]) => <label className="checkbox-label" key={code}><input checked={targetLanguages.includes(code)} onChange={(event) => setTargetLanguages((current) => event.target.checked ? [...new Set([...current, code])] : current.filter((item) => item !== code))} type="checkbox" />{label}</label>)}
            </fieldset>
          </div>

          <fieldset className="display-options"><legend>显示内容</legend>
            <label className="checkbox-label"><input checked={sourceVisible} onChange={(event) => setSourceVisible(event.target.checked)} type="checkbox" />原文</label>
            <label className="checkbox-label"><input checked={translationVisible} onChange={(event) => setTranslationVisible(event.target.checked)} type="checkbox" />译文</label>
          </fieldset>

          <footer className="session-footer">
            <div className={`audio-level ${listening ? 'is-active' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="session-status" role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{notice}</div>
            <button
              className={`button ${listening ? 'secondary-button' : 'primary-button'} start-button`}
              disabled={busy || !api}
              onClick={() => void (listening ? stop() : start())}
              type="button"
            >
              {listening ? <StopRegular aria-hidden /> : <PlayRegular aria-hidden />}
              {state === 'starting' ? '正在启动' : state === 'stopping' ? '正在停止' : listening ? '停止字幕' : '开始字幕'}
            </button>
          </footer>
        </section>

        <CaptionPreview caption={caption} listening={listening} modelProgress={modelProgress} sourceVisible={sourceVisible} translationVisible={translationVisible} />
      </div>
    </div>
  )
}
