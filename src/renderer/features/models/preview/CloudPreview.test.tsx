import type { TtsVoiceRef } from '../../../../shared/tts/voice-ref'
import { TtsVoiceConfiguration, ttsVoiceDrafts, serializeTtsVoices } from './TtsVoiceConfiguration'
import { ModelEditorDialog } from './ModelEditorDialog'
import { astrBotSpeechPresets } from '../../../../shared/astrbot-speech-presets'
import { ttsCatalogCapabilities } from '../../../../shared/tts/catalog'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CloudDetails } from './CloudPreview'
import { newConnection, templates, type Connection, type Service } from './cloud-preview-data'
import * as store from '@/store'
import * as toast from '@/components/ui/toast'
import { encodeIpcError } from '../../../../shared/ipc-error'
import { languageName } from '../../../../shared/languages'

vi.mock('@/components/tts/use-tts-capabilities', async () => {
  const { ttsCatalogCapabilities } = await import('../../../../shared/tts/catalog')
  const { astrBotSpeechPresetForBinding } = await import('../../../../shared/astrbot-speech-presets')
  return { useTtsCapabilities: (binding: string, modelId?: string) => ({ capabilities: ttsCatalogCapabilities(
    astrBotSpeechPresetForBinding(binding)?.id ?? 'mimo', modelId ?? 'mimo-v2.5-tts', binding) }) }
})
vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps configured voice languages within the provider limits in the editor and saved values', () => {
  const caps = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'test')
  const rows = ttsVoiceDrafts(caps, [{ id: 'Mia', name: 'My Mia', languages: ['zh', 'en'] }])
  expect(rows.find(row => row.id === 'Mia')).toMatchObject({ name: 'My Mia', languages: ['en'], languageOptions: ['en'] })
  expect(serializeTtsVoices(rows)).toEqual([{ id: 'Mia', name: 'My Mia', languages: ['en'] }])
})

it('shows only the voice dialog and restores the parent draft after cancel and save', async () => {
  const caps = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'test')
  function Editor() {
    const [rows, setRows] = useState(() => ttsVoiceDrafts(caps, [], undefined, []))
    return <ModelEditorDialog title="模型草稿" canSave onCancel={vi.fn()} onSave={vi.fn()}>
      <TtsVoiceConfiguration rows={rows} onChange={setRows} selected={{ kind: 'engine-default' }} onSelect={vi.fn()} capabilities={caps} binding="test" />
    </ModelEditorDialog>
  }
  render(<Editor />)
  const user = userEvent.setup()
  const parent = screen.getByRole('dialog', { name: '模型草稿' })
  await user.click(screen.getByRole('button', { name: '添加音色' }))
  expect(parent).not.toBeVisible()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  await user.keyboard('{Escape}')
  expect(parent).toBeVisible()
  await user.click(screen.getByRole('button', { name: '添加音色' }))
  const child = within(screen.getByRole('dialog', { name: '音色配置' }))
  await user.type(child.getByLabelText('Voice ID'), 'custom')
  await user.click(child.getByRole('button', { name: '保存' }))
  expect(parent).toBeVisible()
  expect(screen.getByLabelText('Voice ID 1')).toHaveValue('custom')
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
})

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
  const bridge = vi.spyOn(store, 'getBridge').mockReturnValue({ app: { probeCloudModel }, voices: { list: async () => [], compatibility: async (_binding: string, _language: string, refs: unknown[]) => refs.map(ref => ({ ref, compatible: true })) } } as unknown as ReturnType<typeof store.getBridge>)
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
      models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { defaultVoiceRef: { kind: 'preset' as const, modelBinding: 'cloud:mimo-v2.5-tts', voiceId: 'mimo_default' } } }] }
    rerender(<CloudDetails key={tts.id} connection={tts} creating={false} onSave={onSave} onCancel={vi.fn()} />)
    const audition = screen.getByRole('button', { name: '试听 mimo-v2.5-tts' })
    expect(audition).toHaveAttribute('data-variant', 'bare')
    expect(audition).toHaveAttribute('data-size', 'icon-sm')
    await user.click(audition)
    expect(probeCloudModel).toHaveBeenCalledTimes(1)
    const dialog = within(screen.getByRole('dialog', { name: '试听' }))
    fireEvent.change(dialog.getByRole('textbox', { name: '试听文本' }), { target: { value: '试听这句话' } })
    await user.click(dialog.getByRole('combobox', { name: '音色' }))
    await user.click(await screen.findByRole('option', { name: /冰糖/ }))
    await user.click(dialog.getByRole('button', { name: '生成试听' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Play 试听' })).toBeInTheDocument())
    expect(probeCloudModel).toHaveBeenLastCalledWith({ capability: 'TTS', binding: 'cloud:mimo-v2.5-tts', text: '试听这句话', voiceRef: { kind: 'preset', modelBinding: 'cloud:mimo-v2.5-tts', voiceId: '冰糖' }, targetLanguage: 'zh' })
    expect(onSave).not.toHaveBeenCalled()
  } finally { bridge.mockRestore(); notice.mockRestore() }
})

