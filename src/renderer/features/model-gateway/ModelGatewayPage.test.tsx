import userEvent from '@testing-library/user-event'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import * as settingsActions from '@/store/settingsStore'
import type { NolaBridge } from '@/bridge'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import type { ModelGatewayApi, ModelGatewaySnapshot } from '../../../shared/model-gateway'
import { ModelGatewayPage } from './ModelGatewayPage'
import { notifyError, notifyWarning } from '@/components/primitives/notify'

vi.mock('@/components/primitives/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn(), notifyWarning: vi.fn() }))
const initialSettings = store.stores.settings.getState()
const initialModels = store.stores.models.getState()
const asrResource = { resourceId: 'test-recognizer', kind: 'recognitionModel' as const, provider: 'sensevoice', name: 'Enabled local recognizer', description: '', configuration: { slot: 'recognition' as const, engine: 'pytorch' as const, languages: ['zh', 'en'], supportsAutoDetection: true, sourceLanguages: [], targetLanguages: [] }, languages: ['zh', 'en'], installed: true, installedBytes: 100, state: 'idle' as const, cancellable: false }
const snapshot: ModelGatewaySnapshot = {
  state: 'running', address: 'http://127.0.0.1:17860/v2', port: 17860, connections: 0, activeRequests: 0, requests: [],
  services: { asr: { state: 'ready', model: 'resource:test-recognizer', name: 'Enabled local recognizer' }, mt: { state: 'stopped', model: 'model-mt', name: 'Default translator' }, tts: { state: 'stopped', model: '', name: '' }, llm: { state: 'stopped', model: '', name: '' } },
}
let api: ModelGatewayApi
let receive: (snapshot: ModelGatewaySnapshot) => void
beforeEach(() => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', modelGateway: { ...DEFAULT_SETTINGS.modelGateway, asr: true, asrModel: 'resource:test-recognizer' }, modelPolicy: { enabled: { 'asr:resource:test-recognizer': true, 'asr:cloud:aliyun': true, 'mt:cloud:mymemory': true, 'mt:cloud:index-translate': true }, defaults: { mt: 'cloud:mymemory', asr: 'resource:test-recognizer' }, selections: { mt: 'cloud:mymemory', asr: 'resource:test-recognizer' } } } })
  store.stores.models.setState({ resources: [asrResource] })
  const listeners = new Set<(value: ModelGatewaySnapshot) => void>()
  receive = value => listeners.forEach(callback => callback(value))
  api = { snapshot: vi.fn().mockResolvedValue(snapshot), start: vi.fn().mockResolvedValue({ ...snapshot, state: 'running' }), stop: vi.fn().mockResolvedValue(snapshot), revealKey: vi.fn().mockResolvedValue('private-key'), rotateKey: vi.fn().mockResolvedValue('new-private-key'), onChanged: callback => { listeners.add(callback); return () => listeners.delete(callback) } }
  vi.spyOn(store, 'getBridge').mockReturnValue({ gateway: api } as unknown as NolaBridge)
})
afterEach(() => { cleanup(); store.stores.settings.setState(initialSettings); store.stores.models.setState(initialModels); vi.restoreAllMocks() })

it('opens performance monitoring without changing gateway settings or runtime', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings')
  await act(async () => { render(<ModelGatewayPage />) })
  const user = userEvent.setup()
  await user.click(screen.getByRole('switch', { name: '性能监控' }))
  expect(screen.getByRole('switch', { name: '性能监控' })).toBeChecked()
  expect(screen.getByRole('columnheader', { name: '专用显存' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'SenseVoiceSmall Q4_K' }))
  const detail = screen.getByRole('dialog', { name: 'SenseVoiceSmall Q4_K' })
  expect(within(detail).getByText('RTX 4060')).toBeInTheDocument()
  expect(within(detail).getAllByText('CPU').length).toBeGreaterThan(0)
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('combobox', { name: '全部来源' }))
  await user.click(await screen.findByRole('option', { name: '云端' }))
  expect(screen.getByRole('button', { name: 'MiMo TTS(API)' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'SenseVoiceSmall Q4_K' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: '实时链路' }))
  expect(screen.getByText('812 ms')).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: '设备' }))
  expect(screen.getByText('68%')).toBeInTheDocument()
  await user.click(screen.getByRole('switch', { name: '性能监控' }))
  expect(screen.getByRole('switch', { name: '性能监控' })).not.toBeChecked()
  expect(screen.queryByRole('tab', { name: '设备' })).not.toBeInTheDocument()
  expect(update).not.toHaveBeenCalled()
  expect(api.start).not.toHaveBeenCalled()
  expect(api.stop).not.toHaveBeenCalled()
})

