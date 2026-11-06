import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import type { GameSnapshot } from '../../../shared/game-translation'
import { GameTranslationPage, gameIssueKey } from './GameTranslationPage'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const snapshot: GameSnapshot = { version: 1, revision: 9, profiles: [{ id: 'game', name: 'Visual novel', sourceLanguage: 'ja', targetLanguage: 'zh', source: 'clipboard', strategy: 'auto', glossarySelection: { mode: 'auto' } }], status: 'idle', lines: [], hookAvailable: false }
it('names the game recovery action for known runtime and wrapped command failures', () => {
  expect(gameIssueKey(new Error("Error invoking remote method 'game:command': Error: permissionDenied"))).toBe('suite.gamePermissionDenied')
  expect(gameIssueKey('translationModelNotReady')).toBe('suite.modelsNeeded')
  expect(gameIssueKey('textTooLong')).toBe('errors.translationInputTooLong')
  expect(gameIssueKey('targetUnavailable')).toBe('suite.gameSessionEnded')
  expect(gameIssueKey('untrusted provider details')).toBe('suite.actionFailed')
})
it('adds games through the native picker command without accepting a renderer path', async () => {
  const command = vi.fn(async () => snapshot)
  vi.spyOn(store, 'getBridge').mockReturnValue({ gameTranslation: { snapshot: async () => ({ ...snapshot, profiles: [] }), command, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<GameTranslationPage />)
  fireEvent.click((await screen.findAllByRole('button', { name: '添加游戏' }))[0])
  await waitFor(() => expect(command).toHaveBeenCalledExactlyOnceWith({ action: 'add' }))
})
it('requires explicit clipboard selection and saves its profile revision before connecting', async () => {
  const command = vi.fn(async (_command: unknown) => ({ ...snapshot, revision: 10 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ gameTranslation: { snapshot: async () => snapshot, command, sources: async () => [], onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<GameTranslationPage gameId="game" />)
  const connect = await screen.findByRole('button', { name: '连接游戏' })
  expect(screen.queryByRole('combobox', { name: '选择窗口' })).toBeNull()
  fireEvent.click(connect)
  await waitFor(() => expect(command.mock.calls).toHaveLength(2))
  expect(command.mock.calls[0][0]).toMatchObject({ action: 'saveProfile', expectedRevision: 9, profile: { source: 'clipboard' } })
  expect(command.mock.calls[1][0]).toEqual({ action: 'connect', id: 'game', sourceId: undefined })
})
it('shows real hook candidates and only sends the selected session and thread IDs', async () => {
  const command = vi.fn(async (_command: unknown) => snapshot)
  vi.spyOn(store, 'getBridge').mockReturnValue({ gameTranslation: { snapshot: async () => ({ ...snapshot, activeGameId: 'game', source: 'hook', sessionId: 'session', status: 'running', threads: [{ id: 'thread-1', name: 'Dialogue', code: '/HS@1234', preview: 'Real game text', selected: false, embedSupported: false }] }), command, sources: async () => [], onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<GameTranslationPage gameId="game" />)
  expect(await screen.findByText('Real game text')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('switch', { name: '启用 Dialogue' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'selectThreads', sessionId: 'session', ids: ['thread-1'] }))
})