it('shows audition loading on the submit button without adding a status line to the form', async () => {
  let resolveProbe!: (value: { audio: string }) => void
  const probeCloudModel = vi.fn(() => new Promise<{ audio: string }>(resolve => { resolveProbe = resolve }))
  const bridge = vi.spyOn(store, 'getBridge').mockReturnValue({ app: { probeCloudModel }, voices: { list: async () => [], compatibility: async (_binding: string, _language: string, refs: unknown[]) => refs.map(ref => ({ ref, compatible: true })) } } as unknown as ReturnType<typeof store.getBridge>)
  try {
    const user = userEvent.setup()
    const connection = { ...newConnection('mimo', 'TTS', 'speech_test'),
      models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { defaultVoiceRef: { kind: 'preset' as const, modelBinding: 'cloud:mimo-v2.5-tts', voiceId: 'mimo_default' } } }] }
    render(<CloudDetails connection={connection} creating={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '试听 mimo-v2.5-tts' }))
    const dialog = within(screen.getByRole('dialog', { name: '试听' }))
    const button = dialog.getByRole('button', { name: '生成试听' })
    await user.click(button)
    expect(button).toBeDisabled()
    expect(button.querySelector('svg')).toHaveClass('motion-safe:animate-spin')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    resolveProbe({ audio: 'data:audio/wav;base64,AA==' })
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Play 试听' })).toBeInTheDocument())
  } finally { bridge.mockRestore() }
})

it('shows the synthesis support code instead of ERR-999 when audition generation fails', async () => {
  const probeCloudModel = vi.fn().mockRejectedValue(new Error(encodeIpcError('SYNTHESISFAILED', {
    code: 'SYNTHESISFAILED', supportCode: 'TTS-001', retryable: true, correlationId: 'test',
  })))
  const bridge = vi.spyOn(store, 'getBridge').mockReturnValue({ app: { probeCloudModel }, voices: { list: async () => [], compatibility: async (_binding: string, _language: string, refs: unknown[]) => refs.map(ref => ({ ref, compatible: true })) } } as unknown as ReturnType<typeof store.getBridge>)
  const notice = vi.spyOn(toast, 'showToast').mockReturnValue('preview-toast')
  try {
    const user = userEvent.setup()
    const connection = { ...newConnection('mimo', 'TTS', 'speech_test'),
      models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { defaultVoiceRef: { kind: 'preset' as const, modelBinding: 'cloud:mimo-v2.5-tts', voiceId: 'mimo_default' } } }] }
    render(<CloudDetails connection={connection} creating={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '试听 mimo-v2.5-tts' }))
    const dialog = within(screen.getByRole('dialog', { name: '试听' }))
    await user.click(dialog.getByRole('button', { name: '生成试听' }))
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error', title: '生成试听失败', description: 'Could not generate translated speech. Try again. (TTS-001)',
    })))
  } finally { bridge.mockRestore(); notice.mockRestore() }
})

