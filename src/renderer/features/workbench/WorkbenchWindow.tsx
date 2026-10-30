import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssistantRuntimeProvider, SimpleImageAttachmentAdapter, SimpleTextAttachmentAdapter, CompositeAttachmentAdapter, useAui, useAuiState, useAuiEvent, useAssistantInstructions, AuiConfig, Tools, defineToolkit, useRemoteThreadListRuntime } from '@assistant-ui/react'
import { createLocalStorageAdapter } from '@assistant-ui/core/react'
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/ai-sdk'
import { lastAssistantMessageIsCompleteWithToolCalls, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { styledGenerativeUILibrary } from '@/components/assistant-ui/native/generative-ui'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import { customModelsOf } from '../../../shared/custom-models'
import { notifyError, notifyInfo } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { AudioRecordingDictationAdapter } from './audio-dictation'
import type { PlaygroundConfig } from './demo-runtime'
import { createPlaygroundFetch } from './language-model-transport'
import { callableModels, installedPlaygroundModels } from './installed-models'
import { resolveModelBinding, savedBindingOf, selectModelBinding, useAvailableModels, useGatewaySnapshot } from '@/available-models'
import { notifyGatewayModelUnavailable } from '@/components/primitives/notify'
import { AudioAttachmentAdapter, VideoAttachmentAdapter } from './audio-attachment'
import { getBridge } from '@/store'
import { settingsPath, pathOf } from '@/routes'
import type { AgentWorkspaceSnapshot, WorkspaceAction } from '../../../shared/agent-workspace'
import { NativeAgentSurface } from './NativeAgentSurface'
import { createGenerativePresentationTools, nativePresentationTools } from './native-agent-tools'

const workbenchStorage = {
  getItem: async (key: string) => window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: async (key: string) => window.localStorage.removeItem(key),
}
// This desktop transport forwards schemas instead of relying on a server-side generative compiler.
const agentTools = defineToolkit({
  ...nativePresentationTools,
  ...createGenerativePresentationTools(styledGenerativeUILibrary),
})

class WorkbenchSpeechSynthesisAdapter {
  constructor(private readonly getSelection: () => { modelId: string; voice: string }, private readonly t: (key: TranslationKey) => string,
    private readonly reportError: (error: unknown) => void) {}

  speak(text: string) {
    let status: { type: 'running' } | { type: 'ended'; reason: 'finished' | 'cancelled' | 'error'; error?: unknown } = { type: 'running' }
    const subscribers = new Set<() => void>()
    let audioContext: AudioContext | undefined
    let source: AudioBufferSourceNode | undefined
    const isEnded = () => status.type === 'ended'
    const notify = (reason: 'finished' | 'cancelled' | 'error', error?: unknown) => {
      if (isEnded()) return
      status = { type: 'ended', reason, error }
      for (const subscriber of subscribers) subscriber()
      if (reason === 'error') this.reportError(error)
    }
    const requestId = crypto.randomUUID()
    const utterance = {
      get status() { return status },
      cancel: () => {
        void getBridge()?.app.cancelLanguageModel?.(requestId).catch(() => undefined)
        try { source?.stop() } catch { /* The source may not have started. */ }
        void audioContext?.close().catch(() => undefined)
        notify('cancelled')
      },
      subscribe: (callback: () => void) => {
        subscribers.add(callback)
        if (isEnded()) queueMicrotask(callback)
        return () => { subscribers.delete(callback) }
      },
    }
    void (async () => {
      const { modelId, voice } = this.getSelection()
      if (!modelId) throw new Error(this.t('workbench.ttsDefaultModelMissing'))
      audioContext = new AudioContext()
      await audioContext.resume()
      const app = getBridge()?.app
      if (!app?.directModel) throw new Error(this.t('workbench.runtimeUnavailable'))
      const result = await app.directModel({ id: requestId, model: `resource:${modelId}`, kind: 'tts', text, voice })
      if (isEnded()) return
      if (!result.audio) throw new Error(this.t('workbench.noAudioResult'))
      const samples = await audioContext.decodeAudioData(await (await fetch(result.audio)).arrayBuffer())
      if (isEnded()) return
      source = audioContext.createBufferSource()
      source.buffer = samples
      source.connect(audioContext.destination)
      source.addEventListener('ended', () => {
        notify('finished')
        void audioContext?.close().catch(() => undefined)
      }, { once: true })
      source.start()
    })().catch(error => {
      void audioContext?.close().catch(() => undefined)
      notify('error', error)
    })
    return utterance
  }
}

export interface AgentInstructionsProps { active: boolean }
export interface DictationLifecycleProps { adapter: AudioRecordingDictationAdapter }
function DictationLifecycle({ adapter }: DictationLifecycleProps) {
  useAuiEvent('threads.selectionChanged', () => adapter.dispose())
  return null
}
function AgentInstructions({ active }: AgentInstructionsProps) {
  useAssistantInstructions({ disabled: !active, instruction: 'You are the Nola Translator assistant. Reply in the user\'s language. For complex work, use update_plan or update_tasks to show actual progress. Use create_artifact for downloadable documents, show_code_diff for code previews and show_math for derivations. Use the present tool for requested dashboards, charts, tables and other visual interfaces. When the user asks for a visual example or preview, including asking whether you can create one, render a concrete example with present instead of only describing it. Never claim that a preview or visual interface is displayed unless you actually called present. Use prompt_user when you need a structured choice or confirmation from the user. Use registered tools to list models, transcribe audio, translate text and synthesize speech. Use the terminal only when needed for the selected project, with user approval. Never claim an unregistered tool was executed.' })
  return null
}

export function WorkbenchWindow() {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<AgentWorkspaceSnapshot | null>(null)
  useGatewaySnapshot()
  const [busy, setBusy] = useState(false)
  const onAction = useCallback(async (action: WorkspaceAction) => {
    const api = getBridge()?.app.agentWorkspace
    if (!api) return
    setBusy(true)
    try { setSnapshot(await api(action)) }
    catch (error) { notifyError(t('workbench.workspaceActionFailed'), { cause: error }) }
    finally { setBusy(false) }
  }, [t])
  useEffect(() => { void onAction({ action: 'snapshot' }) }, [onAction])
  return <WorkbenchChat key={snapshot?.selectedProject ?? 'standalone'} snapshot={snapshot} onAction={onAction} busy={busy} />
}

export interface WorkbenchChatProps {
  snapshot: AgentWorkspaceSnapshot | null
  onAction: (action: WorkspaceAction) => Promise<void>
  busy: boolean
}
function WorkbenchChat({ snapshot, onAction, busy }: WorkbenchChatProps) {
  const { t } = useI18n()
  const settings = useStore(stores.settings, state => state.settings)
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const profiles = useMemo(() => settings ? customModelsOf(settings.translation) : [], [settings])
  const available = useAvailableModels()
  const playground = useMemo(() => installedPlaygroundModels(resources, settings, credentials, t), [resources, settings, credentials, t])
  const models = useMemo(() => callableModels(available, playground), [available, playground])
  const modelsRef = useRef(models)
  modelsRef.current = models
  const [config, setConfig] = useState<PlaygroundConfig>({ model: '', kind: 'llm', effort: 'auto', source: 'auto', target: 'zh', voice: '', projectId: snapshot?.selectedProject ?? null })
  const [requestRunning, setRequestRunning] = useState(false)
  const [ttsVoices, setTtsVoices] = useState<{ model: string; names: string[] }>({ model: '', names: [] })
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false)
  const [modelsLoadFailed, setModelsLoadFailed] = useState(false)

  const [memories, setMemories] = useState<string[]>(() => { try { const saved: unknown = JSON.parse(localStorage.getItem('nola.playground.memories') || '[]'); return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } })
  const [renaming, setRenaming] = useState(false)
  const memoriesRef = useRef(memories)
  memoriesRef.current = memories
  useEffect(() => {
    // This independent document skips main-window startup queries and needs its own first snapshot.
    const refresh = () => {
      void actions.settings.loadSettings().then(() => setSettingsLoadFailed(false)).catch(() => setSettingsLoadFailed(true))
      void actions.models.loadModels({ includeDevices: false }).then(() => setModelsLoadFailed(false)).catch(() => setModelsLoadFailed(true))
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [t])
  useEffect(() => {
    if (!settings || requestRunning) return
    const saved = config.model || savedBindingOf(config.kind, settings)
    const resolution = resolveModelBinding(config.kind, saved, available[config.kind])
    const selected = models.find(model => model.kind === config.kind && model.id === resolution.binding)
    if (config.model !== (selected?.id ?? '') || config.images !== selected?.images) {
      setConfig(previous => ({ ...previous, model: selected?.id ?? '', images: selected?.images }))
      if (resolution.unavailable && config.model) notifyGatewayModelUnavailable(t('gateway.modelNone', { name: t(`gateway.${config.kind}`) }), t('gateway.modelGatewayStartHint'), t('gateway.title'))
      if (resolution.replaced && config.model) notifyInfo(t('gateway.modelSwitched', { name: resolution.replaced.name }),
        { description: t('gateway.modelSwitchedLoaded') })
    }
  }, [settings, models, available, requestRunning, config.kind, config.model, config.images, t])
  const configRef = useRef(config)
  configRef.current = config
  const transport = useMemo(() => new AssistantChatTransport({ api: '/nola-chat', fetch: createPlaygroundFetch(() => configRef.current, t, () => memoriesRef.current, () => modelsRef.current) }), [t])
  const threadAdapter = useMemo(() => createLocalStorageAdapter({ storage: workbenchStorage, prefix: snapshot?.selectedProject ? `nola.local-call:project:${snapshot.selectedProject}:` : 'nola.local-call:' }), [])
  const videoAttachments = useMemo(() => new VideoAttachmentAdapter(), [])
  const attachments = useMemo(() => new CompositeAttachmentAdapter([new SimpleImageAttachmentAdapter(), new SimpleTextAttachmentAdapter(), new AudioAttachmentAdapter(), videoAttachments]), [videoAttachments])
  const audioAttachments = useMemo(() => new CompositeAttachmentAdapter([new AudioAttachmentAdapter(), videoAttachments]), [videoAttachments])
  const speech = useMemo(() => new WorkbenchSpeechSynthesisAdapter(() => {
    const ready = modelsRef.current.find(model => model.kind === 'tts')
    return { modelId: ready?.id.startsWith('resource:') ? ready.id.slice(9) : '', voice: configRef.current.kind === 'tts' ? configRef.current.voice : settingsRef.current?.synthesis.voice ?? '' }
  }, t,
  error => notifyError(t('workbench.readAloudErrorTitle'), {
    cause: error,
    description: t('workbench.readAloudErrorDescription'),
    action: { label: t('workbench.readAloudErrorAction'), onPress: () => { void actions.settings.openMainPage(pathOf('models')).catch(cause => notifyError(t('workbench.actionFailed'), { cause })) } },
  })), [t])
  const feedback = useMemo(() => ({ submit() { /* LocalRuntime retains the preview feedback state. */ } }), [])
  const runtimeRef = useRef<ReturnType<typeof useChatRuntime> | null>(null)
  const dictationRequestId = useRef<string | null>(null)
  const audioDictation = useMemo(() => new AudioRecordingDictationAdapter(async data => {
    if (config.kind !== 'asr') {
      const asr = models.find(model => model.kind === 'asr')
      const app = getBridge()?.app
      if (!asr || !app?.directModel) throw new Error(t('workbench.noAsr'))
      const id = crypto.randomUUID()
      dictationRequestId.current = id
      try { return (await app.directModel({ id, model: asr.id, kind: 'asr', audio: data.url })).text }
      finally { if (dictationRequestId.current === id) dictationRequestId.current = null }
    }
    runtimeRef.current?.thread.append({ role: 'user', content: [{ type: 'file', mimeType: data.mimeType, data: data.url, filename: `${t('workbench.recording')}.wav` }] })
  }, error => notifyError(t('workbench.micErrorTitle'), {
    cause: error,
    description: t('workbench.micErrorDescription'),
    action: { label: t('workbench.micErrorAction'), onPress: () => { void actions.settings.openMainPage(settingsPath('audio')).catch(cause => notifyError(t('workbench.actionFailed'), { cause })) } },
  }), () => {
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
  const placeholder = t(config.kind === 'asr' ? 'workbench.asrPrompt' : config.kind === 'tts' ? 'workbench.ttsPrompt'
    : config.kind === 'mt' ? config.images ? 'workbench.imagePrompt' : 'workbench.mtPrompt' : 'workbench.prompt')
  const openConfiguration = () => { void actions.settings.openMainPage('#/model-gateway').catch(error => notifyError(t('workbench.actionFailed'), { cause: error })) }
  return <AssistantRuntimeProvider runtime={runtime} config={agentConfig}>
    <div className="flex h-full min-h-0 flex-col">
      {settingsLoadFailed ? <div role="alert" className="flex items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2 text-foreground">
        <span>{t('settings.loadFailed')}</span>
        <Button variant="outline" size="sm" onClick={() => { void actions.settings.loadSettings().then(() => setSettingsLoadFailed(false)).catch(() => setSettingsLoadFailed(true)) }}>{t('common.retry')}</Button>
      </div> : null}
      {modelsLoadFailed ? <div role="alert" className="flex items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2 text-foreground">
        <span>{t('errors.modelsLoadFailed')}</span>
        <Button variant="outline" size="sm" onClick={() => { void actions.models.loadModels({ includeDevices: false }).then(() => setModelsLoadFailed(false)).catch(() => setModelsLoadFailed(true)) }}>{t('common.retry')}</Button>
      </div> : null}
    <WorkbenchRequestLifecycle onRunningChange={setRequestRunning} />
    <AgentInstructions active={config.kind === 'llm'} />
    <DictationLifecycle adapter={audioDictation} />
    <NativeAgentSurface config={config} profiles={profiles} models={models} onConfigure={openConfiguration}
      onChange={next => {
        if (requestRunning) return
        setConfig(next)
        if (next.model !== config.model) {
          setTtsVoices({ model: '', names: [] })
          if (settings && next.model) void selectModelBinding(next.kind, next.model, settings).catch(error => notifyError(t('errors.settingsSaveFailed'), { cause: error }))
        }
      }}
      voices={ttsVoices.model === config.model ? ttsVoices.names : []} onVoices={names => setTtsVoices({ model: config.model, names })}
      snapshot={snapshot} onAction={onAction} busy={busy} placeholder={config.model ? placeholder : t('workbench.noModels')}
      memories={memories} onMemories={next => { setMemories(next); try { localStorage.setItem('nola.playground.memories', JSON.stringify(next)) } catch (error) { notifyError(t('workbench.actionFailed'), { cause: error }) } }} />
    </div>
  </AssistantRuntimeProvider>
}


/** Freeze the current request's model and apply catalog repairs only after it completes. */
function WorkbenchRequestLifecycle({ onRunningChange }: { onRunningChange: (running: boolean) => void }) {
  const running = useAuiState(state => state.thread.isRunning || !!state.composer.submission)
  useEffect(() => { onRunningChange(running) }, [running, onRunningChange])
  return null
}
