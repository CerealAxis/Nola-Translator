import { cleanup, fireEvent, render, renderHook, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { actions, stores } from '@/store'
import { DEFAULT_SETTINGS, MIMO_TTS_BINDING } from '../../../shared/settings'
import { ModelsPage } from './ModelsPage'
import { CloudModelDialog, cloudModelsOf, removeCloudModel } from './CloudModels'
import { LANGUAGE_CODES } from '../../../shared/languages'
import { SOURCE_LANGUAGE_OPTIONS } from '../../../shared/settings'
import { useModelOptions } from '../../model-options'
import * as settingsActions from '@/store/settingsStore'
import * as storeModule from '@/store'
import type { NolaBridge } from '@/bridge'
import { mergeModelPolicy } from '../../../shared/model-policy'
import { OverlayPage } from '../overlay/OverlayPage'

// Publisher avatars pull in an emoji picker with browser-only JSON imports.
vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))

const initialModels = stores.models.getState()
const initialSettings = stores.settings.getState()
beforeEach(() => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, uiLanguage: 'zh-CN' } })
  stores.models.setState({ ...initialModels, loaded: true, loading: false, error: null, resources: [{
    resourceId: 'sensevoice-small', name: 'SenseVoiceSmall', kind: 'recognitionModel',
    provider: 'sensevoice', description: '', languages: [], installed: true, installedBytes: 100,
    state: 'idle', cancellable: false,
  }] })
})
afterEach(() => { cleanup(); stores.models.setState(initialModels); stores.settings.setState(initialSettings); vi.restoreAllMocks() })

const section = (name: string) => within(screen.getByRole('heading', { name }).closest('section')!)

it('manages OCR model details and deletion within model management', () => {
  stores.models.setState({ resources: [{
    resourceId: 'pp-ocrv5-mobile-onnx', kind: 'ocrModel', provider: 'onnx', name: 'PP-OCRv5 mobile',
    description: '', languages: ['zh', 'en', 'ja', 'ko'], installed: true, installedBytes: 34939630,
    state: 'idle', cancellable: false,
  }] })
  render(<ModelsPage />)
  const card = screen.getByText('PP-OCRv5 mobile').closest('[data-slot="card"]')!
  fireEvent.click(within(card as HTMLElement).getByRole('button', { name: '开始配置' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: '删除模型' })).toBeInTheDocument()
  expect(within(dialog).queryByText('本地加载器')).not.toBeInTheDocument()
  expect(within(card as HTMLElement).queryByRole('button', { name: '屏幕翻译' })).not.toBeInTheDocument()
})

it('shows the synthesis default and initializes its voice from discovered metadata', async () => {
  const modelId = 'tts-qwen3-tts-crisp-0.6b-base-q8-0'
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, synthesis: { modelId, voice: '' } } })
  stores.models.setState({ resources: [{ resourceId: modelId, kind: 'ttsModel', provider: 'crisp-tts', name: 'Installed synthesis', description: '', languages: [], installed: true, installedBytes: 1, state: 'idle', cancellable: false }] })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  vi.spyOn(storeModule, 'getBridge').mockReturnValue({ gateway: {
    snapshot: async () => ({ services: { tts: { model: `resource:${modelId}`, voices: ['Discovered voice'] } } }),
    onChanged: () => () => undefined,
  } } as unknown as NolaBridge)
  render(<ModelsPage />)
  const summary = screen.getByText('默认 TTS 模型').closest('[data-slot="card"]')!
  expect(within(summary as HTMLElement).getByText('Installed synthesis')).toBeInTheDocument()
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith({ synthesis: { voice: 'Discovered voice' } }))
})

it('groups remote and local cards by capability with icons inside their headers', () => {
  render(<ModelsPage />)
  const recognition = section('ASR模型')
  expect(recognition.getByText('MiniMax 语音识别')).toBeInTheDocument()
  expect(recognition.getByText('阿里云ASR')).toBeInTheDocument()
  const local = recognition.getByText('SenseVoiceSmall').closest('[data-slot="card"]')!
  expect(within(local as HTMLElement).getByText('本地模型')).toBeInTheDocument()
  expect(within(local as HTMLElement).getByRole('button', { name: '开始配置' })).toBeInTheDocument()
  const aliyunAsr = recognition.getByText('阿里云ASR').closest('[data-slot="card"]')!
  expect(within(aliyunAsr as HTMLElement).getByRole('button', { name: '配置阿里云ASR' })).toBeInTheDocument()
  const translation = section('MT模型')
  const card = translation.getByText('MyMemory 免费翻译').closest('[data-slot="card"]')!
  expect(card.querySelector('[data-slot="card-header"] [data-slot="card-action"] svg')).not.toBeNull()
  expect(within(card as HTMLElement).getByRole('button', { name: '开始配置' })).toBeInTheDocument()
  const speech = section('S2S模型')
  expect(speech.getByText('阿里云 S2S')).toBeInTheDocument()
  expect(speech.getAllByRole('button', { name: '开始配置' })).toHaveLength(1)
  expect(recognition.queryByText('阿里云 S2S')).not.toBeInTheDocument()
  expect(translation.queryByText('阿里云 S2S')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '云端模型' })).not.toBeInTheDocument()
})