it('disables the connection test while running and reports failures in a toast', async () => {
  let rejectProbe!: (error: Error) => void
  const probeCloudModel = vi.fn().mockReturnValue(new Promise((_, reject) => { rejectProbe = reject }))
  const bridge = vi.spyOn(store, 'getBridge').mockReturnValue({ app: { probeCloudModel }, voices: { list: async () => [], compatibility: async (_binding: string, _language: string, refs: unknown[]) => refs.map(ref => ({ ref, compatible: true })) } } as unknown as ReturnType<typeof store.getBridge>)
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
  const model = capability === 'TTS' ? undefined : template.models[capability]?.[0]
  expect(screen.getByRole('button', { name: model ? '编辑模型 ' + model : '添加模型' })).toBeEnabled()
  if (capability === 'LLM') expect(screen.getByRole('combobox', { name: 'API 格式' })).toBeEnabled()
})

it.each([
  ['microsoft', 'MT', ['支持的源语言', '支持的目标语言']],
  ['mimo-stt-api', 'ASR', ['支持的识别语言']],
  ['aliyun', 'S2S', ['支持的源语言', '支持的目标语言', '语音输出语言']],
] as const)('shows the language groups for %s/%s only in the model editor', (service, capability, labels) => {
  render(<CloudDetails connection={newConnection(service, capability, service)} creating onSave={vi.fn()} onCancel={vi.fn()} />)
  for (const label of labels) expect(screen.queryByText(label, { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '编辑模型 ' + templates[service].models[capability]?.[0] }))
  const editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
  for (const label of labels) expect(editor.getByText(label, { exact: true })).toBeVisible()
})

it('accepts multiple custom API voice IDs and preserves a profile default when saved', async () => {
  const onSave = vi.fn(), user = userEvent.setup()
  const connection = { ...newConnection('mimo', 'TTS', 'mimo'), models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true,
    tts: { defaultVoiceRef: { kind: 'profile' as const, profileId: 'my-voice', revision: 3 } } }] }
  render(<CloudDetails connection={connection} creating={false} onSave={onSave} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '编辑模型 mimo-v2.5-tts' }))
  const dialog = within(screen.getByRole('dialog', { name: '编辑模型' }))
  await user.click(dialog.getByRole('button', { name: '添加音色' }))
  await user.type(within(screen.getByRole('dialog', { name: '音色配置' })).getByLabelText('Voice ID'), 'custom-one')
  await user.click(within(screen.getByRole('dialog', { name: '音色配置' })).getByRole('button', { name: '保存' }))
  await user.click(dialog.getByRole('button', { name: '添加音色' }))
  await user.type(within(screen.getByRole('dialog', { name: '音色配置' })).getByLabelText('Voice ID'), 'custom-two')
  await user.click(within(screen.getByRole('dialog', { name: '音色配置' })).getByRole('button', { name: '保存' }))
  await user.click(dialog.getByRole('button', { name: '保存' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ models: [expect.objectContaining({ tts: expect.objectContaining({
    defaultVoiceRef: { kind: 'profile', profileId: 'my-voice', revision: 3 }, capabilityOverride: { presetVoices: [{ id: 'custom-one', name: 'custom-one' }, { id: 'custom-two', name: 'custom-two' }] },
  }) })] }), 'models')
})
it('clears old preset parameters in a draft switched to the design-only model', async () => {
  const user = userEvent.setup(), onSave = vi.fn()
  const connection = { ...newConnection('mimo', 'TTS', 'mimo'), models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true }] }
  render(<CloudDetails connection={connection} creating={false} onSave={onSave} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '编辑模型 mimo-v2.5-tts' }))
  const dialog = within(screen.getByRole('dialog', { name: '编辑模型' }))
  fireEvent.change(dialog.getByLabelText('模型 ID'), { target: { value: 'mimo-v2.5-tts-voicedesign' } })
  expect(dialog.queryByText('API 音色')).not.toBeInTheDocument()
  expect(dialog.queryByLabelText('Voice ID 1')).not.toBeInTheDocument()
  await waitFor(() => expect(dialog.getByRole('button', { name: '保存' })).toBeEnabled())
})


