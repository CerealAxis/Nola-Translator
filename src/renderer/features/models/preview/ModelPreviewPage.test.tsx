import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { actions, stores } from '@/store'
import * as store from '@/store'
import * as settingsActions from '@/store/settingsStore'
import myMemoryIcon from '@/assets/mymemory.svg'
import { DEFAULT_SETTINGS } from '../../../../shared/settings'
import { normalizeModelBinding } from '../../../../shared/model-gateway'
import { workspaceSpeechModel } from '../../../../shared/model-workspace'
import { configuredBatchSpeechModels } from '../../../../shared/model-availability'
import { customCredentialSlot } from '../../../../shared/custom-models'
import { offlineStore } from '@/store/offlineStore'
import { Routes } from '@/routes'
import ModelPreviewPage from './ModelPreviewPage'
import { configuredConnections, createWorkspaceConnection, saveWorkspaceConnection } from './model-workspace-settings'

vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))
const initialModels = stores.models.getState()
const initialSettings = stores.settings.getState()
const initialOffline = offlineStore.getState()
beforeEach(() => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN',
    modelPolicy: { enabled: { 'mt:cloud:index-translate': true }, defaults: {}, selections: {} } } })
  vi.spyOn(settingsActions, 'updateSettings').mockImplementation(async patch => {
    const current = stores.settings.getState().settings!
    stores.settings.setState({ settings: { ...settingsActions.mergeSettings(current, patch),
      realtime: patch.realtime ? { ...DEFAULT_SETTINGS.realtime!, ...current.realtime, ...patch.realtime } : current.realtime,
    } })
  })
  stores.models.setState({ resources: [
    { resourceId: 'qwen3-asr-0.6b-hf', kind: 'recognitionModel', provider: 'qwen3-asr',
      name: 'Qwen3-ASR 0.6B', description: '', languages: [], installed: false, installedBytes: 0, state: 'idle', cancellable: false },
    { resourceId: 'sensevoice-small', kind: 'recognitionModel', provider: 'sensevoice',
      name: 'SenseVoiceSmall', description: '', languages: [], installed: true, installedBytes: 936_694_116, state: 'idle', cancellable: false },
  ], loaded: true })
})
afterEach(() => {
  cleanup()
  stores.models.setState(initialModels)
  stores.settings.setState(initialSettings)
  offlineStore.setState(initialOffline)
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function chooseCategory(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: '模型分类' }))
  await user.click(await screen.findByRole('option', { name }))
}

it('opens search, download management, local import and runtime settings from the new page', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(actions.models, 'searchHub').mockResolvedValue({ query: '', candidates: 0, models: [], rateLimited: false })
  window.history.replaceState(null, '', '#/model-management')
  render(<Routes pages={{ 'model-management': () => <ModelPreviewPage />, settings: () => <p>Runtime settings</p> }} />)
  await chooseCategory(user, '文本翻译')
  expect(screen.getByRole('button', { name: 'Index Translate', pressed: true })).toBeVisible()

  await user.click(screen.getByRole('tab', { name: '搜索' }))
  expect(await screen.findByRole('searchbox')).toBeVisible()
  expect(window.location.hash).toBe('#/model-management/search')
  await user.click(screen.getByRole('tab', { name: '下载管理' }))
  expect(await screen.findByText('没有进行中的下载')).toBeVisible()
  expect(window.location.hash).toBe('#/model-management/downloads')
  await user.click(screen.getByRole('tab', { name: '模型来源' }))
  expect(await screen.findByRole('button', { name: 'Index Translate', pressed: true })).toBeVisible()
  expect(screen.getByRole('combobox', { name: '模型分类' })).toHaveTextContent('文本翻译')

  await user.click(screen.getByRole('button', { name: '本地导入' }))
  expect(await screen.findByRole('dialog', { name: '本地导入' })).toBeVisible()
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: '推理环境配置' }))
  expect(await screen.findByText('Runtime settings')).toBeVisible()
  expect(window.location.hash).toBe('#/settings/engine?component=engine')
})

async function addChatModel(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  const dialog = within(screen.getByRole('dialog', { name: '添加模型' }))
  await user.click(dialog.getByRole('switch', { name: '智能配置' }))
  fireEvent.change(dialog.getByLabelText('模型 ID'), { target: { value: id } })
  fireEvent.change(dialog.getByLabelText('上下文窗口'), { target: { value: '32768' } })
  fireEvent.change(dialog.getByLabelText('最大输出 Token'), { target: { value: '4096' } })
  await user.click(dialog.getByRole('button', { name: '保存' }))
}

