import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AudioPlayer } from '../../src/renderer/components/assistant-ui/native/media-player'

afterEach(cleanup)
it('keeps transcript timing synchronized with playback and seeking', () => {
  const onTimeChange = vi.fn()
  const view = render(<AudioPlayer src="blob:recording" title="Recording" onTimeChange={onTimeChange} />)
  const audio = view.container.querySelector('audio')!
  Object.defineProperty(audio, 'duration', { value: 10, configurable: true })
  fireEvent.loadedMetadata(audio)
  audio.currentTime = 2.5
  fireEvent.timeUpdate(audio)
  expect(onTimeChange).toHaveBeenLastCalledWith(2500)
  fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '6' } })
  expect(audio.currentTime).toBe(6)
  expect(onTimeChange).toHaveBeenLastCalledWith(6000)
})

it('stops playback when the shared player is removed', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  try {
    const view = render(<AudioPlayer src="blob:recording" />)
    Object.defineProperty(view.container.querySelector('audio')!, 'paused', { value: false, configurable: true })
    view.unmount()
    expect(pause).toHaveBeenCalledOnce()
  } finally { pause.mockRestore() }
})