it('persists the loading mode and shows pending separately from ready', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  await act(async () => { render(<ModelGatewayPage />) })
  const user = userEvent.setup()
  expect(screen.queryByText('首次调用时加载，共用模型实例，空闲 5 分钟后释放。')).not.toBeInTheDocument()
  await user.hover(screen.getByRole('button', { name: '加载方式' }))
  expect(await screen.findByText('首次调用时加载，共用模型实例，空闲 5 分钟后释放。')).toBeInTheDocument()
  expect(screen.getByText('启动网关时加载模型，停止网关时释放。')).toBeInTheDocument()
  await user.unhover(screen.getByRole('button', { name: '加载方式' }))
  await user.click(screen.getByRole('combobox', { name: '加载方式' }))
  await user.click(await screen.findByRole('option', { name: '直接加载' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { loadMode: 'direct' } }))
  act(() => receive({ ...snapshot, services: { ...snapshot.services, asr: { ...snapshot.services.asr, state: 'pending' } } }))
  const row = screen.getByRole('row', { name: /^ASR 模型/ })
  expect(within(row).getByText('待加载')).toBeInTheDocument()
  expect(within(row).queryByText('已就绪')).not.toBeInTheDocument()
})

it('saves a per-capability concurrency limit and restores invalid or failed edits', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockImplementation(async patch => {
    const settings = store.stores.settings.getState().settings!
    store.stores.settings.setState({ settings: { ...settings, modelGateway: { ...settings.modelGateway,
      concurrency: { ...settings.modelGateway.concurrency, ...patch.modelGateway?.concurrency } } } })
  })
  await act(async () => { render(<ModelGatewayPage />) })
  const table = within(screen.getByRole('table'))
  const input = table.getByRole('spinbutton', { name: 'MT 模型并发上限' })
  expect(input).toHaveValue(10)
  expect(table.getAllByRole('spinbutton', { name: /并发上限$/ })).toHaveLength(5)
  expect(screen.getByText('与 MT 共用')).toBeInTheDocument()
  fireEvent.change(input, { target: { value: '3' } })
  await act(async () => { fireEvent.blur(input) })
  const saved = table.getByRole('spinbutton', { name: 'MT 模型并发上限' })
  expect(saved).toHaveValue(3)
  expect(update).toHaveBeenCalledWith({ modelGateway: { concurrency: { mt: 3 } } })
  for (const value of ['', '0', '1.5']) {
    fireEvent.change(saved, { target: { value } })
    fireEvent.blur(saved)
    expect(saved).toHaveValue(3)
  }
  expect(update).toHaveBeenCalledOnce()
  update.mockRejectedValueOnce(new Error('write failed'))
  fireEvent.change(saved, { target: { value: '4' } })
  fireEvent.blur(saved)
  await waitFor(() => expect(saved).toHaveValue(3))
  expect(notifyError).toHaveBeenCalled()
})

it('renders real service updates without showing diagnostics or exposing its key', async () => {
  await act(async () => { render(<ModelGatewayPage />) })
  expect(screen.getByText('启动模型')).toBeInTheDocument()
  expect(api.revealKey).not.toHaveBeenCalled()
  expect(screen.queryByText('private-key')).not.toBeInTheDocument()
  act(() => receive({ ...snapshot, connections: 3, activeRequests: 2, services: { ...snapshot.services, mt: { ...snapshot.services.mt, state: 'failed', error: 'raw database path secret' } } }))
  expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument()
  expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('模型不可用，请检查模型配置、运行组件或网络连接。')
  expect(screen.queryByText('raw database path secret')).not.toBeInTheDocument()
})

it('shows a toast when a gateway settings write fails', async () => {
  vi.mocked(notifyError).mockClear()
  vi.spyOn(settingsActions, 'updateSettings').mockRejectedValue(new Error('settings write failed'))
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '选择 ASR 模型' }))
  await user.click(await screen.findByRole('option', { name: '不启用' }))
  await waitFor(() => expect(notifyError).toHaveBeenCalled())
  expect(notifyError).toHaveBeenCalledWith('操作失败，请检查本地服务和日志后重试。', expect.objectContaining({ cause: expect.any(Error) }))
})