it('shows both free services in installed with no local downloads or active cloud selection', () => {
  stores.models.setState({ resources: [] })
  render(<ModelsPage />)
  fireEvent.click(screen.getByRole('tab', { name: /已安装/ }))
  const translation = section('MT模型')
  expect(translation.getByText('MyMemory 免费翻译')).toBeInTheDocument()
  expect(translation.getByText('Index Translate 免费API')).toBeInTheDocument()
  expect(translation.getAllByText('免费')).toHaveLength(2)
  expect(translation.getAllByText('云端模型')).toHaveLength(2)
  expect(translation.queryByText('未安装')).not.toBeInTheDocument()
})

it('shows the active cloud translation capsule and the provider logo in the overview', () => {
  stores.models.setState({ resources: [] })
  stores.settings.setState({ settings: {
    ...DEFAULT_SETTINGS,
    translation: { ...DEFAULT_SETTINGS.translation, provider: 'index-translate', targetLanguage: 'en' },
  } })
  render(<ModelsPage />)
  const card = screen.getByText('默认 MT 模型').closest('[data-slot="card"]')!
  expect(within(card as HTMLElement).getByText('已启用')).toBeInTheDocument()
  expect(card.querySelector('[data-cloud-model="index-translate"] svg')).not.toBeNull()
  expect(within(card as HTMLElement).getByRole('button', { name: '更改' })).toBeInTheDocument()
})

it('keeps configured inactive providers installed and excludes providers missing credentials', () => {
  stores.models.setState({ credentials: { ...initialModels.credentials, google: true, 'aliyun-asr': true } })
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, aliyunWorkspaceId: 'workspace' } } })
  render(<ModelsPage />)
  fireEvent.click(screen.getByRole('tab', { name: /已安装/ }))
  expect(section('MT模型').getByText('Google 翻译')).toBeInTheDocument()
  expect(section('ASR模型').getByText('阿里云ASR')).toBeInTheDocument()
  expect(section('S2S模型').getByText('阿里云 S2S')).toBeInTheDocument()
  expect(screen.queryByText('MiniMax 语音识别')).not.toBeInTheDocument()
})

it('configures MiMo as a cloud speech synthesis model with its own credential', async () => {
  const credential = vi.spyOn(actions.models, 'setTranslationCredential').mockResolvedValue()
  render(<ModelsPage />)
  const card = section('TTS模型').getByText('MiMo V2.5 TTS').closest<HTMLElement>('[data-slot="card"]')!
  fireEvent.click(within(card).getByRole('button', { name: '开始配置' }))
  const dialog = within(screen.getByRole('dialog', { name: 'MiMo V2.5 TTS' }))
  expect(dialog.getByRole('button', { name: '保存配置' })).toBeDisabled()
  fireEvent.change(dialog.getByLabelText('API 密钥', { selector: 'input' }), { target: { value: 'test-mimo-key' } })
  fireEvent.click(dialog.getByRole('button', { name: '保存配置' }))
  await waitFor(() => expect(credential).toHaveBeenCalledExactlyOnceWith('mimo-tts', 'test-mimo-key'))
})

