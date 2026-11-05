import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { TextActions } from '../text-actions'
import { DEFAULT_PREFERENCES } from '../preferences'
import { synthesize, translate } from '../provider-client'
vi.mock('../provider-client', () => ({ translate: vi.fn(), synthesize: vi.fn() }))
afterEach(() => { vi.clearAllMocks(); document.body.replaceChildren() })
it('applies action visibility and toolbar opacity', () => {
  const { container } = render(<TextActions preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en', selectionTranslate: false, selectionCopy: false, selectionSpeak: true, selectionOpacity: 0.4 }} selection={{ text: 'Hello', x: 0, y: 0 }} dismiss={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Translate selection' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy translation' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Read aloud' })).toBeInTheDocument()
  expect(container.firstElementChild).toHaveStyle({ opacity: '0.4' })
})
it('triple-space inference consumes the suffix but never overwrites newer edits', async () => {
  let finish!: (text: string) => void
  vi.mocked(translate).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const target = document.createElement('textarea'); target.value = 'Hello  '; document.body.append(target)
  render(<TextActions preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en' }} selection={{ target, text: target.value, x: 0, y: 0, autoTranslate: true }} dismiss={() => {}} />)
  await waitFor(() => expect(translate).toHaveBeenCalledWith('Hello', 'auto', 'zh', 'input', expect.any(AbortSignal), 'desktop'))
  target.value = 'My newer edit'
  await act(async () => finish('你好'))
  expect(target.value).toBe('My newer edit')
  expect(screen.queryByRole('button', { name: 'Restore input' })).not.toBeInTheDocument()
})
it('does not apply an in-flight inference after the toolbar is dismissed', async () => {
  let finish!: (text: string) => void
  vi.mocked(translate).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const target = document.createElement('textarea'); target.value = 'Hello  '; document.body.append(target)
  const view = render(<TextActions preferences={DEFAULT_PREFERENCES} selection={{ target, text: target.value, x: 0, y: 0, autoTranslate: true }} dismiss={() => {}} />)
  await waitFor(() => expect(translate).toHaveBeenCalled())
  view.unmount(); await act(async () => finish('你好'))
  expect(target.value).toBe('Hello  ')
})

it('uses independently configured input languages', async () => {
  vi.mocked(translate).mockResolvedValue('Bonjour')
  const target = document.createElement('textarea'); target.value = 'Hello  '; document.body.append(target)
  render(<TextActions preferences={{ ...DEFAULT_PREFERENCES, sourceLanguage: 'ja', pageLanguage: 'zh', inputSourceLanguage: 'en', inputTargetLanguage: 'fr' }} selection={{ target, text: target.value, x: 0, y: 0, autoTranslate: true }} dismiss={() => {}} />)
  await waitFor(() => expect(target.value).toBe('Bonjour'))
  expect(translate).toHaveBeenCalledWith('Hello', 'en', 'fr', 'input', expect.any(AbortSignal), 'desktop')
})
it('executes the context-menu speak action through the configured provider', async () => {
  const play = vi.fn().mockResolvedValue(undefined)
  const pause = vi.fn()
  vi.stubGlobal('Audio', class { playbackRate = 1; volume = 1; play = play; pause = pause; addEventListener = vi.fn() })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn().mockReturnValue('blob:test') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.mocked(synthesize).mockResolvedValue({ audioBase64: btoa('audio'), contentType: 'audio/mpeg' })
  render(<TextActions preferences={{ ...DEFAULT_PREFERENCES, ttsProvider: 'my-voice', sourceLanguage: 'en' }} selection={{ text: 'Hello', x: 0, y: 0, autoSpeak: true }} dismiss={() => {}} />)
  await waitFor(() => expect(play).toHaveBeenCalledOnce())
  expect(synthesize).toHaveBeenCalledWith('Hello', 'en', expect.any(AbortSignal), 'my-voice')
})

it('uses a compact icon toolbar and keeps secondary actions in its keyboard-accessible menu', async () => {
  const user = userEvent.setup(); const dismiss = vi.fn()
  render(<TextActions preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en' }} selection={{ text: 'Hello', x: 0, y: 0 }} dismiss={dismiss} />)
  const toolbar = screen.getByRole('toolbar')
  expect(toolbar.querySelectorAll('button')).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Translate selection' })).toHaveAttribute('title', 'Translate selection')
  expect(screen.queryByRole('button', { name: 'Copy translation' })).not.toBeInTheDocument()
  screen.getByRole('button', { name: 'Translate selection' }).focus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('button', { name: 'Read aloud' })).toHaveFocus()
  await user.keyboard('{End}{Enter}')
  expect(await screen.findByRole('button', { name: 'Copy translation' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('button', { name: 'Copy translation' })).not.toBeInTheDocument()
  expect(dismiss).not.toHaveBeenCalled()
})

it('renders translation separately and restores input from the more menu', async () => {
  const user = userEvent.setup()
  vi.mocked(translate).mockResolvedValue('你好')
  const target = document.createElement('textarea'); target.value = 'Hello'; document.body.append(target)
  const view = render(<TextActions preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'en' }} selection={{ target, text: 'Hello', x: 0, y: 0 }} dismiss={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Translate input' }))
  expect(await screen.findByText('你好')).toBeVisible()
  expect(view.container.querySelector('.nola-selection-result')).toHaveTextContent('你好')
  expect(target.value).toBe('你好')
  await user.click(screen.getByRole('button', { name: 'More' }))
  await user.click(await screen.findByRole('button', { name: 'Restore input' }))
  expect(target.value).toBe('Hello')
})

it('does not start delayed speech after dismissal', async () => {
  let finish!: (sound: { audioBase64: string; contentType: string }) => void
  vi.mocked(synthesize).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const play = vi.fn(); vi.stubGlobal('Audio', class { play = play })
  const view = render(<TextActions preferences={DEFAULT_PREFERENCES} selection={{ text: 'Hello', x: 0, y: 0, autoSpeak: true }} dismiss={() => {}} />)
  await waitFor(() => expect(synthesize).toHaveBeenCalled())
  view.unmount()
  await act(async () => finish({ audioBase64: btoa('audio'), contentType: 'audio/mpeg' }))
  expect(play).not.toHaveBeenCalled()
})
