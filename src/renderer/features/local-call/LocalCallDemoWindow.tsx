import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssistantRuntimeProvider, SimpleImageAttachmentAdapter, SimpleTextAttachmentAdapter, CompositeAttachmentAdapter, WebSpeechSynthesisAdapter, useAui, useAuiState, useAuiEvent, useAssistantInstructions, AuiConfig, Tools, defineToolkit, useRemoteThreadListRuntime } from '@assistant-ui/react'
import { createLocalStorageAdapter } from '@assistant-ui/core/react'
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/ai-sdk'
import { lastAssistantMessageIsCompleteWithToolCalls, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { JSONGenerativeUI } from '@assistant-ui/generative-ui/react'
import { styledGenerativeUILibrary } from '@/components/assistant-ui/native/generative-ui'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import { customModelsOf } from '../../../shared/custom-models'
import { notifyError } from '@/components/primitives/notify'
import { AudioRecordingDictationAdapter } from './audio-dictation'
import type { PlaygroundConfig } from './demo-runtime'
import { createPlaygroundFetch } from './language-model-transport'
import { installedPlaygroundModels } from './installed-models'
import { AudioAttachmentAdapter } from './audio-attachment'
import { getBridge } from '@/store'
import type { AgentWorkspaceSnapshot, WorkspaceAction } from '../../../shared/agent-workspace'
import { NativeAgentSurface } from './NativeAgentSurface'
import { nativePresentationTools } from './native-agent-tools'

const generativeUI = new JSONGenerativeUI({ library: styledGenerativeUILibrary })
const localCallStorage = {
  getItem: async (key: string) => window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: async (key: string) => window.localStorage.removeItem(key),
}
// This desktop transport forwards schemas instead of relying on a server-side generative compiler.
const agentTools = defineToolkit({
  ...nativePresentationTools,
  present: { ...generativeUI.present({ display: 'standalone' }), unstable_backendDefault: { parameters: false } },
  prompt_user: { ...generativeUI.promptUser(), unstable_backendDefault: { parameters: false } },
})

export interface AgentInstructionsProps { active: boolean }
export interface DictationLifecycleProps { adapter: AudioRecordingDictationAdapter }
function DictationLifecycle({ adapter }: DictationLifecycleProps) {
  useAuiEvent('threads.selectionChanged', () => adapter.dispose())
  return null
}
function AgentInstructions({ active }: AgentInstructionsProps) {
  useAssistantInstructions({ disabled: !active, instruction: 'You are the Nola Translator assistant. Reply in the user\'s language. For complex work, use update_plan or update_tasks to show actual progress. Use create_artifact for downloadable documents, show_code_diff for code previews and show_math for derivations. Use the present tool for requested dashboards, charts, tables and other visual interfaces. Use prompt_user when you need a structured choice or confirmation from the user. Use registered tools to list models, transcribe audio, translate text and synthesize speech. Use the terminal only when needed for the selected project, with user approval. Never claim an unregistered tool was executed.' })
  return null
}

export function LocalCallDemoWindow() {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<AgentWorkspaceSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const onAction = useCallback(async (action: WorkspaceAction) => {
    const api = getBridge()?.app.agentWorkspace
    if (!api) return
    setBusy(true)
    try { setSnapshot(await api(action)) }
    catch (error) { notifyError(t('localCall.workspaceActionFailed'), { cause: error }) }
    finally { setBusy(false) }
  }, [t])
  useEffect(() => { void onAction({ action: 'snapshot' }) }, [onAction])
  return <LocalCallChat key={snapshot?.selectedProject ?? 'standalone'} snapshot={snapshot} onAction={onAction} busy={busy} />
}

export interface LocalCallChatProps {
  snapshot: AgentWorkspaceSnapshot | null
  onAction: (action: WorkspaceAction) => Promise<void>
  busy: boolean
}
function LocalCallChat({ snapshot, onAction, busy }: LocalCallChatProps) {
  const { t } = useI18n()
  const settings = useStore(stores.settings, state => state.settings)
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const loaded = useStore(stores.models, state => state.loaded)
  const profiles = useMemo(() => settings ? customModelsOf(settings.translation) : [], [settings])
  const models = useMemo(() => installedPlaygroundModels(resources, settings, credentials, t), [resources, settings, credentials, t])
  const [config, setConfig] = useState<PlaygroundConfig>({ model: '', kind: 'llm', effort: 'auto', source: 'auto', target: 'zh', voice: '', projectId: snapshot?.selectedProject ?? null })
  const [ttsVoices, setTtsVoices] = useState<{ model: string; names: string[] }>({ model: '', names: [] })

  const [memories, setMemories] = useState<string[]>(() => { try { const saved: unknown = JSON.parse(localStorage.getItem('nola.playground.memories') || '[]'); return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } })
  const [renaming, setRenaming] = useState(false)
  const memoriesRef = useRef(memories)
  memoriesRef.current = memories
  useEffect(() => {
    // This independent document skips main-window startup queries and needs its own first snapshot.
    const refresh = () => {
      void actions.settings.loadSettings().catch(error => notifyError(t('localCall.actionFailed'), { cause: error }))
      void actions.models.loadModels({ includeDevices: false }).catch(error => notifyError(t('errors.modelsLoadFailed'), { cause: error }))
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [t])
  useEffect(() => {
    if (!loaded || !settings) return
    const selected = models.find(model => model.id === config.model) ?? models.find(model => model.kind === config.kind) ?? models[0]
    if (config.model !== (selected?.id ?? '') || config.images !== selected?.images) {
      setConfig(previous => ({ ...previous, model: selected?.id ?? '', kind: selected?.kind ?? 'llm', images: selected?.images }))
    }
  }, [loaded, settings, models, config.kind, config.model, config.images])
  const configRef = useRef(config)
  configRef.current = config
  const transport = useMemo(() => new AssistantChatTransport({ api: '/nola-chat', fetch: createPlaygroundFetch(() => configRef.current, t, () => memoriesRef.current) }), [t])
  const threadAdapter = useMemo(() => createLocalStorageAdapter({ storage: localCallStorage, prefix: snapshot?.selectedProject ? `nola.local-call:project:${snapshot.selectedProject}:` : 'nola.local-call:' }), [])
  const attachments = useMemo(() => new CompositeAttachmentAdapter([new SimpleImageAttachmentAdapter(), new SimpleTextAttachmentAdapter(), new AudioAttachmentAdapter()]), [])
  const audioAttachments = useMemo(() => new AudioAttachmentAdapter(), [])
  const speech = useMemo(() => new WebSpeechSynthesisAdapter(), [])
  const feedback = useMemo(() => ({ submit() { /* LocalRuntime retains the preview feedback state. */ } }), [])
  const runtimeRef = useRef<ReturnType<typeof useChatRuntime> | null>(null)
  const dictationRequestId = useRef<string | null>(null)
  const audioDictation = useMemo(() => new AudioRecordingDictationAdapter(async data => {
    if (config.kind !== 'asr') {
      const preferred = settings?.recognition.provider === 'local' ? `resource:${settings.recognition.modelId}` : `cloud:${settings?.recognition.provider}`
      const asr = models.find(model => model.kind === 'asr' && model.id === preferred) ?? models.find(model => model.kind === 'asr')
      const app = getBridge()?.app
      if (!asr || !app?.directModel) throw new Error(t('localCall.noAsr'))
      const id = crypto.randomUUID()
      dictationRequestId.current = id
      try { return (await app.directModel({ id, model: asr.id, kind: 'asr', audio: data.url })).text }
      finally { if (dictationRequestId.current === id) dictationRequestId.current = null }
    }
    runtimeRef.current?.thread.append({ role: 'user', content: [{ type: 'file', mimeType: data.mimeType, data: data.url, filename: `${t('localCall.recording')}.wav` }] })
  }, error => notifyError(t('localCall.micError'), { cause: error }), () => {
    if (dictationRequestId.current) void getBridge()?.app.cancelLanguageModel?.(dictationRequestId.current).catch(() => undefined)
    dictationRequestId.current = null
  }), [config.model, config.kind, settings, models, t])
  useEffect(() => () => audioDictation.dispose(), [audioDictation])
  const runtime = useRemoteThreadListRuntime({
    adapter: threadAdapter,
    runtimeHook: () => useChatRuntime({
      transport,
      sendAutomaticallyWhen: state => configRef.current.kind === 'llm' && (lastAssistantMessageIsCompleteWithToolCalls(state) || lastAssistantMessageIsCompleteWithApprovalResponses(state)),
      adapters: { attachments: config.kind === 'asr' ? audioAttachments : config.images || config.kind === 'llm' ? attachments : undefined, feedback, speech,
        dictation: audioDictation },
    }),
  })
  runtimeRef.current = runtime
  const agentConfig = useMemo(() => AuiConfig({ tools: Tools({ toolkit: config.kind === 'llm' ? agentTools : defineToolkit({}) }) }), [config.kind])
  const placeholder = t(config.kind === 'asr' ? 'localCall.asrPrompt' : config.kind === 'tts' ? 'localCall.ttsPrompt'
    : config.kind === 'mt' ? config.images ? 'localCall.imagePrompt' : 'localCall.mtPrompt' : 'localCall.prompt')
  const openConfiguration = () => { void actions.settings.openMainPage('#/models').catch(error => notifyError(t('localCall.actionFailed'), { cause: error })) }
  return <AssistantRuntimeProvider runtime={runtime} config={agentConfig}>
    <AgentInstructions active={config.kind === 'llm'} />
    <DictationLifecycle adapter={audioDictation} />
    <NativeAgentSurface config={config} profiles={profiles} models={models} onConfigure={openConfiguration}
      onChange={next => { setConfig(next); if (next.model !== config.model) setTtsVoices({ model: '', names: [] }) }}
      voices={ttsVoices.model === config.model ? ttsVoices.names : []} onVoices={names => setTtsVoices({ model: config.model, names })}
      snapshot={snapshot} onAction={onAction} busy={busy} placeholder={config.model ? placeholder : t('localCall.noModels')}
      memories={memories} onMemories={next => { setMemories(next); try { localStorage.setItem('nola.playground.memories', JSON.stringify(next)) } catch (error) { notifyError(t('localCall.actionFailed'), { cause: error }) } }} />
  </AssistantRuntimeProvider>
}