it('sets configured MiMo as the default and selects it for quick interpretation', async () => {
  stores.models.setState({ credentials: { ...initialModels.credentials, 'mimo-tts': true } })
  const settings = stores.settings.getState().settings!
  stores.settings.setState({ settings: { ...settings, realtime: { ...settings.realtime, quickS2sModel: null } } })
  const update = vi.spyOn(settingsActions, 'updateSettings').mockImplementation(async patch => {
    const current = stores.settings.getState().settings!
    stores.settings.setState({ settings: { ...current, modelPolicy: mergeModelPolicy(current, patch.modelPolicy),
      synthesis: { ...current.synthesis, ...patch.synthesis }, realtime: { ...current.realtime, ...patch.realtime } } })
  })
  const { unmount } = render(<ModelsPage />)
  fireEvent.click(screen.getByRole('tab', { name: /已安装/ }))
  const card = section('TTS模型').getByText('MiMo V2.5 TTS').closest<HTMLElement>('[data-slot="card"]')!
  fireEvent.click(within(card).getByRole('button', { name: '设为默认' }))
  await waitFor(() => expect(within(card).getByRole('button', { name: '当前使用' })).toBeDisabled())
  expect(update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ synthesis: { modelId: MIMO_TTS_BINDING, voice: '' }, realtime: { outputMode: 'speech' } }))
  expect(screen.getByText('默认 TTS 模型').closest('[data-slot="card"]')).toHaveTextContent('MiMo V2.5 TTS')
  unmount()
  render(<OverlayPage />)
  expect(screen.getByRole('combobox', { name: '语音合成模型' })).toHaveTextContent('MiMo V2.5 TTS')
  expect(screen.getByRole('combobox', { name: '输出设备' })).toBeEnabled()
})

it.each(['保存配置', '设为默认'])('persists the selected S2S model with %s without changing the ASR or MT selection', async (action) => {
  const user = userEvent.setup()
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  const credential = vi.spyOn(actions.models, 'setTranslationCredential').mockResolvedValue()
  render(<ModelsPage />)
  fireEvent.click(section('S2S模型').getByRole('button', { name: '开始配置' }))
  const dialog = within(screen.getByRole('dialog', { name: '阿里云 S2S' }))
  const model = dialog.getByRole('combobox', { name: '模型' })
  expect(model).toHaveTextContent('qwen3.8-livetranslate-flash-realtime')
  await user.click(model)
  await user.click(await screen.findByRole('option', { name: 'qwen3.5-livetranslate-flash-realtime' }))
  expect(model).toHaveTextContent('qwen3.5-livetranslate-flash-realtime')
  expect(dialog.queryByLabelText('识别模型')).not.toBeInTheDocument()
  const workspace = dialog.getByLabelText('百炼业务空间 ID')
  fireEvent.focus(workspace)
  fireEvent.change(workspace, { target: { value: 's2s-workspace' } })
  fireEvent.blur(workspace)
  fireEvent.change(dialog.getByLabelText('API 密钥', { selector: 'input' }), { target: { value: 's2s-key' } })
  fireEvent.click(dialog.getByRole('button', { name: action }))
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith({
    recognition: { aliyunWorkspaceId: 's2s-workspace' },
    realtime: { ...(action === '设为默认' ? { defaultPipeline: 's2s' } : {}), s2sModel: 'qwen3.5-livetranslate-flash-realtime' },
  }))
  expect(credential).toHaveBeenCalledExactlyOnceWith('aliyun-asr', 's2s-key')
})

it('requires credentials for paid services even if selected, and supports keyless Ollama', () => {
  const selected = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'google' as const } }
  expect(cloudModelsOf(selected, initialModels.credentials).find(model => model.id === 'google')).toMatchObject({ ready: false, active: true })
  const ollama = { ...selected, translation: { ...selected.translation, cloudApiFormat: 'ollama' as const, cloudEndpoint: 'http://127.0.0.1:11434', cloudModel: 'qwen3:4b' } }
  expect(cloudModelsOf(ollama, initialModels.credentials).find(model => model.id === 'custom:legacy')?.ready).toBe(true)
})

it('does not offer native translation for Aliyun recognition-only models', () => {
  const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, aliyunWorkspaceId: 'workspace', aliyunModel: 'fun-asr-realtime' as const } }
  const models = cloudModelsOf(settings, { ...initialModels.credentials, 'aliyun-asr': true })
  expect(models.find(model => model.id === 'aliyun')?.ready).toBe(true)
  expect(models.find(model => model.id === 'recognition')?.ready).toBe(false)
})

it('keeps free services available when the local catalog fails', () => {
  stores.models.setState({ resources: [], loaded: false, loading: false, error: 'catalog unavailable' })
  render(<ModelsPage />)
  fireEvent.click(screen.getByRole('tab', { name: /已安装/ }))
  expect(section('MT模型').getAllByText('免费')).toHaveLength(2)
  expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
})

