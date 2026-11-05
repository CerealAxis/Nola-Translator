import { describe, expect, it } from 'vitest'
import { alignPlayerTrigger, detectVideos, playerAdapter, selectXVideo, xVideoIdentity } from './adapters'

describe('video adapters', () => {
  it('aligns the logo with native icons even when the control row has an automatic height', () => {
    const controls = document.createElement('div')
    const native = document.createElement('div'); native.innerHTML = '<svg></svg>'
    const trigger = document.createElement('div')
    trigger.attachShadow({ mode: 'open' }).innerHTML = '<svg></svg>'
    controls.append(native, trigger)
    native.querySelector('svg')!.getBoundingClientRect = () => ({ top: 100, height: 20 }) as DOMRect
    trigger.shadowRoot!.querySelector('svg')!.getBoundingClientRect = () => ({ top: 108 + Number.parseFloat(trigger.style.top || '0'), height: 24 }) as DOMRect
    alignPlayerTrigger(controls, trigger)
    expect(trigger.style.top).toBe('-10px')
    alignPlayerTrigger(controls, trigger)
    expect(trigger.style.top).toBe('-10px')
  })
  it('detects visible top-document and open-shadow videos, excluding closed roots and small players', () => {
    document.body.innerHTML = '<video id="large"></video><video id="small"></video><div id="shadow"></div><iframe></iframe>'
    const large = document.querySelector<HTMLVideoElement>('#large')!
    const small = document.querySelector<HTMLVideoElement>('#small')!
    large.getBoundingClientRect = () => ({ width: 640, height: 360 }) as DOMRect
    small.getBoundingClientRect = () => ({ width: 100, height: 50 }) as DOMRect
    const open = document.querySelector('#shadow')!.attachShadow({ mode: 'open' }); open.innerHTML = '<video></video>'
    const shadowVideo = open.querySelector('video')!
    shadowVideo.getBoundingClientRect = () => ({ width: 320, height: 180 }) as DOMRect
    const closed = document.createElement('div'); document.body.append(closed); closed.attachShadow({ mode: 'closed' }).innerHTML = '<video></video>'
    expect(detectVideos(document)).toEqual([large, shadowVideo])
  })
  it('uses platform controls without modifying other videos', () => {
    document.body.innerHTML = '<div id="movie_player"><video></video><div class="ytp-chrome-bottom"><div class="ytp-right-controls"></div></div></div>'
    const video = document.querySelector('video')!
    expect(playerAdapter(video).controlBar).toBe(document.querySelector('.ytp-chrome-bottom'))
    expect(playerAdapter(video).controls).toBe(document.querySelector('.ytp-right-controls'))
    document.body.innerHTML = '<main><video></video></main>'
    expect(playerAdapter(document.querySelector('video')!)).toEqual({ container: document.querySelector('main'), controls: null, controlBar: null })
  })
})

function xVideos() {
  document.body.innerHTML = '<article><a href="https://x.com/person/status/100"><time></time></a><div data-testid="videoComponent"><video id="one"></video><div><input role="slider"><button>Play</button></div></div><article><a href="https://x.com/quoted/status/200"><time></time></a><div data-testid="videoComponent"><video id="two"></video></div></article></article>'
  const videos = Array.from(document.querySelectorAll('video'))
  videos.forEach(video => { video.getBoundingClientRect = () => ({ width: 640, height: 360 }) as DOMRect })
  return videos
}
it('keeps X post identities separate from quoted posts and selects the URL owner', () => {
  const videos = xVideos()
  expect(videos.map(xVideoIdentity)).toEqual(['100', '200'])
  expect(selectXVideo(videos, 'https://x.com/person/status/100')).toBe(videos[0])
  expect(selectXVideo(videos, 'https://x.com/quoted/status/200')).toBe(videos[1])
})
it('uses explicit X player focus, rejects ambiguous timeline videos, and drops detached/hidden owners', () => {
  const videos = xVideos()
  expect(selectXVideo(videos, 'https://x.com/home')).toBeNull()
  document.querySelector('button')!.focus()
  expect(selectXVideo(videos, 'https://x.com/quoted/status/200')).toBe(videos[0])
  document.querySelector('button')!.blur()
  videos[0].closest('div')!.setAttribute('aria-hidden', 'true')
  expect(selectXVideo(videos, 'https://x.com/home')).toBe(videos[1])
})
it('does not infer X ownership from untrusted external status-shaped links', () => {
  document.body.innerHTML = '<article><a href="https://example.com/person/status/100"><time></time></a><video></video></article>'
  expect(xVideoIdentity(document.querySelector('video')!)).toBeNull()
})

it('ignores stale X nodes removed by SPA navigation and collapsed media', () => {
  const videos = xVideos()
  videos[0].remove()
  expect(selectXVideo(videos, 'https://x.com/person/status/100')).toBe(videos[1])
  videos[1].getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect
  expect(selectXVideo(videos, 'https://x.com/home')).toBeNull()
})