it('normalizes a pasted custom voice ID in both the descriptor and the default reference', async () => {
  const onSave = vi.fn(), user = userEvent.setup()
  const connection = { ...newConnection('mimo', 'TTS', 'mimo'), models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { defaultVoiceRef: { kind: 'engine-default' as const } } }] }
  render(<CloudDetails connection={connection} creating={false} onSave={onSave} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '编辑模型 mimo-v2.5-tts' }))
  const dialog = within(screen.getByRole('dialog', { name: '编辑模型' }))
  await user.click(dialog.getByRole('button', { name: '添加音色' }))
  await user.type(within(screen.getByRole('dialog', { name: '音色配置' })).getByLabelText('Voice ID'), ' custom-id ')
  const details = within(screen.getByRole('dialog', { name: '音色配置' }))
  await user.click(details.getByRole('button', { name: '保存' }))
  expect(onSave).not.toHaveBeenCalled()
  await user.click(dialog.getByRole('combobox', { name: '默认音色' }))
  await user.click(screen.getByRole('option', { name: 'custom-id' }))
  await user.click(dialog.getByRole('button', { name: '保存' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ models: [expect.objectContaining({ tts: expect.objectContaining({
    defaultVoiceRef: { kind: 'preset', modelBinding: 'cloud:mimo-v2.5-tts', voiceId: 'custom-id' }, capabilityOverride: { presetVoices: [{ id: 'custom-id', name: 'custom-id' }] },
  }) })] }), 'models')
})

it('offers built-in model IDs while accepting custom IDs without persisting the default example', async () => {
  const user = userEvent.setup(), onSave = vi.fn()
  const connection = { ...newConnection('mimo', 'TTS', 'mimo'), models: [] }
  render(<CloudDetails connection={connection} creating={false} onSave={onSave} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  const editor = within(screen.getByRole('dialog', { name: '添加模型' }))
  await user.click(editor.getByRole('combobox', { name: '模型 ID' }))
  expect(screen.getByRole('option', { name: 'mimo-v2.5-tts-voicedesign' })).toBeVisible()
  await user.click(screen.getByRole('option', { name: 'mimo-v2.5-tts' }))
  fireEvent.change(editor.getByLabelText('模型 ID'), { target: { value: 'custom-tts' } })
  expect(editor.queryByText('引擎默认')).not.toBeInTheDocument()
  expect(editor.queryByText('unknown')).not.toBeInTheDocument()
  expect(editor.getByRole('button', { name: '添加音色' })).toBeVisible()
  await user.click(editor.getByRole('button', { name: '保存' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ models: [expect.objectContaining({ id: 'custom-tts', tts: expect.objectContaining({ capabilityOverride: { presetVoices: [] } }) })] }), 'models')
})
it('saves voice languages from the secondary dialog and reopens them without submitting the model', async () => {
  const user = userEvent.setup(), onSave = vi.fn()
  const connection = { ...newConnection('mimo', 'TTS', 'mimo'), models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true }] }
  render(<CloudDetails connection={connection} creating={false} onSave={onSave} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '编辑模型 mimo-v2.5-tts' }))
  const editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
  await user.click(editor.getByRole('button', { name: '添加音色' }))
  await user.type(within(screen.getByRole('dialog', { name: '音色配置' })).getByLabelText('Voice ID'), 'custom')
  await user.click(within(screen.getByRole('dialog', { name: '音色配置' })).getByRole('button', { name: '保存' }))
  await user.click(editor.getByRole('button', { name: '详细设置 custom' }))
  let details = within(screen.getByRole('dialog', { name: '音色配置' }))
  details.getByRole('combobox', { name: '支持的语言' }).focus()
  await user.keyboard('{ArrowDown}')
  await user.click(screen.getByRole('option', { name: '英语' }))
  await user.keyboard('{Escape}')
  await user.click(details.getByRole('button', { name: '保存' }))
  expect(onSave).not.toHaveBeenCalled()
  await user.click(editor.getByRole('button', { name: '详细设置 custom' }))
  details = within(screen.getByRole('dialog', { name: '音色配置' }))
  expect(details.getByText('英语', { exact: true })).toBeVisible()
  details.getByRole('combobox', { name: '支持的语言' }).focus()
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('option', { name: '中文' })).toBeVisible()
  await user.keyboard('{Escape}')
  await user.click(details.getByRole('button', { name: '保存' }))
  await user.click(editor.getByRole('button', { name: '保存' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ models: [expect.objectContaining({ tts: expect.objectContaining({ capabilityOverride: { presetVoices: [{ id: 'custom', name: 'custom', languages: ['en'] }] } }) })] }), 'models')
})

