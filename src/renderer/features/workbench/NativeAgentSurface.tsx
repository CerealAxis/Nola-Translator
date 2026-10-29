import { ModelAvailabilityLabel } from '@/features/workspace/ModelAvailabilityLabel'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AttachmentPrimitive, ComposerPrimitive, AuiIf, MessagePrimitive, ThreadPrimitive, useAui, useAuiState, useMessageTiming, type ToolCallMessagePart, type ToolCallMessagePartProps } from '@assistant-ui/react'
import { Archive, BrainCircuit, ChevronLeft, ChevronRight, Ellipsis, Minus, PanelLeft, Pin, Plus, Search, Settings2, Square, X } from 'lucide-react'
import { Composer, ComposerActions, ComposerAttachButton, ComposerAttachments, ComposerBar, ComposerContext, ComposerInput, ComposerMenu, ComposerMenuItem, ComposerModelItem, ComposerModelTrigger, ComposerSend, ComposerToolbar, ComposerVoice, ComposerVoiceButton } from '@/components/assistant-ui/native/composer'
import { ThreadList } from '@/components/assistant-ui/native/thread-list'
import { NativeAgentSettings } from './NativeAgentSettings'
import { DaySeparator } from '@/components/assistant-ui/native/day-separator'
import { ContextBreakdown } from '@/components/assistant-ui/native/context-breakdown'
import { ReasoningEffort } from '@/components/assistant-ui/native/reasoning-effort'
import { ReasoningRoot, ReasoningTrigger, ReasoningContent, ReasoningText } from '@/components/assistant-ui/native/reasoning'
import { MarkdownText } from '@/components/assistant-ui/native/markdown-text'
import { Sources } from '@/components/assistant-ui/native/sources.aui'
import { File } from '@/components/assistant-ui/native/file'
import { Image } from '@/components/assistant-ui/native/image'
import { ThinkingIndicator } from '@/components/assistant-ui/native/thinking-indicator'
import { MessageActions } from '@/components/assistant-ui/native/message-actions'
import { ApprovalCard } from '@/components/assistant-ui/native/approval-card'
import { TerminalBlock } from '@/components/assistant-ui/native/terminal-block'
import { ToolCall } from '@/components/assistant-ui/native/tool-call'
import { RunActivity } from '@/components/assistant-ui/native/run-activity'
import { SubagentList } from '@/components/assistant-ui/native/subagent-list'
import { ToolFallback } from '@/components/assistant-ui/native/tool-fallback.aui'
import { DraftRestore } from '@/components/assistant-ui/native/draft-restore'
import { ErrorState } from '@/components/assistant-ui/native/error-state'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { useAttachmentSrc } from '@/hooks/use-attachment-src'
import { ghostButton } from '@/components/assistant-ui/native/surfaces'
import { useI18n } from '@/i18n'
import { stores, useStore } from '@/store'
import { notifyError } from '@/components/primitives/notify'
import { languageName, LANGUAGE_CODES } from '../../../shared/languages'
import type { CustomTranslationModel } from '../../../shared/settings'
import type { AgentWorkspaceSnapshot, WorkspaceAction } from '../../../shared/agent-workspace'
import type { PlaygroundConfig } from './demo-runtime'
import type { PlaygroundModel } from './installed-models'

export interface NativeAgentSurfaceProps {
  config: PlaygroundConfig
  onChange: (config: PlaygroundConfig) => void
  profiles: readonly CustomTranslationModel[]
  models: readonly PlaygroundModel[]
  voices: string[]
  onVoices: (names: string[]) => void
  onConfigure: () => void
  snapshot: AgentWorkspaceSnapshot | null
  onAction: (action: WorkspaceAction) => Promise<void>
  busy: boolean
  placeholder: string
  memories: readonly string[]
  onMemories: (memories: string[]) => void
}

const WorkbenchConfigContext = createContext<PlaygroundConfig | null>(null)

