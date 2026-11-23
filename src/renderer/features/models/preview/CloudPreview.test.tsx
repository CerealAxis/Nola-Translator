import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { CloudDetails } from './CloudPreview'
import { newConnection, templates, type Connection, type Service } from './cloud-preview-data'
import * as store from '@/store'
import * as toast from '@/components/ui/toast'
import { encodeIpcError } from '../../../../shared/ipc-error'

vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))
afterEach(cleanup)

it('shows the missing API key as a toast without opening a model-list dialog', async () => {
  const error = new Error(encodeIpcError('CLOUD_MODEL_KEY_REQUIRED', {
    code: 'CLOUD_MODEL_KEY_REQUIRED', supportCode: 'ERR-999', retryable: false, correlationId: 'test',
  }))
  const listCloudModels = vi.fn().mockRejectedValue(error)
  const bridge = vi.spyOn(store, 'getBridge').mockReturnValue({ app: { listCloudModels } } as unknown as ReturnType<typeof store.getBridge>)
  const notice = vi.spyOn(toast, 'showToast').mockReturnValue('missing-key-toast')
  try {
    const user = userEvent.setup()
    render(<CloudDetails connection={newConnection('openai', 'LLM', 'provider_test')} creating onSave={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '获取模型列表' }))
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error', title: '获取失败', description: '请先配置 API 密钥',
    })))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '接口地址' })).toBeVisible()
  } finally {
    bridge.mockRestore()
    notice.mockRestore()
  }
})

it('adds only checked remote models and leaves existing models intact', async () => {
  const listCloudModels = vi.fn().mockResolvedValue([{ id: 'existing' }, { id: 'chosen' }, { id: 'other' }])
  const bridge = vi.spyOn(store, 'getBridge').mockReturnValue({ app: { listCloudModels } } as unknown as ReturnType<typeof store.getBridge>)
  const metadata = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}))
  try {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const existing = { id: 'existing', name: 'My model', enabled: false, profileId: 'old' }
    const connection = { ...newConnection('openai', 'LLM', 'provider_test'), models: [existing] }
    render(<CloudDetails connection={connection} creating={false} onSave={onSave} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '获取模型列表' }))
    const dialog = within(await screen.findByRole('dialog', { name: '获取模型列表' }))
    expect(await dialog.findByRole('checkbox', { name: /existing/ })).toHaveAttribute('aria-disabled', 'true')
    expect(onSave).not.toHaveBeenCalled()
    await user.type(dialog.getByRole('searchbox'), 'chosen')
    expect(dialog.queryByRole('checkbox', { name: 'other' })).not.toBeInTheDocument()
    await user.click(dialog.getByRole('checkbox', { name: 'chosen' }))
    await user.click(dialog.getByRole('button', { name: '添加所选模型' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      models: [existing, expect.objectContaining({ id: 'chosen', enabled: true })],
    }), 'models'))
  } finally {
    bridge.mockRestore()
    metadata.mockRestore()
  }
})

it('tests the selected model and generates audio only after the user submits the audition', async () => {
  const probeCloudModel = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ audio: 'data:audio/wav;base64,AA==' })
  const bridge = vi.spyOn(store, 'getBridge').mockReturnValue({ app: { probeCloudModel } } as unknown as ReturnType<typeof store.getBridge>)
  const notice = vi.spyOn(toast, 'showToast').mockReturnValue('connection-toast')
  try {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const chat = { ...newConnection('openai', 'LLM', 'provider_test'),
      models: [{ id: 'chosen', name: 'Chosen', enabled: false, profileId: 'specific-profile' }] }
    const { rerender } = render(<CloudDetails connection={chat} creating={false} onSave={onSave} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '测试连接 chosen' }))
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success', title: '连接成功', description: expect.stringMatching(/^延迟 \d+ ms$/),
    })))
    expect(probeCloudModel).toHaveBeenCalledWith(expect.objectContaining({ capability: 'LLM', binding: 'custom:specific-profile' }))

    const tts = { ...newConnection('mimo', 'TTS', 'speech-test'),
      models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, voice: 'mimo_default' }] }
    rerender(<CloudDetails key={tts.id} connection={tts} creating={false} onSave={onSave} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '试听 mimo-v2.5-tts' }))
    expect(probeCloudModel).toHaveBeenCalledTimes(1)
    const dialog = within(screen.getByRole('dialog', { name: /试听.*MiMo/ }))
    fireEvent.change(dialog.getByRole('textbox', { name: '试听文本' }), { target: { value: '试听这句话' } })
    await user.click(dialog.getByRole('button', { name: '生成试听' }))
    await waitFor(() => expect(dialog.getByLabelText('试听')).toHaveAttribute('src', 'data:audio/wav;base64,AA=='))
    expect(probeCloudModel).toHaveBeenLastCalledWith({ capability: 'TTS', binding: 'cloud:mimo-v2.5-tts', text: '试听这句话' })
    expect(onSave).not.toHaveBeenCalled()
  } finally { bridge.mockRestore(); notice.mockRestore() }
})

