import { mergeTtsCapabilities } from '../../src/shared/tts/capability-overrides'
import { stores } from '../../src/renderer/store'
import { DEFAULT_SETTINGS } from '../../src/shared/settings'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProviderVoicesDialog } from '../../src/renderer/features/voices/ProviderVoicesDialog'
import { VoiceLibraryPage } from '../../src/renderer/features/voices/VoiceLibraryPage'
import { I18nProvider } from '../../src/renderer/i18n'
import { ttsCatalogCapabilities } from '../../src/shared/tts/catalog'
import { notifyError, notifySuccess } from '../../src/renderer/components/primitives/notify'
const { api, models } = vi.hoisted(() => ({ api: { list: vi.fn(), capabilities: vi.fn(), compatibility: vi.fn(), save: vi.fn(), preview: vi.fn(), prepare: vi.fn(), audio: vi.fn(), addProviderVoice: vi.fn(), bindings: vi.fn() }, models: { tts: [{ binding: 'cloud:preset', name: 'MiMo' }] } }))
vi.mock('@/store', async original => ({ ...await original<typeof import('../../src/renderer/store')>(), getBridge: () => ({ voices: api }) }))
vi.mock('@/available-models', () => ({ useAvailableModels: () => models }))
vi.mock('@/components/primitives/notify', () => ({ notifyError: vi.fn(), notifyInfo: vi.fn(), notifySuccess: vi.fn() }))
beforeEach(() => {
  stores.settings.setState({ settings: null })
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN')
  api.list.mockResolvedValue([])
  api.compatibility.mockImplementation(async (_binding, _language, refs: unknown[]) => refs.map(ref => ({ ref, compatible: true })))
  api.capabilities.mockImplementation(async binding => ttsCatalogCapabilities('mimo', binding === 'cloud:design' ? 'mimo-v2.5-tts-voicedesign' : 'mimo-v2.5-tts', binding))
  models.tts = [{ binding: 'cloud:preset', name: 'MiMo' }]
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks() })
it('renders all preset cards without requiring a saved user profile or starting synthesis', async () => {
  render(<I18nProvider readSettings={false}><VoiceLibraryPage /></I18nProvider>)
  expect(await screen.findAllByTestId('voice-tile')).toHaveLength(9)
  expect(screen.getByRole('heading', { name: '茉莉' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '设计音色' })).not.toBeInTheDocument()
  expect(screen.queryByText('导入音色包')).not.toBeInTheDocument()
  expect(api.preview).not.toHaveBeenCalled()
  await userEvent.setup().click(screen.getByRole('button', { name: '试听 茉莉' }))
  expect(screen.getByRole('dialog', { name: '茉莉' })).toBeVisible()
  expect(api.preview).not.toHaveBeenCalled()
  await userEvent.setup().keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole('button', { name: '试听 茉莉' })).toHaveFocus())
})
it('uses the selected voice language for preview without a second language picker', async () => {
  api.preview.mockResolvedValue('data:audio/wav;base64,UklGRg==')
  render(<I18nProvider readSettings={false}><VoiceLibraryPage /></I18nProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '试听 Mia' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Mia' }))
  expect(dialog.queryByRole('combobox', { name: '目标语言' })).not.toBeInTheDocument()
  await user.type(dialog.getByRole('textbox', { name: '试听文本' }), 'Hello')
  await user.click(dialog.getByRole('button', { name: '生成试听' }))
  await waitFor(() => expect(api.preview).toHaveBeenCalledWith('cloud:preset',
    { kind: 'preset', modelBinding: 'cloud:preset', voiceId: 'Mia' }, 'Hello', 'en'))
})
it('saves a design in a dialog without synthesis or preparation', async () => {
  models.tts.push({ binding: 'cloud:design', name: 'MiMo Design' })
  api.save.mockImplementation(async profile => profile)
  render(<I18nProvider readSettings={false}><VoiceLibraryPage /></I18nProvider>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '合成模型' }))
  await user.click(screen.getByRole('option', { name: 'MiMo Design' }))
  await user.click(await screen.findByRole('button', { name: '设计音色' }))
  const editor = within(screen.getByRole('dialog', { name: '设计音色' }))
  expect(editor.queryByRole('combobox', { name: '默认试听语言' })).not.toBeInTheDocument()
  await user.type(editor.getByRole('textbox', { name: '名称' }), '旁白')
  await user.type(editor.getByRole('textbox', { name: '音色描述' }), '温和、清晰的声音')
  expect(screen.queryAllByTestId('voice-tile')).toHaveLength(0)
  await user.click(editor.getByRole('button', { name: '保存音色' }))
  await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('音色已保存'))
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'design', name: '旁白', representations: [expect.objectContaining({ authoringModelBinding: 'cloud:design' })] }), undefined)
  expect(api.preview).not.toHaveBeenCalled()
  expect(api.prepare).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('keeps only failed provider IDs in the dialog and retries them once', async () => {
  const onSaved = vi.fn(), onClose = vi.fn(), user = userEvent.setup()
  api.addProviderVoice.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce({})
  render(<I18nProvider readSettings={false}><ProviderVoicesDialog binding="cloud:test" onSaved={onSaved} onClose={onClose} /></I18nProvider>)
  await user.type(screen.getByLabelText('Voice ID 1'), 'one')
  await user.click(screen.getByRole('button', { name: '添加音色' }))
  await user.type(screen.getByLabelText('Voice ID 2'), 'two')
  await user.click(screen.getByRole('button', { name: '保存音色' }))
  await waitFor(() => expect(screen.getByLabelText('Voice ID 1')).toHaveValue('two'))
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '保存音色' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  expect(api.addProviderVoice.mock.calls.map(call => call[1])).toEqual(['one', 'two', 'two'])
  expect(onSaved).toHaveBeenCalledTimes(2)
})