/** Connect runtime state and localized labels to the Elements components. */
export function NativeAgentSurface(props: NativeAgentSurfaceProps) {
  const { t } = useI18n()
  const theme = useStore(stores.settings, state => state.settings?.theme)
  useEffect(() => {
    if (!theme) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || theme === 'system' && media.matches
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('light', !dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  const aui = useAui()
  const items = useAuiState(s => s.threads.threadItems)
  const activeId = useAuiState(s => s.threads.mainThreadId)
  const title = useAuiState(s => s.threadListItem.title)
  const first = useAuiState(s => s.thread.messages.find(message => message.role === 'user'))
  const remoteId = useAuiState(s => s.threadListItem.remoteId)
  const [sidebar, setSidebar] = useState(true)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [threadQuery, setThreadQuery] = useState('')
  const visibleItems = items.filter(item => item.status === 'regular' && (item.title ?? '').toLowerCase().includes(threadQuery.toLowerCase())).sort((a, b) => Number(Boolean(b.custom?.pinned)) - Number(Boolean(a.custom?.pinned)))
  const currentItem = items.find(item => item.id === activeId)
  useEffect(() => {
    document.documentElement.classList.add('native-agent-document')
    return () => document.documentElement.classList.remove('native-agent-document')
  }, [])
  useEffect(() => {
    if (title || !remoteId || !first) return
    const text = first.content.find(part => part.type === 'text')?.text
    void aui.threadListItem.rename(text?.slice(0, 48) || t('workbench.recording'))
  }, [aui, first, remoteId, t, title])
  const renameCurrent = (text: string) => {
    if (!text.trim()) return
    void aui.threads.item({ id: activeId }).rename(text.trim().slice(0, 80))
    setRenaming(false)
  }
  const switchRelative = (delta: -1 | 1) => {
    const index = visibleItems.findIndex(item => item.id === activeId)
    const next = visibleItems[index + delta]
    if (next) void aui.threads.switchToThread(next.id)
  }
  const togglePin = (id: string) => {
    const item = items.find(candidate => candidate.id === id)
    if (!item) return
    void aui.threads.item({ id }).updateCustom({ ...item.custom, pinned: !item.custom?.pinned })
  }
  const toggleArchive = () => {
    if (!currentItem) return
    const runtime = aui.threads.item({ id: activeId })
    if (currentItem.status === 'archived') void runtime.unarchive()
    else void runtime.archive()
    setHeaderMenu(false)
  }
  return <div className="native-agent-app flex h-full min-h-0 bg-background text-foreground" data-testid="native-agent-app">
    <aside className={`${sidebar ? 'w-[300px]' : 'w-16'} flex shrink-0 flex-col border-e border-border transition-[width] duration-200`}>
      <div className={`native-window-drag flex h-14 shrink-0 items-center ${sidebar ? 'gap-3 px-4' : 'justify-center'}`}>
        <button className={`${ghostButton} native-window-action size-8`} aria-label={t('workbench.toggleSidebar')} onClick={() => setSidebar(value => !value)}><PanelLeft className="size-4" aria-hidden="true" /></button>
        {sidebar && <span className="text-sm font-medium">{t('workbench.chats')}</span>}
      </div>
      {sidebar ? <>
        <div className="px-3 pt-3"><ComposerMenuItem className="w-full" onClick={() => { setMemoryOpen(false); void aui.threads.switchToNewThread() }}><Plus className="size-4" aria-hidden="true" />{t('workbench.newThread')}</ComposerMenuItem></div>
        <div className="relative px-3 pt-2"><Search className="pointer-events-none absolute start-6 top-[18px] size-4 text-muted-foreground" aria-hidden="true" /><ComposerInput className="h-9 min-h-0 rounded-xl bg-foreground/[0.035] ps-9 text-sm" value={threadQuery} onChange={event => setThreadQuery(event.target.value)} placeholder={t('workbench.searchThreads')} /></div>
        <div className="min-h-0 flex-1 overflow-auto px-3 pt-5"><ThreadList className="max-w-none" dateLabel={t('workbench.today')} threads={visibleItems.map(item => ({ id: item.id, title: item.title ?? t('workbench.newThread'), time: '', unread: item.isRunning, pinned: Boolean(item.custom?.pinned) }))} activeIndex={visibleItems.findIndex(item => item.id === activeId)} onActiveIndexChange={index => { setMemoryOpen(false); void aui.threads.switchToThread(visibleItems[index].id) }} onRename={(index, nextTitle) => { if (nextTitle.trim()) void aui.threads.item({ id: visibleItems[index].id }).rename(nextTitle.trim().slice(0, 80)) }} onPin={index => togglePin(visibleItems[index].id)} onArchive={index => { void aui.threads.item({ id: visibleItems[index].id }).archive() }} onDelete={index => { void aui.threads.item({ id: visibleItems[index].id }).delete() }} labels={{ more: t('workbench.moreOptions'), rename: t('workbench.renameThread'), pin: t('workbench.pin'), unpin: t('workbench.unpin'), archive: t('workbench.archive'), delete: t('workbench.delete') }} /></div>
      </> : <div className="flex flex-col items-center gap-2 pt-2"><button className={`${ghostButton} native-window-action size-8`} aria-label={t('workbench.newThread')} onClick={() => aui.threads.switchToNewThread()}><Plus className="size-4" aria-hidden="true" /></button></div>}
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="native-window-drag flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <div className="relative min-w-0 flex-1">
          {renaming ? <input autoFocus value={titleDraft} onChange={event => setTitleDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') renameCurrent(titleDraft); if (event.key === 'Escape') setRenaming(false) }} onBlur={() => renameCurrent(titleDraft)} className="w-full bg-transparent text-[13.5px] outline-none" aria-label={t('workbench.renameThread')} /> : <span className="block truncate text-[13.5px]">{memoryOpen ? t('workbench.memory') : title || t('workbench.newThread')}</span>}
        </div>
        <Popover open={headerMenu} onOpenChange={setHeaderMenu}>
          <PopoverTrigger render={<button className={`${ghostButton} native-window-action size-8`} aria-label={t('workbench.moreOptions')} aria-expanded={headerMenu} />}><Ellipsis className="size-4" aria-hidden="true" /></PopoverTrigger>
          <PopoverContent align="end" side="bottom" sideOffset={6} className="w-64 gap-0.5 rounded-2xl p-1.5">
            <ComposerMenuItem onClick={() => { void aui.threads.switchToNewThread(); setHeaderMenu(false) }}><Plus className="size-4" aria-hidden="true" />{t('workbench.newThread')}</ComposerMenuItem>
            <ComposerMenuItem disabled={visibleItems.findIndex(item => item.id === activeId) <= 0} onClick={() => { switchRelative(-1); setHeaderMenu(false) }}><ChevronLeft className="size-4" aria-hidden="true" />{t('workbench.previousThread')}</ComposerMenuItem>
            <ComposerMenuItem disabled={visibleItems.findIndex(item => item.id === activeId) < 0 || visibleItems.findIndex(item => item.id === activeId) >= visibleItems.length - 1} onClick={() => { switchRelative(1); setHeaderMenu(false) }}><ChevronRight className="size-4" aria-hidden="true" />{t('workbench.nextThread')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => { setTitleDraft(title ?? ''); setRenaming(true); setHeaderMenu(false) }}><Settings2 className="size-4" aria-hidden="true" />{t('workbench.renameThread')}</ComposerMenuItem>
            <ComposerMenuItem onClick={toggleArchive}><Archive className="size-4" aria-hidden="true" />{t('workbench.archiveRestore')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => togglePin(activeId)}><Pin className="size-4" aria-hidden="true" />{t(currentItem?.custom?.pinned ? 'workbench.unpin' : 'workbench.pin')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => { setSidebar(value => !value); setHeaderMenu(false) }}><PanelLeft className="size-4" aria-hidden="true" />{t('workbench.toggleSidebar')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => { document.querySelector<HTMLInputElement>('.aui-composer-input')?.focus(); setHeaderMenu(false) }}><Search className="size-4" aria-hidden="true" />{t('workbench.focusMessage')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => { setMemoryOpen(value => !value); setHeaderMenu(false) }}><BrainCircuit className="size-4" aria-hidden="true" />{t('workbench.memory')}</ComposerMenuItem>
          </PopoverContent>
        </Popover>
        <button className={`${ghostButton} native-window-action size-8`} aria-label={t('titleBar.minimizeWindow')} onClick={() => { void window.nolaTranslator?.minimizeMainWindow() }}><Minus className="size-4" aria-hidden="true" /></button>
        <button className={`${ghostButton} native-window-action size-8`} aria-label={t('titleBar.maximizeWindow')} onClick={() => { void window.nolaTranslator?.toggleMainWindowMaximize() }}><Square className="size-3.5" aria-hidden="true" /></button>
        <button className={`${ghostButton} native-window-action size-8`} aria-label={t('common.close')} onClick={() => { void window.nolaTranslator?.closeMainWindow() }}><X className="size-4" aria-hidden="true" /></button>
      </header>
      <NativeConversation {...props} memoryOpen={memoryOpen} onMemoryClose={() => setMemoryOpen(false)} />
    </div>
  </div>
}

function NativeConversation(props: NativeAgentSurfaceProps & { memoryOpen: boolean; onMemoryClose: () => void }) {
  const { t } = useI18n()
  const aui = useAui()
  const empty = useAuiState(s => s.thread.messages.length === 0)
  const threadId = useAuiState(s => s.threads.mainThreadId)
  return <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col" data-testid="native-conversation">
    <ThreadPrimitive.Viewport data-hide-scrollbar className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6" turnAnchor="top" autoScroll>
      {props.memoryOpen ? <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6"><Breadcrumb aria-label={t('workbench.chats')} className="py-5"><BreadcrumbList><BreadcrumbItem><button type="button" className="rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={props.onMemoryClose}>{t('workbench.chats')}</button></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{t('workbench.memory')}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><div className="flex flex-1 items-start justify-center"><NativeAgentSettings page="memory" snapshot={props.snapshot} onAction={props.onAction} busy={props.busy} model={props.models.find(model => model.id === props.config.model)?.name ?? ''} onPrompt={() => undefined} memories={props.memories} onMemories={props.onMemories} /></div></div> : <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col">
        {empty ? <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8"><h1 className="text-2xl font-medium">{t('workbench.welcomeHeading')}</h1><div className="w-full px-6"><NativeComposer key={threadId} {...props} /></div></div> : <>
          <WorkbenchConfigContext.Provider value={props.config}><div className="flex-1 py-8"><ThreadPrimitive.Messages components={{ UserMessage: NativeUserMessage, AssistantMessage: NativeAssistantMessage }} /></div></WorkbenchConfigContext.Provider>
          <div className="sticky bottom-0 w-full shrink-0 bg-background pb-5 pt-3"><NativeComposer key={threadId} {...props} /></div>
        </>}
      </div>}
    </ThreadPrimitive.Viewport>
  </ThreadPrimitive.Root>
}

function NativeMarkdown() {
  const { t } = useI18n()
  return <MarkdownText copyLabel={t('workbench.copyResponse')} />
}

function NativeUserMessage() {
  const hasAttachments = useAuiState(s => !!s.message.attachments?.length)
  return <div className="mb-8"><NativeDaySeparator /><MessagePrimitive.Root data-role="user" className="group/message flex w-full flex-col items-end gap-2"><div className={['flex min-w-0 max-w-full items-end gap-2', hasAttachments && 'w-full max-w-sm'].filter(Boolean).join(' ')}><div className={['min-w-0 rounded-2xl bg-foreground/[0.04] px-3.5 py-2 text-sm', hasAttachments ? 'w-full' : 'max-w-[85%]'].filter(Boolean).join(' ')}><MessagePrimitive.Attachments components={{ Image: NativeUserAttachment, File: NativeUserAttachment, Document: NativeUserAttachment }} /><MessagePrimitive.Parts components={{ Text: NativeMarkdown }} /></div><NativeMessageTimestamp /></div></MessagePrimitive.Root></div>
}

function NativeDaySeparator() {
  const { language } = useI18n()
  const current = useAuiState(state => state.message)
  const messages = useAuiState(state => state.thread.messages)
  if (!current.createdAt) return null
  const previous = messages[current.index - 1]
  const date = current.createdAt
  if (previous?.createdAt && previous.createdAt.toDateString() === date.toDateString()) return null
  const day = date.toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' })
  return <DaySeparator className="max-w-none [&>div>div:last-child]:min-h-0 [&>div>div:last-child]:gap-0 [&>div>div:last-child>span:first-child]:hidden [&>div>div:last-child>span:last-child]:hidden" messages={[{ id: current.id, day, time: '', role: 'assistant', text: '' }]} />
}

function NativeMessageTimestamp() {
  const { language } = useI18n()
  const createdAt = useAuiState(state => state.message.createdAt)
  if (!createdAt) return null
  const time = createdAt.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
  return <time dateTime={createdAt.toISOString()} className="shrink-0 text-[11px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">{time}</time>
}

function NativeImage(props: Omit<React.ComponentProps<typeof Image>, 'labels'>) {
  const { t } = useI18n()
  return <Image {...props} labels={{ content: t('workbench.imageContent'), zoom: t('workbench.zoomImage'), zoomed: t('workbench.zoomedImage'), close: t('workbench.closeZoom'), generating: t('workbench.generatingImage'), error: t('workbench.imageError'), blocked: t('workbench.imageBlocked'), regenerate: t('workbench.regenerateImage'), download: t('workbench.downloadImage'), copy: t('workbench.copyImage') }} />
}

function NativeUserAttachment() {
  const src = useAttachmentSrc()
  const attachment = useAuiState(state => state.attachment)
  if (attachment.type === 'image' && src) return <Image.Root className="mb-2 max-w-80"><Image.Preview src={src} alt={attachment.name} /><Image.Filename>{attachment.name}</Image.Filename></Image.Root>
  const part = attachment.content?.find(part => part.type === 'file')
  return <AttachmentPrimitive.Root className="mb-2 w-full min-w-0 max-w-sm">
    <File.Root className="w-full min-w-0"><File.Icon mimeType={attachment.contentType} /><File.Name title={attachment.name}><AttachmentPrimitive.Name /></File.Name>{attachment.file && <File.Size bytes={attachment.file.size} />}{part?.type === 'file' && <File.Download data={part.data} mimeType={part.mimeType} filename={attachment.name} />}</File.Root>
    {part?.type === 'file' && <File.Player className="mt-2" data={part.data} mimeType={part.mimeType} filename={attachment.name} />}
  </AttachmentPrimitive.Root>
}

function NativeComposerAttachment() {
  const { t } = useI18n()
  const attachment = useAuiState(state => state.attachment)
  return <AttachmentPrimitive.Root className="flex min-w-0 max-w-full flex-col gap-1">
    <File.Root className="max-w-full min-w-0"><File.Icon mimeType={attachment.contentType} /><File.Name title={attachment.name}><AttachmentPrimitive.Name /></File.Name>{attachment.file && <File.Size bytes={attachment.file.size} />}<AttachmentPrimitive.Remove aria-label={t('workbench.removeAttachment', { name: attachment.name })} className={ghostButton}><X className="size-4" aria-hidden="true" /></AttachmentPrimitive.Remove></File.Root>
    {attachment.status.type === 'incomplete' && <p role="alert" className="text-sm text-destructive">{attachment.status.message || t('workbench.actionFailed')}</p>}
  </AttachmentPrimitive.Root>
}

const MEDIA_TOOLS = {
  nola_extract_audio: 'extractAudio', nola_prepare_audio: 'prepareAudio', nola_transcribe_audio: 'transcribeAudio',
  nola_translate_text: 'translateText', nola_translate_image: 'translateImage', nola_synthesize_speech: 'synthesizeSpeech',
  recognize_audio: 'transcribeAudio', translate_text: 'translateText', translate_image: 'translateImage',
  synthesize_speech: 'synthesizeSpeech', list_models: 'inspectDefaultModels', list_voices: 'inspectVoices',
} as const
function isMediaTool(name: string): name is keyof typeof MEDIA_TOOLS { return Object.hasOwn(MEDIA_TOOLS, name) }

export interface NativeMediaStepProps { part: ToolCallMessagePart; running: boolean }
function NativeMediaStep({ part, running }: NativeMediaStepProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!isMediaTool(part.toolName)) return null
  const label = t(`workbench.${MEDIA_TOOLS[part.toolName]}`)
  const result = part.result && typeof part.result === 'object' ? part.result as Record<string, unknown> : undefined
  const query = String(part.args.filename || part.args.model || result?.model || part.args.target || '')
  if (part.isError || (!running && part.result === undefined)) return <div className="text-sm text-muted-foreground"><p>{label} · {t(part.isError ? 'workbench.taskFailed' : 'workbench.cancel')}</p>{part.isError && <p role="alert">{errorDetail(part.result)}</p>}</div>
  return <ToolCall labels={{ request: t('workbench.requestLabel'), result: t('workbench.resultLabel') }} label={label} activeLabel={label} query={query} request={part.argsText} result={typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2) ?? ''}
    running={running && part.result === undefined} open={open} onOpenChange={setOpen} />
}

function NativeMediaWorkflow() {
  const { t } = useI18n()
  const content = useAuiState(s => s.message.content)
  const messageStatus = useAuiState(s => s.message.status)
  const timing = useMessageTiming()
  const [expanded, setExpanded] = useState<boolean | undefined>()
  const steps = content.filter((part): part is ToolCallMessagePart => part.type === 'tool-call' && isMediaTool(part.toolName))
  if (!steps.length) return null
  const running = messageStatus?.type === 'running'
  const failed = steps.some(part => part.isError) || messageStatus?.type === 'incomplete' && messageStatus.reason === 'error'
  const cancelled = messageStatus?.type === 'incomplete' && messageStatus.reason === 'cancelled'
  return <div data-slot="media-workflow" className="w-full min-w-0"><RunActivity
    status={running ? 'running' : failed ? 'error' : cancelled ? 'cancelled' : 'complete'}
    statusLabel={t(running ? 'workbench.mediaWorkflowRunning' : failed ? 'workbench.taskFailed' : cancelled ? 'workbench.cancel' : 'workbench.mediaWorkflowComplete')}
    durationLabel={timing?.totalStreamTime === undefined ? undefined : `${(timing.totalStreamTime / 1000).toFixed(1)} s`}
    open={expanded ?? running} onOpenChange={setExpanded}
    entries={steps.map(part => ({ id: part.toolCallId, kind: 'tool', label: isMediaTool(part.toolName) ? t(`workbench.${MEDIA_TOOLS[part.toolName]}`) : part.toolName,
      content: <NativeMediaStep part={part} running={running} /> }))} />
  </div>
}

function NativeReasoning() {
  const streaming = useAuiState(s => s.part.status.type === 'running')
  return <ReasoningRoot variant="ghost" streaming={streaming}><ReasoningTrigger active={streaming} /><ReasoningContent><ReasoningText><NativeMarkdown /></ReasoningText></ReasoningContent></ReasoningRoot>
}

function NativeAssistantMessage() {
  const { t } = useI18n()
  const config = useContext(WorkbenchConfigContext)
  const aui = useAui()
  const running = useAuiState(s => s.message.status?.type === 'running')
  const content = useAuiState(s => s.message.content)
  const hasWorkflow = content.some(part => part.type === 'tool-call' && isMediaTool(part.toolName))
  const hasContent = content.some(part => part.type === 'text' || part.type === 'reasoning' ? !!part.text.trim() : true)
  const audioRequest = useAuiState(s => {
    const user = s.thread.messages.slice(0, s.message.index).reverse().find(message => message.role === 'user')
    return user?.attachments.some(attachment => attachment.contentType?.startsWith('audio/')) ?? false
  })
  const error = useAuiState(s => s.message.status?.type === 'incomplete' ? s.message.status.error : undefined)
  const errorText = errorDetail(error)
  const missingProjector = /mmproj|vision projector|视觉投影文件/i.test(errorText)
  const projectorDownloadStarted = errorText === 'NOLA_IMAGE_PROJECTOR_DOWNLOAD_STARTED'
  const projectorDownloadFailed = errorText === 'NOLA_IMAGE_PROJECTOR_DOWNLOAD_FAILED'
  const localTtsNoAudio = config?.kind === 'tts' && /synthesize returned no audio|returned no audio/i.test(errorText)
  const errorTitle = projectorDownloadStarted ? t('workbench.imageProjectorDownloadTitle')
    : missingProjector || projectorDownloadFailed ? t('workbench.imageProjectorMissingTitle')
    : config?.kind === 'tts' ? t('workbench.localTtsError')
    : config?.kind === 'asr' ? (config.model.startsWith('cloud:') ? t('workbench.serviceError') : t('workbench.localAsrError'))
    : config?.kind === 'mt' ? (config.model.startsWith('resource:') ? t('workbench.localMtError') : t('workbench.serviceError'))
    : config?.model.startsWith('resource:') ? t('workbench.localLlmError')
    : t('workbench.networkError')
  const [copied, setCopied] = useState(false)
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null)
  const [more, setMore] = useState(false)
  return <div className="mb-8"><NativeDaySeparator /><MessagePrimitive.Root data-role="assistant" className="group/message flex w-full flex-col items-start gap-3">
    <NativeMediaWorkflow />
    {running && !hasContent && <ThinkingIndicator role="status" label={t(audioRequest ? 'workbench.transcribingMedia' : 'workbench.thinkingProcess')} />}
    {!running && !hasContent && !error && <p role="status" className="text-sm text-muted-foreground">{t('workbench.emptyResult')}</p>}
    <MessagePrimitive.Parts components={{ Text: NativeMarkdown, Reasoning: NativeReasoning, tools: { Fallback: NativeTool }, File, Image: NativeImage, Source: Sources }} />
    {!hasWorkflow && <NativeMessageTiming />}
    {error && <ErrorState
      title={errorTitle}
      detail={projectorDownloadStarted ? t('workbench.imageProjectorDownloadStarted') : missingProjector || projectorDownloadFailed ? t('workbench.imageProjectorMissingDetail')
        : localTtsNoAudio ? `${t('workbench.localTtsNoAudio')} ${errorText}` : errorText}
      retryLabel={t('workbench.retry')} retryingLabel={t('workbench.retrying')}
      retrying={running} onRetry={() => aui.message.reload()}
    />}
    <NativeMessageTimestamp />
    {!running && <div className="relative"><MessageActions labels={{ copied: t('workbench.copiedResponse'), copy: t('workbench.copyResponse'), helpful: t('workbench.helpfulResponse'), unhelpful: t('workbench.unhelpfulResponse'), regenerate: t('workbench.regenerateResponse'), more: t('workbench.moreOptions') }} copied={copied} reaction={reaction} regenerating={false} onCopy={() => { void navigator.clipboard.writeText(content.filter(part => part.type === 'text').map(part => part.text).join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} onReactionChange={value => { setReaction(value); if (value) aui.message.submitFeedback({ type: value === 'up' ? 'positive' : 'negative' }) }} onRegenerate={() => aui.message.reload()} onMore={() => setMore(value => !value)} />{more && <ComposerMenu open><ComposerMenuItem onClick={() => { aui.message.speak(); setMore(false) }}>{t('workbench.readAloud')}</ComposerMenuItem></ComposerMenu>}</div>}
  </MessagePrimitive.Root></div>
}

function NativeMessageTiming() {
  const { t } = useI18n()
  const timing = useMessageTiming()
  const milliseconds = timing?.totalStreamTime
  if (milliseconds === undefined) return null
  const duration = milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(1)} s`
  return <span className="text-[11px] tabular-nums text-muted-foreground">{t('workbench.nativeReplyTime', { duration })}</span>
}

function errorDetail(error: unknown): string {
  if (typeof error === 'string') {
    try {
      const parsed: unknown = JSON.parse(error)
      if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') return parsed.message
    } catch { /* Keep non-JSON error text as-is. */ }
    return error
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return error ? JSON.stringify(error) : ''
}

function NativeTool(props: ToolCallMessagePartProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const { args, argsText, result, status, approval, toolName } = props
  const running = status.type === 'running'
  if (isMediaTool(toolName)) return null
  const decide = (approved: boolean, optionId?: string) => {
    if (pending) return
    setPending(true)
    void props.respondToApproval(optionId ? { optionId } : { approved }).catch(error => notifyError(t('workbench.actionFailed'), { cause: error })).finally(() => setPending(false))
  }
  if (approval && approval.approved === undefined) {
    const options = approval.options ?? []
    const allowOnce = options.find(option => option.kind === 'allow-once')
    const alwaysAllow = options.find(option => option.kind === 'allow-always')
    const deny = options.find(option => option.kind === 'reject-once' || option.kind === 'reject-always')
    return <ApprovalCard state="request" title={typeof args.title === 'string' ? args.title : toolName}
      subtitle={typeof args.subtitle === 'string' ? args.subtitle : t('workbench.sandboxHint')}
      description={typeof args.description === 'string' ? args.description : undefined}
      command={typeof args.command === 'string' ? args.command : argsText}
      onAllowOnce={pending ? undefined : () => decide(true, allowOnce?.id)}
      onAlwaysAllow={pending || !alwaysAllow ? undefined : () => decide(true, alwaysAllow.id)}
      onDeny={pending ? undefined : () => decide(false, deny?.id)}
      allowOnceLabel={t('workbench.allowOnce')} alwaysAllowLabel={t('workbench.allowAlways')} denyLabel={t('workbench.deny')} />
  }
  if (props.isError || status.type === 'requires-action' || status.type === 'incomplete' || approval?.approved === false) return <ToolFallback {...props} />
  if (toolName === 'terminal') {
    let output = result
    if (typeof output === 'string') { try { output = JSON.parse(output) } catch { /* Plain terminal output is also valid. */ } }
    const record = output && typeof output === 'object' ? output as Record<string, unknown> : {}
    const text = typeof record.output === 'string' ? record.output : typeof output === 'string' ? output : ''
    return <TerminalBlock command={String(args.command ?? '')} lines={text.split('\n')} visibleCount={text.split('\n').length} done={!running} exitCode={typeof record.exitCode === 'number' ? record.exitCode : undefined} />
  }
  return <>{toolName.startsWith('delegate_') && <SubagentList agents={[{ name: t('workbench.subagents'), model: '' }]} completedCount={running ? 0 : 1} progress={[running ? 0 : 100]} showSummary={false} summaryAgent={{ name: '', model: '' }} />}<ToolCall labels={{ request: t('workbench.requestLabel'), result: t('workbench.resultLabel') }} label={toolName} activeLabel={toolName} query={argsText} request={argsText} result={typeof result === 'string' ? result : JSON.stringify(result, null, 2) ?? ''} running={running} open={open} onOpenChange={setOpen} /></>
}

function NativeComposer(props: NativeAgentSurfaceProps) {
  const { t, language } = useI18n()
  const aui = useAui()
  const text = useAuiState(s => s.composer.text)
  const attachments = useAuiState(s => s.composer.attachments)
  const preparing = useAuiState(s => !!s.composer.submission)
  const dictation = useAuiState(s => s.composer.dictation)
  const messages = useAuiState(s => s.thread.messages)
  const running = useAuiState(s => s.thread.isRunning)
  const threadId = useAuiState(s => s.threads.mainThreadId)
  const [savedDraft, setSavedDraft] = useState(() => { try { return localStorage.getItem(`nola.native.draft:${threadId}`) ?? '' } catch { return '' } })
  const edited = useRef(false)
  useEffect(() => {
    try {
      if (text) { edited.current = true; localStorage.setItem(`nola.native.draft:${threadId}`, text) }
      else if (edited.current) localStorage.removeItem(`nola.native.draft:${threadId}`)
    } catch { /* Draft persistence is optional when browser storage is unavailable. */ }
  }, [text, threadId])
  const [menu, setMenu] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [seconds, setSeconds] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!menu) return undefined
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && !target.closest('[data-testid="native-composer"]')) setMenu('')
    }
    const closeOnFocusOutside = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof Element && !target.closest('[data-testid="native-composer"]')) setMenu('')
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu('')
    }
    const closeOnBlur = () => setMenu('')
    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('focusin', closeOnFocusOutside)
    window.addEventListener('blur', closeOnBlur)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('focusin', closeOnFocusOutside)
      window.removeEventListener('blur', closeOnBlur)
    }
  }, [menu])
  useEffect(() => {
    setSeconds(0)
    if (!dictation) return
    const timer = setInterval(() => setSeconds(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [!!dictation])
  const profile = props.profiles.find(profile => `custom:${profile.id}` === props.config.model)
  const usage = [...messages].reverse().find(message => message.role === 'assistant' && message.metadata?.custom?.usage)?.metadata.custom.usage as { inputTokens?: number; outputTokens?: number; totalTokens?: number; reasoningTokens?: number } | undefined
  const selected = props.models.find(model => model.id === props.config.model)
  const contextWindow = profile?.contextWindow ?? selected?.contextWindow ?? 0
  const send = () => { if (preparing || running) aui.thread.composer().cancel(); else if (props.config.model && (text.trim() || attachments.length)) aui.thread.composer().send() }
  const pick = (change: Partial<PlaygroundConfig>, closeMenu = true) => {
    if (preparing || running) return
    const model = props.models.find(item => item.id === change.model)
    props.onChange({ ...props.config, ...change,
      ...(model?.sourceLanguages?.length && !model.sourceLanguages.includes(props.config.source) ? { source: model.sourceLanguages[0] } : {}),
      ...(model?.targetLanguages?.length && !model.targetLanguages.includes(props.config.target) ? { target: model.targetLanguages[0] } : {}),
    })
    if (closeMenu) setMenu('')
  }
  const sourceCodes = selected?.sourceLanguages?.length ? selected.sourceLanguages : ['auto', ...LANGUAGE_CODES]
  const targetCodes = selected?.targetLanguages?.length ? selected.targetLanguages : LANGUAGE_CODES
  const chooseVoices = () => {
    setMenu(menu === 'voice' ? '' : 'voice')
    if (!props.voices.length) void import('@/store').then(async ({ getBridge }) => {
      const result = await getBridge()?.app.directModel?.({ id: crypto.randomUUID(), model: props.config.model, kind: 'tts' }, true)
      props.onVoices(result?.voices ?? [])
    }).catch(error => notifyError(t('workbench.actionFailed'), { cause: error }))
  }
  return <Composer className="max-w-none" data-testid="native-composer">
    {!!savedDraft && !text && <DraftRestore draft={savedDraft} savedAt={t('workbench.nativeDraft')} onRestore={() => { aui.thread.composer().setText(savedDraft); setSavedDraft('') }} onDiscard={() => { setSavedDraft(''); try { localStorage.removeItem(`nola.native.draft:${threadId}`) } catch { /* Keep dismissing usable when storage is unavailable. */ } }} />}
    {menu === 'models' && <ComposerMenu open anchor="models"><p className="px-2.5 py-2 text-xs text-muted-foreground"><ModelAvailabilityLabel label={t('nav.models')} hint={t('gateway.modelNoneHint')} /></p><ComposerInput className="mx-2 w-[calc(100%-1rem)] rounded-lg border border-border bg-background" placeholder={t('workbench.searchModels')} value={modelQuery} onChange={event => setModelQuery(event.target.value)} />{(['llm', 'asr', 'mt', 'tts'] as const).map(kind => <div key={kind}><p className="px-2.5 py-2 text-xs text-muted-foreground">{t(`workbench.${kind}`)}</p>{props.models.filter(model => model.kind === kind && model.name.toLowerCase().includes(modelQuery.toLowerCase())).map(model => <ComposerModelItem key={model.id} entry={{ name: model.name, meta: t(`workbench.${kind}`) }} selected={props.config.model === model.id} onClick={() => pick({ model: model.id, kind: model.kind, images: model.images, voice: '' })} />)}</div>)}<ComposerMenuItem onClick={props.onConfigure}><Settings2 className="size-4" aria-hidden="true" />{t('nav.models')}</ComposerMenuItem></ComposerMenu>}
    {menu === 'effort' && <ComposerMenu open anchor="effort" className="w-80 gap-3 p-3"><ReasoningEffort variant="slider" levels={(['auto', 'low', 'medium', 'high'] as const).map(key => ({ key, label: t(key === 'auto' ? 'modelsSettingsUi.default' : `workbench.${key}`) }))} selectedKey={props.config.effort} title={t('workbench.reasoningTokens')} onSelect={effort => pick({ effort }, false)} /></ComposerMenu>}
    {menu === 'language' && <ComposerMenu open anchor="language">{(props.config.kind === 'mt' ? targetCodes : sourceCodes).map(code => <ComposerMenuItem key={code} onClick={() => pick(props.config.kind === 'mt' ? { target: code } : { source: code })}>{code === 'auto' ? t('workbench.auto') : languageName(code, language)}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'source' && <ComposerMenu open anchor="source">{sourceCodes.map(code => <ComposerMenuItem key={code} onClick={() => pick({ source: code })}>{code === 'auto' ? t('workbench.auto') : languageName(code, language)}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'voice' && <ComposerMenu open anchor="voice">{props.voices.map(voice => <ComposerMenuItem key={voice} onClick={() => pick({ voice })}>{voice}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'context' && <ComposerMenu open align="end"><ContextBreakdown limit={contextWindow} segments={[{ label: t('workbench.inputTokens'), tokens: usage?.inputTokens ?? 0, tint: 'bg-blue-400' }, { label: t('workbench.outputTokens'), tokens: usage?.outputTokens ?? 0, tint: 'bg-blue-600' }]} /></ComposerMenu>}
    <ComposerBar>
      {attachments.length > 0 && <ComposerAttachments><ComposerPrimitive.Attachments components={{ Attachment: NativeComposerAttachment }} /></ComposerAttachments>}
      {dictation ? <ComposerVoice recording={dictation.status.type === 'running'} seconds={seconds} /> : <ComposerPrimitive.Input className="aui-composer-input min-h-11 max-h-40 w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted-foreground" rows={1} addAttachmentOnPaste={false} placeholder={props.placeholder} readOnly={!props.config.model} onPaste={event => {
        const kind = props.config.kind
        if (kind === 'tts' || kind === 'mt' && !props.config.images) return
        const clipboard = event.clipboardData
        const clipboardFiles = Array.from(clipboard.files)
        const files = clipboardFiles.length > 0
          ? clipboardFiles
          : Array.from(clipboard.items).filter(item => item.kind === 'file').flatMap(item => {
              const file = item.getAsFile()
              return file ? [file] : []
            })
        const acceptedFiles = files.filter(file => {
          const name = file.name.toLowerCase()
          if (kind === 'asr') return file.type.startsWith('audio/') || file.type.startsWith('video/')
          if (kind === 'mt') return file.type.startsWith('image/')
          return file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type.startsWith('video/') || file.type.startsWith('text/') || /\.(md|json|txt)$/.test(name)
        })
        if (acceptedFiles.length === 0) return
        event.preventDefault()
        for (const file of acceptedFiles) {
          const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1] || 'bin'
          const attachment = file.name ? file : new globalThis.File([file], `pasted-attachment.${extension}`, { type: file.type })
          void aui.thread.composer().addAttachment(attachment).catch(error => notifyError(t('workbench.actionFailed'), { cause: error }))
        }
      }} />}
      <ComposerToolbar><ComposerActions>
        <ComposerAttachButton aria-label={t('workbench.addAttachment')} disabled={props.config.kind === 'tts' || props.config.kind === 'mt' && !props.config.images} onClick={() => inputRef.current?.click()} />
        <ComposerModelTrigger data-menu-anchor="models" model={selected?.name ?? t('workbench.noModels')} open={menu === 'models'} onClick={() => setMenu(menu === 'models' ? '' : 'models')} />
        {props.config.kind === 'llm' && <ComposerModelTrigger data-menu-anchor="effort" model={t(props.config.effort === 'auto' ? 'modelsSettingsUi.default' : `workbench.${props.config.effort as 'low' | 'medium' | 'high'}`)} open={menu === 'effort'} onClick={() => setMenu(menu === 'effort' ? '' : 'effort')} />}
        {props.config.kind === 'mt' && <ComposerModelTrigger data-menu-anchor="source" model={props.config.source === 'auto' ? t('workbench.auto') : languageName(props.config.source, language)} open={menu === 'source'} onClick={() => setMenu(menu === 'source' ? '' : 'source')} />}
        {(props.config.kind === 'asr' || props.config.kind === 'mt') && <ComposerModelTrigger data-menu-anchor="language" model={languageName(props.config.kind === 'mt' ? props.config.target : props.config.source, language)} open={menu === 'language'} onClick={() => setMenu(menu === 'language' ? '' : 'language')} />}
        {props.config.kind === 'tts' && <ComposerModelTrigger data-menu-anchor="voice" model={props.config.voice || t('workbench.voice')} open={menu === 'voice'} onClick={chooseVoices} />}
      </ComposerActions><ComposerActions>
        {props.config.kind === 'llm' && <div><ComposerContext labels={{ context: t('workbench.contextUsage'), system: t('workbench.contextSystem'), tools: t('workbench.contextTools'), messages: t('workbench.contextMessages'), total: t('workbench.contextTotal') }} usage={{ system: 0, tools: 0, messages: (usage?.totalTokens ?? 0) / 1000, total: contextWindow / 1000 }} /></div>}
        <ComposerVoiceButton active={!!dictation} aria-label={t(dictation ? 'workbench.stopDictation' : 'workbench.record')} onClick={() => { if (dictation) aui.thread.composer().stopDictation(); else aui.thread.composer().startDictation() }} />
        <ComposerSend aria-label={t(running || preparing ? 'workbench.stopGenerating' : 'workbench.sendMessage')} className={running || preparing ? 'aui-composer-cancel' : 'aui-composer-send'} streaming={running || preparing} idle={!preparing && !text.trim() && !attachments.length} disabled={!running && !preparing && (!props.config.model || !text.trim() && !attachments.length)} onClick={send} />
      </ComposerActions></ComposerToolbar>
    </ComposerBar>
    <input ref={inputRef} type="file" className="hidden" multiple accept={props.config.kind === 'asr' ? 'audio/*,video/*' : props.config.images || props.config.kind === 'llm' ? 'image/*,audio/*,video/*,text/*,.md,.json' : 'text/*,.md,.json'} onChange={event => { for (const file of event.target.files ?? []) void aui.thread.composer().addAttachment(file).catch(error => notifyError(t('workbench.actionFailed'), { cause: error })); event.target.value = '' }} />
  </Composer>
}