it('keeps all language options for a custom voice on a model with unknown languages', async () => {
  const user = userEvent.setup()
  const connection = { ...newConnection('openai-tts-api', 'TTS', 'openai'), models: [{ id: 'custom-api-model', name: 'Custom', enabled: true, tts: { capabilityOverride: { presetVoices: [{ id: 'custom', name: 'Custom', languages: ['en'] }] } } }] }
  render(<CloudDetails connection={connection} creating={false} onSave={vi.fn()} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '编辑模型 custom-api-model' }))
  await user.click(screen.getByRole('button', { name: '详细设置 custom' }))
  const details = within(screen.getByRole('dialog', { name: '音色配置' }))
  expect(details.getByText('英语', { exact: true })).toBeVisible()
  details.getByRole('combobox', { name: '支持的语言' }).focus()
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('option', { name: '日语' })).toBeVisible()
})

it.each(astrBotSpeechPresets.filter(preset => preset.capability === 'TTS'))('starts $id with an empty model and only the add-voice control', async preset => {
  const user = userEvent.setup()
  render(<CloudDetails connection={newConnection(preset.id, 'TTS', preset.id)} creating onSave={vi.fn()} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  const editor = within(screen.getByRole('dialog', { name: '添加模型' }))
  expect(editor.getByLabelText('模型 ID')).toHaveValue('')
  expect(editor.queryAllByLabelText(/^Voice ID \d+$/)).toHaveLength(0)
  expect(editor.getByRole('button', { name: '添加音色' })).toBeVisible()
})
it('matches on input with a toast, allows removing every preset and preserves an empty saved selection', async () => {
  const user = userEvent.setup(), onSave = vi.fn()
  const notice = vi.spyOn(toast, 'showToast').mockReturnValue('matched')
  const connection = newConnection('mimo', 'TTS', 'mimo')
  const view = render(<CloudDetails connection={connection} creating={false} onSave={onSave} onCancel={vi.fn()} />)
  try {
    await user.click(screen.getByRole('button', { name: '添加模型' }))
    let editor = within(screen.getByRole('dialog', { name: '添加模型' }))
    fireEvent.change(editor.getByLabelText('模型 ID'), { target: { value: 'mimo-v2.5-tts' } })
    expect(editor.getByRole('button', { name: '保存' })).toBeDisabled()
    fireEvent.click(editor.getByRole('button', { name: '保存' }))
    expect(onSave).not.toHaveBeenCalled()
    await waitFor(() => expect(editor.queryAllByLabelText(/^Voice ID \d+$/)).toHaveLength(9))
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', description: '模型配置匹配成功' }))
    while (editor.queryAllByRole('button', { name: /^移除 / }).length) await user.click(editor.getAllByRole('button', { name: /^移除 / })[0])
    expect(editor.queryAllByLabelText(/^Voice ID \d+$/)).toHaveLength(0)
    expect(editor.getByRole('button', { name: '添加音色' })).toBeVisible()
    await user.click(editor.getByRole('button', { name: '保存' }))
    const saved = onSave.mock.calls.at(-1)![0]
    expect(saved.models[0].tts.presetVoiceIds).toEqual([])
    view.unmount()
    render(<CloudDetails connection={saved} creating={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '编辑模型 mimo-v2.5-tts' }))
    editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
    expect(editor.queryAllByLabelText(/^Voice ID \d+$/)).toHaveLength(0)
    fireEvent.change(editor.getByLabelText('模型 ID'), { target: { value: '' } })
    expect(editor.getByRole('button', { name: '添加音色' })).toBeVisible()
  } finally { notice.mockRestore() }
})