it('adds ChatGPT as a dialogue supplier and saves a model returned for the authenticated account', async () => {
  const user = userEvent.setup()
  const account = { email: 'user@example.test', name: '', authorized: true }
  const chatGptPlan = vi.fn(async ({ action }: { action: string }) =>
    action === 'sign-in' ? { account } : action === 'models' ? { models: [{ id: 'plan-model', name: 'Plan Model' }] } : {})
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: { chatGptPlan } } as unknown as ReturnType<typeof store.getBridge>)
  render(<ModelPreviewPage />)
  await user.click(screen.getByRole('button', { name: '新增' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue with ChatGPT' }))
  expect(screen.getByRole('heading', { name: 'ChatGPT' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '连接设置' })).toBeVisible()
  expect(screen.queryByText('API 密钥')).not.toBeInTheDocument()
  expect(screen.queryByText('此供应商使用你授权的 ChatGPT 订阅额度。')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '名称' }))
  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: '个人 ChatGPT' } })
  await user.click(screen.getByRole('button', { name: '使用 ChatGPT 继续' }))
  expect(await screen.findByText('user@example.test')).toBeVisible()
  const add = await screen.findByRole('button', { name: '添加模型' })
  await waitFor(() => expect(add).toBeEnabled())
  await user.click(add)
  const dialog = within(await screen.findByRole('dialog'))
  await user.click(dialog.getByRole('checkbox', { name: 'Plan Model' }))
  await user.click(dialog.getByRole('button', { name: '添加所选模型' }))
  await waitFor(() => expect(stores.settings.getState().settings?.modelWorkspace?.connections[0])
    .toMatchObject({ name: '个人 ChatGPT', service: 'chatgpt-plan', protocol: 'chat-responses', models: [{ id: 'plan-model', name: 'Plan Model' }] }))
})

it('lists same-name sources without showing their endpoints in the sidebar', async () => {
  const user = userEvent.setup()
  const endpoint = 'https://api.example.test/v1'
  const first = { ...createWorkspaceConnection('compatible', 'LLM'), name: 'OpenAI Compatible', endpoint }
  const second = { ...first, id: createWorkspaceConnection('compatible', 'LLM').id }
  await saveWorkspaceConnection(first)
  await saveWorkspaceConnection(second)
  render(<ModelPreviewPage />)

  const rail = within(screen.getByRole('complementary', { name: '模型来源' }))
  const sources = rail.getAllByRole('button', { name: 'OpenAI Compatible' })
  expect(sources).toHaveLength(2)
  expect(rail.queryByText(endpoint)).not.toBeInTheDocument()
  await user.click(sources[1])
  expect(sources[1]).toHaveAttribute('aria-pressed', 'true')
})

it('persists a provider, its icon and model edits, and shares its credential across profiles', async () => {
  const user = userEvent.setup()
  const setKey = vi.spyOn(actions.models, 'setTranslationCredential').mockImplementation(async (slot, key) => {
    stores.models.setState(state => ({ credentials: { ...state.credentials, [slot]: !!key } }))
  })
  const { unmount } = render(<ModelPreviewPage />)
  await user.click(screen.getByRole('button', { name: '新增' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OpenAI Compatible' }))
  fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'test-secret' } })
  await user.click(screen.getByRole('button', { name: '更换图标' }))
  const icons = within(screen.getByRole('dialog', { name: '更换图标' }))
  fireEvent.change(icons.getByRole('searchbox'), { target: { value: 'DeepSeek' } })
  await user.click(icons.getByRole('button', { name: 'DeepSeek' }))
  await user.click(icons.getByRole('button', { name: '完成' }))
  await user.click(screen.getByRole('button', { name: '添加模型来源' }))
  await addChatModel(user, 'test-chat-a')
  await addChatModel(user, 'test-chat-b')

  const current = stores.settings.getState().settings!
  const models = current.translation.customModels!
  expect(models.map(model => model.model)).toEqual(['test-chat-a', 'test-chat-b'])
  const slot = customCredentialSlot(models[0].id)
  expect(customCredentialSlot(models[1].id)).toBe(slot)
  expect(setKey).toHaveBeenCalledExactlyOnceWith(slot, 'test-secret')
  expect(current.modelWorkspace?.connections[0].icon).toBe('DeepSeek')
  expect(JSON.stringify(current)).not.toContain('test-secret')
  unmount()

  render(<ModelPreviewPage />)
  expect(screen.getByLabelText('API 密钥')).toHaveValue('')
  await user.click(screen.getByRole('switch', { name: '启用 test-chat-a' }))
  expect(stores.settings.getState().settings?.modelPolicy?.enabled[`llm:custom:${models[0].id}`]).toBe(false)
  await user.click(screen.getByRole('button', { name: '编辑模型 test-chat-b' }))
  const editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
  fireEvent.change(editor.getByLabelText('最大输出 Token'), { target: { value: '8192' } })
  await user.click(editor.getByRole('button', { name: '保存' }))
  expect(stores.settings.getState().settings?.translation.customModels?.[1].maxOutputTokens).toBe(8192)
  await user.click(screen.getByRole('button', { name: '删除模型 test-chat-a' }))
  await user.click(screen.getByRole('button', { name: '确定' }))
  expect(setKey).toHaveBeenCalledTimes(1)
  expect(stores.settings.getState().settings?.translation.customModels?.map(model => model.model)).toEqual(['test-chat-b'])

  await user.click(screen.getByRole('button', { name: '移除 OpenAI Compatible' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '移除' }))
  expect(setKey).toHaveBeenLastCalledWith(slot, '')
  expect(stores.settings.getState().settings?.translation.customModels).toEqual([])
  expect(screen.getByText('尚未添加模型来源')).toBeVisible()
}, 15_000)