it('opens credential configuration without enabling an unconfigured provider', () => {
  render(<CloudModelDialog id="minimax" onClose={() => undefined} />)
  expect(screen.getByLabelText('API 密钥', { selector: 'input' })).toHaveAttribute('type', 'password')
  expect(screen.queryByRole('button', { name: '检查密钥' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '删除密钥' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '设为默认' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
  expect(screen.queryByText('请先完成模型配置，再将它设为默认模型。')).not.toBeInTheDocument()
})

it('saves an Aliyun connection explicitly without selecting it as the default', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  const credential = vi.spyOn(actions.models, 'setTranslationCredential').mockResolvedValue()
  const close = vi.fn()
  render(<CloudModelDialog id="aliyun" onClose={close} />)
  const workspace = screen.getByLabelText('百炼业务空间 ID')
  fireEvent.focus(workspace)
  fireEvent.change(workspace, { target: { value: 'saved-workspace' } })
  fireEvent.blur(workspace)
  fireEvent.change(screen.getByLabelText('API 密钥', { selector: 'input' }), { target: { value: 'new-key' } })
  expect(update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ recognition: { aliyunWorkspaceId: 'saved-workspace' } }))
  expect(credential).toHaveBeenCalledWith('aliyun-asr', 'new-key')
  expect(close).toHaveBeenCalledOnce()
})

it('sets the legacy native translation default without changing the selected scene', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  stores.models.setState({ credentials: { ...initialModels.credentials, 'aliyun-asr': true } })
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, aliyunWorkspaceId: 'workspace', aliyunModel: 'qwen3.8-livetranslate-flash-realtime', provider: 'minimax' }, translation: { ...DEFAULT_SETTINGS.translation, targetLanguage: 'none' } } })
  render(<CloudModelDialog id="recognition" onClose={() => undefined} />)
  fireEvent.click(screen.getByRole('button', { name: '设为默认' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({
    modelPolicy: expect.objectContaining({ defaults: expect.objectContaining({ mt: 'cloud:recognition' }), enabled: expect.objectContaining({ 'mt:cloud:recognition': true }), selections: expect.objectContaining({ asr: 'cloud:minimax' }) }),
  })))
  expect(update.mock.calls[0][0]).not.toHaveProperty('recognition')
  expect(update.mock.calls[0][0]).not.toHaveProperty('translation')
})

it('sets the MiniMax recognition default without retiring the selected native translation', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  stores.models.setState({ credentials: { ...initialModels.credentials, 'minimax-asr': true } })
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'recognition' } } })
  render(<CloudModelDialog id="minimax" onClose={() => undefined} />)
  fireEvent.click(screen.getByRole('button', { name: '设为默认' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith({ modelPolicy: expect.objectContaining({ defaults: expect.objectContaining({ asr: 'cloud:minimax' }), enabled: expect.objectContaining({ 'asr:cloud:minimax': true }), selections: expect.objectContaining({ mt: 'cloud:recognition' }) }) }))
})

const customModel = { id: 'custom-first', name: 'First model', endpoint: 'https://example.com/v1', model: 'fast-model', apiFormat: 'chat-completions' as const, contextWindow: 32768, maxOutputTokens: 1024, languages: ['zh', 'en'] }

it('shows named saved models only in installed and leaves the recommended template available', () => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [customModel, { ...customModel, id: 'custom-second', name: 'Second model' }] } } })
  render(<ModelsPage />)
  expect(section('大语言模型').getByRole('heading', { name: '大语言模型' })).toBeInTheDocument()
  expect(screen.queryByText('First model')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: /已安装/ }))
  expect(section('大语言模型').getByText('First model')).toBeInTheDocument()
  expect(section('大语言模型').getByText('Second model')).toBeInTheDocument()
  const firstCard = screen.getByText('First model').closest<HTMLElement>('[data-slot="card"]')!
  fireEvent.click(within(firstCard).getByRole('button', { name: '查看详情' }))
  const dialog = within(screen.getByRole('dialog', { name: 'First model' }))
  expect(dialog.getByRole('button', { name: '删除模型' })).toBeInTheDocument()
})

it('offers a saved custom model as the default translation model once its key is stored', () => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [customModel] } } })
  stores.models.setState({ credentials: { ...initialModels.credentials, 'cloud-model:custom-first': true } })
  render(<ModelsPage />)
  fireEvent.click(screen.getByRole('tab', { name: /已安装/ }))
  const card = section('大语言模型').getByText('First model').closest('[data-slot="card"]') as HTMLElement
  expect(within(card).getByText('已安装')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: '设置为默认翻译模型' })).toBeEnabled()
})

