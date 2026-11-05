import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import type { AvailableModel } from '@/available-models'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { screenConfigSchema, type ScreenSnapshot } from '../../../shared/screen-translation'
import { ScreenTranslationPage } from './ScreenTranslationPage'
import userEvent from '@testing-library/user-event'
import * as notifications from '@/components/primitives/notify'
import * as toast from '@/components/ui/toast'

const fixture = vi.hoisted(() => ({ ocr: [] as AvailableModel[], mt: [] as AvailableModel[] }))
vi.mock('@/available-models', () => ({ useAvailableModels: () => ({
  mt: fixture.mt, ocr: fixture.ocr,
}) }))
const initial = store.stores.settings.getState()
const initialModels = store.stores.models.getState()
const snapshot: ScreenSnapshot = { status: 'ready', config: screenConfigSchema.parse({ sourceId: 'screen:1:0', sourceName: 'Display', model: 'cloud:mymemory', processingMode: 'cascade',
  regions: [{ id: '8ddba01d-f7dd-4ea2-b24e-0a3220212420', x: 0, y: 0, width: 1, height: 1 }] }),
  sessionId: 'session', epoch: 0, shortcutError: false, frames: 0, ocrMs: 0, translationMs: 0,
  blocks: [{ id: 'block', regionId: 'region', text: 'Foreign screen text', translation: 'Translated screen text', revision: 1,
    x: 0, y: 0, width: 0.2, height: 0.1, angle: 0, status: 'ready' }] }
let command: ReturnType<typeof vi.fn>
let changed: (value: ScreenSnapshot) => void
beforeEach(() => {
  fixture.ocr = []
  fixture.mt = [{ binding: 'cloud:mymemory', name: 'MyMemory', kind: 'mt', origin: 'cloud', free: true, sourceLanguages: ['en', 'zh'], targetLanguages: ['zh', 'en'] }]
  store.stores.models.setState({ resources: [] })
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  command = vi.fn(async () => snapshot)
  vi.spyOn(store, 'getBridge').mockReturnValue({ screenTranslation: { snapshot: async () => snapshot,
    sources: async () => [{ id: 'screen:1:0', name: 'Display', kind: 'screen', preview: '' }],
    command, onChanged: (callback: (value: ScreenSnapshot) => void) => { changed = callback; return () => {} },
  } } as unknown as NolaBridge)
})
afterEach(() => { cleanup(); store.stores.settings.setState(initial); store.stores.models.setState(initialModels); vi.restoreAllMocks() })

it('does not start when OCR supports Japanese but custom MT accepts only English', async () => {
  fixture.ocr = [{ binding: 'resource:ja-ocr', name: 'Japanese OCR', kind: 'ocr', origin: 'gateway', free: true, sourceLanguages: ['ja'] }]
  fixture.mt = [{ binding: 'mt-custom:limited', name: 'Limited', kind: 'mt', origin: 'cloud', free: false, sourceLanguages: ['en'], targetLanguages: ['zh'] }]
  const invalid = { ...snapshot, config: { ...snapshot.config, model: 'mt-custom:limited', sourceLanguage: 'ja', targetLanguage: 'zh' } }
  vi.mocked(store.getBridge).mockReturnValue({ screenTranslation: {
    snapshot: async () => invalid,
    sources: async () => [], command,
    onChanged: () => () => {},
  } } as unknown as NolaBridge)
  render(<ScreenTranslationPage />)
  await waitFor(() => expect(screen.getByRole('button', { name: '开始翻译' })).toBeDisabled())
  expect(screen.getByRole('combobox', { name: '原文语言' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '开始翻译' }))
  expect(command).not.toHaveBeenCalled()
})

