import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import type { GlossaryDocument } from '../../../../shared/glossary'
import { GlossaryTab } from './GlossaryTab'
import userEvent from '@testing-library/user-event'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const id = '3d9f75b0-b0f0-4c35-8ae9-c7c03398e35e'
const document: GlossaryDocument = { schemaVersion: 1, revision: 7, matchingRevision: 3, enabled: true, libraries: [{ id, name: 'Names', description: '', enabled: true, scope: { mode: 'global' }, entries: [] }] }
it('saves a blank translation as keep and sends the confirmed document revision', async () => {
  const command = vi.fn(async () => ({ ...document, revision: 8 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ glossary: { snapshot: async () => document, command, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<GlossaryTab libraryId={id} />)
  fireEvent.click(await screen.findByRole('button', { name: '添加术语' }))
  fireEvent.change(screen.getByRole('textbox', { name: '原文' }), { target: { value: 'Nola' } })
  expect(screen.getByText('保留原文')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 7, command: { action: 'saveTerm', libraryId: id, entry: expect.objectContaining({ source: 'Nola', target: '', targetLanguage: '*' }) } })))
})
it('requires an explicit confirmation before deleting a library', async () => {
  const command = vi.fn(async () => document)
  vi.spyOn(store, 'getBridge').mockReturnValue({ glossary: { snapshot: async () => document, command, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<GlossaryTab libraryId={id} />)
  fireEvent.click(await screen.findByRole('button', { name: '删除' }))
  expect(command).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: '确认删除“Names”？' })).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: '删除' }).at(-1)!)
  await waitFor(() => expect(command).toHaveBeenCalledWith(expect.objectContaining({ command: { action: 'deleteLibrary', libraryId: id } })))
})
it('previews CSV conflicts and replaces only the selected duplicate while preserving its identity', async () => {
  const existing = { id: 'f3eb9e6e-18a4-4ee3-a378-e4d31137204c', source: 'Nola', target: 'Old translation', targetLanguage: '*', caseSensitive: false, enabled: true }
  const value = { ...document, libraries: [{ ...document.libraries[0], entries: [existing] }] }
  const command = vi.fn(async () => ({ ...value, revision: 8 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ glossary: { snapshot: async () => value, command, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<GlossaryTab libraryId={id} />)
  fireEvent.click(await screen.findByRole('button', { name: '导入 CSV' }))
  const file = new File([''], 'terms.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: async () => 'source,target,targetLanguage,caseSensitive,enabled\nNola,New translation,*,false,true' })
  fireEvent.change(screen.getByLabelText('导入 CSV'), { target: { files: [file] } })
  expect(await screen.findByText('1 条术语已存在')).toBeInTheDocument()
  expect(command).not.toHaveBeenCalled()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '重复术语' }))
  await user.click(await screen.findByRole('option', { name: '替换重复项' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '导入 CSV' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 7, command: { action: 'importTerms', libraryId: id, mode: 'replace', entries: [{ ...existing, target: 'New translation' }] } })))
})
it('tests a game-scoped library in its actual scenario instead of the unrelated tool scope', async () => {
  const value: GlossaryDocument = { ...document, libraries: [{ ...document.libraries[0], scope: { mode: 'selected', targets: [{ kind: 'game', ids: '*' }] } }] }
  const testMatch = vi.fn(async () => ({ terms: [], hits: [], signature: '' }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ glossary: { snapshot: async () => value, testMatch, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<GlossaryTab libraryId={id} />)
  await waitFor(() => expect(screen.getByRole('combobox', { name: '测试场景' })).toHaveTextContent('游戏翻译'))
  fireEvent.change(screen.getByRole('textbox', { name: '原文' }), { target: { value: 'Nola' } })
  fireEvent.click(screen.getByRole('button', { name: '测试匹配' }))
  await waitFor(() => expect(testMatch).toHaveBeenCalledWith(expect.objectContaining({ context: { scenario: 'game' }, selection: { mode: 'selected', libraryIds: [id] } })))
})
