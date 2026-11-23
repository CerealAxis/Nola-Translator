import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceRecord } from '../../../../shared/contracts'
import { localModelFamilies } from './local-preview-catalog'
import { LocalDetails, LocalDownloadDialog } from './LocalPreview'

vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))
afterEach(cleanup)

const families = localModelFamilies([
  { resourceId: 'hy-mt2-7b-q4-k-m', kind: 'translationModel', provider: 'hymt2', name: 'Hy-MT2 7B Q4_K_M' },
  { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hymt2', name: 'Hy-MT2 1.8B Q4_K_M' },
  { resourceId: 'qwen35-0.8b-q4-k-m', kind: 'translationModel', provider: 'llama.cpp', name: 'Qwen3.5 0.8B Q4_K_M' },
  { resourceId: 'sensevoice-small', kind: 'recognitionModel', provider: 'sensevoice', name: 'SenseVoiceSmall' },
  { resourceId: 'pp-ocrv5-mobile-korean-onnx', kind: 'ocrModel', provider: 'pp-ocrv5', name: 'PP-OCRv5 mobile Korean', languages: ['ko'] },
  { resourceId: 'pp-ocrv5-mobile-latin-onnx', kind: 'ocrModel', provider: 'pp-ocrv5', name: 'PP-OCRv5 mobile Latin' },
].map((record): ResourceRecord => ({
  description: '', languages: [], installed: false, installedBytes: 0, state: 'idle', cancellable: false,
  ...record, kind: record.kind as ResourceRecord['kind'],
})))

it('shows only installed variants in the family and adds models through a separate action', async () => {
  const user = userEvent.setup()
  const family = families.find(item => item.key === 'hymt2')!
  const installed = new Set(['hy-mt2-7b-q4-k-m'])
  const onAdd = vi.fn()
  render(<LocalDetails family={family} installed={installed} onAdd={onAdd} onRemove={vi.fn()} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '已安装的模型' })).toBeVisible()
  expect(screen.getByText('Hy-MT2 7B Q4_K_M')).toBeVisible()
  expect(screen.queryByText('Hy-MT2 1.8B Q4_K_M')).toBeNull()
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  expect(onAdd).toHaveBeenCalledOnce()
})

it('chooses an uninstalled variant and its mirror in the download dialog', async () => {
  const user = userEvent.setup()
  const family = families.find(item => item.key === 'hymt2')!
  const onInstall = vi.fn()
  render(<LocalDownloadDialog family={family} installed={new Set()} onClose={vi.fn()} onInstall={onInstall} />)
  const dialog = within(screen.getByRole('dialog'))
  await user.click(dialog.getByRole('tab', { name: '1.8B' }))
  expect(dialog.getByRole('combobox', { name: '模型' })).toBeVisible()
  const mirror = dialog.getByRole('tab', { name: /镜像站/ })
  await user.click(mirror)
  expect(mirror).toHaveAttribute('aria-selected', 'true')
  expect(dialog.queryByText(/下载文件/)).toBeNull()
  await user.click(dialog.getByRole('button', { name: '安装' }))
  expect(onInstall).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ resourceId: 'hy-mt2-1.8b-q4-k-m' }), 'hf-mirror')
})

it.each([
  ['hy-mt2-7b-q4-k-m', 'Hy-MT2 7B Q4_K_M', '支持的目标语言', '英语'],
  ['sensevoice-small', 'SenseVoiceSmall', '支持的识别语言', '粤语'],
  ['pp-ocrv5-mobile-korean-onnx', 'PP-OCRv5 mobile Korean', '支持语言', '韩语'],
] as const)('opens the languages for installed local model %s', (id, name, label, chip) => {
  const family = families.find(item => item.records.some(record => record.resourceId === id))!
  render(<LocalDetails family={family} installed={new Set([id])} onAdd={vi.fn()} onRemove={vi.fn()} />)
  expect(screen.queryByText(label, { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '编辑模型 ' + name }))
  const popup = screen.getByRole('dialog')
  expect(popup).toHaveClass('model-editor')
  expect(popup).not.toHaveClass('modal__dialog--lg')
  const dialog = within(popup)
  expect(dialog.getByText(label, { exact: true })).toBeVisible()
  expect(dialog.getAllByText(chip, { exact: true })[0]).toBeVisible()
  expect(dialog.queryByText('运行引擎')).toBeNull()
})

it('does not show language settings for installed local chat models', () => {
  const id = 'qwen35-0.8b-q4-k-m'
  const family = families.find(item => item.records.some(record => record.resourceId === id))!
  render(<LocalDetails family={family} installed={new Set([id])} onAdd={vi.fn()} onRemove={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑模型 Qwen3.5 0.8B Q4_K_M' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.queryByText('支持的源语言')).toBeNull()
  expect(dialog.queryByText('支持的目标语言')).toBeNull()
  expect(dialog.getByRole('textbox', { name: '推理等级（从低到高） 1' })).toHaveValue('disabled')
})