it('shows the seven model rows in order and resets keys after confirmation', async () => {
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const card = document.querySelector<HTMLElement>('[data-onboarding="gateway-capabilities"]')!
  const table = within(within(card).getByRole('table'))
  expect(table.getAllByRole('combobox').map(element => element.getAttribute('aria-label')))
    .toEqual(['选择 ASR 模型', '选择 MT 模型', '选择 TTS 模型', 'S2S 模型', '选择 LLM 模型', '选择 OCR 模型', '备用 MT 模型'])
  expect(within(table.getByRole('row', { name: /^TTS 模型/ })).getByRole('button', { name: '复制模型 ID：nola-tts' })).toBeInTheDocument()
  expect(screen.queryByRole('switch', { name: '语音识别' })).not.toBeInTheDocument()
  expect(screen.queryByText('对外 API 模型映射')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重置密钥' }))
  expect(api.rotateKey).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: '重置密钥' }).at(-1)!)
  await waitFor(() => expect(api.rotateKey).toHaveBeenCalledOnce())
  expect(screen.queryByDisplayValue('new-private-key')).not.toBeInTheDocument()
})

it('puts speech translation mode first and changes the S2S model without changing the mode', async () => {
  const settings = store.stores.settings.getState().settings!
  store.stores.settings.setState({ settings: { ...settings, recognition: { ...settings.recognition, aliyunWorkspaceId: 'workspace' } } })
  store.stores.models.setState({ credentials: { ...initialModels.credentials, 'aliyun-asr': true } })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  const mode = await screen.findByRole('combobox', { name: '处理方式' })
  expect(screen.getAllByRole('combobox')[0]).toBe(mode)
  await user.hover(screen.getByRole('button', { name: '处理方式' }))
  expect(await screen.findByText(/先识别语音/)).toBeInTheDocument()
  await user.click(screen.getByRole('combobox', { name: 'S2S 模型' }))
  await user.click(await screen.findByRole('option', { name: 'Qwen3.5 LiveTranslate' }))
  expect(update).toHaveBeenCalledWith({ realtime: { s2sModel: 'qwen3.5-livetranslate-flash-realtime', defaultPipeline: 'cascade' } })
  await user.click(mode)
  await user.click(await screen.findByRole('option', { name: '直接语音识别' }))
  expect(update).toHaveBeenCalledWith({ realtime: { defaultPipeline: 's2s' } })
})

it('confirms disabling the active default S2S model before reverting to step-by-step recognition', async () => {
  const settings = store.stores.settings.getState().settings!
  store.stores.models.setState({ credentials: { ...initialModels.credentials, 'aliyun-asr': true } })
  store.stores.settings.setState({ settings: { ...settings, recognition: { ...settings.recognition, aliyunWorkspaceId: 'workspace' }, realtime: {
    ...settings.realtime, s2sModel: 'qwen3.5-livetranslate-flash-realtime', defaultPipeline: 's2s',
  } } })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: 'S2S 模型' }))
  await user.click(await screen.findByRole('option', { name: '不启用' }))
  const confirmation = await screen.findByRole('dialog', { name: '停用网关默认 S2S 模型？' })
  expect(update).not.toHaveBeenCalled()
  await user.click(within(confirmation).getByRole('button', { name: '不启用' }))
  expect(update).toHaveBeenCalledWith({ realtime: { s2sModel: null, defaultPipeline: 'cascade' } })
})

it('blocks unconfigured S2S choices and stops a saved direct mode from starting the gateway', async () => {
  const settings = store.stores.settings.getState().settings!
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  vi.mocked(api.snapshot).mockResolvedValue({ ...snapshot, state: 'stopped' })
  render(<ModelGatewayPage />)

  const mode = await screen.findByRole('combobox', { name: '处理方式' })
  expect(screen.queryByText('请先在模型管理中配置阿里云工作空间和 API 密钥。')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'S2S 模型' })).toBeDisabled()
  await userEvent.click(mode)
  await userEvent.click(await screen.findByRole('option', { name: '直接语音识别' }))
  expect(notifyWarning).toHaveBeenCalledWith('请先配置一个可用的 S2S 模型。')
  expect(mode).toHaveTextContent('分步识别')
  expect(update).not.toHaveBeenCalled()

  act(() => store.stores.settings.setState({ settings: { ...settings, realtime: { ...settings.realtime, defaultPipeline: 's2s' } } }))
  expect(screen.getByRole('button', { name: '启动服务' })).toBeDisabled()
  expect(api.start).not.toHaveBeenCalled()
})

