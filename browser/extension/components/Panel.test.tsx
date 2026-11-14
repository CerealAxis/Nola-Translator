import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { createExtensionStore } from '../store'
import { DEFAULT_PREFERENCES, savePreferences } from '../preferences'
import { Panel } from './Panel'

vi.mock('../preferences', async importOriginal => ({ ...await importOriginal<typeof import('../preferences')>(), savePreferences: vi.fn(async () => {}) }))
beforeEach(() => vi.clearAllMocks())

it('limits the panel to connection controls without repeating desktop settings', () => {
  const store = createExtensionStore({ bridge: { request: vi.fn(async () => undefined), subscribe: () => () => {}, close: vi.fn() } })
  store.setPreferences({ ...DEFAULT_PREFERENCES, asrProvider: 'desktop', subtitleProvider: 'desktop' })
  render(<Panel store={store} />)
  expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  expect(screen.queryByText('Audio source')).not.toBeInTheDocument()
  expect(screen.queryByText('Font size')).not.toBeInTheDocument()
  expect(screen.queryByText('Bottom offset')).not.toBeInTheDocument()
})

it('shows that live translation is waiting when the video is paused', () => {
  const store = createExtensionStore({ bridge: { request: vi.fn(async () => undefined), subscribe: () => () => {}, close: vi.fn() } })
  vi.spyOn(store, 'getSnapshot').mockReturnValue({
    ...store.getSnapshot(), connected: true, status: 'active', playbackPaused: true,
  })
  render(<Panel store={store} />)
  expect(screen.getByRole('status')).toHaveTextContent('Waiting for playback')
})

function setup() {
  const store = createExtensionStore({ bridge: { request: vi.fn(async () => undefined), subscribe: () => () => {}, close: vi.fn() } })
  store.setPreferences({ ...DEFAULT_PREFERENCES, uiLanguage: 'en' })
  store.updateVideos([document.createElement('video')])
  const toggleSubtitles = vi.fn()
  render(<Panel store={store} subtitles={{ active: false, tracks: [], availability: 'ready' }} toggleSubtitles={toggleSubtitles} />)
  return { store, toggleSubtitles }
}

it('starts existing subtitles with a compact switch and keeps implementation details out of the menu', () => {
  const { toggleSubtitles } = setup()
  fireEvent.click(screen.getByRole('switch', { name: 'Translate existing subtitles' }))
  expect(toggleSubtitles).toHaveBeenCalledOnce()
  expect(screen.queryByText(/ASR|Step|Tab audio/)).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

it('navigates through settings and style, saves changes, and goes back with Escape', async () => {
  const user = userEvent.setup()
  setup()
  await user.click(screen.getByRole('button', { name: 'Subtitle settings' }))
  expect(screen.getByRole('combobox', { name: 'Target language' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Subtitle style' }))
  const opacity = screen.getByRole('slider', { name: 'Subtitle background opacity' })
  act(() => opacity.focus())
  await user.keyboard('{Home}')
  expect(savePreferences).toHaveBeenLastCalledWith({ subtitleBackgroundOpacity: 0 })
  await user.click(screen.getByRole('button', { name: 'Subtitle background color' }))
  const color = screen.getByRole('textbox', { name: 'Subtitle background color · HEX' })
  expect(screen.getByRole('region', { name: /Nola/ }).contains(color)).toBe(true)
  await user.clear(color)
  await user.type(color, '#ff0000')
  expect(savePreferences).toHaveBeenLastCalledWith({ subtitleBackground: '#FF0000' })
  await user.keyboard('{Escape}')
  const fonts = screen.getAllByRole('combobox', { name: 'Subtitle font' })
  expect(fonts).toHaveLength(2)
  fireEvent.keyDown(fonts[0], { key: 'ArrowDown' })
  const monospace = await screen.findByRole('option', { name: 'monospace' })
  expect(within(monospace).getByText('monospace')).toHaveStyle({ fontFamily: 'monospace' })
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: 'Reset style' }))
  expect(savePreferences).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleBackgroundOpacity: DEFAULT_PREFERENCES.subtitleBackgroundOpacity }))
  fireEvent.keyDown(screen.getByRole('region', { name: /Nola/ }), { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Subtitle style' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('switch', { name: 'Translate existing subtitles' })).toBeInTheDocument()
})
