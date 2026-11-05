import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NolaBridge } from '@/bridge'
import * as store from '@/store'
import { DEFAULT_SETTINGS } from '../../../../shared/settings'
import { screenConfigSchema, type ScreenSnapshot } from '../../../../shared/screen-translation'
import { EDITOR_SHORTCUT_DEFAULTS } from '../../../../shared/keyboard-shortcuts'
import { parseRoute } from '@/routes'
import { ShortcutsTab } from './ShortcutsTab'

const initial = store.stores.settings.getState()
let snapshot: ScreenSnapshot
const command = vi.fn()
beforeEach(() => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  snapshot = { status: 'running', config: screenConfigSchema.parse({ toggleShortcut: 'Ctrl+Shift+F8' }),
    sessionId: 'fixture', epoch: 0, blocks: [], frames: 0, ocrMs: 0, translationMs: 0, shortcutError: false }
  command.mockReset().mockImplementation(async ({ action, shortcuts }) => {
    if (action === 'shortcuts') snapshot = { ...snapshot, config: { ...snapshot.config, ...shortcuts } }
    return snapshot
  })
  vi.spyOn(store, 'getBridge').mockReturnValue({ screenTranslation: { snapshot: async () => snapshot, command, onChanged: () => () => {} } } as unknown as NolaBridge)
  vi.spyOn(store.actions.settings, 'updateSettings').mockImplementation(async patch => {
    store.stores.settings.setState({ settings: { ...store.stores.settings.getState().settings!, ...patch } as typeof DEFAULT_SETTINGS })
  })
})
afterEach(() => { cleanup(); store.stores.settings.setState(initial); vi.restoreAllMocks() })

function Surface() {
  const settings = store.useStore(store.stores.settings, state => state.settings!)
  return <ShortcutsTab settings={settings} />
}
const row = (id: string) => within(document.querySelector<HTMLElement>(`[data-shortcut-id="${id}"]`)!)
const open = async () => {
  render(<Surface />)
  await waitFor(() => expect(row('toggleShortcut').getByRole('button', { name: /^修改/ })).toBeEnabled())
  return userEvent.setup()
}
const edit = async (user: ReturnType<typeof userEvent.setup>, id: string) => {
  await user.click(row(id).getByRole('button', { name: /^修改/ }))
  return screen.findByRole('button', { name: '按下新组合…' })
}
const press = (button: HTMLElement, key: string, options = {}) => {
  fireEvent.keyDown(button, { key, code: key, ...options })
  fireEvent.keyUp(button, { key, code: key, ...options })
}

it('uses one searchable table for every editable command and Kbd for its keys', async () => {
  expect(parseRoute('#/settings/shortcuts').tab).toBe('shortcuts')
  const user = await open()
  expect(screen.getAllByRole('row')).toHaveLength(16)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(document.querySelector('[data-slot="kbd-group"] [data-slot="kbd"]')).toBeInTheDocument()
  await user.type(screen.getByRole('searchbox'), 'Ctrl Shift F8')
  expect(screen.getAllByRole('row')).toHaveLength(2)
  await user.clear(screen.getByRole('searchbox'))
  await user.type(screen.getByRole('searchbox'), '不存在的快捷键')
  expect(screen.getByText('没有匹配的快捷键')).toBeInTheDocument()
})

it('records a new combination while suspending and restoring global shortcuts', async () => {
  const user = await open()
  const recorder = await edit(user, 'toggleShortcut')
  expect(command).toHaveBeenCalledWith({ action: 'shortcutRecording', active: true })
  press(recorder, 'F6', { ctrlKey: true, shiftKey: true })
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'shortcuts', shortcuts: expect.objectContaining({ toggleShortcut: 'Control+Shift+F6' }) }))
  expect(command).toHaveBeenCalledWith({ action: 'shortcutRecording', active: false })
  await waitFor(() => expect(screen.queryByRole('button', { name: '按下新组合…' })).not.toBeInTheDocument())
})