it('shows usable protocol examples with stable model aliases and one API prefix', async () => {
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const mt = document.querySelector('[data-slot="code-block"] code')!.textContent!
  expect(mt).toContain('http://127.0.0.1:17860/v2/chat/completions')
  expect(mt).not.toContain('/v2/v2')
  expect(mt).toContain('"model":"nola-mt"')
  await waitFor(() => expect(document.querySelector('[data-slot="code-block"] code span[style]')).toBeInTheDocument())
  expect(screen.queryByRole('tab', { name: 'LLM 模型' })).not.toBeInTheDocument()
  expect(screen.queryByText('nola-llm')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'TTS 模型' }))
  expect(document.querySelector('[data-slot="code-block"] code')).toHaveTextContent('"response_format":"wav"')
  fireEvent.click(screen.getByRole('tab', { name: '实时语音识别' }))
  const realtime = document.querySelector('[data-slot="code-block"] code')!.textContent!
  expect(realtime).toContain('ws://127.0.0.1:17860/v2/realtime?model=nola-asr')
  expect(realtime).toContain('session.finish')
  await waitFor(() => expect(document.querySelector('[data-slot="code-block"] code span[style]')).toBeInTheDocument())
  const user = userEvent.setup()
  await user.hover(screen.getByRole('tab', { name: '实时语音识别' }))
  expect(await screen.findByText(/发送 16 kHz/)).toBeInTheDocument()
  expect(screen.getByText(/浏览器客户端先用 API 密钥/)).toBeInTheDocument()
  await user.click(within(document.querySelector<HTMLElement>('[data-slot="code-block"]')!).getByRole('button', { name: '复制' }))
  expect(await navigator.clipboard.readText()).toBe(realtime)
})

it('selects an enabled loadable local model without changing business defaults', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const localCard = document.querySelector<HTMLElement>('[data-onboarding="gateway-capabilities"]')!
  await userEvent.setup().click(within(localCard).getByRole('combobox', { name: '选择 ASR 模型' }))
  expect(await screen.findByRole('option', { name: 'Enabled local recognizer' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'MyMemory 免费翻译' })).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('option', { name: 'Enabled local recognizer' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { asrModel: 'resource:test-recognizer', asr: true }, modelPolicy: { enabled: { 'asr:resource:test-recognizer': true }, defaults: {}, selections: {} } }))
})

it.each([
  ['ASR 模型', 'asr'], ['MT 模型', 'mt'], ['LLM 模型', 'llm'], ['TTS 模型', 'tts'],
] as const)('disables %s and clears its gateway binding', async (label, kind) => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: `选择 ${label}` }))
  await user.click(await screen.findByRole('option', { name: '不启用' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { [`${kind}Model`]: '', [kind]: false } }))
})

it('offers available cloud translations and persists the primary gateway binding', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: '选择 MT 模型' }))
  await user.click(await screen.findByRole('option', { name: 'MyMemory 免费翻译' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { mtModel: 'cloud:mymemory', mt: true }, modelPolicy: { enabled: { 'mt:cloud:mymemory': true }, defaults: {}, selections: {} } }))
  expect(update.mock.calls[0][0]).not.toHaveProperty('translation')
})

it('controls external API access separately from internal capability flags', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  fireEvent.click(screen.getByRole('switch', { name: '对外 API' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { externalEnabled: false } }))
  expect(api.stop).not.toHaveBeenCalled()
})

it('keeps unrelated controls enabled while an external API setting is saved', async () => {
  let finish!: () => void
  const update = vi.spyOn(settingsActions, 'updateSettings').mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  render(<ModelGatewayPage />)
  const toggle = await screen.findByRole('switch', { name: '对外 API' })
  const model = screen.getByRole('combobox', { name: '选择 ASR 模型' })
  const limit = screen.getByRole('spinbutton', { name: 'MT 模型并发上限' })
  fireEvent.click(toggle)
  expect(update).toHaveBeenCalledWith({ modelGateway: { externalEnabled: false } })
  expect(toggle).not.toHaveAttribute('aria-disabled', 'true')
  expect(model).toBeEnabled()
  expect(limit).toBeEnabled()
  expect(screen.getByRole('button', { name: '停止服务' })).toBeDisabled()
  await act(async () => finish())
  expect(screen.getByRole('button', { name: '停止服务' })).toBeEnabled()
})

