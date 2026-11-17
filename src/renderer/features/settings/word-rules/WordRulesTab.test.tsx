import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import * as notices from '@/components/primitives/notify'
import type { NolaBridge } from '@/bridge'
import {
  applyWordRuleMutation,
  emptyWordRules,
  type WordRuleMutation,
} from '../../../../shared/word-rules'
import { WordRulesTab } from './WordRulesTab'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('manages a global preserve library and edits words without a translation field', async () => {
  let document = emptyWordRules()
  let changed: (() => void) | undefined
  const command = vi.fn(async (request: WordRuleMutation) => {
    document = applyWordRuleMutation(document, request)
    changed?.()
    return document
  })
  vi.spyOn(store, 'getBridge').mockReturnValue({
    wordRules: {
      snapshot: async () => document,
      command,
      onChanged: (listener: () => void) => {
        changed = listener
        return () => {}
      },
    },
  } as unknown as NolaBridge)
  render(<WordRulesTab kind="preserve" />)
  await waitFor(() => expect(screen.getByRole('button', { name: '新建词库' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '新建词库' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Characters' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await screen.findByText('Characters')
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  fireEvent.click(screen.getByRole('button', { name: '添加词语' }))
  expect(screen.queryByLabelText('译文')).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: '词语' }), { target: { value: 'Nola' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(document.libraries[0].entries[0].text).toBe('Nola'))
  expect(command).toHaveBeenCalledTimes(2)
})

it('offers subtitle-only scopes for blocked word libraries', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({
    wordRules: {
      snapshot: async () => emptyWordRules(),
      onChanged: () => () => {},
      command: vi.fn(),
    },
  } as unknown as NolaBridge)
  render(<WordRulesTab kind="mask" />)
  fireEvent.click(await screen.findByRole('button', { name: '新建词库' }))
  fireEvent.click(screen.getByRole('combobox', { name: /范围/ }))
  expect(screen.queryByRole('option', { name: '漫画翻译' })).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '屏幕翻译' })).not.toBeInTheDocument()
})

it('closes a saved draft and reloads the stored document when realtime synchronization fails', async () => {
  let document = emptyWordRules()
  const snapshot = vi.fn(async () => document)
  const error = new Error('wordRulesSavedSyncFailed')
  const notify = vi.spyOn(notices, 'notifyError').mockReturnValue('notice')
  vi.spyOn(store, 'getBridge').mockReturnValue({
    wordRules: {
      snapshot,
      onChanged: () => () => {},
      command: async (request: WordRuleMutation) => {
        document = applyWordRuleMutation(document, request)
        throw error
      },
    },
  } as unknown as NolaBridge)
  render(<WordRulesTab kind="preserve" />)
  fireEvent.click(await screen.findByRole('button', { name: '新建词库' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Saved library' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await screen.findByText('Saved library')).toBeInTheDocument()
  expect(snapshot.mock.calls.length).toBeGreaterThanOrEqual(2)
  expect(notify).toHaveBeenCalledWith(expect.stringContaining('已保存'), { cause: error })
  expect(document.revision).toBe(1)
})
