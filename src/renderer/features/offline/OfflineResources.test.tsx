import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SettingSelectProps } from '../settings/SettingsPage'
import { LocalModelImport, OfflineDialog } from './OfflineResources'
import { offlineActions, offlineStore } from '@/store/offlineStore'
import { settingsStore } from '@/store/settingsStore'
import { modelsStore } from '@/store/modelStore'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { runtimePackageSchema, runtimeRecipeSchema } from '../../../shared/compute'
import type { RuntimeSnapshot } from '../../../shared/compute'

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
afterAll(() => vi.unstubAllGlobals())

vi.mock('../settings/SettingsPage', () => ({
  SettingGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SettingSelect: ({ value, options, ariaLabel, onChange }: SettingSelectProps) => <select aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
}))
function runtimes(): RuntimeSnapshot {
  const recipe = (backend: 'cpu' | 'cuda') => ({ ...runtimeRecipeSchema.parse({ id: `torch-${backend}`, name: `Torch ${backend}`, backend, pythonAbi: 'cp312-win_amd64', torchVersion: '2.8.0', indexUrl: 'https://download.pytorch.org/whl/cpu', wheel: { url: 'https://example.com/torch.whl', filename: 'torch.whl', sha256: 'a'.repeat(64), bytes: 100 }, requirements: [] }), installed: false, available: true, reason: '' })
  const pkg = (backend: 'cpu' | 'cuda') => ({ ...runtimePackageSchema.parse({ id: `llama-${backend}`, name: `llama ${backend}`, backend, kind: 'llama', version: '1', url: 'https://example.com/llama.zip', sha256: 'a'.repeat(64), bytes: 100 }), installed: false })
  const missing = { path: '', status: 'missing' as const, backend: '', version: '', gpuAvailable: false, reason: '' }
  return { recipes: [recipe('cuda'), recipe('cpu')], packages: [pkg('cuda'), pkg('cpu')], recommendation: { engineId: null, llamaId: null, reasons: [] }, hardware: { adapters: [{ name: 'NVIDIA', vendor: 'nvidia', driver: '', hardwareId: '' }], nvidiaDriver: null, notes: [] }, local: { engine: missing, llama: missing }, operation: null, lastError: null, directory: '' }
}
beforeEach(() => {
  settingsStore.setState({ settings: DEFAULT_SETTINGS, runtimes: runtimes() })
  modelsStore.setState({ resources: [{ resourceId: DEFAULT_SETTINGS.recognition.modelId, provider: 'sensevoice', kind: 'recognitionModel', name: 'Speech model', description: '', languages: ['en'], installed: false, installedBytes: 0, downloadBytes: 1024, state: 'idle', cancellable: false }] })
  offlineStore.setState({ available: true, mode: 'prepare', task: null, preview: null, busy: false, failed: false, downloadModelId: undefined, destination: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('opens the folder picker first and shows the checked model only after selection', async () => {
  const user = userEvent.setup()
  offlineStore.setState({ mode: null })
  let finish!: () => void
  const select = vi.spyOn(offlineActions, 'selectModel').mockImplementation(() => new Promise(resolve => {
    finish = () => {
      offlineStore.setState({ preview: { token: 'model', compatible: true, issues: [], items: [], totalBytes: 1024 } })
      resolve()
    }
  }))
  render(<LocalModelImport />)
  expect(screen.getByRole('button', { name: '本地导入' })).toHaveAttribute('data-slot', 'button')
  expect(screen.getByRole('button', { name: '本地导入' }).parentElement).toHaveAttribute('data-variant', 'secondary')
  await user.hover(screen.getByRole('button', { name: '导入说明' }))
  expect(await screen.findByRole('tooltip')).toHaveTextContent('ASR GGUF 还需要配套的 mmproj 音频编码器')
  await user.click(screen.getByRole('button', { name: '导入说明' }))
  expect(select).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '本地导入' }))
  expect(select).toHaveBeenCalledWith('directory')
  expect(screen.queryByRole('dialog', { name: '本地导入' })).not.toBeInTheDocument()
  await act(async () => finish())
  expect(await screen.findByRole('button', { name: '开始安装' })).toBeEnabled()
  expect(screen.getByText('安装所需空间')).toBeInTheDocument()
})
it('starts with explicit loader version choices and no hardware or computer selector', () => {
  render(<OfflineDialog scope="runtime" />)
  for (const name of ['PyTorch', 'llama.cpp', 'CrispASR']) expect(screen.getByRole('combobox', { name })).toHaveValue('')
  expect(screen.queryByRole('combobox', { name: '目标电脑' })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '运算设备' })).not.toBeInTheDocument()
})
it('exports the exact selected loader version without choosing it from local hardware', () => {
  const prepare = vi.spyOn(offlineActions, 'prepare').mockResolvedValue()
  render(<OfflineDialog scope="runtime" />)
  fireEvent.change(screen.getByRole('combobox', { name: 'PyTorch' }), { target: { value: 'torch-cuda' } })
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  fireEvent.click(screen.getByRole('button', { name: '导出 ZIP' }))
  expect(prepare).toHaveBeenCalledWith({ modelIds: [], runtimeIds: ['torch-cuda'] })
})
it('disables models until their loader is included and displays the loader chip', async () => {
  const user = userEvent.setup()
  render(<OfflineDialog scope="runtime" />)
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await user.click(screen.getByRole('combobox', { name: '识别模型' }))
  expect(await screen.findByRole('option', { name: /Speech model/ })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getAllByText('PyTorch').length).toBeGreaterThan(0)
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()
})
it('blocks an invalid import preview and shows available space', () => {
  offlineStore.setState({ mode: 'model', preview: { token: 'opaque', compatible: false, issues: ['checksumMismatch'], items: [], totalBytes: 1024, availableBytes: 4096 } })
  render(<OfflineDialog scope="model" />)
  expect(screen.getByRole('button', { name: '开始安装' })).toBeDisabled()
  expect(screen.getByText('可用空间')).toBeInTheDocument()
})
it('selects a model and download source, then starts the download to the chosen path', async () => {
  const user = userEvent.setup()
  const download = vi.spyOn(offlineActions, 'downloadModel').mockResolvedValue()
  offlineStore.setState({ mode: 'model', downloadModelId: 'tts-qwen3-tts-pytorch-1.7b-base-bf16' })
  render(<OfflineDialog scope="model" />)
  expect(screen.getByRole('dialog', { name: '另存为' })).toBeInTheDocument()
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.queryByText('模型将保存为一个可导入的文件夹')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '模型' })).toBeInTheDocument()
  const source = screen.getByRole('combobox', { name: '下载来源' })
  expect(source).toHaveTextContent('Hugging Face')
  await user.click(source)
  await user.click(await screen.findByRole('option', { name: 'ModelScope' }))
  expect(source).toHaveTextContent('ModelScope')
  await user.type(screen.getByRole('textbox', { name: '保存位置' }), 'G:\\Models')
  await user.click(screen.getByRole('button', { name: '下载模型' }))
  expect(download).toHaveBeenCalledWith('tts-qwen3-tts-pytorch-1.7b-base-bf16', 'modelscope', 'G:\\Models')
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('opens the folder picker again without clearing the current preview', () => {
  const select = vi.spyOn(offlineActions, 'selectModel').mockResolvedValue()
  const preview = { token: 'old', compatible: true, issues: [], items: [], totalBytes: 0 }
  offlineStore.setState({ mode: 'model', preview })
  render(<OfflineDialog scope="model" />)
  expect(screen.queryByRole('textbox', { name: '模型路径' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新选择' }))
  expect(select).toHaveBeenCalledWith('directory')
  expect(offlineStore.getState().preview).toEqual(preview)
})
it('reopens the folder picker after a failed import and closes the dialog if cancelled', async () => {
  const user = userEvent.setup()
  const select = vi.spyOn(offlineActions, 'selectModel').mockResolvedValue()
  offlineStore.setState({ mode: 'model', task: { state: 'failed', phase: 'verify', current: 0, total: 1 }, preview: null })
  render(<OfflineDialog scope="model" />)
  await user.click(screen.getByRole('button', { name: '重新选择' }))
  expect(select).toHaveBeenCalledWith('directory')
  expect(screen.queryByRole('dialog', { name: '本地导入' })).not.toBeInTheDocument()
})

it('downloads to a typed path without retaining a previous folder token', () => {
  const download = vi.spyOn(offlineActions, 'downloadModel').mockResolvedValue()
  offlineStore.setState({ mode: 'model', downloadModelId: 'hy-mt2-7b-q4-k-m', destination: { token: 'old', label: 'G:\\Old' } })
  render(<OfflineDialog scope="model" />)
  const path = screen.getByRole('textbox', { name: '保存位置' })
  expect(path).not.toHaveAttribute('readonly')
  fireEvent.change(path, { target: { value: 'G:\\New' } })
  expect(offlineStore.getState().destination).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '下载模型' }))
  expect(download).toHaveBeenCalledWith('hy-mt2-7b-q4-k-m', 'huggingface', 'G:\\New')
})
it('shows resource counts rather than gigabytes while packaging', () => {
  offlineStore.setState({ task: { state: 'running', phase: 'pack', current: 1, total: 3 } })
  render(<OfflineDialog scope="runtime" />)
  expect(screen.getByText('1 / 3')).toBeInTheDocument()
  expect(screen.queryByText('0.00 GB / 0.00 GB')).not.toBeInTheDocument()
})

it('keeps the export title when reopening a background preparation task', () => {
  offlineStore.setState({ mode: 'bundle', workflow: 'bundle-prepare', task: { state: 'running', phase: 'pack', current: 1, total: 3 } })
  render(<OfflineDialog scope="runtime" />)
  expect(screen.getByRole('heading', { name: '准备离线包' })).toBeInTheDocument()
})

it('includes dependency artifacts in the estimate for a runtime-only ZIP', () => {
  const runtime = runtimes()
  const cpu = runtime.recipes.find(item => item.backend === 'cpu')!
  cpu.wheel.bytes = 1024 ** 3
  cpu.companions = [{ ...cpu.wheel, filename: 'companion.whl', bytes: 1024 ** 3 }]
  settingsStore.setState({ runtimes: runtime })
  render(<OfflineDialog scope="runtime" />)
  fireEvent.change(screen.getByRole('combobox', { name: 'PyTorch' }), { target: { value: 'torch-cpu' } })
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  expect(screen.getByText('2.00 GB')).toBeInTheDocument()
  expect(screen.queryByText('包含模型和已固定的组件文件；额外依赖大小将在准备时确定。')).not.toBeInTheDocument()
})
