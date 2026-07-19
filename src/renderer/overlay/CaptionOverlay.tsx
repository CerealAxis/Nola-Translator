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
  return (
    <main
      className="standalone-overlay"
      data-locked={settings.overlay.locked}
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
        {settings.overlay.showSource && <p className="overlay-source">{current?.sourceText || '开始字幕后，原文会显示在这里。'}</p>}
        {settings.overlay.showTranslation && current?.translations.map((translation) => (
          <p className="overlay-translation" key={translation.targetLanguage}>
            {translation.state === 'complete' ? translation.text : translation.state === 'pending' ? '正在翻译…' : `翻译不可用：${translation.errorCode}`}
          </p>
        ))}
      </div>
      {!settings.overlay.locked && <span aria-hidden="true" className="overlay-resize-cue" />}
    </main>
  )
}
