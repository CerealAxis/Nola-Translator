import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LlmPreviewEditor, type LlmPreviewModel } from './LlmPreviewEditor'

const openAiModels: readonly LlmPreviewModel[] = [
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', contextWindow: 1_047_576, maxOutputTokens: 32_768, images: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', contextWindow: 128_000, maxOutputTokens: 16_384, images: true },
]

const notifySuccess = vi.hoisted(() => vi.fn())
vi.mock('@/components/primitives/notify', () => ({ notifySuccess }))

const catalog = {
  openai: { models: {
    'gpt-4.1-mini': { name: 'GPT-4.1 mini', limit: { context: 1047576, output: 32768 }, modalities: { input: ['image', 'pdf'] } },
    'gpt-4o-mini': { name: 'GPT-4o mini', limit: { context: 128000, output: 16384 } },
  } },
  anthropic: { models: {
    'claude-haiku-4-5': { limit: { context: 200000, output: 64000 }, modalities: { input: ['image'] },
      reasoning_options: [{ type: 'effort', values: ['low', 'high'] }] },
  } },
}

beforeEach(() => {
  notifySuccess.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(catalog)))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('opens a dialog, fills an exact match and preserves a manual value entered during lookup', async () => {
  const save = vi.fn()
  const user = userEvent.setup()
  render(<LlmPreviewEditor provider="openai" onCancel={vi.fn()} onSave={save} />)
  expect(screen.getByRole('dialog', { name: '添加模型' })).toBeVisible()
  fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'gpt-4.1-mini' } })
  fireEvent.change(screen.getByLabelText('最大输出 Token'), { target: { value: '4096' } })
  await waitFor(() => expect(screen.getByLabelText('上下文窗口')).toHaveValue(1047576))
  expect(screen.getByLabelText('最大输出 Token')).toHaveValue(4096)
  expect(screen.getByRole('checkbox', { name: '图片' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'PDF' })).toBeChecked()
  expect(notifySuccess).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledWith('https://models.dev/api.json', expect.objectContaining({ credentials: 'omit' }))
  await user.click(screen.getByRole('button', { name: '保存' }))
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ...openAiModels[0], maxOutputTokens: 4096, pdf: true }))
})

it('drops values for the previous catalog ID and accepts an unlisted model', () => {
  const save = vi.fn()
  render(<LlmPreviewEditor provider="openai" model={openAiModels[1]} onCancel={vi.fn()} onSave={save} />)
  fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'private-chat' } })
  expect(screen.getByLabelText('上下文窗口')).toHaveValue(null)
  expect(screen.getByRole('checkbox', { name: '图片' })).not.toBeChecked()
  fireEvent.change(screen.getByLabelText('上下文窗口'), { target: { value: '65536' } })
  fireEvent.change(screen.getByLabelText('最大输出 Token'), { target: { value: '8192' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'private-chat', name: 'private-chat', contextWindow: 65536, maxOutputTokens: 8192, images: false }))
})

it('matches typed IDs only within the selected provider and blocks duplicates', () => {
  const cancel = vi.fn(), save = vi.fn()
  render(<LlmPreviewEditor provider="custom" existingIds={['gpt-4o-mini']} onCancel={cancel} onSave={save} />)
  fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'gpt-4o-mini' } })
  expect(screen.getByRole('alert')).toHaveTextContent('相同的模型 ID')
  expect(screen.getByLabelText('上下文窗口')).toHaveValue(null)
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(cancel).toHaveBeenCalledOnce()
  expect(save).not.toHaveBeenCalled()
})

it('preserves saved overrides on open and refills limits for a different exact ID', async () => {
  render(<LlmPreviewEditor provider="openai" model={{ ...openAiModels[0], contextWindow: 48000 }}
    onCancel={vi.fn()} onSave={vi.fn()} />)
  expect(screen.getByLabelText('上下文窗口')).toHaveValue(48000)
  fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'gpt-4o-mini' } })
  await waitFor(() => expect(screen.getByLabelText('上下文窗口')).toHaveValue(128000))
  expect(screen.getByLabelText('最大输出 Token')).toHaveValue(16384)
})

it('fills the limits and reasoning levels for the Anthropic preset model', async () => {
  render(<LlmPreviewEditor provider="anthropic" onCancel={vi.fn()} onSave={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'claude-haiku-4-5' } })
  await waitFor(() => expect(screen.getByLabelText('上下文窗口')).toHaveValue(200_000))
  expect(screen.getByLabelText('最大输出 Token')).toHaveValue(64_000)
  expect(screen.getByRole('checkbox', { name: '图片' })).toBeChecked()
  expect(screen.getByRole('textbox', { name: '推理等级（从低到高） 2' })).toHaveValue('high')
})

it('saves chat model settings without asking for languages', () => {
  const save = vi.fn()
  render(<LlmPreviewEditor provider="openai" model={openAiModels[0]} onCancel={vi.fn()} onSave={save} />)
  expect(screen.queryByRole('button', { name: '支持语言' })).toBeNull()
  expect(screen.queryByText('支持的源语言')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: openAiModels[0].id }))
})