it('keeps model settings disabled while the gateway is stopping', async () => {
  let finish!: (value: ModelGatewaySnapshot) => void
  vi.mocked(api.stop).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<ModelGatewayPage />)
  const stop = await screen.findByRole('button', { name: '停止服务' })
  fireEvent.click(stop)
  expect(screen.getByRole('switch', { name: '对外 API' })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('combobox', { name: '选择 ASR 模型' })).toBeDisabled()
  await act(async () => finish({ ...snapshot, state: 'stopped' }))
  expect(screen.getByRole('switch', { name: '对外 API' })).not.toHaveAttribute('aria-disabled', 'true')
})

it('does not disable unrelated controls while copying the service address', async () => {
  const user = userEvent.setup()
  let finish!: () => void
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  render(<ModelGatewayPage />)
  await screen.findByRole('button', { name: '停止服务' })
  const address = screen.getByLabelText('服务地址').closest('[data-slot="input-group"]')!
  await user.click(within(address as HTMLElement).getByRole('button', { name: '复制' }))
  expect(screen.getByRole('button', { name: '停止服务' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '显示密钥' })).toBeEnabled()
  await act(async () => finish())
})

it('restores a failed port change without overwriting a newer edit', async () => {
  let fail!: (error: Error) => void
  vi.spyOn(settingsActions, 'updateSettings').mockImplementation(() => new Promise<void>((_resolve, reject) => { fail = reject }))
  render(<ModelGatewayPage />)
  const port = await screen.findByRole('spinbutton', { name: '端口' })
  fireEvent.change(port, { target: { value: '17861' } })
  fireEvent.blur(port)
  fireEvent.change(port, { target: { value: '17862' } })
  await act(async () => fail(new Error('write failed')))
  expect(port).toHaveValue(17862)
  fireEvent.change(port, { target: { value: '0' } })
  fireEvent.blur(port)
  expect(port).toHaveValue(17860)
  fireEvent.change(port, { target: { value: '17861' } })
  fireEvent.blur(port)
  await act(async () => fail(new Error('write failed')))
  expect(port).toHaveValue(17860)
})

it('binds the translation backup in the gateway rather than in the business settings', async () => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', modelGateway: { ...DEFAULT_SETTINGS.modelGateway, mtFallbackModel: 'cloud:index-translate' }, modelPolicy: { enabled: { 'mt:cloud:mymemory': true, 'mt:cloud:index-translate': true }, defaults: {}, selections: {} } } })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '备用 MT 模型' }))
  await user.click(await screen.findByRole('option', { name: 'MyMemory 免费翻译' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { mtFallbackModel: 'cloud:mymemory' } }))
  expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ translation: expect.anything() }))
})

it('binds a custom LLM without changing the translation default', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', translation: {
    ...DEFAULT_SETTINGS.translation, customModels: [{ id: 'chat', name: 'Chat profile', endpoint: 'https://fixture.invalid/v1',
      model: 'chat-model', apiFormat: 'chat-responses', contextWindow: 4096, maxOutputTokens: 512, languages: ['zh'] }],
  }, modelPolicy: { enabled: { 'llm:custom:chat': true, 'mt:cloud:mymemory': true }, defaults: { mt: 'cloud:mymemory' }, selections: { mt: 'cloud:mymemory' } } } })
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '选择 LLM 模型' }))
  await user.click(await screen.findByRole('option', { name: 'Chat profile' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { llmModel: 'custom:chat', llm: true }, modelPolicy: { enabled: { 'llm:custom:chat': true }, defaults: {}, selections: {} } }))
  expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ translation: expect.anything() }))
})

it('clears backup translation in the gateway even with a legacy business fallback', async () => {
  const settings = store.stores.settings.getState().settings!
  store.stores.settings.setState({ settings: { ...settings, modelGateway: { ...settings.modelGateway, mtFallbackModel: 'cloud:index-translate' },
    translation: { ...settings.translation, fallback: { ...settings.translation.fallback, provider: 'mymemory' } } } })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: '备用 MT 模型' }))
  await user.click(await screen.findByRole('option', { name: '不启用' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { mtFallbackModel: '' } }))
})

