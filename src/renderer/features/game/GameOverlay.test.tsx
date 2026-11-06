import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stores } from '@/store'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import type { GameSnapshot, GameTranslationBridge } from '../../../shared/game-translation'
import { GameOverlay } from './GameOverlay'

const initial = stores.settings.getState()
afterEach(() => { cleanup(); stores.settings.setState(initial) })
const ready: GameSnapshot = { version: 1, revision: 1, profiles: [], activeGameId: 'game', sessionId: 'session', status: 'running', source: 'hook', hookAvailable: true,
  lines: [{ id: 'first', text: 'Old source', translation: 'Old translation', status: 'ready' }] }
it('withdraws the older translation as soon as a new line starts and never falls back on errors', async () => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, overlay: { ...DEFAULT_SETTINGS.overlay, showSource: true, showTranslation: true } } })
  let changed!: (snapshot: GameSnapshot) => void
  const api = { snapshot: async () => ready, onChanged: (listener: typeof changed) => { changed = listener; return vi.fn() } } as Pick<GameTranslationBridge, 'snapshot' | 'onChanged'>
  render(<GameOverlay api={api} sessionId="session" />)
  expect(await screen.findByText('Old translation')).toBeInTheDocument()
  act(() => changed({ ...ready, lines: [...ready.lines, { id: 'second', text: 'New source', status: 'translating' }] }))
  expect(screen.getByText('New source')).toBeInTheDocument()
  expect(screen.queryByText('Old translation')).not.toBeInTheDocument()
  act(() => changed({ ...ready, lines: [...ready.lines, { id: 'second', text: 'New source', translation: 'Stale result', status: 'error' }] }))
  expect(screen.getByText('New source')).toBeInTheDocument()
  expect(screen.queryByText('Stale result')).not.toBeInTheDocument()
})
it('hides paused and superseded sessions rather than reusing their captions', async () => {
  let changed!: (snapshot: GameSnapshot) => void
  render(<GameOverlay sessionId="session" api={{ snapshot: async () => ready, onChanged: listener => { changed = listener; return () => {} } }} />)
  await screen.findByText('Old source')
  act(() => changed({ ...ready, status: 'paused' }))
  expect(screen.queryByText('Old source')).not.toBeInTheDocument()
  act(() => changed({ ...ready, sessionId: 'other-session' }))
  expect(screen.queryByText('Old source')).not.toBeInTheDocument()
})