it.each([
  { category: 'ASR', service: 'aliyun', model: 'fun-asr-realtime', slot: 'aliyun-asr', binding: 'asr:cloud:aliyun' },
  { category: 'ASR', service: 'minimax', model: 'asr-1.0', slot: 'minimax-asr', binding: 'asr:cloud:minimax' },
  { category: 'TTS', service: 'mimo', model: 'mimo-v2.5-tts', slot: 'mimo-tts', binding: 'tts:cloud:mimo-v2.5-tts' },
  { category: 'MT', service: 'index', model: 'Index-Translate-35B-A3B', binding: 'mt:cloud:index-translate' },
  { category: 'MT', service: 'mymemory', model: 'MyMemory', binding: 'mt:cloud:mymemory' },
  { category: 'MT', service: 'microsoft', model: 'Microsoft Translator', binding: 'mt:cloud:microsoft' },
  { category: 'MT', service: 'google', model: 'Google Translate', binding: 'mt:cloud:google' },
  { category: 'S2S', service: 'aliyun', model: 'qwen3.5-livetranslate-flash-realtime', slot: 'aliyun-asr' },
] as const)('connects $category/$service to its existing runtime configuration', async scenario => {
  const setKey = vi.spyOn(actions.models, 'setTranslationCredential').mockResolvedValue()
  const connection = {
    ...createWorkspaceConnection(scenario.service, scenario.category),
    workspace: 'test-workspace', region: 'ap-southeast-1', key: 'slot' in scenario ? 'test-key' : '',
    models: [{ id: scenario.model, name: scenario.model, enabled: true, ...(scenario.service === 'mimo' ? { voice: 'Mia' } : {}) }],
  }
  await saveWorkspaceConnection(connection)
  let current = stores.settings.getState().settings!
  if ('slot' in scenario) expect(setKey).toHaveBeenCalledExactlyOnceWith(scenario.slot, 'test-key')
  else expect(setKey).not.toHaveBeenCalled()
  if (scenario.binding) expect(current.modelPolicy?.enabled[scenario.binding]).toBe(true)
  else expect(current.realtime).toMatchObject({ s2sModel: scenario.model, defaultPipeline: 's2s' })
  if (scenario.service === 'aliyun') expect(current.recognition).toMatchObject({ aliyunWorkspaceId: 'test-workspace', aliyunRegion: 'ap-southeast-1' })
  if (scenario.service === 'mimo') expect(current.synthesis.voice).toBe('Mia')
  await saveWorkspaceConnection({ ...connection, key: '', models: [] }, connection, true)
  current = stores.settings.getState().settings!
  expect(current.modelWorkspace?.connections).toEqual([])
  if (scenario.binding) expect(current.modelPolicy?.enabled[scenario.binding]).toBe(false)
  else expect(current.realtime).toMatchObject({ s2sModel: null, defaultPipeline: 'cascade' })
})