it('allows renaming a saved design while its authoring model is unavailable', async () => {
  const now = new Date().toISOString()
  api.list.mockResolvedValue([{ schemaVersion: 1, id: 'saved-design', revision: 2, name: 'Old name', kind: 'design',
    representations: [{ kind: 'design-recipe', description: 'Warm voice', recipe: {}, authoringModelBinding: 'cloud:removed' }], createdAt: now, updatedAt: now }])
  api.bindings.mockResolvedValue([])
  api.save.mockImplementation(async profile => profile)
  render(<I18nProvider readSettings={false}><VoiceLibraryPage /></I18nProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '编辑音色 Old name' }))
  const editor = within(screen.getByRole('dialog', { name: '编辑音色' }))
  await user.clear(editor.getByRole('textbox', { name: '名称' }))
  await user.type(editor.getByRole('textbox', { name: '名称' }), 'New name')
  await user.click(editor.getByRole('button', { name: '保存音色' }))
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New name' }), 2))
  expect(api.preview).not.toHaveBeenCalled()
})

it('uses the shared Assistant UI player for an existing recording without synthesis', async () => {
  const now = new Date().toISOString()
  api.list.mockResolvedValue([{ schemaVersion: 1, id: 'recorded', revision: 1, name: 'Recorded', kind: 'clone', primaryReferenceAssetId: 'asset',
    representations: [{ kind: 'reference-audio', assetId: 'asset' }], createdAt: now, updatedAt: now }])
  api.bindings.mockResolvedValue([])
  api.audio.mockResolvedValue('data:audio/wav;base64,UklGRg==')
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  render(<I18nProvider readSettings={false}><VoiceLibraryPage /></I18nProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '试听 Recorded' }))
  const player = within(screen.getByRole('dialog', { name: 'Recorded' }))
  expect(player.queryByText('0.5x')).not.toBeInTheDocument()
  const playButton = await player.findByRole('button', { name: 'Play Recorded' })
  expect(player.getByRole('textbox', { name: '试听文本' }).compareDocumentPosition(playButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await user.click(playButton)
  await waitFor(() => expect(play).toHaveBeenCalled())
  expect(await player.findByRole('button', { name: 'Pause Recorded' })).toBeVisible()
  expect(api.audio).toHaveBeenCalledWith('asset')
  expect(api.preview).not.toHaveBeenCalled()
  expect(api.prepare).not.toHaveBeenCalled()
})

