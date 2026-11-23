import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceRecord } from '@/bridge'
import { actions } from '@/store'
import { ModelConfigurationDialog } from './ModelConfigurationDialog'
import { TranslationCompatibilityDialog } from './TranslationCompatibilityDialog'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'

afterEach(() => vi.restoreAllMocks())
const pending: ResourceRecord = { resourceId: 'hub:test/recognizer', kind: 'recognitionModel', provider: 'qwen3-asr', name: 'Test recognizer', description: 'Test', languages: ['en', 'ja'], installed: true, installedBytes: 0, state: 'idle', cancellable: false }

it('keeps a downloaded model gated until the user saves its configuration', async () => {
  const save = vi.spyOn(actions.models, 'configureModel').mockResolvedValue()
  const close = vi.fn()
  render(<ModelConfigurationDialog record={pending} onClose={close} />)
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(pending.resourceId, expect.objectContaining({ slot: 'recognition', engine: 'pytorch', languages: ['en', 'ja'], supportsAutoDetection: true })))
  expect(close).toHaveBeenCalledOnce()
})

it('saves imported GGUF models as llama.cpp translation models', async () => {
  const save = vi.spyOn(actions.models, 'configureModel').mockResolvedValue()
  const translator: ResourceRecord = { ...pending, resourceId: 'hub:test/gguf', kind: 'translationModel', provider: 'llama.cpp' }
  render(<ModelConfigurationDialog record={translator} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(translator.resourceId, expect.objectContaining({
    slot: 'translation', engine: 'llama', sourceLanguages: ['auto', 'en', 'ja'], targetLanguages: ['en', 'ja'], supportsAutoDetection: true,
  })))
})

it('explains the incompatible direction and offers only model change and close', () => {
  const close = vi.fn()
  const translator: ResourceRecord = { ...pending, resourceId: 'hub:test/translator', kind: 'translationModel', provider: 'llama.cpp', name: 'English/Japanese', configuration: { slot: 'translation', engine: 'llama', languages: [], supportsAutoDetection: false, sourceLanguages: ['en', 'ja'], targetLanguages: ['en', 'ja'] } }
  render(<TranslationCompatibilityDialog isOpen onClose={close} source="zh" target="en" translation={translator} resources={[pending, translator]} compute={DEFAULT_COMPUTE_SETTINGS} onChangeModel={vi.fn()} />)
  expect(screen.getByText(/English\/Japanese 不支持 中文（简体） → 英语/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '更换模型' })).toBeEnabled()
  expect(screen.getAllByRole('button')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: '更换识别语言' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '关闭翻译' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更换模型' }))
  expect(screen.getByRole('combobox')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(close).toHaveBeenCalledOnce()
})