it('offers unloaded local loading candidates but excludes unconfigured models', async () => {
  const settings = store.stores.settings.getState().settings!
  store.stores.settings.setState({ settings: { ...settings, modelPolicy: { ...settings.modelPolicy!, enabled: {
    ...settings.modelPolicy!.enabled, 'asr:resource:unloaded': true, 'asr:resource:unconfigured': true,
  } } } })
  store.stores.models.setState({ resources: [asrResource, { ...asrResource, resourceId: 'unloaded', name: 'Unloaded local' },
    { ...asrResource, resourceId: 'unconfigured', name: 'Unconfigured local', configuration: undefined }] })
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: '选择 ASR 模型' }))
  expect(await screen.findByRole('option', { name: 'Unloaded local' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Unconfigured local' })).not.toBeInTheDocument()
})

it('starts and stops the service from the page', async () => {
  render(<ModelGatewayPage />)
  fireEvent.click(await screen.findByRole('button', { name: '停止服务' }))
  await waitFor(() => expect(api.stop).toHaveBeenCalledOnce())
  act(() => receive({ ...snapshot, state: 'stopped' }))
  fireEvent.click(screen.getByRole('button', { name: '启动服务' }))
  await waitFor(() => expect(api.start).toHaveBeenCalledOnce())
})


it.each([
  ['mt', 'MT 模型', 'hy-mt2-1.8b-q4-k-m', 'hymt2', 'translationModel'],
  ['llm', 'LLM 模型', 'qwen35-0.8b-q4-k-m', 'llama.cpp', 'translationModel'],
  ['tts', 'TTS 模型', 'voice', 'transformers-tts', 'ttsModel'],
] as const)('binds a loadable local %s model and enables the capability', async (kind, label, id, provider, resourceKind) => {
  const settings = store.stores.settings.getState().settings!
  store.stores.settings.setState({ settings: { ...settings, modelPolicy: { ...settings.modelPolicy!, enabled: {
    ...settings.modelPolicy!.enabled, [`${kind}:resource:${id}`]: true,
  } } } })
  store.stores.models.setState({ resources: [asrResource, { ...asrResource, resourceId: id, name: 'Local candidate', kind: resourceKind, provider, configuration: undefined }] })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: `选择 ${label}` }))
  await user.click(await screen.findByRole('option', { name: 'Local candidate' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { [`${kind}Model`]: `resource:${id}`, [kind]: true }, modelPolicy: { enabled: { [`${kind}:resource:${id}`]: true }, defaults: {}, selections: {} } }))
})

it('selects downloaded OCR weights for gateway startup without changing scene models', async () => {
  store.stores.models.setState({ resources: [{ resourceId: 'pp-ocrv5-mobile-onnx', kind: 'ocrModel', provider: 'pp-ocrv5',
    name: 'PP-OCRv5 mobile', description: 'OCR', languages: ['zh', 'en', 'ja', 'ko'], installed: true,
    installedBytes: 34939630, state: 'idle', cancellable: false }] })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: '选择 OCR 模型' }))
  await user.click(await screen.findByRole('option', { name: 'PP-OCRv5 mobile' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({
    modelGateway: { ocr: true, ocrModel: 'resource:pp-ocrv5-mobile-onnx' },
  })))
  expect(update.mock.calls[0][0]).not.toHaveProperty('translation')
  expect(update.mock.calls[0][0]).not.toHaveProperty('recognition')
})


it('defaults local concurrency to one and explains the CrispASR limit', async () => {
  render(<ModelGatewayPage />)
  const local = await screen.findByRole('spinbutton', { name: 'ASR 模型并发上限' })
  expect(local).toHaveValue(1)
  expect(local).not.toHaveAttribute('max')
  expect(local).not.toBeDisabled()
  act(() => store.stores.models.setState({ resources: [{ ...asrResource, provider: 'crisp-asr' }] }))
  const crisp = screen.getByRole('spinbutton', { name: 'ASR 模型并发上限' })
  expect(crisp).toHaveValue(1)
  expect(crisp).not.toHaveAttribute('max')
  expect(crisp).toBeDisabled()
  const user = userEvent.setup()
  await user.hover(screen.getByRole('button', { name: '并发上限' }))
  expect(await screen.findByText(/控制同时处理的任务数量/)).toHaveTextContent('CrispASR 单个模型实例不支持并行，并发上限固定为 1')
})