it('keeps configured preset voices visible when credentials are unavailable', async () => {
  models.tts = []
  stores.settings.setState({ settings: { ...structuredClone(DEFAULT_SETTINGS), modelWorkspace: { connections: [{ id: 'account', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: '', protocol: '', region: '', workspace: '',
    models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true }] }], localSources: {} } } })
  render(<I18nProvider readSettings={false}><VoiceLibraryPage /></I18nProvider>)
  expect(await screen.findAllByTestId('voice-tile')).toHaveLength(9)
  expect(api.capabilities).not.toHaveBeenCalled()
  expect(api.preview).not.toHaveBeenCalled()
})

it.each([true, false])('shows pending generation, blocks repeat submissions and resets on completion (success=%s)', async success => {
  let finish!: (audio: string) => void
  let fail!: (error: Error) => void
  api.preview.mockImplementation(() => new Promise<string>((resolve, reject) => { finish = resolve; fail = reject }))
  render(<I18nProvider readSettings={false}><VoiceLibraryPage /></I18nProvider>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '试听 茉莉' }))
  const dialog = within(screen.getByRole('dialog', { name: '茉莉' }))
  expect(dialog.queryByRole('combobox', { name: '目标语言' })).not.toBeInTheDocument()
  await user.type(dialog.getByRole('textbox', { name: '试听文本' }), '你好')
  await user.click(dialog.getByRole('button', { name: '生成试听' }))
  expect(api.preview).toHaveBeenCalledWith('cloud:preset', { kind: 'preset', modelBinding: 'cloud:preset', voiceId: '茉莉' }, '你好', 'zh')
  const pending = dialog.getByRole('button', { name: '生成中' })
  expect(pending).toBeDisabled()
  expect(pending).toHaveAttribute('aria-busy', 'true')
  expect(pending.querySelector('[data-slot="spinner"]')).toBeInTheDocument()
  await user.click(pending)
  expect(api.preview).toHaveBeenCalledTimes(1)
  const error = new Error('generation failed')
  await act(async () => { if (success) finish('data:audio/wav;base64,UklGRg=='); else fail(error) })
  await waitFor(() => expect(dialog.getByRole('button', { name: '生成试听' })).toBeEnabled())
  expect(dialog.queryByRole('button', { name: '生成中' })).not.toBeInTheDocument()
  if (success) {
    const player = dialog.getByRole('button', { name: 'Play 茉莉' })
    expect(player).toBeInTheDocument()
    expect(dialog.getByRole('textbox', { name: '试听文本' }).compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
  else expect(notifyError).toHaveBeenCalledWith('音色操作失败', { cause: error })
})

it.each([false, true])('keeps a deleted preset set empty in the voice wall (online=%s)', async online => {
  const binding = 'cloud:mimo-v2.5-tts'
  models.tts = online ? [{ binding, name: 'MiMo' }] : []
  stores.settings.setState({ settings: { ...structuredClone(DEFAULT_SETTINGS), modelWorkspace: { connections: [{ id: 'account', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: '', protocol: '', region: '', workspace: '', models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { presetVoiceIds: [] } }] }], localSources: {} } } })
  api.capabilities.mockResolvedValue(mergeTtsCapabilities(ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', binding), undefined, []))
  render(<I18nProvider readSettings={false}><VoiceLibraryPage /></I18nProvider>)
  await waitFor(() => expect(api.list).toHaveBeenCalled())
  if (online) await waitFor(() => expect(api.capabilities).toHaveBeenCalled())
  expect(screen.queryAllByTestId('voice-tile')).toHaveLength(0)
  expect(api.preview).not.toHaveBeenCalled()
})
