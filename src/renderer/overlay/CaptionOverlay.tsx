import { useEffect, useReducer, useRef, useState } from 'react'

import type { CaptionSegment, EngineEvent } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/settings'

import { CaptionText } from '../components/CaptionText'
import { captionPages } from '../components/caption-pages'
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
  const [page, setPage] = useState({ segmentId: '', index: 0 })
  const resizeStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const previousRef = useRef<{ sessionId: string | null; segment: CaptionSegment } | null>(null)
  const leavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finishAdjustment = async (): Promise<void> => {
    try {
      const saved = await window.fluentCaptions?.updateSettings({ overlay: { locked: true } })
      if (saved) setSettings(saved)
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法完成浮层调整') }
  }

  const beginAdjustment = async (): Promise<void> => {
    try {
      const saved = await window.fluentCaptions?.updateSettings({ overlay: { mode: 'free', locked: false } })
      if (saved) setSettings(saved)
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法调整浮层') }
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

  const caption = current.caption
  const pages = captionPages(caption?.sourceText ?? '')
  const pageIndex = caption && page.segmentId === caption.segmentId
    ? Math.min(page.index, Math.max(0, pages.length - 1))
    : caption?.isFinal ? 0 : Math.max(0, pages.length - 1)
  const visible = caption && pages.length ? {
    ...caption,
    segmentId: `${caption.segmentId}:${pageIndex}`,
    sourceText: pages[pageIndex],
    translations: caption.translations.map((item) => {
      if (!item.text) return item
      const translatedPages = captionPages(item.text)
      return { ...item, text: translatedPages[Math.min(pageIndex, translatedPages.length - 1)] ?? '' }
    }),
  } : null

  useEffect(() => {
    if (!caption) return
    if (page.segmentId !== caption.segmentId) {
      setPage({ segmentId: caption.segmentId, index: caption.isFinal ? 0 : Math.max(0, pages.length - 1) })
    } else if (!caption.isFinal && page.index !== pages.length - 1) {
      setPage({ segmentId: caption.segmentId, index: Math.max(0, pages.length - 1) })
    }
  }, [caption?.segmentId, caption?.isFinal, caption?.sourceText])

  useEffect(() => {
    if (!caption?.isFinal || page.segmentId !== caption.segmentId || page.index >= pages.length - 1) return
    const timer = setTimeout(() => setPage((value) => ({ ...value, index: value.index + 1 })),
      Math.min(3500, Math.max(1700, pages[page.index].length * 45)))
    return () => clearTimeout(timer)
  }, [caption?.segmentId, caption?.isFinal, caption?.sourceText, page])

  // A new sentence retains the old row briefly so it can travel upward.
  useEffect(() => {
    const segment = visible
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
  }, [current.sessionId, visible?.segmentId, visible?.sourceText])

  useEffect(() => () => { if (leavingTimer.current) clearTimeout(leavingTimer.current) }, [])

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!resizeStart.current) return
    const { x, y, width, height } = resizeStart.current
    void window.fluentCaptions?.resizeOverlay(width + event.screenX - x, height + event.screenY - y)
  }
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
          '--caption-track-count': Math.max(1, Number(settings.overlay.showSource) + (settings.overlay.showTranslation ? visible?.translations.filter((item) => item.state === 'complete' && item.text).length ?? 0 : 0)),
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
        <div className="overlay-adjustment-controls">
          {notice && <span role="status">{t(notice)}</span>}
          {settings.overlay.locked
            ? <button type="button" onClick={() => void beginAdjustment()}>{t('调整浮层')}</button>
            : <button type="button" onClick={() => void finishAdjustment()}>{t('完成调整')}</button>}
          <button type="button" onClick={() => void hide()} aria-label={t('隐藏浮层')}>×</button>
        </div>
        <div className="overlay-lines">
          {!visible && settings.overlay.showSource && <CaptionText className="overlay-source">{t('正在识别语音…')}</CaptionText>}
          {visible && leaving && leaving.segmentId !== visible.segmentId && renderRow(leaving, 'overlay-caption-row overlay-caption-leaving', true)}
          {visible && renderRow(visible, 'overlay-caption-row overlay-caption-entering')}
        </div>
        {!settings.overlay.locked && <div className="overlay-resize-grip" role="button" tabIndex={0} aria-label={t('拖动调整浮层大小')}
          onKeyDown={(event) => {
            const dx = event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0
            const dy = event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0
            if (dx || dy) {
              event.preventDefault()
              void window.fluentCaptions?.resizeOverlay(window.innerWidth + dx, window.innerHeight + dy)
            }
          }}
          onPointerDown={(event) => {
            resizeStart.current = { x: event.screenX, y: event.screenY, width: window.innerWidth, height: window.innerHeight }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={onResizeMove}
          onPointerUp={(event) => { resizeStart.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
        />}
      </section>
    </main>
  )
}
