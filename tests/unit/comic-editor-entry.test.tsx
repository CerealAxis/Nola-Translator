import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
const state = vi.hoisted(() => ({ fail: false }))
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn() }) }))
vi.mock('@/store', () => ({ initStores: vi.fn() }))
vi.mock('@/bridge/ipc/ipcBridge', () => ({ createIpcBridge: vi.fn() }))
vi.mock('@/i18n', () => ({ I18nProvider: ({ children }: { children: React.ReactNode }) => children, useI18n: () => ({ t: (key: string) => key, language: 'en' }) }))
vi.mock('@/components/ui/toast', () => ({ ToastProvider: () => null }))
vi.mock('@/components/primitives/TitleBar', () => ({ TitleBar: () => null }))
vi.mock('@/components/assistant-ui/native/error-state', () => ({ ErrorState: ({ title, detail }: { title: string; detail: string }) => <div role="alert">{title} {detail}</div> }))
vi.mock('@/features/comic/ComicTranslationPage', () => ({ ComicTranslationPage: () => { if (state.fail) throw new Error('IPC offline'); return <div>Editor canvas</div> } }))
vi.mock('../../src/renderer/theme/desktop-material', () => ({}))
import { ComicEditorBoundary, ComicEditorDocument } from '../../src/renderer/comic-editor-entry'
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); state.fail = false; vi.restoreAllMocks() })
it('catches invalid editor URLs inside the mounted boundary instead of failing at module startup', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.history.replaceState({}, '', '/comic-editor.html?projectId=invalid')
  render(<ComicEditorBoundary><ComicEditorDocument /></ComicEditorBoundary>)
  expect(screen.getByRole('alert').textContent).toContain('suite.actionFailed')
})
it('shows a recoverable error view when the editor render fails', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.history.replaceState({}, '', '/comic-editor.html?projectId=11111111-1111-4111-8111-111111111111')
  state.fail = true
  render(<ComicEditorBoundary><ComicEditorDocument /></ComicEditorBoundary>)
  expect(screen.getByRole('alert').textContent).toContain('IPC offline')
})