it('updates source choices from the selected OCR resource and targets from the selected translator', async () => {
  fixture.ocr = [{ binding: 'resource:first', name: 'First OCR', kind: 'ocr', origin: 'gateway', free: true }]
  fixture.mt = [{ binding: 'cloud:mymemory', name: 'Translator', kind: 'mt', origin: 'cloud', free: true, sourceLanguages: ['en', 'ja'], targetLanguages: ['zh', 'ko'] }]
  const settings = { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' as const, modelGateway: { ...DEFAULT_SETTINGS.modelGateway, ocrModel: 'resource:first' },
    modelPolicy: { enabled: { 'ocr:resource:first': true, 'ocr:resource:second': true }, defaults: {}, selections: {} } }
  store.stores.settings.setState({ settings })
  store.stores.models.setState({ resources: [
    { resourceId: 'first', kind: 'ocrModel', provider: 'pp-ocrv5', name: 'First OCR', description: '', installed: true, installedBytes: 1, state: 'idle', cancellable: false, languages: ['en', 'ja'] },
    { resourceId: 'second', kind: 'ocrModel', provider: 'pp-ocrv5', name: 'Second OCR', description: '', installed: true, installedBytes: 1, state: 'idle', cancellable: false, languages: ['fr', 'de'] },
  ] })
  render(<ScreenTranslationPage />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: '原文语言' }))
  expect(within(await screen.findByRole('listbox')).getAllByRole('option').map(option => option.textContent)).toEqual(['英语 (English)', '日语 (日本語)'])
  await user.keyboard('{Escape}')
  act(() => {
    fixture.ocr = [{ ...fixture.ocr[0], binding: 'resource:second', name: 'Second OCR' }]
    store.stores.settings.setState({ settings: { ...settings, modelGateway: { ...settings.modelGateway, ocrModel: 'resource:second' } } })
  })
  expect(screen.getByRole('combobox', { name: '原文语言' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '开始翻译' })).toBeDisabled()
  await user.click(screen.getByRole('combobox', { name: '译文语言' }))
  expect(within(await screen.findByRole('listbox')).getAllByRole('option').map(option => option.textContent)).toEqual(['简体中文', '韩语 (한국어)'])
})
it('uses the shared page header and an empty OCR selector without setup links or a result list', async () => {
  render(<ScreenTranslationPage />)
  await screen.findByRole('button', { name: '选择区域' })
  expect(screen.getByRole('button', { name: '开始翻译' })).toBeEnabled()
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

it('defaults to following the gateway and keeps start available before models or regions are ready', async () => {
  const config = screenConfigSchema.parse({ model: 'cloud:mymemory' })
  vi.mocked(store.getBridge).mockReturnValue({ screenTranslation: {
    snapshot: async () => ({ ...snapshot, config }), command,
    onChanged: () => () => {},
  } } as unknown as NolaBridge)
  render(<ScreenTranslationPage />)
  await waitFor(() => expect(screen.getByRole('combobox', { name: '处理方式' })).toHaveTextContent('跟随网关'))
  expect(screen.queryByRole('combobox', { name: 'OCR 模型' })).not.toBeInTheDocument()
  const start = screen.getByRole('button', { name: '开始翻译' })
  expect(start).toBeEnabled()
  fireEvent.click(start)
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'start' }))
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

it('shows startup errors as toasts, deduplicates snapshots and allows retry notifications', async () => {
  const notice = vi.spyOn(notifications, 'notifyError').mockReturnValue('notice')
  const gatewayNotice = vi.spyOn(notifications, 'notifyGatewayStartIssue').mockResolvedValue(true)
  render(<ScreenTranslationPage />)
  await screen.findByRole('button', { name: '选择区域' })
  const failed: ScreenSnapshot = { ...snapshot, status: 'error', error: 'ocrNotReady', errorId: 'failure-1' }
  act(() => { changed(failed); changed({ ...failed, frames: 1 }) })
  expect(gatewayNotice).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 'ocr', '')
  expect(notice).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  act(() => { changed({ ...snapshot, status: 'starting' }); changed({ ...failed, errorId: 'failure-2' }) })
  expect(gatewayNotice).toHaveBeenCalledTimes(2)
  act(() => changed({ ...snapshot, status: 'error', error: 'regionsMissing', errorId: 'failure-3' }))
  expect(notice).toHaveBeenLastCalledWith('请选择翻译区域。')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('reports snapshot loading failures as a toast without an inline alert', async () => {
  const notice = vi.spyOn(notifications, 'notifyError').mockReturnValue('notice')
  vi.mocked(store.getBridge).mockReturnValue({ screenTranslation: {
    snapshot: async () => { throw new Error('disconnected') }, command, onChanged: () => () => {},
  } } as unknown as NolaBridge)
  render(<ScreenTranslationPage />)
  await waitFor(() => expect(notice).toHaveBeenCalledWith('本地识别服务不可用。请重试。', { cause: expect.any(Error) }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('does not replay an old error when opening the page or receiving its cleanup snapshot', async () => {
  const notice = vi.spyOn(notifications, 'notifyGatewayStartIssue').mockResolvedValue(true)
  const failed: ScreenSnapshot = { ...snapshot, status: 'error', error: 'gatewayNotReady', errorId: 'old-failure' }
  vi.mocked(store.getBridge).mockReturnValue({ screenTranslation: {
    snapshot: async () => failed, command,
    onChanged: (callback: typeof changed) => { changed = callback; return () => {} },
  } } as unknown as NolaBridge)
  render(<ScreenTranslationPage />)
  await screen.findByRole('button', { name: '选择区域' })
  act(() => changed(failed))
  expect(notice).not.toHaveBeenCalled()
  act(() => changed({ ...failed, errorId: 'new-failure' }))
  expect(notice).toHaveBeenCalledExactlyOnceWith(expect.any(Function))
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
  await user.click(await screen.findByRole('combobox', { name: 'OCR 模型' }))
  expect(await screen.findByRole('option', { name: 'first' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'second' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'disabled' })).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'missing' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('option', { name: 'second' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelGateway: { ocrModel: 'resource:second', ocr: true } }))
})


it('offers two processing modes, hides inherited model selectors and saves the mode', async () => {
  render(<ScreenTranslationPage />)
  const user = userEvent.setup()
  await screen.findByRole('combobox', { name: 'OCR 模型' })
  await user.click(screen.getByRole('combobox', { name: '处理方式' }))
  expect((await screen.findAllByRole('option')).map(option => option.textContent)).toEqual(['跟随网关', '分步翻译'])
  await user.click(await screen.findByRole('option', { name: '跟随网关' }))
  expect(screen.queryByRole('combobox', { name: '翻译模型' })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'OCR 模型' })).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '原文语言' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '交换语言' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  expect(command).toHaveBeenCalledWith({ action: 'configure', config: expect.objectContaining({ processingMode: 'default' }) })
})

it('shows the S2S failure returned by the main process once', async () => {
  store.stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN', realtime: {
    ...DEFAULT_SETTINGS.realtime, defaultPipeline: 's2s', s2sModel: 'qwen3.5-livetranslate-flash-realtime',
  } } })
  const notice = vi.spyOn(notifications, 'notifyError').mockReturnValue('notice')
  command.mockImplementation(async value => {
    if (value.action !== 'start') return snapshot
    const failed: ScreenSnapshot = { ...snapshot, status: 'error', error: 's2sUnsupported', errorId: 's2s-failure' }
    changed(failed)
    return failed
  })
  render(<ScreenTranslationPage />)
  const user = userEvent.setup()
  await screen.findByRole('combobox', { name: 'OCR 模型' })
  await user.click(screen.getByRole('combobox', { name: '处理方式' }))
  await user.click(await screen.findByRole('option', { name: '跟随网关' }))
  await user.click(screen.getByRole('button', { name: '开始翻译' }))
  expect(notice).toHaveBeenCalledWith('屏幕翻译不支持当前 S2S 处理方式，请切换为分步翻译或更改网关处理方式。')
  expect(notice).toHaveBeenCalledOnce()
  expect(command).toHaveBeenCalledWith({ action: 'start' })
})