it('removes the Alibaba ASR source without reviving it from the speech translation credential', async () => {
  const setKey = vi.spyOn(actions.models, 'setTranslationCredential').mockResolvedValue()
  const asr = { ...createWorkspaceConnection('aliyun', 'ASR'), workspace: 'shared-workspace',
    models: [{ id: 'fun-asr-realtime', name: 'Fun-ASR', enabled: true }] }
  const s2s = { ...createWorkspaceConnection('aliyun', 'S2S'), workspace: asr.workspace,
    models: [{ id: 'qwen3.5-livetranslate-flash-realtime', name: 'LiveTranslate', enabled: true }] }
  await saveWorkspaceConnection(asr)
  await saveWorkspaceConnection(s2s)
  await saveWorkspaceConnection({ ...asr, models: [] }, asr, true, true)
  const credentials = { ...stores.models.getState().credentials, 'aliyun-asr': true }
  const connections = configuredConnections(stores.settings.getState().settings!, credentials)
  expect(connections.some(connection => connection.id === asr.id)).toBe(false)
  expect(connections.some(connection => connection.id === s2s.id)).toBe(true)
  expect(setKey).not.toHaveBeenCalled()
})

it('shows language chips in each saved cloud ASR model editor', async () => {
  const user = userEvent.setup()
  const providers = [
    { service: 'aliyun', name: '阿里云', model: 'fun-asr-realtime', language: '荷兰语' },
    { service: 'minimax', name: 'MiniMax', model: 'asr-1.0', language: '粤语' },
    { service: 'whisper-api', name: 'Whisper(API)', model: 'whisper-1', language: '法语' },
    { service: 'mimo-stt-api', name: 'MiMo STT(API)', model: 'mimo-v2.5-asr', language: '四川话' },
  ] as const
  for (const { service, model } of providers) {
    await saveWorkspaceConnection({ ...createWorkspaceConnection(service, 'ASR'),
      workspace: 'test-workspace', models: [{ id: model, name: model, enabled: true }] })
  }
  window.history.replaceState(null, '', '#/model-management')
  render(<Routes pages={{ 'model-management': () => <ModelPreviewPage /> }} />)
  await chooseCategory(user, '语音识别')
  const sources = within(screen.getByRole('complementary'))
  for (const { name, model, language, service } of providers) {
    fireEvent.click(sources.getByRole('button', { name }))
    expect(screen.queryByText('支持的识别语言')).toBeNull()
    if (service === 'aliyun' || service === 'minimax') expect(screen.queryByRole('button', { name: '添加模型' })).toBeNull()
    else expect(screen.getByRole('button', { name: '添加模型' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: `编辑模型 ${model}` }))
    const editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
    expect(editor.getByText('支持的识别语言')).toBeVisible()
    expect(editor.getByText(language, { exact: true })).toBeVisible()
    fireEvent.click(editor.getByRole('button', { name: '取消' }))
  }
  await chooseCategory(user, '语音合成')
  expect(screen.queryByText('支持的识别语言')).toBeNull()
}, 15_000)