it('disables the connection test while running and reports failures in a toast', async () => {
  let rejectProbe!: (error: Error) => void
  const probeCloudModel = vi.fn().mockReturnValue(new Promise((_, reject) => { rejectProbe = reject }))
  const bridge = vi.spyOn(store, 'getBridge').mockReturnValue({ app: { probeCloudModel } } as unknown as ReturnType<typeof store.getBridge>)
  const notice = vi.spyOn(toast, 'showToast').mockReturnValue('connection-toast')
  try {
    const connection = { ...newConnection('openai', 'LLM', 'provider_test'),
      models: [{ id: 'chosen', name: 'Chosen', enabled: true, profileId: 'specific-profile' }] }
    render(<CloudDetails connection={connection} creating={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    const button = screen.getByRole('button', { name: '测试连接 chosen' })
    await userEvent.click(button)
    expect(screen.getByRole('button', { name: '测试连接 chosen' })).toBeDisabled()
    rejectProbe(new Error(encodeIpcError('CLOUD_MODEL_KEY_REQUIRED', {
      code: 'CLOUD_MODEL_KEY_REQUIRED', supportCode: 'ERR-999', retryable: false, correlationId: 'test',
    })))
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error', title: '连接测试失败', description: '请先配置 API 密钥',
    })))
    expect(screen.getByRole('button', { name: '测试连接 chosen' })).toBeEnabled()
  } finally { bridge.mockRestore(); notice.mockRestore() }
})

it('keeps independently created Alibaba recognition and speech translation connections separate', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  const chat = newConnection('aliyun', 'ASR', 'asr')
  const speech = newConnection('aliyun', 'S2S', 'speech')
  const view = render(<CloudDetails key={chat.id} connection={chat} creating onSave={save} onCancel={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('百炼业务空间 ID'), { target: { value: 'recognition-workspace' } })
  fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'recognition-key' } })
  await user.click(screen.getByRole('button', { name: '添加模型来源' }))
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ capability: 'ASR', key: 'recognition-key', workspace: 'recognition-workspace' }))
  view.rerender(<CloudDetails key={speech.id} connection={speech} creating onSave={save} onCancel={vi.fn()} />)
  expect(screen.getByLabelText('API 密钥')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('百炼业务空间 ID'), { target: { value: 'speech-workspace' } })
  fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'speech-key' } })
  await user.click(screen.getByRole('button', { name: '添加模型来源' }))
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ capability: 'S2S', key: 'speech-key', workspace: 'speech-workspace',
    models: [expect.objectContaining({ id: 'qwen3.8-livetranslate-flash-realtime' })] }))
  const savedSpeech: Connection = save.mock.calls.at(-1)![0]
  view.rerender(<CloudDetails key="saved-speech" connection={savedSpeech} creating={false} onSave={save} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '编辑模型 qwen3.8-livetranslate-flash-realtime' }))
  expect(screen.getByRole('dialog', { name: '编辑模型' })).toBeVisible()
  expect(screen.getByRole('combobox', { name: '模型 ID' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('keeps connection drafts independent of model edits and confirms removal', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  function StatefulDetails() {
    const [connection, setConnection] = useState<Connection>({
      ...newConnection('openai', 'LLM', 'openai'),
      models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', enabled: true }],
    })
    const update = (next: Connection, edit?: 'connection' | 'models') => {
      const merged = edit === 'models' ? { ...connection, models: next.models } : next
      setConnection(merged)
      save(merged)
    }
    return <CloudDetails connection={connection} creating={false} onSave={update} onCancel={vi.fn()} />
  }
  render(<StatefulDetails />)
  expect(screen.queryByRole('button', { name: '保存配置' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'OpenAI Compatible' })).toBeVisible()
  expect(screen.queryByText('https://api.openai.com/v1')).toBeNull()
  await user.click(screen.getByRole('button', { name: '名称' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Work account' } })
  await user.click(screen.getByRole('switch', { name: '启用 gpt-4.1-mini' }))
  expect(screen.getByRole('heading', { name: 'Work account' })).toBeVisible()
  expect(screen.queryByRole('textbox', { name: '名称' })).toBeNull()
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Work account', models: [expect.objectContaining({ enabled: false })] }))
  await user.click(screen.getByRole('button', { name: '删除模型 gpt-4.1-mini' }))
  expect(screen.getByText('移除这个模型？')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '确定' }))
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Work account', models: [] }))
})

it('saves valid endpoint changes on blur and preserves the previous endpoint for invalid input', () => {
  const save = vi.fn()
  const source = newConnection('index', 'MT', 'index')
  render(<CloudDetails connection={source} creating={false} onSave={save} onCancel={vi.fn()} />)
  const endpoint = screen.getByLabelText('接口地址')
  fireEvent.change(endpoint, { target: { value: 'not a URL' } })
  fireEvent.blur(endpoint)
  expect(endpoint).toHaveAttribute('aria-invalid', 'true')
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(endpoint, { target: { value: 'https://proxy.example/v1' } })
  expect(save).not.toHaveBeenCalled()
  fireEvent.blur(endpoint)
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ endpoint: 'https://proxy.example/v1' }), 'connection')
})

