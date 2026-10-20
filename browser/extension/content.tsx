import { createRoot } from 'react-dom/client'
import { Button } from '@heroui/react'
import { enableShadowDOM } from 'react-stately/private/flags/flags'
import { createBridge } from './bridge'
import { createExtensionStore } from './store'
import { alignPlayerTrigger, detectVideos, playerAdapter } from './adapters'
import { browserText, errorKey } from './i18n'
import { resolveUiLanguage } from '../../src/shared/languages'
import { Panel } from './components'
import { NolaLogo } from './logo'
import { CaptionClock, captionLines, deepFullscreenElement, fullscreenCueBounds, subtitleGeometry, visibleControlReserve } from './captionPresentation'
import type { CaptionConfig } from './store'
import { NativeCaptionTrack } from './nativeCaptions'
import css from './styles.css?inline'

/**
 * Share of the frame height the caption block keeps clear between its own bottom edge and whatever the
 * player has painted underneath it: the bottom edge of the video, or the top of the control band when
 * the bar is on screen.
 */
type CaptionPhase = 'idle' | 'appearing' | 'shown' | 'fading'
interface PendingCaption { key: string; lines: string[] }

function install(): void {
  if (window !== window.top || location.protocol !== 'https:' || document.documentElement.dataset.nolaInstalled) return
  document.documentElement.dataset.nolaInstalled = 'true'
  // React Aria's document-level press handlers need composed targets; the pinned flags module enables its shipped shadow support.
  enableShadowDOM()
  const store = createExtensionStore({ bridge: createBridge() })
  const shadowCss = css.replaceAll(':root', ':host').replace(/(^|[,\s])html(?=[,\s{])/g, '$1:host').replace(/(^|[,\s])body(?=[,\s{])/g, '$1:host')
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
  const overlay = shadow('overlay', 'none')
  const nativeCueStyles = document.createElement('style')
  nativeCueStyles.dataset.nolaCaptionStyles = 'true'
  ;(document.head ?? document.documentElement).append(nativeCueStyles)
  const triggerRoot = createRoot(trigger.mount)
  const panelRoot = createRoot(panel.mount)
  const caption = document.createElement('div'); caption.className = 'nola-caption'; caption.setAttribute('aria-live', 'polite'); overlay.mount.append(caption)
  const nativeTrack = new NativeCaptionTrack()
  let fingerprint = ''
  const captionClock = new CaptionClock()
  let nativeCueStyleText = ''
  let captionPhase: CaptionPhase = 'idle'
  let captionKey = ''
  let pendingCaption: PendingCaption | null = null
  /** Takes the block down at once: a stopped session has nothing left to fade out to. */
  const dismissCaption = (): void => {
    pendingCaption = null
    captionPhase = 'idle'
    captionKey = ''
    caption.dataset.phase = 'idle'
    caption.replaceChildren()
    overlay.host.hidden = true
  }
  const updateCaptionLines = (lines: string[], config: CaptionConfig): void => {
    const rows = document.createDocumentFragment()
    let sourceIndex = 0
    for (const line of lines) {
      const row = document.createElement('div')
      row.textContent = line
      const isSource = config.showSource && sourceIndex === 0
      if (isSource) {
        row.style.color = config.sourceColor
        row.style.fontSize = `${config.sourceFontSize}px`
        sourceIndex += 1
      } else {
        row.style.color = config.translationColor
        row.style.fontSize = `${config.translationFontSize}px`
      }
      rows.append(row)
    }
    caption.replaceChildren(rows)
  }
  /** Paints one phrase and lets it fade in as a whole, so a revision never reveals itself character by character. */
  const paintCaption = (key: string, lines: string[], config: CaptionConfig): void => {
    updateCaptionLines(lines, config)
    captionKey = key
    pendingCaption = null
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
    const fontFamily = config.fontFamily.replace(/[\\"\r\n]/g, character => `\\${character}`)
    const background = `color-mix(in oklab, ${config.backgroundColor} ${config.backgroundOpacity * 100}%, transparent)`
    const css = `video::cue(.nola-caption-source){color:${config.sourceColor};font-family:"${fontFamily}";font-size:${config.sourceFontSize}px;line-height:${config.lineHeight};background-color:${background}}video::cue(.nola-caption-translation){color:${config.translationColor};font-family:"${fontFamily}";font-size:${config.translationFontSize}px;line-height:${config.lineHeight};background-color:${background}}`
    if (css === nativeCueStyleText) return
    nativeCueStyles.textContent = css
    nativeCueStyleText = css
  }
  const escapeCueText = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  /**
   * Height the painted text needs, measured against `auto`. Reading it off the box instead would feed
   * a transition's own intermediate height back into the measurement and stall it halfway.
   */
  const captionContentHeight = (): number => {
    if (overlay.host.hidden) return 0
    caption.style.height = 'auto'
    return caption.scrollHeight
  }
  // Finish the outgoing fade before painting the latest revision of the queued sentence.
  caption.addEventListener('animationend', event => {
    if (event.target !== caption || (captionPhase !== 'appearing' && captionPhase !== 'fading')) return
    const next = pendingCaption
    pendingCaption = null
    if (next && captionPhase === 'fading') { paintCaption(next.key, next.lines, store.getSnapshot().config); return }
    if (captionPhase === 'appearing') { captionPhase = 'shown'; caption.dataset.phase = 'shown' }
    else dismissCaption()
  })
  function render(): void {
    const state = store.getSnapshot()
    const language = resolveUiLanguage(state.summary?.uiLanguage ?? 'auto', navigator.language)
    const t = browserText(state.summary?.uiLanguage)
    for (const host of [trigger.host, panel.host, overlay.host]) host.lang = language
    const video = state.selectedVideo ?? state.videos[0]
    const fullscreen = deepFullscreenElement(document)
    if (!video) { for (const host of hosts) host.hidden = true; return }
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
    const panelWidth = Math.min(token('--browser-panel-width'), innerWidth - token('--space-3'))
    if (!adapter.controls) { trigger.host.style.left = `${Math.max(0, rect.right - trigger.host.getBoundingClientRect().width - token('--space-2'))}px`; trigger.host.style.top = `${rect.top + spacing}px` }
    trigger.host.hidden = fullscreen === video || rect.width < 160
    // A failed session clears the caption block, so the trigger is the only place left that can
    // say why the screen is empty.
    const failure = state.error ? t(errorKey(state.error)) : ''
    const triggerLabel = failure ? `${t('button')} — ${failure}` : t('button')
    // HeroUI's Button props carry no `title`, so the native hover tooltip rides on the trigger host.
    trigger.host.title = triggerLabel
    triggerRoot.render(<Button isIconOnly size="sm" variant="secondary" className={failure ? 'nola-trigger-error' : undefined} aria-label={triggerLabel} aria-expanded={state.panelOpen} onPress={store.togglePanel}><NolaLogo /></Button>)
    const controls = adapter.controls
    if (controls) requestAnimationFrame(() => {
      if (!trigger.host.hidden && trigger.host.parentElement === controls) alignPlayerTrigger(controls, trigger.host)
    })
    panel.host.hidden = !state.panelOpen || fullscreen === video
    panel.host.style.left = `${Math.max(spacing, Math.min(innerWidth - panelWidth - spacing, rect.right - panelWidth))}px`
    panel.host.style.top = `${Math.max(spacing, Math.min(innerHeight - panel.mount.getBoundingClientRect().height - spacing, rect.top + token('--space-6')))}px`
    panelRoot.render(<Panel store={store} />)
    overlay.host.style.left = `${rect.left + rect.width * 0.08}px`
    overlay.host.style.width = `${rect.width * 0.84}px`
    caption.style.fontFamily = `${state.config.fontFamily}, ${theme.getPropertyValue('--font-ui')}`
    caption.style.lineHeight = String(state.config.lineHeight)
    caption.style.backgroundColor = `color-mix(in oklab, ${state.config.backgroundColor} ${state.config.backgroundOpacity * 100}%, transparent)`
    updateNativeCueStyles(state.config)
    const segment = state.captions[0]
    const remaining = captionClock.update(segment ? `${state.epoch}:${segment.segmentId}:${segment.revision}` : '', performance.now(), state.playbackPaused || !segment?.isFinal, video.playbackRate)
    const lines = remaining > 0 ? captionLines(segment, state.config) : []
    // Segment identity survives streaming revisions and late translations of the same sentence.
    const key = lines.length ? `${state.epoch}:${segment?.segmentId}` : ''
    if (state.status !== 'active' || fullscreen === video) dismissCaption()
    else if (key && key === captionKey) {
      updateCaptionLines(lines, state.config)
    } else if (key) {
      if (captionPhase === 'idle') paintCaption(key, lines, state.config)
      else {
        pendingCaption = { key, lines }
        if (captionPhase !== 'fading') beginFade()
      }
    } else if (captionPhase !== 'idle') {
      pendingCaption = null
      if (captionPhase !== 'fading') beginFade()
    }
    // The control bar expands on hover and fades out again on its own, so the band it reserves is read
    // from the bar as it is right now. Holding the tallest bar ever seen is what left the block parked
    // high over the video for the rest of the session.
    const reserve = visibleControlReserve(adapter.controlBar, adapter.container, rect)
    // The block hangs by its bottom edge, so the anchor is a line across the frame rather than the
    // block's own height: a phrase that grows from one line to two extends upward and leaves the
    // anchor where it was.
    const contentHeight = captionPhase === 'idle' ? 0 : captionContentHeight()
    const clearance = state.config.bottomOffset / 100
    const band = subtitleGeometry(rect.height, clearance, contentHeight, reserve)
    overlay.host.style.bottom = `${Math.max(0, innerHeight - rect.top - band.top)}px`
    if (contentHeight) caption.style.height = `${Math.min(band.maxHeight, contentHeight)}px`
    overlay.host.hidden = fullscreen === video || captionPhase === 'idle'
    let cue: VTTCue | null = null
    if (fullscreen === video && state.status === 'active' && segment && lines.length) {
      const [start, end] = fullscreenCueBounds(segment, video.currentTime, remaining)
      const cueText = lines.map((line, index) => {
        const kind = state.config.showSource && index === 0 ? 'source' : 'translation'
        return `<c.nola-caption-${kind}>${escapeCueText(line)}</c>`
      }).join('\n')
      cue = new VTTCue(start, end, cueText)
      cue.line = 100 - state.config.bottomOffset; cue.snapToLines = false
    }
    nativeTrack.update(fullscreen === video ? video : null, state.status === 'active', cue, t('button'), state.config.targetLanguage)
  }
  const unsubscribe = store.subscribe(render)
  let scheduled = false
  const refresh = (): void => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      const videos = detectVideos(document)
      const state = store.getSnapshot()
      if (videos.length !== state.videos.length || videos.some((video, index) => video !== state.videos[index])) store.updateVideos(videos)
      const selected = store.getSnapshot().selectedVideo
      if (selected) resize.observe(selected)
      const nextFingerprint = `${location.href}|${selected?.currentSrc}|${selected?.getAttribute('src')}`
      if (fingerprint && fingerprint !== nextFingerprint) store.timelineChanged()
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
  for (const name of ['scroll', 'resize', 'pointermove', 'pointerleave', 'fullscreenchange', 'enterpictureinpicture', 'leavepictureinpicture']) window.addEventListener(name, refresh, true)
  const destroy = (): void => {
    mutation.disconnect(); resize.disconnect(); clearInterval(interval); nativeTrack.restore(); unsubscribe()
    for (const name of ['scroll', 'resize', 'pointermove', 'pointerleave', 'fullscreenchange', 'enterpictureinpicture', 'leavepictureinpicture']) window.removeEventListener(name, refresh, true)
    triggerRoot.unmount(); panelRoot.unmount(); hosts.forEach(host => host.remove()); delete document.documentElement.dataset.nolaInstalled; void store.destroy()
  }
  window.addEventListener('pagehide', destroy, { once: true })
  void store.init(); refresh()
}
install()
window.addEventListener('pageshow', event => { if (event.persisted) install() })
