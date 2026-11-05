import { afterEach, expect, it, vi } from 'vitest'
import { SubtitleHoverPause } from './subtitle-hover'
afterEach(() => document.body.replaceChildren())
function video(paused = false) {
  const node = document.createElement('video'); document.body.append(node)
  Object.defineProperty(node, 'paused', { configurable: true, writable: true, value: paused })
  const pause = vi.spyOn(node, 'pause').mockImplementation(() => { Object.defineProperty(node, 'paused', { configurable: true, writable: true, value: true }); node.dispatchEvent(new Event('pause')) })
  const play = vi.spyOn(node, 'play').mockResolvedValue(undefined)
  return { node, pause, play }
}
it('only resumes playback that the hover itself paused', () => {
  const running = video(); const hold = new SubtitleHoverPause()
  hold.enter(running.node, true); expect(running.pause).toHaveBeenCalledOnce()
  hold.leave(); expect(running.play).toHaveBeenCalledOnce()
  const alreadyPaused = video(true); hold.enter(alreadyPaused.node, true); hold.leave()
  expect(alreadyPaused.pause).not.toHaveBeenCalled(); expect(alreadyPaused.play).not.toHaveBeenCalled()
})
it('preserves a user pause or play intent and does not reacquire until leaving', () => {
  const current = video(); const hold = new SubtitleHoverPause()
  hold.enter(current.node, true)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
  hold.enter(current.node, true); hold.leave()
  expect(current.pause).toHaveBeenCalledOnce(); expect(current.play).not.toHaveBeenCalled()
})
it('does nothing when hover pausing is disabled', () => {
  const current = video(); const hold = new SubtitleHoverPause()
  hold.enter(current.node, false); hold.leave()
  expect(current.pause).not.toHaveBeenCalled(); expect(current.play).not.toHaveBeenCalled()
})
