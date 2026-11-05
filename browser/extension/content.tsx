import './csp'
import { createRoot } from 'react-dom/client'
import { Button } from '../../src/renderer/components/ui/button'
import { createBridge } from './bridge'
import { createExtensionStore } from './store'
import { alignPlayerTrigger, detectVideos, playerAdapter } from './adapters'
import { browserText, errorKey } from './i18n'
import { resolveUiLanguage } from '../../src/shared/languages'
import { Panel } from './components'
import { NolaLogo } from './logo'
import { FloatingControls } from './floating/FloatingControls'
import { createInputTrigger } from './floating/input-trigger'
import { CaptionClock, captionLines, deepFullscreenElement, fullscreenCueBounds, subtitleGeometry, visibleControlReserve } from './captionPresentation'
import type { CaptionConfig } from './store'
import { captionLineAppearance, nativeCaptionStyles, nativeCaptionText } from './caption-appearance'
import { SubtitleHoverPause } from './subtitle-hover'
import { NativeCaptionTrack } from './nativeCaptions'
import { splitTranslationText } from '../../src/renderer/components/caption/translationText'
import { createTextTranslation } from './text-translation'
import { readPageContext } from './page-context'
import { providerRequest } from './provider-client'
import { TextActions, editableTarget, editableText, matchesShortcut, type TextActionState } from './text-actions'
import { prepareContentRuntime, registerContentRuntime } from './content-lifecycle'
import { createPageTranslation } from './page-translation'
import { createSubtitleTranslation } from './subtitle-translation'
import { DEFAULT_PREFERENCES, matchesSitePatterns, siteEnabled, observePreferences, savePreferences } from './preferences'
import css from './styles.css?inline'

/**
 * Share of the frame height the caption block keeps clear between its own bottom edge and whatever the
 * player has painted underneath it: the bottom edge of the video, or the top of the control band when
 * the bar is on screen.
 */
type CaptionPhase = 'idle' | 'appearing' | 'shown' | 'fading'

