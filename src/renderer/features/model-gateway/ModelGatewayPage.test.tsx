import userEvent from '@testing-library/user-event'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import * as settingsActions from '@/store/settingsStore'
import type { NolaBridge } from '@/bridge'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import type { ModelGatewayApi, ModelGatewaySnapshot } from '../../../shared/model-gateway'
import { ModelGatewayPage } from './ModelGatewayPage'
import { notifyError } from '@/components/primitives/notify'

vi.mock('@/components/primitives/notify', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }))
const initialSettings = store.stores.settings.getState()
const initialModels = store.stores.models.getState()
const asrResource = { resourceId: 'test-recognizer', kind: 'recognitionModel' as const, provider: 'sensevoice', name: 'Enabled local recognizer', description: '', configuration: { slot: 'recognition' as const, engine: 'pytorch' as const, languages: ['zh', 'en'], supportsAutoDetection: true, sourceLanguages: [], targetLanguages: [] }, languages: ['zh', 'en'], installed: true, installedBytes: 100, state: 'idle' as const, cancellable: false }
const snapshot: ModelGatewaySnapshot = {
  state: 'running', address: 'http://127.0.0.1:17860/v1', port: 17860, connections: 0, activeRequests: 0, requests: [],
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

it('renders real service updates without showing diagnostics or exposing its key', async () => {
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  expect(api.revealKey).not.toHaveBeenCalled()
  expect(screen.queryByText('private-key')).not.toBeInTheDocument()
  act(() => receive({ ...snapshot, connections: 3, activeRequests: 2, services: { ...snapshot.services, mt: { ...snapshot.services.mt, state: 'failed', error: 'raw database path secret' } } }))
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('模型不可用，请检查模型配置、运行组件或网络连接。')).toBeInTheDocument()
  expect(screen.queryByText('raw database path secret')).not.toBeInTheDocument()
})

it('shows a toast when a gateway settings write fails', async () => {
  vi.mocked(notifyError).mockClear()
  vi.spyOn(settingsActions, 'updateSettings').mockRejectedValue(new Error('settings write failed'))
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '选择ASR模型' }))
  await user.click(await screen.findByRole('option', { name: '不启用' }))
  await waitFor(() => expect(notifyError).toHaveBeenCalled())
  expect(notifyError).toHaveBeenCalledWith('操作失败，请检查本地服务和日志后重试。', expect.objectContaining({ cause: expect.any(Error) }))
})

it('shows five unified model rows and resets keys after confirmation', async () => {
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const card = document.querySelector<HTMLElement>('[data-onboarding="gateway-capabilities"]')!
  expect(within(card).getAllByRole('combobox').slice(0, 5).map(element => element.getAttribute('aria-label')))
    .toEqual(['选择ASR模型', '选择MT模型', '备用翻译', '选择大语言模型', '选择TTS模型'])
  expect(screen.queryByRole('switch', { name: '语音识别' })).not.toBeInTheDocument()
  expect(screen.queryByText('对外 API 模型映射')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重置密钥' }))
  expect(api.rotateKey).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: '重置密钥' }).at(-1)!)
  await waitFor(() => expect(api.rotateKey).toHaveBeenCalledOnce())
  expect(screen.queryByDisplayValue('new-private-key')).not.toBeInTheDocument()
})

it('shows usable protocol examples with stable model aliases and one API prefix', async () => {
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const mt = screen.getByText(/translation_options/).textContent!
  expect(mt).toContain('http://127.0.0.1:17860/v1/chat/completions')
  expect(mt).not.toContain('/v1/v1')
  expect(mt).toContain('"model":"nola-mt"')
  fireEvent.click(screen.getByRole('tab', { name: '大语言模型' }))
  expect(screen.getByText(/"model":"nola-llm"/)).toHaveTextContent('"stream":true')
  fireEvent.click(screen.getByRole('tab', { name: 'TTS模型' }))
  expect(screen.getByText(/response_format/)).toHaveTextContent('"response_format":"wav"')
  fireEvent.click(screen.getByRole('tab', { name: '实时语音识别' }))
  const realtime = screen.getByText(/import WebSocket/).textContent!
  expect(realtime).toContain('ws://127.0.0.1:17860/v1/realtime?model=nola-asr')
  expect(realtime).toContain('session.finish')
})

it('selects an enabled loadable local model without changing business defaults', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const localCard = document.querySelector<HTMLElement>('[data-onboarding="gateway-capabilities"]')!
  await userEvent.setup().click(within(localCard).getByRole('combobox', { name: '选择ASR模型' }))
  expect(await screen.findByRole('option', { name: 'Enabled local recognizer' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'MyMemory 免费翻译' })).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('option', { name: 'Enabled local recognizer' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { asrModel: 'resource:test-recognizer', asr: true }, modelPolicy: { enabled: { 'asr:resource:test-recognizer': true }, defaults: {}, selections: {} } }))
})

it.each([
  ['ASR模型', 'asr'], ['MT模型', 'mt'], ['大语言模型', 'llm'], ['TTS模型', 'tts'],
] as const)('disables %s and clears its gateway binding', async (label, kind) => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: `选择${label}` }))
  await user.click(await screen.findByRole('option', { name: '不启用' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { [`${kind}Model`]: '', [kind]: false } }))
})

it('offers available cloud translations and persists the primary gateway binding', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: '选择MT模型' }))
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

it('binds the translation backup in the gateway rather than in the business settings', async () => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', modelGateway: { ...DEFAULT_SETTINGS.modelGateway, mtFallbackModel: 'cloud:index-translate' }, modelPolicy: { enabled: { 'mt:cloud:mymemory': true, 'mt:cloud:index-translate': true }, defaults: {}, selections: {} } } })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  await screen.findByText('启动模型')
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '备用翻译' }))
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
  await user.click(screen.getByRole('combobox', { name: '选择大语言模型' }))
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
  await user.click(await screen.findByRole('combobox', { name: '备用翻译' }))
  await user.click(await screen.findByRole('option', { name: '不使用备用翻译' }))
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
  await user.click(await screen.findByRole('combobox', { name: '选择ASR模型' }))
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
  ['mt', 'MT模型', 'hy-mt2-1.8b-q4-k-m', 'hymt2', 'translationModel'],
  ['llm', '大语言模型', 'qwen35-0.8b-q4-k-m', 'llama.cpp', 'translationModel'],
  ['tts', 'TTS模型', 'voice', 'transformers-tts', 'ttsModel'],
] as const)('binds a loadable local %s model and enables the capability', async (kind, label, id, provider, resourceKind) => {
  const settings = store.stores.settings.getState().settings!
  store.stores.settings.setState({ settings: { ...settings, modelPolicy: { ...settings.modelPolicy!, enabled: {
    ...settings.modelPolicy!.enabled, [`${kind}:resource:${id}`]: true,
  } } } })
  store.stores.models.setState({ resources: [asrResource, { ...asrResource, resourceId: id, name: 'Local candidate', kind: resourceKind, provider, configuration: undefined }] })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: `选择${label}` }))
  await user.click(await screen.findByRole('option', { name: 'Local candidate' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { [`${kind}Model`]: `resource:${id}`, [kind]: true }, modelPolicy: { enabled: { [`${kind}:resource:${id}`]: true }, defaults: {}, selections: {} } }))
})