it('filters cloud and local templates together within the selected capability', async () => {
  const manage = vi.spyOn(actions.models, 'manageResource').mockImplementation(async (id, action) => {
    const record = stores.models.getState().resources.find(item => item.resourceId === id)!
    return { ...record, state: action === 'install' ? 'running' : 'idle' }
  })
  const user = userEvent.setup()
  render(<ModelPreviewPage />)
  await user.click(screen.getByRole('combobox', { name: '模型分类' }))
  expect(await screen.findAllByRole('option')).toHaveLength(8)
  await user.click(screen.getByRole('option', { name: '语音识别' }))
  const sources = within(screen.getByRole('complementary'))
  expect(sources.getByRole('button', { name: 'SenseVoiceSmall 系列' })).toBeVisible()
  expect(sources.queryByRole('button', { name: 'Qwen3-ASR 系列' })).toBeNull()
  await user.click(screen.getByRole('button', { name: '新增' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('button', { name: '阿里云' })).toBeVisible()
  expect(dialog.getByRole('button', { name: 'Qwen3-ASR 系列' })).toBeVisible()
  expect(dialog.getByRole('heading', { name: '本地模型' })).toAppearBefore(dialog.getByRole('heading', { name: '云端供应商' }))
  expect(dialog.queryByRole('button', { name: 'OpenAI Compatible' })).toBeNull()
  expect(dialog.queryByRole('button', { name: 'Fun-ASR 系列' })).toBeNull()
  fireEvent.change(dialog.getByRole('searchbox'), { target: { value: 'qwen' } })
  expect(dialog.queryByRole('button', { name: '阿里云' })).toBeNull()
  await user.click(dialog.getByRole('button', { name: 'Qwen3-ASR 系列' }))

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(sources.getByRole('button', { name: 'Qwen3-ASR 系列', pressed: true })).toBeVisible()
  expect(screen.getByText('尚未安装模型')).toBeVisible()
  await chooseCategory(user, '对话')
  await chooseCategory(user, '语音识别')
  await user.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Qwen3-ASR 系列' }))

  await user.click(screen.getByRole('button', { name: '添加模型' }))
  await user.click(within(screen.getByRole('dialog', { name: '添加模型' })).getByRole('button', { name: '取消' }))
  expect(screen.getByText('尚未安装模型')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  const manual = within(screen.getByRole('dialog', { name: '添加模型' }))
  await user.click(manual.getByRole('button', { name: '手动下载' }))
  expect(offlineStore.getState().downloadModelId).toBe('qwen3-asr-0.6b-hf')
  act(() => offlineStore.setState(initialOffline))
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  const download = within(screen.getByRole('dialog', { name: '添加模型' }))
  expect(download.getByText('可尝试')).toBeVisible()
  await user.click(download.getByRole('button', { name: '安装' }))
  expect(manage).toHaveBeenCalledExactlyOnceWith('qwen3-asr-0.6b-hf', 'install', 'huggingface')
  expect(screen.queryByRole('dialog', { name: '添加模型' })).toBeNull()
  expect(screen.getByRole('heading', { name: '已安装的模型' })).toBeVisible()
  expect(stores.models.getState().resources[0].installed).toBe(false)
  expect(screen.queryByText('Qwen3-ASR 0.6B')).not.toBeInTheDocument()
  act(() => stores.models.setState(state => ({
    resources: state.resources.map(record => record.resourceId === 'qwen3-asr-0.6b-hf'
      ? { ...record, state: 'running', phase: 'download' } : record),
  })))
  const row = screen.getByText('Qwen3-ASR 0.6B').closest('li')!
  expect(within(row).getByText('下载中')).toBeVisible()
  expect(within(row).queryByRole('button', { name: '删除模型 Qwen3-ASR 0.6B' })).toBeNull()
  expect(screen.queryByRole('link', { name: '查看进度' })).toBeNull()
  act(() => stores.models.setState(state => ({
    resources: state.resources.map(record => record.resourceId === 'qwen3-asr-0.6b-hf'
      ? { ...record, installed: true, state: 'idle', phase: undefined } : record),
  })))
  expect(within(row).queryByText('下载中')).toBeNull()
  await user.click(screen.getByRole('button', { name: '删除模型 Qwen3-ASR 0.6B' }))
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '移除' }))
  expect(manage).toHaveBeenLastCalledWith('qwen3-asr-0.6b-hf', 'remove')
}, 15_000)

it('keeps provider connections inside the type where they were added', async () => {
  const user = userEvent.setup()
  render(<ModelPreviewPage />)
  await user.click(screen.getByRole('button', { name: '新增' }))
  const llmPicker = within(screen.getByRole('dialog'))
  expect(llmPicker.queryByText('本地模型')).toBeNull()
  expect(llmPicker.queryByRole('button', { name: '阿里云' })).toBeNull()
  await user.click(llmPicker.getByRole('button', { name: 'OpenAI Compatible' }))
  await user.click(screen.getByRole('button', { name: '添加模型来源' }))
  expect(within(screen.getByRole('complementary')).getByRole('button', { name: 'OpenAI Compatible' })).toBeVisible()
  await chooseCategory(user, '语音同传')
  expect(screen.getByText('尚未添加模型来源')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '新增' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('button', { name: '阿里云' })).toBeVisible()
  expect(dialog.queryByText('本地模型')).toBeNull()
})

