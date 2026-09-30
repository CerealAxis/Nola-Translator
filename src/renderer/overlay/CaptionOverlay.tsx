import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import {
  BoardRegular, ChevronDownRegular, DesktopRegular, DismissRegular, LockClosedRegular, LockOpenRegular, MicRegular,
  MoreHorizontalRegular, PinRegular, StopRegular, SubtractRegular,
} from '@fluentui/react-icons'

import type { EngineEvent } from '../../shared/contracts'
import { DEFAULT_SETTINGS, type AppSettings, type OverlaySettings } from '../../shared/settings'
import { EMPTY_CAPTION, receiveCaption } from '../components/caption-state'
import { translationErrorLabel } from '../components/translation-status'
import { useI18n } from '../i18n'
import {
  buildSessionConfig, findMissingResource, resolveAudioSource, shortLanguageLabel,
  translationModelDetail, translationProviderLabel,
} from '../session'
import { CaptionTrack, type TrackLine } from './CaptionTrack'
import { allocateCaptionLines } from './line-budget'

type DisplayMode = 'bilingual' | 'source' | 'translation'

type CaptionLayout = 'rolling' | 'sentence'

const LAYOUT_OPTIONS: { value: CaptionLayout; label: string; hint: string }[] = [
  { value: 'rolling', label: '分区对照', hint: '转写翻译，分区显示' },
  { value: 'sentence', label: '逐句对照', hint: '按句分段，语意清晰' },
]

/** One pill cycles 双语 → 原文 → 译文 → 双语, so each entry is the patch for the *next* mode. */
const NEXT_DISPLAY: Record<DisplayMode, Pick<OverlaySettings, 'showSource' | 'showTranslation'>> = {
  bilingual: { showSource: true, showTranslation: false },
  source: { showSource: false, showTranslation: true },
  translation: { showSource: true, showTranslation: true },
}