it.each([
  ['gatewayNotReady', '模型网关未启动'],
  ['ocrNotReady', '没有可用的 OCR 模型'],
  ['translationModelMissing', '没有可用的 MT 模型'],
  ['translationModelNotReady', '所选 MT 模型 不可用'],
  ['regionsMissing', '请选择翻译区域。'],
] as const)('shows one precise toast for %s despite events and stale command replies', async (error, message) => {
  const notice = vi.spyOn(toast, 'showToast').mockReturnValue('notice')
  vi.mocked(store.getBridge).mockReturnValue({ ...store.getBridge(), gateway: {
    snapshot: async () => ({ state: error === 'gatewayNotReady' ? 'stopped' : 'running', services: {} }),
  } } as unknown as NolaBridge)
  command.mockImplementation(async value => {
    if (value.action === 'configure') {
      changed(snapshot)
      return snapshot
    }
    const failed: ScreenSnapshot = { ...snapshot, config: error === 'translationModelMissing' ? { ...snapshot.config, model: '' } : snapshot.config, status: 'error', error, errorId: 'one-start-failure' }
    changed(failed)
    changed(snapshot)
    changed(failed)
    return failed
  })
  render(<ScreenTranslationPage />)
  await screen.findByRole('button', { name: '选择区域' })
  fireEvent.click(screen.getByRole('button', { name: '开始翻译' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'start' }))
  await waitFor(() => expect(notice).toHaveBeenCalledOnce())
  expect(notice).toHaveBeenCalledWith(expect.objectContaining(error === 'regionsMissing'
    ? { description: message }
    : { title: message, actionProps: { children: error === 'translationModelNotReady' ? '模型管理' : '模型网关', onClick: expect.any(Function) } }))
})

it('does not dispatch a second start while the first configuration is pending', async () => {
  let finish!: (value: ScreenSnapshot) => void
  command.mockImplementationOnce(() => new Promise<ScreenSnapshot>(resolve => { finish = resolve }))
  render(<ScreenTranslationPage />)
  await screen.findByRole('button', { name: '选择区域' })
  const start = screen.getByRole('button', { name: '开始翻译' })
  act(() => { fireEvent.click(start); fireEvent.click(start) })
  expect(command).toHaveBeenCalledOnce()
  await act(async () => finish(snapshot))
  expect(command.mock.calls.map(([value]) => value.action)).toEqual(['configure', 'start'])
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