function install(): void {
  if (window !== window.top || !['http:', 'https:'].includes(location.protocol)) return
  const owner = prepareContentRuntime()
  if (!owner) return
  let unregisterRuntime = () => {}
  let destroyed = false
  const store = createExtensionStore({ bridge: createBridge() })
  const translator = createTextTranslation(createBridge())
  const page = createPageTranslation(translator)
  const subtitles = createSubtitleTranslation(translator, () => refresh())
  const colorScheme = matchMedia('(prefers-color-scheme: dark)')
  let preferences = DEFAULT_PREFERENCES
  let previousAuto = false
  let floatingHiddenPage = false
  const inputTrigger = createInputTrigger()
  let contextController: AbortController | undefined
  let contextUrl = ''
  let contextError = false
  const updateContext = () => {
    if (!siteEnabled(preferences, location.href) || !preferences.contextAware) { contextController?.abort(); contextController = undefined; contextUrl = ''; contextError = false; return }
    if (contextUrl === location.href) return
    contextController?.abort(); contextController = new AbortController(); contextUrl = location.href; contextError = false
    const text = readPageContext(document)
    const owned = contextController
    if (text.trim()) void providerRequest({ type: 'context', text }, owned.signal).catch(() => { if (!owned.signal.aborted) { contextError = true; refresh() } })
  }
  const shadowCss = css.replaceAll(':root', ':host')
    .replace(/\[data-theme=(?:"dark"|'dark'|dark)\]/g, ':host([data-theme=dark])')
    .replace(/(^|[,\s])(?:html|body)(?=[,\s{])/g, '$1:host')
  const hosts: HTMLElement[] = []
  const shadow = (kind: string, pointerEvents: string): { host: HTMLElement; mount: HTMLDivElement } => {
    const host = document.createElement('div')
    host.dataset.nolaExtension = kind
    host.className = 'z-overlay'
    // Host geometry lives outside the shadow; all theme declarations remain inside it.
    Object.assign(host.style, { position: 'fixed', pointerEvents })
    const root = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style'); style.textContent = `@layer properties, theme, base, components, utilities;${shadowCss}`
    const mount = document.createElement('div'); mount.className = 'nola-extension'
    root.append(style, mount); document.documentElement.append(host); hosts.push(host)
    return { host, mount }
  }
  const trigger = shadow('trigger', 'auto')
  trigger.mount.classList.add('nola-trigger')
  const panel = shadow('panel', 'auto')
  trigger.host.className = 'z-popup'; panel.host.className = 'z-popup'
  const overlay = shadow('overlay', 'none')
  const floating = shadow('floating', 'auto')
  const floatingRoot = createRoot(floating.mount)

  const actions = shadow('text-actions', 'auto')
  const actionsRoot = createRoot(actions.mount)
  let actionRevision = 0
  let actionAnchor = { x: 0, y: 0 }
  const positionActions = () => {
    const rect = actions.mount.getBoundingClientRect()
    actions.host.style.left = `${Math.max(0, Math.min(actionAnchor.x, innerWidth - rect.width))}px`
    actions.host.style.top = `${Math.max(0, Math.min(actionAnchor.y, innerHeight - rect.height))}px`
  }
  const actionsResize = new ResizeObserver(positionActions)
  actionsResize.observe(actions.mount)
  const closeActions = () => { actions.host.hidden = true; actionsRoot.render(null) }
  const showActions = (target?: HTMLElement, autoTranslate = false, autoSpeak = false) => {
    if (!siteEnabled(preferences, location.href)) return
    if (!target && !autoTranslate && !autoSpeak && (matchesSitePatterns(preferences.selectionDisabledSites, location.href) || !(preferences.selectionTranslate || preferences.selectionCopy || preferences.selectionSpeak))) return
    const current = window.getSelection()
    const text = target ? editableText(target) : current?.toString().trim() ?? ''
    if (!text || text.length > 4000) { closeActions(); return }
    const rect = target?.getBoundingClientRect() ?? (current?.rangeCount ? current.getRangeAt(0).getBoundingClientRect() : undefined)
    const selection: TextActionState = { text, target, x: rect?.left ?? 0, y: rect?.bottom ?? 0, autoTranslate, autoSpeak }
    actions.host.hidden = false
    actionAnchor = { x: selection.x, y: selection.y }
    positionActions()
    actions.host.style.maxWidth = '100vw'
    actionsRoot.render(<TextActions key={++actionRevision} selection={selection} preferences={preferences} dismiss={closeActions} />)
  }
  const onSelection = (event: PointerEvent) => {
    if (event.composedPath().some(node => node instanceof HTMLElement && node.dataset.nolaExtension)) return
    if (preferences.selectionTranslation && !editableTarget(event.target instanceof Element ? event.target : null)) showActions()
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { closeActions(); store.closePanel(); return }
    if (event.repeat || event.isComposing || !siteEnabled(preferences, location.href)) { inputTrigger(event); return }
    const target = editableTarget(document.activeElement)
    if (preferences.inputTranslation && preferences.inputTrigger === 'tripleSpace' && inputTrigger(event, target ?? undefined)) { event.preventDefault(); showActions(target!, true); return }
    if (target && preferences.inputTranslation && event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'Enter') { event.preventDefault(); showActions(target); return }
    if (target) return
    if (preferences.shortcutPage.toLowerCase() !== 'alt+t' && matchesShortcut(event, preferences.shortcutPage)) { event.preventDefault(); if (page.state().pageActive) page.stop(); else page.start() }
    else if (preferences.shortcutSelection.toLowerCase() !== 'alt+s' && matchesShortcut(event, preferences.shortcutSelection)) { event.preventDefault(); showActions(undefined, true) }
    else if (preferences.shortcutSubtitles.toLowerCase() !== 'alt+v' && matchesShortcut(event, preferences.shortcutSubtitles)) { event.preventDefault(); toggleSubtitles() }
  }
  const hoverPage = (event: PointerEvent) => page.hover(event)
  window.addEventListener('pointerover', hoverPage)
  window.addEventListener('pointerup', onSelection)
  window.addEventListener('keydown', onKey)
  const onOutsidePress = (event: PointerEvent) => {
    const path = event.composedPath()
    if (store.getSnapshot().panelOpen && !path.includes(panel.host) && !path.includes(trigger.host)) store.closePanel()
    if (!path.includes(actions.host)) closeActions()
  }
  window.addEventListener('pointerdown', onOutsidePress)
  const nativeCueStyles = document.createElement('style')
  nativeCueStyles.dataset.nolaCaptionStyles = 'true'
  ;(document.head ?? document.documentElement).append(nativeCueStyles)
  const triggerRoot = createRoot(trigger.mount)
  const panelRoot = createRoot(panel.mount)
  const positionPanel = () => {
    const video = store.getSnapshot().selectedVideo
    if (!video) return
    const rect = video.getBoundingClientRect()
    const box = panel.mount.getBoundingClientRect()
    const spacing = Number.parseFloat(getComputedStyle(panel.host).getPropertyValue('--space-1')) || 8
    const adapter = playerAdapter(video)
    panel.host.style.left = `${Math.max(spacing, Math.min(innerWidth - box.width - spacing, rect.right - box.width))}px`
    panel.host.style.top = `${Math.max(spacing, Math.min(innerHeight - box.height - spacing, rect.bottom - visibleControlReserve(adapter.controlBar, adapter.container, rect) - box.height - spacing))}px`
  }
  const panelResize = new ResizeObserver(positionPanel)
  panelResize.observe(panel.mount)
  const caption = document.createElement('div'); caption.className = 'nola-caption'; caption.setAttribute('aria-live', 'polite'); overlay.mount.append(caption)
  const nativeTrack = new NativeCaptionTrack()
  const overlayHoverPause = new SubtitleHoverPause()
  const nativeHoverPause = new SubtitleHoverPause()
  let nativeHoverBounds: { left: number; right: number; top: number; bottom: number; video: HTMLVideoElement } | undefined
  const hoverEnter = () => overlayHoverPause.enter(store.getSnapshot().selectedVideo, preferences.subtitlePauseOnHover)
  const hoverLeave = () => overlayHoverPause.leave()
  const nativeHover = (event: PointerEvent) => {
    const box = nativeHoverBounds
    if (box && preferences.subtitlePauseOnHover && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) nativeHoverPause.enter(box.video, true)
    else nativeHoverPause.leave()
  }
  caption.addEventListener('pointerenter', hoverEnter); caption.addEventListener('pointerleave', hoverLeave)
  window.addEventListener('pointermove', nativeHover, true)
  let drag: { x: number; y: number; left: number; top: number; video: DOMRect } | undefined
  const dragStart = (event: PointerEvent) => {
    const video = store.getSnapshot().selectedVideo
    if (!video || store.getSnapshot().status !== 'idle' || !subtitles.state().active) return
    const rect = overlay.host.getBoundingClientRect()
    drag = { x: event.clientX, y: event.clientY, left: rect.left + rect.width / 2, top: rect.bottom, video: video.getBoundingClientRect() }
    caption.setPointerCapture(event.pointerId); event.preventDefault()
  }
  const dragMove = (event: PointerEvent) => {
    if (!drag) return
    const x = Math.max(42, Math.min(58, (drag.left + event.clientX - drag.x - drag.video.left) / drag.video.width * 100))
    const y = Math.max(5, Math.min(100, (drag.top + event.clientY - drag.y - drag.video.top) / drag.video.height * 100))
    preferences = { ...preferences, subtitlePositionX: x, subtitlePositionY: y }; render()
  }
  const dragEnd = () => { if (drag) { drag = undefined; void savePreferences({ subtitlePositionX: preferences.subtitlePositionX, subtitlePositionY: preferences.subtitlePositionY }) } }
  caption.addEventListener('pointerdown', dragStart); caption.addEventListener('pointermove', dragMove); caption.addEventListener('pointerup', dragEnd); caption.addEventListener('pointercancel', dragEnd)

  let fingerprint = ''
  let pageUrl = location.href
  const captionClock = new CaptionClock()
  let nativeCueStyleText = ''
  let captionPhase: CaptionPhase = 'idle'
  let captionKey = ''
  let translationTail = ''
  let pendingSegmentKey = ''
  let pendingTranslation = ''
  /** Takes the block down at once: a stopped session has nothing left to fade out to. */
  const dismissCaption = (): void => {
    overlayHoverPause.leave()
    captionPhase = 'idle'
    captionKey = ''
    translationTail = ''
    pendingSegmentKey = ''
    pendingTranslation = ''
    caption.dataset.phase = 'idle'
    caption.replaceChildren()
    overlay.host.hidden = true
  }
  const updateCaptionLines = (lines: string[], config: CaptionConfig, stableText?: string): void => {
    // Keep each track and its text nodes mounted while interim recognition and translation revisions arrive.
    while (caption.childElementCount > lines.length) caption.lastElementChild?.remove()
    lines.forEach((line, index) => {
      let row = caption.children[index] as HTMLDivElement | undefined
      if (!row) {
        row = document.createElement('div')
        row.className = 'nola-caption-line'
        const confirmed = document.createElement('span')
        const tail = document.createElement('span')
        row.append(confirmed, tail)
        caption.append(row)
      }
      const isTranslation = index === (config.showSource ? 1 : 0)
      if (isTranslation) {
        const split = splitTranslationText(line, stableText)
        const confirmedText = split.confirmed ?? ''
        const tailText = split.confirmed === undefined ? line : split.tail
        const confirmed = row.children[0].firstChild ?? row.children[0].appendChild(document.createTextNode(''))
        const tail = row.children[1].firstChild ?? row.children[1].appendChild(document.createTextNode(''))
        confirmed.nodeValue = confirmedText
        tail.nodeValue = tailText
        translationTail = tailText
      } else {
        const text = row.children[0].firstChild ?? row.children[0].appendChild(document.createTextNode(''))
        if (text.nodeValue !== line) text.nodeValue = line
        const tail = row.children[1].firstChild ?? row.children[1].appendChild(document.createTextNode(''))
        tail.nodeValue = ''
      }
      row.style.cssText = ''
      Object.assign(row.style, captionLineAppearance(index, config))
      row.style.cssText += preferences.subtitleCustomCss
    })
  }
  /** Paints one phrase and lets it fade in as a whole, so a revision never reveals itself character by character. */
  const paintCaption = (key: string, lines: string[], config: CaptionConfig, stableText?: string): void => {
    updateCaptionLines(lines, config, stableText)
    captionKey = key
    captionPhase = 'appearing'
    overlay.host.hidden = false
    // The phase is cleared and then set again around a forced layout, which is what restarts the
    // animation: two writes inside one task collapse into a single style recalculation, and an
    // unchanged animation name would leave the finished animation in place and skip the fade for the
    // phrase arriving while the previous one was still fading in. The host is already visible here, so
    // the block's first painted frame is already at the opening opacity of the new animation.
    caption.dataset.phase = 'idle'
    caption.getBoundingClientRect()
    caption.dataset.phase = 'appearing'
  }
  /**
   * The painted phase and the variable the sequencer reads have to move together. `animationend` is what
   * advances the queue, so a fade the sequencer never heard about leaves the block faded out with the next
   * phrase still queued behind a phase that already ended.
   */
  const beginFade = (): void => {
    captionPhase = 'fading'
    caption.dataset.phase = 'fading'
  }
  const updateNativeCueStyles = (config: CaptionConfig): void => {
    const css = nativeCaptionStyles(config)
    if (css === nativeCueStyleText) return
    nativeCueStyles.textContent = css
    nativeCueStyleText = css
  }
  const toggleSubtitles = () => {
    if (subtitles.state().active) subtitles.stop()
    else if (store.getSnapshot().status === 'idle') void subtitles.start()
  }
  /**
   * Height the painted text needs, measured against `auto`. Reading it off the box instead would feed
   * a transition's own intermediate height back into the measurement and stall it halfway.
   */
  const captionContentHeight = (): number => {
    if (overlay.host.hidden) return 0
    caption.style.height = 'auto'
    return caption.scrollHeight
  }
  caption.addEventListener('animationend', event => {
    if (event.target !== caption || (captionPhase !== 'appearing' && captionPhase !== 'fading')) return
    if (captionPhase === 'appearing') { captionPhase = 'shown'; caption.dataset.phase = 'shown' }
    else dismissCaption()
  })
  function render(): void {
    if (destroyed) return
    const state = store.getSnapshot()
    const language = resolveUiLanguage(preferences.uiLanguage, navigator.language)
    const t = browserText(preferences.uiLanguage)
    for (const host of hosts) {
      host.lang = language
      host.dataset.theme = preferences.theme === 'auto' ? colorScheme.matches ? 'dark' : 'light' : preferences.theme
    }
    const video = state.selectedVideo ?? state.videos[0]
    const fullscreen = deepFullscreenElement(document)
    const enabled = siteEnabled(preferences, location.href)
    floating.host.hidden = !enabled || !preferences.floatingButton || floatingHiddenPage || matchesSitePatterns(preferences.floatingDisabledSites, location.href) || Boolean(fullscreen)
    floating.host.style.left = preferences.floatingSide === 'left' ? '0px' : ''
    floating.host.style.right = preferences.floatingSide === 'right' ? '0px' : ''
    floating.host.style.top = `${Math.max(48, Math.min(innerHeight - 96, innerHeight * preferences.floatingPosition))}px`
    floatingRoot.render(floating.host.hidden ? null : <FloatingControls preferences={preferences} active={page.state().pageActive} error={page.state().pageError} onTranslate={() => { if (siteEnabled(preferences, location.href)) page.start(); refresh() }} onRestore={() => { page.stop(); refresh() }} onPosition={(position, commit) => { preferences = { ...preferences, ...position }; if (commit) void savePreferences(position); refresh() }} onLock={() => { void savePreferences({ floatingLocked: !preferences.floatingLocked }) }} onHide={scope => {
      if (scope === 'page') floatingHiddenPage = true
      else if (scope === 'site') void savePreferences({ floatingDisabledSites: [...preferences.floatingDisabledSites, location.origin] })
      else void savePreferences({ floatingButton: false })
      refresh()
    }} />)
    if (!enabled) { overlayHoverPause.leave(); nativeHoverPause.leave(); for (const host of hosts) host.hidden = true; return }
    if (!video) { for (const host of [trigger.host, panel.host, overlay.host]) host.hidden = true; return }
    const adapter = playerAdapter(video)
    const parent = fullscreen && fullscreen !== video ? fullscreen : document.documentElement
    for (const host of [panel.host, overlay.host]) if (host.parentElement !== parent) parent.append(host)
    if (adapter.controls && !fullscreen?.matches('video')) {
      trigger.host.dataset.docked = 'true'
      if (trigger.host.parentElement !== adapter.controls) {
        trigger.host.style.top = ''
        adapter.controls.append(trigger.host)
      }
      Object.assign(trigger.host.style, { position: 'relative', display: 'inline-flex', left: '' })
    } else {
      trigger.host.dataset.docked = 'false'
      if (trigger.host.parentElement !== parent) parent.append(trigger.host)
      Object.assign(trigger.host.style, { position: 'fixed', display: 'block' })
    }
    const rect = video.getBoundingClientRect()
    const theme = getComputedStyle(panel.host)
    const token = (name: string): number => Number.parseFloat(theme.getPropertyValue(name)) || 0
    const spacing = token('--space-1')
    if (!adapter.controls) { trigger.host.style.left = `${Math.max(0, rect.right - trigger.host.getBoundingClientRect().width - token('--space-2'))}px`; trigger.host.style.top = `${rect.top + spacing}px` }
    trigger.host.hidden = fullscreen === video || rect.width < 160
    // A failed session clears the caption block, so the trigger is the only place left that can
    // say why the screen is empty.
    const failure = state.error ? t(errorKey(state.error)) : ''
    const triggerLabel = failure ? `${t('button')} — ${failure}` : t('button')
    // The native hover tooltip rides on the trigger host.
    trigger.host.title = triggerLabel
    const subtitleVisible = subtitles.state().active || state.status === 'active'
    triggerRoot.render(<Button size="icon-sm" variant="bare" aria-label={triggerLabel} aria-expanded={state.panelOpen} onClick={store.togglePanel}><NolaLogo /><span className="nola-trigger-state" data-active={subtitleVisible}>{t(subtitleVisible ? 'subtitleOn' : 'subtitleOff')}</span></Button>)
    const controls = adapter.controls
    if (controls) requestAnimationFrame(() => {
      if (!trigger.host.hidden && trigger.host.parentElement === controls) alignPlayerTrigger(controls, trigger.host)
    })
    panel.host.hidden = !state.panelOpen || fullscreen === video
    positionPanel()
    panelRoot.render(<Panel store={store} subtitles={subtitles.state()} toggleSubtitles={toggleSubtitles} selectTrack={id => { void subtitles.start(id) }} subtitleController={subtitles} />)
    overlay.host.style.left = `${rect.left + rect.width * 0.08}px`
    overlay.host.style.width = `${rect.width * 0.84}px`
    caption.style.fontFamily = `${state.config.fontFamily}, ${theme.getPropertyValue('--font-ui')}`
    caption.style.lineHeight = String(state.config.lineHeight)
    caption.style.removeProperty('background-color')
    caption.style.setProperty('--caption-fill', state.config.backgroundColor)
    caption.style.setProperty('--caption-fill-opacity', `${state.config.backgroundOpacity * 100}%`)
    updateNativeCueStyles(state.config)
    const segment = state.captions[0]
    const remaining = captionClock.update(segment ? `${state.epoch}:${segment.segmentId}:${segment.revision}` : '', performance.now(), state.playbackPaused || !segment?.isFinal, video.playbackRate)
    const translation = state.config.showTranslation && state.config.targetLanguage !== 'none'
      ? segment?.translations.find(item => item.targetLanguage === state.config.targetLanguage && item.state !== 'failed' && item.text)
      : undefined
    const segmentKey = segment ? `${state.epoch}:${segment.segmentId}` : ''
    if (segmentKey && segmentKey !== captionKey && !translation?.text) {
      pendingSegmentKey = segmentKey
    }
    const holdingPrevious = !!pendingSegmentKey && pendingSegmentKey === segmentKey && !translation?.text && !!captionKey
    if (pendingSegmentKey === segmentKey && translation?.text) {
      pendingTranslation = translation.text
    }
    const activeSegment = holdingPrevious ? undefined : segment
    const knownCue = state.status === 'idle' ? subtitles.at(video.currentTime) : undefined
    const lines = knownCue?.lines ?? (remaining > 0 ? captionLines(activeSegment, state.config) : [])
    // Segment identity survives streaming revisions and late translations of the same sentence.
    const key = lines.length ? knownCue ? `track:${knownCue.start}` : `${state.epoch}:${segment?.segmentId}` : ''
    const knownConfig = { ...state.config, showSource: preferences.videoDisplay !== 'translation', showTranslation: preferences.videoDisplay !== 'source' }
    if (knownCue) updateNativeCueStyles(knownConfig)
    if (knownCue && lines.length && fullscreen !== video) {
      if (captionKey !== key) paintCaption(key, lines, knownConfig)
      else updateCaptionLines(lines, knownConfig)
    } else if (state.status !== 'active' || fullscreen === video) dismissCaption()
    else if (holdingPrevious) {
      // Keep the previous phrase visible until the next sentence has a translation.
    } else if (key && key === captionKey) {
      translationTail = caption.children[state.config.showSource ? 1 : 0]?.children[1]?.textContent ?? translationTail
      updateCaptionLines(lines, state.config, translation?.stableText)
    } else if (key) {
      if (pendingTranslation && pendingSegmentKey === key && lines.length) {
        lines[state.config.showSource ? 1 : 0] = pendingTranslation
      }
      if (captionPhase === 'idle') paintCaption(key, lines, state.config, translation?.stableText)
      else {
        // VAD can advance to a new phrase while the previous caption is still visible.
        // Fade only when speech stops; fading every segment boundary makes live captions blink.
        captionKey = key
        pendingSegmentKey = ''
        pendingTranslation = ''
        translationTail = ''
        updateCaptionLines(lines, state.config, translation?.stableText)
        if (captionPhase === 'fading') {
          captionPhase = 'shown'
          caption.dataset.phase = 'shown'
        }
      }
    } else if (captionPhase !== 'idle') {
      if (captionPhase !== 'fading') beginFade()
    }
    // The control bar expands on hover and fades out again on its own, so the band it reserves is read
    // from the bar as it is right now. Holding the tallest bar ever seen is what left the block parked
    // high over the video for the rest of the session.
    if (knownCue) {
      caption.style.fontFamily = preferences.subtitleSourceFont
      caption.style.setProperty('--caption-fill', preferences.subtitleBackground)
      caption.style.setProperty('--caption-fill-opacity', `${preferences.subtitleBackgroundOpacity * 100}%`)
      overlay.host.style.left = `${rect.left + rect.width * (Math.max(42, Math.min(58, preferences.subtitlePositionX)) / 100 - 0.42)}px`
      caption.style.pointerEvents = 'auto'; caption.style.cursor = 'move'; caption.style.touchAction = 'none'
    } else { caption.style.pointerEvents = preferences.subtitlePauseOnHover ? 'auto' : 'none'; caption.style.cursor = ''; caption.style.touchAction = '' }
    const reserve = visibleControlReserve(adapter.controlBar, adapter.container, rect)
    // The block hangs by its bottom edge, so the anchor is a line across the frame rather than the
    // block's own height: a phrase that grows from one line to two extends upward and leaves the
    // anchor where it was.
    const contentHeight = captionPhase === 'idle' ? 0 : captionContentHeight()
    const clearance = state.config.bottomOffset / 100
    const band = subtitleGeometry(rect.height, clearance, contentHeight, reserve)
    overlay.host.style.bottom = `${Math.max(0, innerHeight - rect.top - (knownCue ? rect.height * preferences.subtitlePositionY / 100 : band.top))}px`
    if (contentHeight) caption.style.height = `${Math.min(band.maxHeight, contentHeight)}px`
    overlay.host.hidden = fullscreen === video || captionPhase === 'idle'
    let cue: VTTCue | null = null
    nativeHoverBounds = undefined
    if (!preferences.subtitlePauseOnHover) { overlayHoverPause.leave(); nativeHoverPause.leave() }
    if (fullscreen === video && (knownCue || state.status === 'active' && segment) && lines.length) {
      const [start, end] = knownCue ? [knownCue.start, knownCue.end] : fullscreenCueBounds(segment!, video.currentTime, remaining)
      const cueText = nativeCaptionText(lines, knownCue ? knownConfig : state.config)
      cue = new VTTCue(start, end, cueText)
      cue.line = knownCue ? preferences.subtitlePositionY : 100 - state.config.bottomOffset; cue.snapToLines = false; cue.lineAlign = 'end'
      if (knownCue) { cue.position = preferences.subtitlePositionX; cue.size = 84 }
      const config = knownCue ? knownConfig : state.config
      const height = lines.reduce((sum, _, index) => sum + (config.showSource && index === 0 ? config.sourceFontSize : config.translationFontSize) * config.lineHeight, 0)
      const bottom = rect.top + rect.height * Number(cue.line) / 100
      nativeHoverBounds = { left: rect.left + rect.width * 0.08, right: rect.right - rect.width * 0.08, top: Math.max(rect.top, bottom - height), bottom: Math.min(rect.bottom, bottom), video }
    }
    if (!nativeHoverBounds) nativeHoverPause.leave()
    nativeTrack.update(fullscreen === video ? video : null, state.status === 'active' || subtitles.state().active, cue, t('button'), state.config.targetLanguage)
  }
  const unsubscribe = store.subscribe(render)
  let scheduled = false
  const refresh = (): void => {
    if (destroyed || scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      if (destroyed) return
      const videos = detectVideos(document)
      const state = store.getSnapshot()
      if (videos.length !== state.videos.length || videos.some((video, index) => video !== state.videos[index])) store.updateVideos(videos)
      const selected = store.getSnapshot().selectedVideo
      if (selected) resize.observe(selected)
      const nextFingerprint = `${location.href}|${selected?.currentSrc}|${selected?.getAttribute('src')}`
      const changed = Boolean(fingerprint && fingerprint !== nextFingerprint)
      const enabled = siteEnabled(preferences, location.href)
      if (!enabled) {
        if (page.state().pageActive) page.stop()
        if (subtitles.state().active) subtitles.stop()
        if (store.getSnapshot().status === 'active' || store.getSnapshot().status === 'starting') void store.stop()
        if (!actions.host.hidden) closeActions()
      }
      if (changed && enabled) store.timelineChanged()
      if (store.getSnapshot().status !== 'idle' && subtitles.state().active) subtitles.stop()
      if (siteEnabled(preferences, location.href)) subtitles.selectVideo(selected, changed)
      if (pageUrl !== location.href) {
        pageUrl = location.href
        floatingHiddenPage = false
        updateContext()
        const active = page.state().pageActive
        page.stop()
        if (siteEnabled(preferences, location.href) && (active || matchesSitePatterns(preferences.autoSites, location.href) && !matchesSitePatterns(preferences.neverAutoSites, location.href))) page.start()
      }
      fingerprint = nextFingerprint
      render()
    })
  }
  const mutation = new MutationObserver(records => {
    // Host layout updates are ours; observing them would schedule an endless render loop.
    if (records.some(record => !(record.target instanceof Element) || !record.target.closest('[data-nola-extension]'))) refresh()
  })
  mutation.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'style', 'hidden'] })
  const resize = new ResizeObserver(refresh)
  resize.observe(document.documentElement)
  resize.observe(panel.mount)
  // The caption block is left unobserved: its height is pinned by render() from the caption's own
  // content, so its box only ever changes when render() has just changed it, and each of those
  // notifications would run another full-document video scan and another pair of React renders.
  const interval = setInterval(refresh, 1000)
  const playerEvents = ['scroll', 'resize', 'pointermove', 'pointerleave', 'fullscreenchange', 'enterpictureinpicture', 'leavepictureinpicture', 'timeupdate', 'seeked', 'loadedmetadata']
  for (const name of playerEvents) window.addEventListener(name, refresh, true)
  const unobservePreferences = observePreferences(next => {
    preferences = next
    updateContext()
    const enabled = siteEnabled(next, location.href)
    store.setPreferences(next); page.configure(next); if (enabled) subtitles.configure(next)
    const auto = enabled && matchesSitePatterns(next.autoSites, location.href) && !matchesSitePatterns(next.neverAutoSites, location.href)
    closeActions()
    if (!enabled) { page.stop(); subtitles.stop(); if (store.getSnapshot().status !== 'idle') void store.stop() }
    if (auto && !previousAuto) page.start()
    previousAuto = auto
    refresh()
  })
  page.configure(preferences); subtitles.configure(preferences)
  colorScheme.addEventListener('change', refresh)
  const onCommand = (message: unknown, sender: ChromeSender, reply: (response: unknown) => void) => {
    if (!(sender.url?.startsWith(chrome.runtime.getURL('')) && !sender.tab) || typeof message !== 'object' || message === null || !('type' in message)) return
    if (message.type === 'siteAccessChanged') {
      void chrome.runtime.sendMessage({ type: 'checkSiteAccess' }).then(result => { if (!(result as { allowed?: boolean })?.allowed) destroy() }).catch(() => destroy())
      reply({}); return
    }
    if (!siteEnabled(preferences, location.href) && message.type !== 'pageStatus' && message.type !== 'stopPageTranslation') return
    switch (message.type) {
      case 'translateSelection': showActions(undefined, true); break
      case 'speakSelection': showActions(undefined, false, true); break
      case 'translateInput': { const target = editableTarget(document.activeElement); if (target) showActions(target); break }
      case 'togglePageTranslation': if (page.state().pageActive) page.stop(); else page.start(); break
      case 'startPageTranslation': page.start(); break
      case 'stopPageTranslation': page.stop(); break
      case 'toggleSubtitles': toggleSubtitles(); break
      case 'toggleRealtime':
        if (store.getSnapshot().status !== 'idle') void store.stop()
        else store.pressStart()
        break
      case 'pageStatus': break
      default: return
    }
    const state = store.getSnapshot()
    reply({ ...page.state(), video: Boolean(state.selectedVideo), realtime: state.status !== 'idle', liveError: state.liveAttempted ? state.error : undefined, subtitles: subtitles.state().active, subtitleError: subtitles.state().error })
  }
  chrome.runtime.onMessage.addListener(onCommand)
  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    // Browser API objects can already be invalid during an extension replacement.
    // Each release must run even if another one can no longer reach the old context.
    for (const release of [
      () => { mutation.disconnect(); resize.disconnect(); actionsResize.disconnect(); panelResize.disconnect(); clearInterval(interval); nativeTrack.restore(); unsubscribe() },
      () => unobservePreferences(),
      () => { colorScheme.removeEventListener('change', refresh); chrome.runtime.onMessage.removeListener(onCommand) },
      () => { for (const name of playerEvents) window.removeEventListener(name, refresh, true) },
      () => { window.removeEventListener('pointerdown', onOutsidePress); window.removeEventListener('pointerover', hoverPage); window.removeEventListener('pointerup', onSelection); window.removeEventListener('keydown', onKey); window.removeEventListener('pagehide', destroy) },
      () => contextController?.abort(),
      () => { overlayHoverPause.leave(); nativeHoverPause.leave(); caption.removeEventListener('pointerenter', hoverEnter); caption.removeEventListener('pointerleave', hoverLeave); window.removeEventListener('pointermove', nativeHover, true) },
      () => { closeActions(); actionsRoot.unmount(); floatingRoot.unmount() },
      () => subtitles.destroy(), () => page.stop(), () => translator.close(),
      () => { triggerRoot.unmount(); panelRoot.unmount(); hosts.forEach(host => host.remove()); nativeCueStyles.remove() },
      () => unregisterRuntime(),
    ]) { try { release() } catch { /* The old extension context may already be gone. */ } }
    void store.destroy().catch(() => undefined)
  }
  unregisterRuntime = registerContentRuntime(owner, destroy)
  window.addEventListener('pagehide', destroy, { once: true })
  void store.init(); refresh()
}
install()
window.addEventListener('pageshow', event => { if (event.persisted) install() })