it('opens distinct China and international MiniMax presets', async () => {
  const user = userEvent.setup()
  render(<ModelPreviewPage />)
  await user.click(screen.getByRole('button', { name: '新增' }))
  const dialog = within(screen.getByRole('dialog'))
  const services = dialog.getAllByRole('button').flatMap(button => button.dataset.service ?? [])
  expect(services.slice(0, 21)).toEqual([
    'chatgpt-plan', 'openai', 'openai-responses', 'anthropic', 'gemini-native', 'gemini',
    'zhipu', 'zai', 'moonshot', 'moonshot-global', 'kimi-code', 'kimi-code-global',
    'qianwen', 'qwencloud', 'modelscope', 'xiaomi', 'xiaomi-token-plan',
    'minimax-chat', 'minimax-chat-global', 'minimax-token-plan', 'minimax-token-plan-global',
  ])
  expect(services.slice(21)).toEqual([
    'deepseek', 'deepseek-responses', 'deepseek-anthropic', 'volcengine-ark', 'byteplus-modelark', 'byteplus-modelark-eu',
    'tencent-tokenhub', 'tencent-tokenhub-global', 'baidu-qianfan', 'baidu-qianfan-global', 'stepfun', 'stepfun-global',
    'longcat', 'bailing', 'astron-maas', 'streamlake', 'streamlake-global', 'xai', 'meta-model-api', 'mistral',
    'azure-openai', 'microsoft-foundry', 'aws-bedrock', 'nvidia', 'groq', 'openrouter', 'siliconflow', 'compatible',
  ])
  expect(dialog.getByRole('button', { name: 'MiniMax' })).toHaveAttribute('data-service', 'minimax-chat')
  expect(dialog.getByRole('button', { name: 'MiniMax Token Plan' })).toHaveAttribute('data-service', 'minimax-token-plan')
  expect(dialog.getByRole('button', { name: 'MiniMax Token Plan (Global)' })).toHaveAttribute('data-service', 'minimax-token-plan-global')
  const tokenPlan = dialog.getByRole('button', { name: 'MiniMax Token Plan (Global)' })
  expect(tokenPlan).not.toHaveAttribute('title')
  await user.hover(tokenPlan)
  expect(await screen.findByRole('tooltip')).toHaveTextContent('MiniMax Token Plan (Global)')
  await user.unhover(tokenPlan)
  const kimi = dialog.getByRole('button', { name: 'Kimi Global' })
  await waitFor(() => expect(kimi.querySelector('svg')).toHaveAttribute('fill', 'currentColor'))
  await user.click(dialog.getByRole('button', { name: 'MiniMax (Global)' }))
  expect(screen.getByLabelText('接口地址')).toHaveValue('https://api.minimax.io/v1')
})

it('shows the MyMemory mark in the translation source picker', async () => {
  const user = userEvent.setup()
  render(<ModelPreviewPage />)
  await chooseCategory(user, '文本翻译')
  await user.click(screen.getByRole('button', { name: '新增' }))
  const button = within(screen.getByRole('dialog')).getByRole('button', { name: 'MyMemory' })
  expect(button.querySelector('img')).toHaveAttribute('src', myMemoryIcon)
  await user.click(button)
  const titleMark = screen.getByRole('button', { name: '更换图标' }).querySelector('img')
  expect(titleMark).toHaveAttribute('width', '20')
  expect(titleMark).toHaveAttribute('height', '20')
})

