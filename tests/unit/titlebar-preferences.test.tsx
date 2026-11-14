import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
vi.mock('@/store', () => ({ settingsStore: {}, useStore: (_store: unknown, selector: (state: unknown) => unknown) => selector({ settings: { theme: 'light', appearance: { reduceMotion: true } } }), updateSettings: vi.fn(async () => {}) }))
vi.mock('@/routes', () => ({ useRoute: () => ({ navigate: vi.fn() }) }))
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, uiLanguage: 'en', setLanguage: vi.fn() }) }))
import { TitleBar } from '../../src/renderer/components/primitives/TitleBar'
afterEach(cleanup)
it('keeps preference buttons by default, but omits them for the independent editor', () => {
  const { unmount } = render(<TitleBar helpItems={[]} />)
  expect(screen.getByRole('button', { name: 'titleBar.language' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'titleBar.themeToDark' })).toBeTruthy()
  unmount()
  render(<TitleBar preferences={false} helpItems={[]} leading={<div id="comic-editor-menus">Editor menus</div>} />)
  expect(screen.queryByRole('button', { name: 'titleBar.language' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'titleBar.themeToDark' })).toBeNull()
  expect(screen.getByText('Editor menus')).toBeTruthy()
  expect(document.querySelector('.nola-native-controls')).not.toBeNull()
})
