import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import type { AvailableModel } from '@/available-models'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { screenConfigSchema, type ScreenSnapshot } from '../../../shared/screen-translation'
import { ScreenTranslationPage } from './ScreenTranslationPage'

const fixture = vi.hoisted(() => ({ ocr: [] as AvailableModel[] }))
vi.mock('@/available-models', () => ({ useAvailableModels: () => ({
  mt: [{ binding: 'cloud:mymemory', name: 'MyMemory', kind: 'mt', origin: 'cloud', free: true }], ocr: fixture.ocr,
}) }))
const initial = store.stores.settings.getState()
const initialModels = store.stores.models.getState()
const snapshot: ScreenSnapshot = { status: 'ready', config: screenConfigSchema.parse({ sourceId: 'screen:1:0', sourceName: 'Display', model: 'cloud:mymemory',
  regions: [{ id: '8ddba01d-f7dd-4ea2-b24e-0a3220212420', x: 0, y: 0, width: 1, height: 1 }] }),
  sessionId: 'session', epoch: 0, shortcutError: false, frames: 0, ocrMs: 0, translationMs: 0,
  blocks: [{ id: 'block', regionId: 'region', text: 'Foreign screen text', translation: 'Translated screen text', revision: 1,
    x: 0, y: 0, width: 0.2, height: 0.1, angle: 0, status: 'ready' }] }
let command: ReturnType<typeof vi.fn>
let changed: (value: ScreenSnapshot) => void
beforeEach(() => {
  fixture.ocr = []
  store.stores.models.setState({ resources: [] })
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  command = vi.fn(async () => snapshot)
  vi.spyOn(store, 'getBridge').mockReturnValue({ screenTranslation: { snapshot: async () => snapshot,
    sources: async () => [{ id: 'screen:1:0', name: 'Display', kind: 'screen', preview: '' }],
    command, onChanged: (callback: (value: ScreenSnapshot) => void) => { changed = callback; return () => {} },
  } } as unknown as NolaBridge)
})
afterEach(() => { cleanup(); store.stores.settings.setState(initial); store.stores.models.setState(initialModels); vi.restoreAllMocks() })
it('uses the shared page header and an empty OCR selector without setup links or a result list', async () => {
  render(<ScreenTranslationPage />)
  await screen.findByRole('button', { name: '选择区域' })
  expect(screen.getByRole('button', { name: '开始翻译' })).toBeDisabled()
  expect(screen.getByRole('heading', { name: '屏幕翻译', level: 1 })).toHaveClass('nola-display')
  expect(screen.getByRole('heading', { name: '屏幕翻译', level: 1 }).closest('.card')).toBeNull()
  expect(screen.getByRole('combobox', { name: 'OCR 模型' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: '管理模型' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '模型网关' })).not.toBeInTheDocument()
  expect(screen.queryByText('译文覆盖在屏幕原文对应位置，鼠标操作直接穿透到下方应用。')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '下载识别模型' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '删除识别模型' })).not.toBeInTheDocument()
  expect(document.querySelector('[data-slot="screen-results"]')).toBeNull()
  expect(screen.queryByText('Foreign screen text')).not.toBeInTheDocument()
  expect(screen.queryByText('Translated screen text')).not.toBeInTheDocument()
  expect(command).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '快捷键设置' })).toHaveAttribute('href', '#/settings/shortcuts')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
it('starts a continuous screen session using the already loaded OCR capability', async () => {
  fixture.ocr = [{ binding: 'resource:pp-ocrv5-mobile-onnx', name: 'PP-OCRv5 mobile', kind: 'ocr', origin: 'gateway', free: true }]
  render(<ScreenTranslationPage />)
  const start = await screen.findByRole('button', { name: '开始翻译' })
  await waitFor(() => expect(start).toBeEnabled())
  fireEvent.click(start)
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'start' }))
  expect(command.mock.calls.map(([value]) => value.action)).toEqual(['configure', 'start'])
})

it.each(['starting', 'running', 'waiting', 'paused'] as const)('shows a single red stop action while %s', async status => {
  const { act } = await import('@testing-library/react')
  render(<ScreenTranslationPage />)
  await screen.findByRole('button', { name: '选择区域' })
  act(() => changed({ ...snapshot, status }))
  const stop = screen.getByRole('button', { name: '停止' })
  expect(stop).toHaveAttribute('data-variant', 'destructive')
  expect(screen.queryByRole('button', { name: '开始翻译' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '暂停' })).not.toBeInTheDocument()
  fireEvent.click(stop)
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'stop' }))
  expect(command).toHaveBeenCalledOnce()
})

it('selects only installed enabled OCR models and passes the selection to the gateway', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  const update = vi.spyOn(store, 'updateSettings').mockResolvedValue()
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN',
    modelPolicy: { enabled: { 'ocr:resource:first': true, 'ocr:resource:second': true, 'ocr:resource:missing': true }, defaults: {}, selections: {} } } })
  store.stores.models.setState({ resources: ['first', 'second', 'disabled', 'missing'].map(id => ({
    resourceId: id, name: id, kind: 'ocrModel', provider: 'pp-ocrv5', description: '', languages: ['en'],
    installed: id !== 'missing', installedBytes: 0, state: 'idle', cancellable: false,
  })) })
  render(<ScreenTranslationPage />)
  await user.click(screen.getByRole('combobox', { name: 'OCR 模型' }))
  expect(await screen.findByRole('option', { name: 'first' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'second' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'disabled' })).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'missing' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('option', { name: 'second' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { ocrModel: 'resource:second', ocr: true } }))
})


it('opens a named area save dialog and keeps the selection button free of counts', async () => {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(<ScreenTranslationPage />)
  const choose = await screen.findByRole('button', { name: '选择区域' })
  expect(choose.textContent).toBe('选择区域')
  expect(document.querySelector('#screen-source, .screen-source-preview')).toBeNull()
  await user.click(screen.getByRole('button', { name: '保存区域方案' }))
  await user.type(screen.getByRole('textbox', { name: '方案名称' }), 'Reading')
  const { within } = await import('@testing-library/react')
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存区域方案' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'savePreset', name: 'Reading', id: undefined }))
})
