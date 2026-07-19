import { useEffect, useState } from 'react'

import type { CaptionSegment, EngineEvent } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/settings'

export function CaptionOverlay(): React.JSX.Element {
  const [segments, setSegments] = useState<CaptionSegment[]>([])
  const [status, setStatus] = useState('等待字幕会话')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    document.documentElement.dataset.overlay = 'true'
    const api = window.fluentCaptions
    if (!api) return
    void api.getSettings().then(setSettings)
    const unsubscribeSettings = api.onSettingsChanged(setSettings)
    const unsubscribeEvents = api.onEngineEvent((event: EngineEvent) => {
      if (event.type === 'caption') {
        setStatus(event.segment.isFinal ? '已识别' : '正在识别')
        setSegments((current) => {
          const index = current.findIndex((item) => item.segmentId === event.segment.segmentId)
          const next = [...current]
          if (index >= 0) {
            if (next[index].revision > event.segment.revision) return current
            next[index] = event.segment
          } else {
            next.push(event.segment)
          }
          return next.slice(-3)
        })
      } else if (event.type === 'sessionStarted') {
        setSegments([])
        setStatus('正在识别')
      } else if (event.type === 'sessionStopped') {
        setStatus('字幕会话已停止')
      } else if (event.type === 'error') {
        setStatus(`引擎状态：${event.code}`)
      }
    })
    return () => { unsubscribeSettings(); unsubscribeEvents() }
  }, [])

  const finishAdjustment = async (): Promise<void> => {
    const api = window.fluentCaptions
    if (!api) return
    setSettings(await api.updateSettings({ overlay: { locked: true } }))
  }

  const hideOverlay = async (): Promise<void> => {
    await window.fluentCaptions?.hideOverlay()
  }

  const current = segments.at(-1)
  const visibleSegments = segments.slice(-Math.max(1, Math.min(settings.overlay.maxLines, 3)))
  const sourceLines = visibleSegments.map((segment) => segment.sourceText).filter(Boolean).join('\n')
  const completeTranslations = new Map<string, string[]>()
  for (const segment of visibleSegments) {
    for (const translation of segment.translations) {
      if (translation.state !== 'complete' || !translation.text) continue
      const lines = completeTranslations.get(translation.targetLanguage) ?? []
      lines.push(translation.text)
      completeTranslations.set(translation.targetLanguage, lines)
    }
  }
  const pendingTargets = current?.translations.filter((translation) => translation.state === 'pending') ?? []
  const failedTargets = current?.translations.filter((translation) => translation.state === 'failed') ?? []
  return (
    <main
      className="standalone-overlay"
      data-locked={settings.overlay.locked}
      data-transparent-background={settings.overlay.backgroundOpacity <= 0}
      aria-live="polite"
      style={{
        '--overlay-background-opacity': settings.overlay.backgroundOpacity,
        '--overlay-source-color': settings.overlay.sourceColor,
        '--overlay-translation-color': settings.overlay.translationColor,
        '--overlay-font-size': `${settings.overlay.fontSize}px`,
        '--overlay-font-weight': settings.overlay.fontWeight,
        '--overlay-line-height': settings.overlay.lineHeight,
        '--overlay-max-lines': settings.overlay.maxLines,
        fontFamily: settings.overlay.fontFamily,
      } as React.CSSProperties}
    >
      {!settings.overlay.locked && (
        <div className="overlay-edit-bar">
          <span className="overlay-drag-hint">拖动浮层移动 · 拖动边缘或右下角缩放</span>
          <span className="overlay-edit-actions">
            <button onClick={() => void finishAdjustment()} type="button">完成调整</button>
            <button onClick={() => void hideOverlay()} type="button">隐藏浮层</button>
          </span>
        </div>
      )}
      <div className="overlay-status"><span className="status-dot" aria-hidden="true" />{status}</div>
      <div className="overlay-lines">
        {settings.overlay.showSource && <p className="overlay-source">{sourceLines || '开始字幕后，原文会显示在这里。'}</p>}
        {settings.overlay.showTranslation && [...completeTranslations].map(([targetLanguage, lines]) => (
          <p className="overlay-translation" key={targetLanguage}>{lines.join('\n')}</p>
        ))}
        {settings.overlay.showTranslation && pendingTargets.map((translation) => (
          !completeTranslations.has(translation.targetLanguage) && <p className="overlay-translation" key={translation.targetLanguage}>正在翻译…</p>
        ))}
        {settings.overlay.showTranslation && failedTargets.map((translation) => (
          !completeTranslations.has(translation.targetLanguage) && <p className="overlay-translation" key={translation.targetLanguage}>翻译不可用：{translation.errorCode}</p>
        ))}
      </div>
      {!settings.overlay.locked && <span aria-hidden="true" className="overlay-resize-cue" />}
    </main>
  )
}