it('saves a smart-off OpenAI draft without an invisible preset default', async () => {
  const user = userEvent.setup(), onSave = vi.fn()
  render(<CloudDetails connection={newConnection('openai-tts-api', 'TTS', 'openai')} creating={false} onSave={onSave} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  const editor = within(screen.getByRole('dialog', { name: '添加模型' }))
  await user.click(editor.getByRole('switch', { name: '智能配置' }))
  fireEvent.change(editor.getByLabelText('模型 ID'), { target: { value: 'tts-1' } })
  await user.click(editor.getByRole('button', { name: '添加音色' }))
  await user.type(within(screen.getByRole('dialog', { name: '音色配置' })).getByLabelText('Voice ID'), 'custom')
  await user.click(within(screen.getByRole('dialog', { name: '音色配置' })).getByRole('button', { name: '保存' }))
  await user.click(editor.getByRole('button', { name: '保存' }))
  expect(onSave.mock.calls.at(-1)![0].models[0].tts).toMatchObject({ defaultVoiceRef: { kind: 'preset', modelBinding: 'cloud:openai-tts-api', voiceId: 'custom' }, presetVoiceIds: ['custom'] })
})
it('preserves saved inventory IDs missing from the offline catalog without inventing descriptors', async () => {
  const user = userEvent.setup(), onSave = vi.fn()
  const connection = { ...newConnection('mimo', 'TTS', 'mimo'), models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { presetVoiceIds: ['provider-new-voice'] } }] }
  render(<CloudDetails connection={connection} creating={false} onSave={onSave} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '编辑模型 mimo-v2.5-tts' }))
  const editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
  expect(editor.getByLabelText('Voice ID 1')).toHaveValue('provider-new-voice')
  await user.click(editor.getByRole('button', { name: '保存' }))
  expect(onSave.mock.calls.at(-1)![0].models[0].tts).toMatchObject({ presetVoiceIds: ['provider-new-voice'], capabilityOverride: { presetVoices: [] } })
})

it('uses model language options after replacing a fixed-language preset ID with a custom ID', async () => {
  const caps = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'test')
  caps.presetVoices = [{ id: 'english', name: 'English', languages: ['en'] }]
  function Editor() {
    const [rows, setRows] = useState(() => ttsVoiceDrafts(caps))
    return <TtsVoiceConfiguration rows={rows} onChange={setRows} selected={{ kind: 'engine-default' }} onSelect={vi.fn()} capabilities={caps} binding="test" />
  }
  render(<Editor />)
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('Voice ID 1'))
  await user.type(screen.getByLabelText('Voice ID 1'), 'custom')
  await user.click(screen.getByRole('button', { name: '详细设置 custom' }))
  const details = within(screen.getByRole('dialog', { name: '音色配置' }))
  details.getByRole('combobox', { name: '支持的语言' }).focus()
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('option', { name: '中文' })).toBeVisible()
})

