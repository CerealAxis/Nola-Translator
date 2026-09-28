import { useEffect, useReducer, useRef, useState } from 'react'
import {
  ChevronDownRegular, DesktopRegular, DismissRegular, LockClosedRegular, LockOpenRegular, MicRegular,
  MoreHorizontalRegular, PinRegular, SubtractRegular,
} from '@fluentui/react-icons'

import type { EngineEvent } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type AppSettings, type OverlaySettings } from '../../shared/settings'
import { EMPTY_CAPTION, receiveCaption } from '../components/caption-state'
import { translationErrorLabel } from '../components/translation-status'
import { useI18n } from '../i18n'
import { CaptionTrack, type TrackLine } from './CaptionTrack'

export function CaptionOverlay(): React.JSX.Element {
  const { t } = useI18n()
  const [current, dispatch] = useReducer(receiveCaption, EMPTY_CAPTION)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [active, setActive] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [notice, setNotice] = useState('')
  const resizeStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const expandedHeight = useRef(118)

  useEffect(() => {
    document.documentElement.dataset.overlay = 'true'
    const api = window.nolaTranslator
    if (!api) return
    void api.getSettings().then(setSettings).catch(() => undefined)
    const offSettings = api.onSettingsChanged(setSettings)
    const offEngine = api.onEngineEvent((event: EngineEvent) => {
      if (event.type === 'sessionStarted') setActive(true)
      if (event.type === 'sessionStopped') setActive(false)
      dispatch(event)
    })
    return () => { offSettings(); offEngine() }
  }, [])

  const caption = current.caption
  const sourceLine: TrackLine | null = caption?.sourceText
    ? { key: caption.segmentId, text: caption.sourceText }
    : null

  const translationTracks = (caption?.translations ?? []).map((item) => {
    const line = item.state === 'complete' && item.text
      ? { key: caption!.segmentId, text: item.text }
      : item.state === 'failed'
        // 失败不能和「还在翻译」一样静默，否则看不出是密钥、网络还是模型没就绪。
        ? { key: caption!.segmentId, text: translationErrorLabel(t, item) }
        : null
    return { language: item.targetLanguage, line }
  })

  const updateOverlay = async (overlay: Partial<OverlaySettings>): Promise<void> => {
    try {
      const saved = await window.nolaTranslator?.updateSettings({ overlay })
      if (saved) setSettings(saved)
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法修改浮层设置') }
  }
  const hide = async (): Promise<void> => {
    try { await window.nolaTranslator?.hideOverlay() }
    catch (error) { setNotice(error instanceof Error ? error.message : '隐藏浮层失败') }
  }
  const toggleCollapse = (): void => {
    if (!collapsed) expandedHeight.current = window.innerHeight
    void window.nolaTranslator?.resizeOverlay(window.innerWidth, collapsed ? expandedHeight.current : 56)
    setCollapsed(!collapsed)
  }
  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!resizeStart.current) return
    const { x, y, width, height } = resizeStart.current
    void window.nolaTranslator?.resizeOverlay(width + event.screenX - x, height + event.screenY - y)
  }

  return <main className="overlay-window">
    <section className="caption-console" data-locked={settings.overlay.locked} data-color-scheme={settings.overlay.colorScheme}
      data-transparent-background={settings.overlay.backgroundOpacity <= 0} data-collapsed={collapsed}
      style={{
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
      } as React.CSSProperties}>
      <div className="caption-console-stage">
        {!collapsed && settings.overlay.showSource && <CaptionTrack key={`source-${current.sessionId}`} kind="source" segmentId={caption?.segmentId ?? null} line={sourceLine} />}
        {!collapsed && settings.overlay.showTranslation && translationTracks.map(({ language, line }) =>
          <CaptionTrack key={`${current.sessionId}-${language}`} kind="translation" segmentId={caption?.segmentId ?? null} line={line} />)}
      </div>

      <div className="caption-console-actions" aria-label={t('字幕浮层控制')}>
        <button type="button" title={t('切换字幕位置')} aria-label={t('切换字幕位置')}
          onClick={() => void updateOverlay({ mode: settings.overlay.mode === 'top' ? 'bottom' : 'top' })}><DesktopRegular /></button>
        <button type="button" title={settings.overlay.locked ? t('解锁位置') : t('锁定位置')} aria-label={settings.overlay.locked ? t('解锁位置') : t('锁定位置')}
          onClick={() => void updateOverlay({ mode: 'free', locked: !settings.overlay.locked })}>
          {settings.overlay.locked ? <LockClosedRegular /> : <LockOpenRegular />}</button>
        <button type="button" data-active={settings.overlay.alwaysOnTop} title={t('始终置顶')} aria-label={t('始终置顶')}
          onClick={() => void updateOverlay({ alwaysOnTop: !settings.overlay.alwaysOnTop })}><PinRegular /></button>
        <span className="caption-action-divider" aria-hidden="true" />
        <button type="button" title={t('打开字幕设置')} aria-label={t('打开字幕设置')}
          onClick={() => void window.nolaTranslator?.openAppearance()}><MoreHorizontalRegular /></button>
        <button type="button" title={collapsed ? t('展开浮层') : t('收起浮层')} aria-label={collapsed ? t('展开浮层') : t('收起浮层')}
          onClick={toggleCollapse}><SubtractRegular /></button>
        <button type="button" title={t('隐藏浮层')} aria-label={t('隐藏浮层')} onClick={() => void hide()}><DismissRegular /></button>
      </div>

      {!collapsed && <div className="caption-console-controls">
        <span className="caption-mic" data-active={active} title={active ? t('正在监听音频') : t('等待字幕会话')}><MicRegular /></span>
        <button type="button" className="caption-control-pill caption-mode-pill" title={t('打开字幕设置')}
          onClick={() => void window.nolaTranslator?.openAppearance()}><span className="caption-mode-dot" />{t('本地字幕')}<ChevronDownRegular /></button>
        <button type="button" className="caption-control-pill" data-active={settings.overlay.showSource}
          aria-pressed={settings.overlay.showSource} onClick={() => void updateOverlay({ showSource: !settings.overlay.showSource })}>{t('原文')}</button>
        <button type="button" className="caption-control-pill" data-active={settings.overlay.showTranslation}
          aria-pressed={settings.overlay.showTranslation} onClick={() => void updateOverlay({ showTranslation: !settings.overlay.showTranslation })}>{t('译文')}</button>
      </div>}
      {notice && <span className="caption-console-notice" role="status">{t(notice)}</span>}
      {!collapsed && !settings.overlay.locked && <div className="overlay-resize-grip" role="button" tabIndex={0} aria-label={t('拖动调整浮层大小')}
        onKeyDown={(event) => {
          const dx = event.key === 'ArrowRight' ? 16 : event.key === 'ArrowLeft' ? -16 : 0
          const dy = event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0
          if (dx || dy) { event.preventDefault(); void window.nolaTranslator?.resizeOverlay(window.innerWidth + dx, window.innerHeight + dy) }
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
}