it('keeps local chat settings after reopening the model editor', async () => {
  const user = userEvent.setup()
  stores.models.setState({ resources: [{
    resourceId: 'qwen35-0.8b-q4-k-m', kind: 'translationModel', provider: 'llama.cpp',
    name: 'Qwen3.5', description: '', languages: ['en'], installed: true, installedBytes: 1,
    state: 'idle', cancellable: false,
  }] })
  render(<ModelPreviewPage />)
  const open = () => user.click(screen.getByRole('button', { name: '编辑模型 Qwen3.5' }))
  await open()
  let dialog = within(screen.getByRole('dialog', { name: '编辑模型' }))
  fireEvent.change(dialog.getByLabelText('上下文窗口'), { target: { value: '8192' } })
  fireEvent.change(dialog.getByLabelText('最大输出 Token'), { target: { value: '1024' } })
  await user.click(dialog.getByRole('button', { name: '移除推理等级 1' }))
  await user.click(dialog.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑模型' })).toBeNull())
  expect(stores.settings.getState().settings?.modelWorkspace?.localChat?.['qwen35-0.8b-q4-k-m'])
    .toEqual({ contextWindow: 8192, maxOutputTokens: 1024, reasoningLevels: ['enabled'] })
  await open()
  dialog = within(screen.getByRole('dialog', { name: '编辑模型' }))
  expect(dialog.getByLabelText('上下文窗口')).toHaveValue(8192)
  expect(dialog.getByRole('textbox', { name: '推理等级（从低到高） 1' })).toHaveValue('enabled')
})

it('preserves an endpoint autosave and a model toggle submitted while it is pending', async () => {
  const user = userEvent.setup()
  const update = vi.mocked(settingsActions.updateSettings)
  const apply = update.getMockImplementation()!
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  update.mockImplementationOnce(async patch => { await pending; await apply(patch) })
  render(<ModelPreviewPage />)
  await chooseCategory(user, '文本翻译')
  const endpoint = screen.getByLabelText('接口地址')
  await user.click(endpoint)
  fireEvent.change(endpoint, { target: { value: 'https://proxy.example/v1' } })
  await user.click(screen.getByRole('switch', { name: /启用 Index-Translate/ }))
  expect(update).toHaveBeenCalledOnce()
  release()
  await waitFor(() => {
    const saved = stores.settings.getState().settings!
    expect(saved.translation.providerOverrides?.['index-translate']?.endpoint).toBe('https://proxy.example/v1')
    expect(saved.modelPolicy?.enabled['mt:cloud:index-translate']).toBe(false)
  })
})

it('opens the local Index-Translate details independently of the cloud connection', async () => {
  const user = userEvent.setup()
  stores.models.setState({ resources: [{
    resourceId: 'index-translate-2b-q4-k-m', kind: 'translationModel', provider: 'index-translate',
    name: 'Index-Translate 2B Q4_K_M', description: '', languages: [], installed: false, installedBytes: 0, state: 'idle', cancellable: false,
  }] })
  render(<ModelPreviewPage />)
  await chooseCategory(user, '文本翻译')
  await user.click(screen.getByRole('button', { name: '新增' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Index-Translate 系列' }))

  const sources = within(screen.getByRole('complementary'))
  const local = sources.getByRole('button', { name: 'Index-Translate 系列' })
  const cloud = sources.getByRole('button', { name: 'Index Translate' })
  expect(local).toHaveAttribute('aria-pressed', 'true')
  expect(cloud).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('heading', { name: '已安装的模型' })).toBeVisible()
  expect(screen.queryByText('接口地址')).toBeNull()

  await user.click(cloud)
  expect(screen.getByText('接口地址')).toBeVisible()
  await user.click(local)
  expect(screen.getByRole('button', { name: '添加模型' })).toBeVisible()
})

it('adds Whisper with the AstrBot name and exposes a callable batch ASR model only while enabled', async () => {
  const user = userEvent.setup()
  const setKey = vi.spyOn(actions.models, 'setTranslationCredential').mockImplementation(async (slot, key) => {
    stores.models.setState(state => ({ credentials: { ...state.credentials, [slot]: !!key } }))
  })
  render(<ModelPreviewPage />)
  await chooseCategory(user, '语音识别')
  await user.click(screen.getByRole('button', { name: '新增' }))
  const picker = within(screen.getByRole('dialog'))
  expect(picker.queryByRole('button', { name: 'Whisper(Local)' })).toBeNull()
  await user.click(picker.getByRole('button', { name: 'Whisper(API)' }))
  fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'test-whisper-key' } })
  await user.click(screen.getByRole('button', { name: '添加模型来源' }))
  expect(setKey).toHaveBeenCalledExactlyOnceWith('cloud-model:ASR-whisper-api', 'test-whisper-key')
  const list = () => configuredBatchSpeechModels(stores.settings.getState().settings!, stores.models.getState().credentials)
  expect(list()).toContainEqual(expect.objectContaining({ name: 'whisper-1', binding: 'cloud:whisper-api' }))
  expect(JSON.stringify(stores.settings.getState().settings)).not.toContain('test-whisper-key')
  await user.click(screen.getByRole('switch', { name: '启用 whisper-1' }))
  expect(list()).toEqual([])
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  const editor = within(screen.getByRole('dialog', { name: '添加模型' }))
  fireEvent.change(editor.getByLabelText('模型 ID'), { target: { value: 'custom-asr' } })
  await user.click(editor.getByRole('button', { name: '保存' }))
  const [custom] = list()
  expect(custom).toMatchObject({ name: 'custom-asr', binding: expect.stringMatching(/^cloud:whisper-api:/) })
  expect(normalizeModelBinding('asr', custom.binding)).toBe(custom.binding)
  const [configured] = stores.settings.getState().settings!.modelWorkspace!.connections
  expect(workspaceSpeechModel(configured, custom.binding)).toMatchObject({ id: 'custom-asr' })
  expect(workspaceSpeechModel({ ...configured, models: configured.models.slice(1) }, 'cloud:whisper-api')).toBeUndefined()
})

