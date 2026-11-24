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
  { resourceId: 'pp-ocrv6-medium-onnx', kind: 'ocrModel', provider: 'pp-ocrv6', name: 'PP-OCRv6 Medium' },
  { resourceId: 'comic-lama-onnx', kind: 'inpaintModel', provider: 'lama-onnx', name: 'LaMa (ONNX)' },
  { resourceId: 'comic-lama-manga-onnx', kind: 'inpaintModel', provider: 'lama-manga-onnx', name: 'LaMa Manga (ONNX)' },
  { resourceId: 'lama-manga', kind: 'inpaintModel', provider: 'lama', name: 'LaMA Manga' },
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

it('confirms removal in the selected model row and leaves cancelled models installed', async () => {
  const user = userEvent.setup()
  const family = families.find(item => item.key === 'hymt2')!
  const onRemove = vi.fn()
  render(<LocalDetails family={family} installed={new Set(['hy-mt2-7b-q4-k-m', 'hy-mt2-1.8b-q4-k-m'])} onAdd={vi.fn()} onRemove={onRemove} />)

  await user.click(screen.getByRole('button', { name: '删除模型 Hy-MT2 1.8B Q4_K_M' }))
  const secondRow = screen.getByText('Hy-MT2 1.8B Q4_K_M').closest('li')!
  expect(within(secondRow).getByText('移除这个模型？')).toBeVisible()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(onRemove).not.toHaveBeenCalled()
  await user.click(within(secondRow).getByRole('button', { name: '取消' }))
  expect(onRemove).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: '删除模型 Hy-MT2 7B Q4_K_M' }))
  const firstRow = screen.getByText('Hy-MT2 7B Q4_K_M').closest('li')!
  await user.click(within(firstRow).getByRole('button', { name: '确定' }))
  expect(onRemove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ resourceId: 'hy-mt2-7b-q4-k-m' }))
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
  ['pp-ocrv5-mobile-korean-onnx', 'PP-OCRv5 Mobile Korean', '支持语言', '韩语'],
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


it('groups LaMa variants while retaining each runtime', () => {
  const family = families.find(item => item.category === 'inpaint')
  expect(families.filter(item => item.category === 'inpaint')).toHaveLength(1)
  expect(family?.name).toBe('LaMa')
  expect(family?.engines).toEqual(['opencv', 'onnx', 'pytorch'])
})

it('groups PP-OCR versions and installs the selected variant from the selected source', async () => {
  const family = families.find(item => item.category === 'OCR')!
  expect(families.filter(item => item.category === 'OCR')).toHaveLength(1)
  expect(family.records.map(record => record.resourceId)).toContain('pp-ocrv6-medium-onnx')
  const onInstall = vi.fn()
  const user = userEvent.setup()
  render(<LocalDownloadDialog family={family} installed={new Set()} onClose={vi.fn()} onInstall={onInstall} />)
  expect(screen.getByRole('button', { name: '另存为' })).toBeVisible()
  await user.click(screen.getByRole('tab', { name: /镜像站/ }))
  await user.click(screen.getByRole('button', { name: '安装' }))
  expect(onInstall).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ resourceId: 'pp-ocrv5-mobile-korean-onnx' }), 'hf-mirror')
})