it('inherits the new preset language when a renamed voice has an incompatible explicit selection', async () => {
  const caps = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'test')
  caps.languages = { mode: 'finite', values: ['en', 'ja'] }
  caps.presetVoices = [{ id: 'japanese', name: 'Japanese', languages: ['ja'] }]
  function Editor() {
    const [rows, setRows] = useState(() => ttsVoiceDrafts(caps, [{ id: 'custom', name: 'Custom', languages: ['en'] }], undefined, ['custom']))
    return <TtsVoiceConfiguration rows={rows} onChange={setRows} selected={{ kind: 'engine-default' }} onSelect={vi.fn()} capabilities={caps} binding="test" />
  }
  render(<Editor />)
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('Voice ID 1'))
  await user.type(screen.getByLabelText('Voice ID 1'), 'japanese')
  await user.click(screen.getByRole('button', { name: '详细设置 japanese' }))
  const details = within(screen.getByRole('dialog', { name: '音色配置' }))
  expect(details.getByText('日语', { exact: true })).toBeVisible()
  expect(details.queryByText('英语', { exact: true })).not.toBeInTheDocument()
})

it('opens an unsaved voice dialog from plus and leaves the list untouched on cancel', async () => {
  const caps = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'test')
  const changed = vi.fn()
  render(<TtsVoiceConfiguration rows={[]} onChange={changed} selected={{ kind: 'engine-default' }} onSelect={vi.fn()} capabilities={caps} binding="test" />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '添加音色' }))
  let details = within(screen.getByRole('dialog', { name: '音色配置' }))
  expect(details.getByLabelText('Voice ID')).toHaveValue('')
  expect(details.getByRole('button', { name: '保存' })).toBeDisabled()
  expect(changed).not.toHaveBeenCalled()
  await user.type(details.getByLabelText('Voice ID'), 'discarded')
  await user.click(details.getByRole('button', { name: '取消' }))
  expect(changed).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '添加音色' }))
  details = within(screen.getByRole('dialog', { name: '音色配置' }))
  expect(details.getByLabelText('Voice ID')).toHaveValue('')
  await user.type(details.getByLabelText('Voice ID'), 'new-voice')
  await user.click(details.getByRole('button', { name: '保存' }))
  expect(changed).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ id: 'new-voice', name: 'new-voice' })])
})

it('selects the first voice by default and updates the selector when its voice is removed or renamed', async () => {
  const caps = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'test')
  function Editor() {
    const [rows, setRows] = useState(() => ttsVoiceDrafts(caps))
    const [selected, setSelected] = useState<TtsVoiceRef>({ kind: 'engine-default' })
    return <TtsVoiceConfiguration rows={rows} onChange={setRows} selected={selected} onSelect={setSelected} capabilities={caps} binding="test" />
  }
  render(<Editor />)
  const user = userEvent.setup()
  expect(screen.getByRole('combobox', { name: '默认音色' })).toHaveTextContent('mimo_default')
  await user.click(screen.getByRole('combobox', { name: '默认音色' }))
  await user.click(await screen.findByRole('option', { name: 'Mia' }))
  expect(screen.getByRole('combobox', { name: '默认音色' })).toHaveTextContent('Mia')
  await user.click(screen.getByRole('button', { name: '移除 Mia' }))
  expect(screen.getByRole('combobox', { name: '默认音色' })).toHaveTextContent('mimo_default')
  await user.click(screen.getByRole('button', { name: '移除 mimo_default' }))
  expect(screen.getByRole('combobox', { name: '默认音色' })).toHaveTextContent('冰糖')
  await user.clear(screen.getByLabelText('Voice ID 1'))
  await user.type(screen.getByLabelText('Voice ID 1'), 'renamed')
  expect(screen.getByRole('combobox', { name: '默认音色' })).toHaveTextContent('renamed')
})
