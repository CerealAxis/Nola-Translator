import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stores } from '@/store'
import * as settingsActions from '@/store/settingsStore'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { ModelPolicyPanel } from './ModelPolicyPanel'

vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))
const initialSettings = stores.settings.getState()
const initialModels = stores.models.getState()
afterEach(() => { cleanup(); stores.settings.setState(initialSettings); stores.models.setState(initialModels); vi.restoreAllMocks() })

it('enables a configured model independently from scene selection and capability defaults', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  stores.settings.setState({ settings: { ...structuredClone(DEFAULT_SETTINGS), modelPolicy: { enabled: {}, defaults: {}, selections: {} } } })
  stores.models.setState({ resources: [] })
  render(<ModelPolicyPanel />)
  fireEvent.click(screen.getByRole('button', { name: '模型启用与默认模型' }))
  expect(screen.getAllByRole('combobox')).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: '启用 MyMemory 免费翻译' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelPolicy: { enabled: { 'mt:cloud:mymemory': true }, defaults: {}, selections: {} } }))
})

it('disables a model without including default or scene-selection entries in the patch', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  stores.settings.setState({ settings: { ...structuredClone(DEFAULT_SETTINGS), modelPolicy: { enabled: { 'mt:cloud:mymemory': true }, defaults: { mt: 'cloud:mymemory' }, selections: { mt: 'cloud:mymemory' } } } })
  stores.models.setState({ resources: [] })
  render(<ModelPolicyPanel />)
  fireEvent.click(screen.getByRole('button', { name: '模型启用与默认模型' }))
  fireEvent.click(screen.getByRole('button', { name: '停用 MyMemory 免费翻译' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelPolicy: { enabled: { 'mt:cloud:mymemory': false }, defaults: {}, selections: {} } }))
})
