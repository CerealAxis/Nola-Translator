import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const snapshot: ModelGatewaySnapshot = {
  state: 'running', address: 'http://127.0.0.1:17860/v1', port: 17860, connections: 0, activeRequests: 0, requests: [],
  services: { asr: { state: 'stopped', model: '', name: '' }, mt: { state: 'stopped', model: 'model-mt', name: 'Default translator' }, tts: { state: 'stopped', model: '', name: '' } },
}
let api: ModelGatewayApi
let receive: (snapshot: ModelGatewaySnapshot) => void
beforeEach(() => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  api = { snapshot: vi.fn().mockResolvedValue(snapshot), start: vi.fn().mockResolvedValue({ ...snapshot, state: 'running' }), stop: vi.fn().mockResolvedValue(snapshot), revealKey: vi.fn().mockResolvedValue('private-key'), rotateKey: vi.fn().mockResolvedValue('new-private-key'), onChanged: callback => { receive = callback; return () => undefined } }
  vi.spyOn(store, 'getBridge').mockReturnValue({ gateway: api } as unknown as NolaBridge)
})
afterEach(() => { cleanup(); store.stores.settings.setState(initialSettings); vi.restoreAllMocks() })

it('renders real service updates without showing diagnostics or exposing its key', async () => {
  render(<ModelGatewayPage />)
  await screen.findByText(/Default translator/)
  expect(api.revealKey).not.toHaveBeenCalled()
  expect(screen.queryByText('private-key')).not.toBeInTheDocument()
  act(() => receive({ ...snapshot, connections: 3, activeRequests: 2, services: { ...snapshot.services, mt: { ...snapshot.services.mt, state: 'failed', error: 'raw database path secret' } } }))
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('模型加载失败，请检查模型、运行组件与可用内存。')).toBeInTheDocument()
  expect(screen.queryByText('raw database path secret')).not.toBeInTheDocument()
})

it('leaves settings write failures to the shared settings notice', async () => {
  vi.mocked(notifyError).mockClear()
  vi.spyOn(settingsActions, 'updateSettings').mockRejectedValue(new Error('settings write failed'))
  render(<ModelGatewayPage />)
  await screen.findByText(/Default translator/)
  fireEvent.click(screen.getByRole('switch', { name: '语音识别' }))
  await waitFor(() => expect(screen.getByRole('switch', { name: '语音识别' })).not.toBeDisabled())
  expect(notifyError).not.toHaveBeenCalled()
})

it('persists capability switches without a second model selector and resets keys after confirmation', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue(undefined)
  render(<ModelGatewayPage />)
  await screen.findByText(/Default translator/)
  fireEvent.click(screen.getByRole('switch', { name: '语音识别' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { asr: true } }))
  expect(screen.queryByLabelText('默认语音合成模型')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重置密钥' }))
  expect(api.rotateKey).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: '重置密钥' }).at(-1)!)
  await waitFor(() => expect(api.rotateKey).toHaveBeenCalledOnce())
  expect(screen.queryByDisplayValue('new-private-key')).not.toBeInTheDocument()
})

it('shows usable protocol examples with stable model aliases and one API prefix', async () => {
  render(<ModelGatewayPage />)
  await screen.findByText(/Default translator/)
  const mt = screen.getByText(/translation_options/).textContent!
  expect(mt).toContain('http://127.0.0.1:17860/v1/chat/completions')
  expect(mt).not.toContain('/v1/v1')
  expect(mt).toContain('"model":"nola-mt"')
  fireEvent.click(screen.getByRole('tab', { name: '语音合成' }))
  expect(screen.getByText(/response_format/)).toHaveTextContent('"response_format":"wav"')
  fireEvent.click(screen.getByRole('tab', { name: '实时语音识别' }))
  const realtime = screen.getByText(/import WebSocket/).textContent!
  expect(realtime).toContain('ws://127.0.0.1:17860/v1/realtime?model=nola-asr')
  expect(realtime).toContain('session.finish')
})
