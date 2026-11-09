import { expect, it } from 'vitest'
import { suppressPlayerCaptions } from './nativeCaptions'

it('hides and restores the player captions without changing disabled or Nola tracks', () => {
  const player = document.createElement('div')
  player.id = 'movie_player'
  const video = player.appendChild(document.createElement('video'))
  const existing = { kind: 'captions', label: 'English', mode: 'showing' }
  const disabled = { kind: 'captions', label: 'Chinese', mode: 'disabled' }
  const own = { kind: 'captions', label: 'Nola', mode: 'showing' }
  const tracks = [existing, disabled, own]
  const list = Object.assign(new EventTarget(), { [Symbol.iterator]: () => tracks[Symbol.iterator]() })
  Object.defineProperty(video, 'textTracks', { value: list })
  const restore = suppressPlayerCaptions(video)
  try {
    expect(player.hasAttribute('data-nola-live-captions')).toBe(true)
    expect(tracks.map(track => track.mode)).toEqual(['hidden', 'disabled', 'showing'])
    const added = { kind: 'subtitles', label: 'French', mode: 'showing' }
    tracks.push(added)
    list.dispatchEvent(new Event('addtrack'))
    expect(added.mode).toBe('hidden')
  } finally { restore() }
  expect(player.hasAttribute('data-nola-live-captions')).toBe(false)
  expect(tracks.map(track => track.mode)).toEqual(['showing', 'disabled', 'showing', 'showing'])
})