it('deletes bindings to Unassigned and restores one or all defaults', async () => {
  const user = await open()
  await user.click(row('editShortcut').getByRole('button', { name: /^删除/ }))
  await waitFor(() => expect(row('editShortcut').getByText('未分配')).toBeInTheDocument())
  expect(row('editShortcut').getByRole('button', { name: /^删除/ })).toBeDisabled()
  await user.click(row('editShortcut').getByRole('button', { name: /^重置/ }))
  await waitFor(() => expect(row('editShortcut').queryByText('未分配')).not.toBeInTheDocument())
  await user.click(row('meeting').getByRole('button', { name: /^删除/ }))
  await waitFor(() => expect(row('meeting').getByText('未分配')).toBeInTheDocument())
  await user.click(row('editor:cancel').getByRole('button', { name: /^删除/ }))
  await waitFor(() => expect(row('editor:cancel').getByText('未分配')).toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '全部恢复默认' }))
  await waitFor(() => expect(screen.queryByText('未分配')).not.toBeInTheDocument())
  expect(snapshot.config.editorShortcuts).toEqual(EDITOR_SHORTCUT_DEFAULTS)
  expect(store.stores.settings.getState().settings?.meetingMode?.passthroughKey).toBe('F9')
})

it('cancels with Escape and resets a recorded row with Backspace', async () => {
  const user = await open()
  press(await edit(user, 'toggleShortcut'), 'Escape')
  expect(command.mock.calls.some(([value]) => value.action === 'shortcuts')).toBe(false)
  press(await edit(user, 'toggleShortcut'), 'Backspace')
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'shortcuts', shortcuts: expect.objectContaining({ toggleShortcut: 'CommandOrControl+Shift+F8' }) }))
})

it('keeps recording after a duplicate and accepts a replacement', async () => {
  const user = await open()
  const recorder = await edit(user, 'toggleShortcut')
  press(recorder, 'F9', { ctrlKey: true, shiftKey: true })
  expect(await screen.findByText('此组合已分配给“编辑区域”')).toBeInTheDocument()
  expect(command.mock.calls.some(([value]) => value.action === 'shortcuts')).toBe(false)
  press(recorder, 'F6', { ctrlKey: true, shiftKey: true })
  await waitFor(() => expect(snapshot.config.toggleShortcut).toBe('Control+Shift+F6'))
})

it('persists custom meeting and editor bindings through their existing owners', async () => {
  const user = await open()
  press(await edit(user, 'meeting'), 'k', { code: 'KeyK', ctrlKey: true, shiftKey: true })
  await waitFor(() => expect(store.actions.settings.updateSettings).toHaveBeenCalledWith({ meetingMode: expect.objectContaining({ passthroughKey: 'Control+Shift+K', duckVolume: 20 }) }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '按下新组合…' })).not.toBeInTheDocument())
  press(await edit(user, 'editor:left'), 'j', { code: 'KeyJ', altKey: true })
  await waitFor(() => expect(snapshot.config.editorShortcuts?.left).toBe('Alt+J'))
})

it('keeps the editor open and preserves the binding after an OS registration conflict', async () => {
  command.mockImplementation(async ({ action }) => action === 'shortcuts' ? { ...snapshot, shortcutError: true } : snapshot)
  const user = await open()
  press(await edit(user, 'toggleShortcut'), 'F6', { ctrlKey: true, shiftKey: true })
  expect(await screen.findByText(/快捷键注册失败/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '按下新组合…' })).toBeInTheDocument()
  expect(snapshot.config.toggleShortcut).toBe('Ctrl+Shift+F8')
})

it('does not record keys while meeting interpretation is active', async () => {
  const bridge = store.getBridge()!
  vi.mocked(store.getBridge).mockReturnValue({ ...bridge, meetingMode: { snapshot: async () => ({ state: 'running', passthroughActive: false }) } } as NolaBridge)
  const user = await open()
  await user.click(row('meeting').getByRole('button', { name: /^修改/ }))
  expect(await screen.findByText('请先停止会议口译，再修改快捷键。')).toBeInTheDocument()
  expect(command).not.toHaveBeenCalledWith({ action: 'shortcutRecording', active: true })
})