it('shows a single MiMo TTS(API) source for a legacy configured MiMo connection', async () => {
  const user = userEvent.setup()
  const oldConnection = createWorkspaceConnection('mimo', 'TTS')
  await saveWorkspaceConnection({ ...oldConnection, name: 'Xiaomi MiMo',
    endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    models: [{ id: 'mimo-v2.5-tts', name: 'mimo-v2.5-tts', enabled: true, voice: 'Mia' }] })
  render(<ModelPreviewPage />)
  await chooseCategory(user, '语音合成')
  expect(within(screen.getByRole('complementary')).getByRole('button', { name: 'MiMo TTS(API)' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '新增' }))
  const picker = within(screen.getByRole('dialog'))
  expect(picker.getAllByRole('button', { name: 'MiMo TTS(API)' })).toHaveLength(1)
  await user.click(picker.getByRole('button', { name: 'MiMo TTS(API)' }))
  expect(screen.getByLabelText('接口地址')).toHaveValue('https://api.xiaomimimo.com/v1')
  expect(screen.getByText('Mia')).toBeVisible()
})

it.each([
  ['MiniMax Token Plan', 'https://proxy.example/anthropic', 'Anthropic Messages', 'demo-minimax'],
  ['自定义接口', 'https://proxy.example/v1', 'OpenAI Chat Completions', 'demo-custom'],
  ['Gemini Compatible', 'https://proxy.example/gemini', 'Gemini API', 'demo-gemini'],
] as const)('configures models and edits the connection before the first save for %s', async (provider, endpoint, format, model) => {
  const user = userEvent.setup()
  const setKey = vi.spyOn(actions.models, 'setTranslationCredential').mockImplementation(async (slot, key) => {
    stores.models.setState(state => ({ credentials: { ...state.credentials, [slot]: !!key } }))
  })
  const { unmount } = render(<ModelPreviewPage />)
  await user.click(screen.getByRole('button', { name: '新增' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: provider }))
  expect(screen.getByRole('combobox', { name: 'API 格式' })).toHaveTextContent(format)
  fireEvent.change(screen.getByLabelText('接口地址'), { target: { value: endpoint } })
  fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'test-user-key' } })
  await addChatModel(user, model)
  expect(screen.getByText(model)).toBeVisible()
  expect(setKey).not.toHaveBeenCalled()
  expect(stores.settings.getState().settings?.modelWorkspace?.connections ?? []).toEqual([])
  await user.click(screen.getByRole('button', { name: '添加模型来源' }))
  expect(stores.settings.getState().settings?.translation.customModels?.[0]).toMatchObject({ endpoint, model })
  expect(setKey).toHaveBeenCalledOnce()
  unmount()
  render(<ModelPreviewPage />)
  expect(screen.getByLabelText('接口地址')).toHaveValue(endpoint)
  expect(screen.getByText(model)).toBeVisible()
})

it('adds another MiMo model and lets the user choose or type a voice', async () => {
  const user = userEvent.setup()
  const source = createWorkspaceConnection('mimo', 'TTS')
  await saveWorkspaceConnection({ ...source,
    models: [{ id: 'mimo-v2.5-tts', name: 'mimo-v2.5-tts', enabled: true, voice: 'mimo_default' }],
  })
  render(<ModelPreviewPage />)
  await chooseCategory(user, '语音合成')
  await user.click(screen.getByRole('button', { name: '编辑模型 mimo-v2.5-tts' }))
  const editor = within(screen.getByRole('dialog', { name: '编辑模型' }))
  const voice = editor.getByRole('combobox', { name: '音色' })
  await user.clear(voice)
  await user.type(voice, 'private-voice')
  expect(voice).toHaveValue('private-voice')
  await user.keyboard('{Tab}')
  await user.click(editor.getByRole('button', { name: '选择预设音色' }))
  await user.click(await screen.findByRole('option', { name: 'Chloe' }))
  expect(editor.getByLabelText('音色')).toHaveValue('Chloe')
  await user.click(editor.getByRole('button', { name: '保存' }))
  await user.click(screen.getByRole('button', { name: '添加模型' }))
  const add = within(screen.getByRole('dialog', { name: '添加模型' }))
  fireEvent.change(add.getByLabelText('模型 ID'), { target: { value: 'custom-tts' } })
  fireEvent.change(add.getByLabelText('音色'), { target: { value: 'custom-voice' } })
  await user.click(add.getByRole('button', { name: '保存' }))
  expect(stores.settings.getState().settings?.modelWorkspace?.connections[0].models).toEqual([
    expect.objectContaining({ id: 'mimo-v2.5-tts', voice: 'Chloe' }),
    expect.objectContaining({ id: 'custom-tts', voice: 'custom-voice', profileId: expect.any(String) }),
  ])
})
