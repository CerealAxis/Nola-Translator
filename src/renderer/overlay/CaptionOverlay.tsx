import { useEffect, useReducer, useRef, useState } from 'react'

import type { CaptionSegment, EngineEvent } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/settings'

import { CaptionText } from '../components/CaptionText'
import { EMPTY_CAPTION, receiveCaption } from '../components/caption-state'
import { useI18n } from '../i18n'

// 离场动画时长与 CSS 的 caption-roll-out 保持一致。
const LEAVING_DURATION_MS = 320

export function CaptionOverlay(): React.JSX.Element {
  const { t } = useI18n()
  const [current, dispatch] = useReducer(receiveCaption, EMPTY_CAPTION)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [notice, setNotice] = useState('')
  const [leaving, setLeaving] = useState<CaptionSegment | null>(null)
  const previousRef = useRef<{ sessionId: string | null; segment: CaptionSegment } | null>(null)
  const leavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finishAdjustment = async (): Promise<void> => {
    try {
      const saved = await window.fluentCaptions?.updateSettings({ overlay: { locked: true } })
      if (saved) setSettings(saved)
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法完成浮层调整') }
  }

  const hide = async (): Promise<void> => {
    try { await window.fluentCaptions?.hideOverlay() }
    catch (error) { setNotice(error instanceof Error ? error.message : '隐藏浮层失败') }
  }

  useEffect(() => {
    document.documentElement.dataset.overlay = 'true'
    const api = window.fluentCaptions
    if (!api) return
    void api.getSettings().then(setSettings).catch(() => undefined)
    const unsubscribeSettings = api.onSettingsChanged(setSettings)
    const unsubscribeEvents = api.onEngineEvent((event: EngineEvent) => {
      dispatch(event)
    })
    return () => { unsubscribeSettings(); unsubscribeEvents() }
  }, [])

  // 换句时把旧句留 320ms 做向上滚出；新会话直接切换不播离场动画。
  useEffect(() => {
    const segment = current.caption
    if (!segment) {
      previousRef.current = null
      setLeaving(null)
      return
    }
    const previous = previousRef.current
    if (previous && previous.segment.segmentId !== segment.segmentId) {
      if (previous.sessionId === current.sessionId) {
        setLeaving(previous.segment)
        if (leavingTimer.current) clearTimeout(leavingTimer.current)
        leavingTimer.current = setTimeout(() => setLeaving(null), LEAVING_DURATION_MS)
      } else {
        setLeaving(null)
      }
    }
    previousRef.current = { sessionId: current.sessionId, segment }
  }, [current])

  useEffect(() => () => { if (leavingTimer.current) clearTimeout(leavingTimer.current) }, [])

  const caption = current.caption
  const renderRow = (segment: CaptionSegment, className: string, hidden = false): React.JSX.Element => (
    <section className={className} key={segment.segmentId} aria-hidden={hidden || undefined}>
      {settings.overlay.showSource && <CaptionText className="overlay-source">{segment.sourceText}</CaptionText>}
      {settings.overlay.showTranslation && segment.translations
        .filter((translation) => translation.state === 'complete' && translation.text)
        .map((translation) => <CaptionText className="overlay-translation" key={translation.targetLanguage}>{translation.text!}</CaptionText>)}
    </section>
  )
  return (
    <main
      className="overlay-window"
      data-adjusting={!settings.overlay.locked}
    >
      <section
        className="standalone-overlay"
        data-locked={settings.overlay.locked}
        data-color-scheme={settings.overlay.colorScheme}
        data-transparent-background={settings.overlay.backgroundOpacity <= 0}
        aria-live="polite"
        style={{
          '--caption-track-count': Math.max(1, Number(settings.overlay.showSource) + (settings.overlay.showTranslation ? current.caption?.translations.filter((item) => item.state === 'complete' && item.text).length ?? 0 : 0)),
          '--overlay-background-alpha': `${settings.overlay.backgroundOpacity * 100}%`,
          '--overlay-background-color': settings.overlay.backgroundColor,
          '--overlay-source-color': settings.overlay.sourceColor,
          '--overlay-translation-color': settings.overlay.translationColor,
          '--overlay-font-size': `${settings.overlay.fontSize}px`,
          '--overlay-font-weight': settings.overlay.fontWeight,
          '--overlay-line-height': settings.overlay.lineHeight,
          '--overlay-max-lines': settings.overlay.maxLines,
          '--overlay-translation-font-size': `${settings.overlay.translationFontSize}px`,
          '--overlay-translation-font-weight': settings.overlay.translationFontWeight,
          '--overlay-translation-line-height': settings.overlay.translationLineHeight,
          '--overlay-translation-max-lines': settings.overlay.translationMaxLines,
          fontFamily: settings.overlay.fontFamily,
        } as React.CSSProperties}
        >
        {!settings.overlay.locked && <div className="overlay-adjustment-controls">
          {notice && <span role="status">{t(notice)}</span>}
          <button type="button" onClick={() => void finishAdjustment()}>{t('完成调整')}</button>
          <button type="button" onClick={() => void hide()}>{t('隐藏浮层')}</button>
        </div>}
        <div className="overlay-lines">
          {!caption && settings.overlay.showSource && <CaptionText className="overlay-source">{t('开始字幕后，原文会显示在这里。')}</CaptionText>}
          {caption && leaving && leaving.segmentId !== caption.segmentId && renderRow(leaving, 'overlay-caption-row overlay-caption-leaving', true)}
          {caption && renderRow(caption, 'overlay-caption-row')}
        </div>
      </section>
    </main>
  )
}
