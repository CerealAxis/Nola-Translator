export interface PlayerAdapter { container: HTMLElement; controls: HTMLElement | null; controlBar: HTMLElement | null }
/** Native control rows can have automatic heights and different text baselines. Match their painted icons. */
export function alignPlayerTrigger(controls: HTMLElement, trigger: HTMLElement): void {
  const logo = trigger.shadowRoot?.querySelector('svg')
  if (!logo) return
  const mark = logo.getBoundingClientRect()
  if (mark.height <= 0) return
  for (const control of Array.from(controls.children).reverse()) {
    if (control === trigger) continue
    const icon = control.querySelector('svg, img') ?? control
    const reference = icon.getBoundingClientRect()
    if (reference.height <= 0) continue
    const difference = reference.top + reference.height / 2 - (mark.top + mark.height / 2)
    if (Math.abs(difference) > 0.25) trigger.style.top = `${(Number.parseFloat(trigger.style.top) || 0) + difference}px`
    return
  }
}

const X_PLAYER = '[data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="videoPlayerContainer"]'
function xPlayerContainer(video: HTMLVideoElement): HTMLElement | null {
  let container = video.closest<HTMLElement>(X_PLAYER)
  let parent = container?.parentElement?.closest<HTMLElement>(X_PLAYER)
  while (parent && parent.querySelectorAll('video').length === 1) {
    container = parent
    parent = parent.parentElement?.closest<HTMLElement>(X_PLAYER)
  }
  return container
}
const xHost = (hostname: string) => /^(?:www\.)?(?:x|twitter)\.com$/.test(hostname)

/** Resolve only links owned by this article, excluding quoted posts nested inside it. */
export function xVideoIdentity(video: HTMLVideoElement): string | null {
  const article = video.closest('article')
  if (!article) return null
  const links = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(link => link.closest('article') === article)
  const dated = links.filter(link => link.querySelector('time'))
  for (const link of [...dated, ...links]) {
    const url = new URL(link.href, video.ownerDocument.baseURI)
    if (!xHost(url.hostname)) continue
    const match = /^\/[^/]+\/status\/(\d+)(?:\/|$)/.exec(url.pathname)
    if (match) return match[1]
  }
  return null
}

/** Do not bind captions to an arbitrary timeline video when the active player is ambiguous. */
export function selectXVideo(videos: HTMLVideoElement[], href: string): HTMLVideoElement | null {
  const visible = videos.filter(video => {
    const rect = video.getBoundingClientRect()
    return video.isConnected && rect.width > 0 && rect.height > 0 && !video.closest('[aria-hidden="true"], [hidden]') && Boolean(video.closest(X_PLAYER))
  })
  const focused = visible.filter(video => xPlayerContainer(video)?.contains(video.ownerDocument.activeElement))
  if (focused.length === 1) return focused[0]
  const hovered = visible.filter(video => xPlayerContainer(video)?.matches(':hover'))
  if (hovered.length === 1) return hovered[0]
  const status = /^\/[^/]+\/status\/(\d+)(?:\/|$)/.exec(new URL(href).pathname)?.[1]
  const current = status ? visible.filter(video => xVideoIdentity(video) === status) : []
  if (current.length === 1) return current[0]
  const playing = visible.filter(video => !video.paused && !video.ended)
  if (playing.length === 1) return playing[0]
  return visible.length === 1 ? visible[0] : null
}

export function detectVideos(document: Document): HTMLVideoElement[] {
  const roots: (Document | ShadowRoot)[] = [document]
  const videos: HTMLVideoElement[] = []
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index]
    videos.push(...root.querySelectorAll('video'))
    // Open roots are inspectable; closed roots and frame documents remain outside the supported scope.
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot)
  }
  const visible = videos.filter(video => {
    const rect = video.getBoundingClientRect()
    return video.isConnected && rect.width >= 160 && rect.height >= 90 && !video.hidden && document.pictureInPictureElement !== video
  })
  if (xHost(document.location?.hostname ?? '')) {
    const selected = selectXVideo(visible, document.location.href)
    return selected ? [selected] : []
  }
  return visible
}
export function playerAdapter(video: HTMLVideoElement): PlayerAdapter {
  const youtube = video.closest<HTMLElement>('#movie_player')
  if (youtube) return { container: youtube, controlBar: youtube.querySelector<HTMLElement>('.ytp-chrome-bottom'), controls: youtube.querySelector<HTMLElement>('.ytp-right-controls') }
  const bilibili = video.closest<HTMLElement>('.bpx-player-container, .bilibili-player')
  if (bilibili) return { container: bilibili, controlBar: bilibili.querySelector<HTMLElement>('.bpx-player-control-bottom, .bilibili-player-video-control'), controls: bilibili.querySelector<HTMLElement>('.bpx-player-control-bottom-right, .bilibili-player-video-control-bottom-right') }
  const x = xPlayerContainer(video)
  if (x && xHost(video.ownerDocument.location?.hostname ?? '')) {
    const slider = x.querySelector<HTMLElement>('[role="slider"]')
    // Find the smallest common control ancestor, rather than depending on generated CSS names.
    let bar = slider?.parentElement ?? null
    while (bar && bar !== x && !bar.querySelector('button')) bar = bar.parentElement
    const controlBar = bar && bar !== x ? bar : null
    return { container: x, controls: controlBar, controlBar }
  }
  const netflix = video.closest<HTMLElement>('.watch-video, .nf-player-container')
  if (netflix) return { container: netflix, controls: netflix.querySelector<HTMLElement>('[data-uia="controls-standard"]'), controlBar: netflix.querySelector<HTMLElement>('[data-uia="controls-standard"]') }
  return { container: video.parentElement ?? video, controls: null, controlBar: null }
}
