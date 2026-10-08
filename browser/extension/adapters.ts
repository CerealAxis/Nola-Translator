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

export function detectVideos(document: Document): HTMLVideoElement[] {
  const roots: (Document | ShadowRoot)[] = [document]
  const videos: HTMLVideoElement[] = []
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index]
    videos.push(...root.querySelectorAll('video'))
    // Open roots are inspectable; closed roots and frame documents remain outside the supported scope.
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot)
  }
  return videos.filter(video => {
    const rect = video.getBoundingClientRect()
    return video.isConnected && rect.width >= 160 && rect.height >= 90 && !video.hidden && document.pictureInPictureElement !== video
  })
}
export function playerAdapter(video: HTMLVideoElement): PlayerAdapter {
  const youtube = video.closest<HTMLElement>('#movie_player')
  if (youtube) return { container: youtube, controlBar: youtube.querySelector<HTMLElement>('.ytp-chrome-bottom'), controls: youtube.querySelector<HTMLElement>('.ytp-right-controls') }
  const bilibili = video.closest<HTMLElement>('.bpx-player-container, .bilibili-player')
  if (bilibili) return { container: bilibili, controlBar: bilibili.querySelector<HTMLElement>('.bpx-player-control-bottom, .bilibili-player-video-control'), controls: bilibili.querySelector<HTMLElement>('.bpx-player-control-bottom-right, .bilibili-player-video-control-bottom-right') }
  return { container: video.parentElement ?? video, controls: null, controlBar: null }
}