export function CaptionOverlay(): React.JSX.Element {
  const { t } = useI18n()
  const [current, dispatch] = useReducer(receiveCaption, EMPTY_CAPTION)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [overlaySize, setOverlaySize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [stageBox, setStageBox] = useState(() => ({ height: Math.max(0, window.innerHeight - 52), gap: 6 }))
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const layoutMenuRef = useRef<HTMLDivElement | null>(null)
  const resizeStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const expandedHeight = useRef(218)

  useEffect(() => {
    document.documentElement.dataset.overlay = 'true'
    const api = window.nolaTranslator
    if (!api) return
    void api.getSettings().then(setSettings).catch(() => undefined)
    const offSettings = api.onSettingsChanged(setSettings)
    const offEngine = api.onEngineEvent((event: EngineEvent) => {
      if (event.type === 'sessionStarted') setSessionId(event.sessionId)
      if (event.type === 'sessionStopped') setSessionId(null)
      dispatch(event)
    })
    return () => { offSettings(); offEngine() }
  }, [])

  useEffect(() => {
    const onResize = (): void => setOverlaySize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Resolved from raw pointer coordinates rather than enter/leave: the card is a drag region while unlocked
  // and its rounded corners leave the pointer over the wrapper, both of which swallow the synthetic events.
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const inside = (event: MouseEvent): boolean => {
      const rect = card.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom
    }
    const onMove = (event: MouseEvent): void => setHovered(inside(event))
    const onLeave = (): void => setHovered(false)
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => { window.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave) }
  }, [])

  const overlay = settings.overlay
  const visible = !collapsed && (overlay.showSource || overlay.showTranslation)

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || stage.clientHeight <= 0) return
    const style = window.getComputedStyle(stage)
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    setStageBox({ height: Math.max(0, stage.clientHeight - padding), gap: Number.parseFloat(style.rowGap) || 0 })
  }, [overlaySize.height, visible, overlay.showSource, overlay.showTranslation])

  const caption = current.caption
  const sourceLine: TrackLine | null = caption?.sourceText
    ? { key: caption.segmentId, text: caption.sourceText }
    : null

  // Track identity comes from the configured target language, never from the incoming segment: an
  // intermediate carries no translation, and deriving the list from it would unmount the track and
  // throw away the transcript it has accumulated so far.
  const translationTracks = [settings.translation.targetLanguage].map((language) => {
    const item = caption?.translations.find((entry) => entry.targetLanguage === language)
    const line = item?.state === 'complete' && item.text
      ? { key: caption!.segmentId, text: item.text }
      : item?.state === 'failed'
        // A failed translation must not go silent like a pending one, or the user cannot tell a bad key from a missing model.
        ? { key: caption!.segmentId, text: translationErrorLabel(t, item) }
        : null
    return { language, line }
  })
  // Whether a track owns space depends on the user's display mode, not on whether text has arrived yet:
  // keying it to "has text" would hand the whole stage to the source while a translation is still pending
  // and then halve it the moment the translation lands, so the rows would jump on every segment.
  const lineBudgets = allocateCaptionLines(stageBox.height, [
    { visible: overlay.showSource, fontSize: overlay.fontSize, lineHeight: overlay.lineHeight },
    ...translationTracks.map(() => ({
      visible: overlay.showTranslation,
      fontSize: overlay.translationFontSize, lineHeight: overlay.translationLineHeight,
    })),
  ], stageBox.gap)

  const updateOverlay = async (patch: Partial<OverlaySettings>): Promise<void> => {
    try {
      const saved = await window.nolaTranslator?.updateSettings({ overlay: patch })
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

  const toggleSession = async (): Promise<void> => {
    const api = window.nolaTranslator
    if (!api || sessionBusy) return
    setSessionBusy(true)
    setNotice('')
    try {
      if (sessionId) {
        await api.stopSession(sessionId)
        return
      }
      const config = buildSessionConfig(settings, await resolveAudioSource(api, settings.recognition.audioSource))
      const missing = findMissingResource(await api.listResources(), config)
      if (missing) {
        setNotice(t('{name}模型尚未安装，请先到“模型与资源”页面安装。', { name: missing.name }))
        await api.openAppearance('resources')
        return
      }
      setSessionId((await api.startSession(config)).sessionId)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '字幕会话启动失败')
    } finally {
      setSessionBusy(false)
    }
  }

  const displayMode: DisplayMode = overlay.showSource && !overlay.showTranslation
    ? 'source'
    : !overlay.showSource && overlay.showTranslation ? 'translation' : 'bilingual'
  const displayLabel: Record<DisplayMode, string> = {
    bilingual: t('双语'), source: t('原文'), translation: t('译文'),
  }
  const modelDetail = translationModelDetail(settings.translation)
  const languagePair = `${shortLanguageLabel(settings.recognition.sourceLanguage)} → ${shortLanguageLabel(settings.translation.targetLanguage)}`
  const layout: CaptionLayout = overlay.layout === 'sentence' ? 'sentence' : 'rolling'

  // Close the layout popover when the user clicks anywhere outside it.
  useEffect(() => {
    if (!layoutMenuOpen) return
    const onPointer = (event: PointerEvent): void => {
      const menu = layoutMenuRef.current
      if (menu && event.target instanceof Node && menu.contains(event.target)) return
      setLayoutMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [layoutMenuOpen])

  const setLayout = (next: CaptionLayout): void => {
    setLayoutMenuOpen(false)
    if (next === layout) return
    void updateOverlay({ layout: next })
  }

  return <main className="overlay-window">
    <section className="caption-console" ref={cardRef} data-locked={overlay.locked} data-color-scheme={overlay.colorScheme}
      data-transparent-background={overlay.backgroundOpacity <= 0} data-collapsed={collapsed} data-hover={hovered}
      style={{
        '--overlay-background-alpha': `${overlay.backgroundOpacity * 100}%`,
        '--overlay-background-color': overlay.backgroundColor,
        '--overlay-source-color': overlay.sourceColor,
        '--overlay-translation-color': overlay.translationColor,
        '--overlay-font-size': `${overlay.fontSize}px`,
        '--overlay-font-weight': overlay.fontWeight,
        '--overlay-line-height': overlay.lineHeight,
        '--overlay-translation-font-size': `${overlay.translationFontSize}px`,
        '--overlay-translation-font-weight': overlay.translationFontWeight,
        '--overlay-translation-line-height': overlay.translationLineHeight,
        fontFamily: overlay.fontFamily,
      } as React.CSSProperties}>
      <div className="caption-console-stage" ref={stageRef}>
        {visible && overlay.showSource && <CaptionTrack key={`source-${current.sessionId}`} kind="source" line={sourceLine} maxLines={lineBudgets[0]} layout={layout} />}
        {visible && overlay.showTranslation && <div className="caption-console-translations">{translationTracks.map(({ language, line }, index) =>
          <CaptionTrack key={`${current.sessionId}-${language}`} kind="translation" line={line} maxLines={lineBudgets[index + 1]} layout={layout} />)}</div>}
      </div>

      <div className="caption-console-scrim caption-console-scrim-top" aria-hidden="true" />
      <div className="caption-console-scrim caption-console-scrim-bottom" aria-hidden="true" />

      <div className="caption-console-actions" aria-label={t('字幕浮层控制')}>
        <button type="button" title={t('切换字幕位置')} aria-label={t('切换字幕位置')}
          onClick={() => void updateOverlay({ mode: overlay.mode === 'top' ? 'bottom' : 'top' })}><DesktopRegular /></button>
        <button type="button" title={overlay.locked ? t('解锁位置') : t('锁定位置')} aria-label={overlay.locked ? t('解锁位置') : t('锁定位置')}
          onClick={() => void updateOverlay({ mode: 'free', locked: !overlay.locked })}>
          {overlay.locked ? <LockClosedRegular /> : <LockOpenRegular />}</button>
        <button type="button" data-active={overlay.alwaysOnTop} title={t('始终置顶')} aria-label={t('始终置顶')}
          onClick={() => void updateOverlay({ alwaysOnTop: !overlay.alwaysOnTop })}><PinRegular /></button>
        <span className="caption-action-divider" aria-hidden="true" />
        <button type="button" title={t('打开字幕设置')} aria-label={t('打开字幕设置')}
          onClick={() => void window.nolaTranslator?.openAppearance('appearance')}><MoreHorizontalRegular /></button>
        <button type="button" title={collapsed ? t('展开浮层') : t('收起浮层')} aria-label={collapsed ? t('展开浮层') : t('收起浮层')}
          onClick={toggleCollapse}><SubtractRegular /></button>
        <button type="button" title={t('隐藏浮层')} aria-label={t('隐藏浮层')} onClick={() => void hide()}><DismissRegular /></button>
      </div>

      {!collapsed && <div className="caption-console-controls">
        <button type="button" className="caption-mic" data-active={Boolean(sessionId)} disabled={sessionBusy}
          title={sessionId ? t('停止字幕') : t('开始字幕')} aria-label={sessionId ? t('停止字幕') : t('开始字幕')}
          onClick={() => void toggleSession()}>{sessionId ? <StopRegular /> : <MicRegular />}</button>
        <button type="button" className="caption-control-pill caption-mode-pill" title={t('翻译模型 · {model}', { model: modelDetail })}
          onClick={() => void window.nolaTranslator?.openAppearance('translation')}>
          <span className="caption-mode-dot" />{translationProviderLabel(settings.translation.provider)}<ChevronDownRegular /></button>
        <button type="button" className="caption-control-pill" title={t('源语言与目标语言')} aria-label={t('切换源语言与目标语言')}
          onClick={() => void window.nolaTranslator?.openAppearance('captions')}>{languagePair}</button>
        <button type="button" className="caption-control-pill" data-caption-display-toggle
          title={t('切换双语、原文和译文')}
          onClick={() => void updateOverlay(NEXT_DISPLAY[displayMode])}>{displayLabel[displayMode]}</button>
        <div className="caption-layout-popover" ref={layoutMenuRef}>
          <button type="button" className="caption-control-pill caption-control-icon" data-active={layoutMenuOpen}
            title={t('字幕排版')} aria-label={t('字幕排版')}
            aria-haspopup="menu" aria-expanded={layoutMenuOpen}
            onClick={() => setLayoutMenuOpen((open) => !open)}><BoardRegular /></button>
          {layoutMenuOpen && <div className="caption-layout-menu" role="menu">
            <span className="caption-layout-menu-title">{t('仅在「双语」模式下生效')}</span>
            {LAYOUT_OPTIONS.map((option) => (
              <button key={option.value} type="button" role="menuitemradio" aria-checked={layout === option.value}
                className="caption-layout-menu-item" data-active={layout === option.value}
                onClick={() => setLayout(option.value)}>
                <span className="caption-layout-menu-thumb" data-layout={option.value} aria-hidden="true">
                  <i /><i /><i /><i />
                </span>
                <span className="caption-layout-menu-text">
                  <span className="caption-layout-menu-label">{option.label}</span>
                  <span className="caption-layout-menu-hint">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>}
        </div>
      </div>}
      {notice && <span className="caption-console-notice" role="status">{t(notice)}</span>}
      {!collapsed && !overlay.locked && <div className="overlay-resize-grip" role="button" tabIndex={0} aria-label={t('拖动调整浮层大小')}
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