// Rendering the complete source and target language inventories needs integration-test headroom in JSDOM.
it('saves a new independent custom model with every translation language selected by default', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  const saveKey = vi.spyOn(actions.models, 'setTranslationCredential').mockResolvedValue()
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [customModel] } } })
  render(<CloudModelDialog id="cloud" onClose={() => undefined} />)
  expect(screen.getByText(`已选 ${LANGUAGE_CODES.length} 种`)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '移除语言 自动检测' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'Second model' } })
  fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'second-model' } })
  fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'second-secret' } })
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ translation: expect.objectContaining({ customModels: expect.arrayContaining([customModel, expect.objectContaining({ name: 'Second model', model: 'second-model', languages: LANGUAGE_CODES, sourceLanguages: SOURCE_LANGUAGE_OPTIONS })]) }) })))
  expect(saveKey).toHaveBeenCalledWith(expect.stringMatching(/^cloud-model:/), 'second-secret')
  expect(JSON.stringify(update.mock.calls)).not.toContain('second-secret')
}, 20_000)

it('shows locked source and target language support for built-in cloud translation providers', () => {
  render(<CloudModelDialog id="index-translate" onClose={() => undefined} />)
  expect(screen.getAllByText('英语')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: /移除语言/ })).not.toBeInTheDocument()
})

it('deletes only the chosen custom model and its key and falls back when it was selected', async () => {
  const update = vi.spyOn(settingsActions, 'updateSettings').mockResolvedValue()
  const deleteKey = vi.spyOn(actions.models, 'setTranslationCredential').mockResolvedValue()
  const other = { ...customModel, id: 'other', name: 'Other model' }
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'cloud' as const, customModelId: customModel.id, customModels: [customModel, other] } }
  stores.settings.setState({ settings })
  await removeCloudModel(cloudModelsOf(settings, initialModels.credentials).find(model => model.id === `custom:${customModel.id}`)!)
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ translation: expect.objectContaining({ customModels: [other], customModelId: '', provider: 'mymemory' }), modelPolicy: expect.objectContaining({ enabled: expect.objectContaining({ 'mt:mt-custom:custom-first': false, 'llm:custom:custom-first': false }) }) }))
  expect(deleteKey).toHaveBeenCalledExactlyOnceWith('cloud-model:custom-first', '')
})

// Rendering the complete source and target language inventories needs integration-test headroom in JSDOM.
it('uses the selected custom model language inventory and blocks an empty selection', () => {
  stores.settings.setState({ settings: { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'cloud', customModelId: customModel.id, customModels: [customModel], cloudLanguages: ['zh', 'en'] } } })
  const options = renderHook(() => useModelOptions())
  expect(options.result.current.targetLanguages).toEqual(['none', 'zh', 'en'])
  render(<CloudModelDialog id={`custom:${customModel.id}`} onClose={() => undefined} />)
  fireEvent.click(screen.getByRole('button', { name: '取消全选' }))
  expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '全选语言' }))
  expect(screen.getByRole('button', { name: '保存配置' })).toBeEnabled()
}, 20_000)

it('opens the OCR family selector and downloads the chosen language variant', async () => {
  const make = (group: string, languages: string[]) => ({ resourceId: `pp-ocrv5-mobile-${group}-onnx`, kind: 'ocrModel' as const,
    provider: 'pp-ocrv5', name: `PP-OCRv5 mobile · ${group}`, description: 'OCR', languages, installed: false, installedBytes: 0,
    downloadBytes: 12724089, state: 'idle' as const, cancellable: false })
  stores.models.setState({ resources: [make('ch', ['zh', 'en', 'ja']), make('latin', ['fr', 'de', 'es'])] })
  const manage = vi.spyOn(actions.models, 'manageResource').mockResolvedValue(make('latin', ['fr', 'de', 'es']))
  render(<ModelsPage />)
  const ocr = section('OCR 模型')
  expect(ocr.queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
  fireEvent.click(ocr.getByRole('button', { name: '开始配置' }))
  const dialog = screen.getByRole('dialog'), user = userEvent.setup()
  expect(within(dialog).queryByText(/模型管理负责下载/)).not.toBeInTheDocument()
  expect(dialog.querySelector('.model-language-field .model-language-chip')).toBeInTheDocument()
  expect(within(dialog).getByRole('combobox', { name: '支持的识别语言' })).toBeDisabled()
  await user.click(within(dialog).getByRole('combobox', { name: '模型' }))
  await user.click(await screen.findByRole('option', { name: /PP-OCRv5 mobile · latin/ }))
  expect(within(dialog).getByText('法语')).toBeInTheDocument()
  expect(within(dialog).getByText('德语')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: '安装' }))
  await waitFor(() => expect(manage).toHaveBeenCalledWith('pp-ocrv5-mobile-latin-onnx', 'install', 'modelscope'))
})