const cloudTemplates = (Object.keys(templates) as Service[]).flatMap(service =>
  (Object.keys(templates[service].models) as Connection['capability'][]).map(capability => ({ service, capability })))

it.each(cloudTemplates)('shows the icon and editable settings for $service ($capability)', async ({ service, capability }) => {
  const template = templates[service]
  const connection = newConnection(service, capability, service)
  render(<CloudDetails connection={connection} creating onSave={vi.fn()} onCancel={vi.fn()} production />)
  const icon = screen.getByRole('button', { name: '更换图标' })
  await waitFor(() => expect(icon.querySelector('svg, img')).toBeInTheDocument())
  if (service !== 'edge-tts') {
    expect(screen.getByLabelText('接口地址')).toHaveValue(template.endpoint)
    expect(screen.getByLabelText('接口地址')).toBeEnabled()
  }
  const model = template.models[capability]?.[0]
  expect(screen.getByRole('button', { name: model ? '编辑模型 ' + model : '添加模型' })).toBeEnabled()
  if (capability === 'LLM') expect(screen.getByRole('combobox', { name: 'API 格式' })).toBeEnabled()
})

it.each([
  ['microsoft', 'MT', ['支持的源语言', '支持的目标语言']],
  ['mimo-stt-api', 'ASR', ['支持的识别语言']],
  ['mimo', 'TTS', ['语音输出语言']],
  ['aliyun', 'S2S', ['支持的源语言', '支持的目标语言', '语音输出语言']],
] as const)('shows the language groups for %s/%s only in the model editor', (service, capability, labels) => {
  render(<CloudDetails connection={newConnection(service, capability, service)} creating onSave={vi.fn()} onCancel={vi.fn()} />)
  for (const label of labels) expect(screen.queryByText(label, { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '编辑模型 ' + templates[service].models[capability]?.[0] }))
  const editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
  for (const label of labels) expect(editor.getByText(label, { exact: true })).toBeVisible()
})

it('shows the language list for the model selected in the editor', () => {
  const connection = newConnection('openai-tts-api', 'TTS', 'openai-tts')
  connection.models = [
    { id: 'tts-1', name: 'tts-1', enabled: true },
    { id: 'custom-tts', name: 'Custom TTS', enabled: true },
  ]
  render(<CloudDetails connection={connection} creating={false} onSave={vi.fn()} onCancel={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑模型 custom-tts' }))
  const editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
  expect(editor.getByText('暂无该模型的语言清单')).toBeVisible()
  fireEvent.change(editor.getByLabelText('模型 ID'), { target: { value: 'tts-1-hd' } })
  expect(editor.queryByText('暂无该模型的语言清单')).toBeNull()
  expect(editor.getByText('英语')).toBeVisible()
  expect(editor.getByText('中文', { exact: true })).toBeVisible()
  expect(editor.queryByText('中文（简体）')).toBeNull()
})
