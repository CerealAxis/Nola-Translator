import { useEffect, useMemo, useRef, useState } from 'react'
import { AuiIf, MessagePrimitive, ThreadPrimitive, useAui, useAuiState, type ToolCallMessagePartProps } from '@assistant-ui/react'
import { Archive, BrainCircuit, ChevronLeft, ChevronRight, Ellipsis, Minus, PanelLeft, Pin, Plus, Search, Settings2, Square, X } from 'lucide-react'
import { Composer, ComposerActions, ComposerAttachButton, ComposerAttachmentChip, ComposerAttachments, ComposerBar, ComposerContext, ComposerInput, ComposerMenu, ComposerMenuItem, ComposerModelItem, ComposerModelTrigger, ComposerSend, ComposerToolbar, ComposerVoice, ComposerVoiceButton } from '@/components/assistant-ui/native/composer'
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
import { SubagentList } from '@/components/assistant-ui/native/subagent-list'
import { ToolFallback } from '@/components/assistant-ui/native/tool-fallback.aui'
import { DraftRestore } from '@/components/assistant-ui/native/draft-restore'
import { ErrorState } from '@/components/assistant-ui/native/error-state'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { useAttachmentSrc } from '@/hooks/use-attachment-src'
import { ghostButton } from '@/components/assistant-ui/native/surfaces'
import { useI18n } from '@/i18n'
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

/** Only application wiring lives here; every visible control comes from the unmodified Elements catalog. */
export function NativeAgentSurface(props: NativeAgentSurfaceProps) {
  const { t } = useI18n()
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
    <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6" turnAnchor="top">
      {props.memoryOpen ? <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6"><Breadcrumb aria-label={t('workbench.chats')} className="py-5"><BreadcrumbList><BreadcrumbItem><button type="button" className="rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={props.onMemoryClose}>{t('workbench.chats')}</button></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{t('workbench.memory')}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><div className="flex flex-1 items-start justify-center"><NativeAgentSettings page="memory" snapshot={props.snapshot} onAction={props.onAction} busy={props.busy} model={props.models.find(model => model.id === props.config.model)?.name ?? ''} onPrompt={() => undefined} memories={props.memories} onMemories={props.onMemories} /></div></div> : <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col">
        {empty ? <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8"><h1 className="text-2xl font-medium">{t('workbench.welcomeHeading')}</h1><div className="w-full px-6"><NativeComposer key={threadId} {...props} /></div></div> : <>
          <div className="flex-1 py-8"><ThreadPrimitive.Messages components={{ UserMessage: NativeUserMessage, AssistantMessage: NativeAssistantMessage }} /></div>
          <div className="sticky bottom-0 w-full shrink-0 bg-background pb-5 pt-3"><NativeComposer key={threadId} {...props} /></div>
        </>}
      </div>}
    </ThreadPrimitive.Viewport>
  </ThreadPrimitive.Root>
}

function NativeUserMessage() {
  return <><NativeDaySeparator /><MessagePrimitive.Root data-role="user" className="group/message flex w-full flex-col items-end gap-2"><div className="flex max-w-full items-end gap-2"><div className="max-w-[85%] rounded-2xl bg-foreground/[0.04] px-3.5 py-2 text-sm"><MessagePrimitive.Attachments components={{ Image: NativeUserAttachment, File: NativeUserAttachment, Document: NativeUserAttachment }} /><MessagePrimitive.Parts components={{ Text: MarkdownText, File, Image }} /></div><NativeMessageTimestamp /></div></MessagePrimitive.Root></>
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

function NativeUserAttachment() {
  const src = useAttachmentSrc()
  const attachment = useAuiState(state => state.attachment)
  if (attachment.type === 'image' && src) return <Image.Root className="mb-2 max-w-80"><Image.Preview src={src} alt={attachment.name} /><Image.Filename>{attachment.name}</Image.Filename></Image.Root>
  return <File.Root className="mb-2 max-w-80"><File.Icon mimeType={attachment.contentType} /><File.Name>{attachment.name}</File.Name>{attachment.file && <File.Size bytes={attachment.file.size} />}</File.Root>
}

function NativeReasoning() {
  const streaming = useAuiState(s => s.part.status.type === 'running')
  return <ReasoningRoot variant="ghost" streaming={streaming}><ReasoningTrigger active={streaming} /><ReasoningContent><ReasoningText><MarkdownText /></ReasoningText></ReasoningContent></ReasoningRoot>
}

function NativeAssistantMessage() {
  const { t } = useI18n()
  const aui = useAui()
  const running = useAuiState(s => s.message.status?.type === 'running')
  const content = useAuiState(s => s.message.content)
  const error = useAuiState(s => s.message.status?.type === 'incomplete' ? s.message.status.error : undefined)
  const [copied, setCopied] = useState(false)
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null)
  const [more, setMore] = useState(false)
  return <><NativeDaySeparator /><MessagePrimitive.Root data-role="assistant" className="group/message flex w-full flex-col items-start gap-3">
    {running && !content.length && <ThinkingIndicator label={t('workbench.thinkingProcess')} />}
    <MessagePrimitive.Parts components={{ Text: MarkdownText, Reasoning: NativeReasoning, tools: { Fallback: NativeTool }, File, Image, Source: Sources }} />
    {error && <ErrorState title={t('workbench.networkError')} detail={typeof error === 'string' ? error : JSON.stringify(error)} retrying={running} onRetry={() => aui.message.reload()} />}
    <NativeMessageTimestamp />
    {!running && <div className="relative"><MessageActions copied={copied} reaction={reaction} regenerating={false} onCopy={() => { void navigator.clipboard.writeText(content.filter(part => part.type === 'text').map(part => part.text).join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} onReactionChange={value => { setReaction(value); if (value) aui.message.submitFeedback({ type: value === 'up' ? 'positive' : 'negative' }) }} onRegenerate={() => aui.message.reload()} onMore={() => setMore(value => !value)} />{more && <ComposerMenu open><ComposerMenuItem onClick={() => { aui.message.speak(); setMore(false) }}>{t('workbench.readAloud')}</ComposerMenuItem></ComposerMenu>}</div>}
  </MessagePrimitive.Root></>
}

function NativeTool(props: ToolCallMessagePartProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const { args, argsText, result, status, approval, toolName } = props
  const running = status.type === 'running'
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
  if (status.type === 'requires-action' || status.type === 'incomplete' || approval?.approved === false) return <ToolFallback {...props} />
  if (toolName === 'terminal') {
    let output = result
    if (typeof output === 'string') { try { output = JSON.parse(output) } catch { /* Plain terminal output is also valid. */ } }
    const record = output && typeof output === 'object' ? output as Record<string, unknown> : {}
    const text = typeof record.output === 'string' ? record.output : typeof output === 'string' ? output : ''
    return <TerminalBlock command={String(args.command ?? '')} lines={text.split('\n')} visibleCount={text.split('\n').length} done={!running} exitCode={typeof record.exitCode === 'number' ? record.exitCode : undefined} />
  }
  return <>{toolName.startsWith('delegate_') && <SubagentList agents={[{ name: t('workbench.subagents'), model: '' }]} completedCount={running ? 0 : 1} progress={[running ? 0 : 100]} showSummary={false} summaryAgent={{ name: '', model: '' }} />}<ToolCall label={toolName} activeLabel={toolName} query={argsText} request={argsText} result={typeof result === 'string' ? result : JSON.stringify(result, null, 2) ?? ''} running={running} open={open} onOpenChange={setOpen} /></>
}

function NativeComposer(props: NativeAgentSurfaceProps) {
  const { t, language } = useI18n()
  const aui = useAui()
  const text = useAuiState(s => s.composer.text)
  const attachments = useAuiState(s => s.composer.attachments)
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu('')
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      document.removeEventListener('keydown', closeOnEscape)
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
  const send = () => { if (running) aui.thread.cancelRun(); else if (props.config.model && (text.trim() || attachments.length)) aui.thread.composer().send() }
  const pick = (change: Partial<PlaygroundConfig>, closeMenu = true) => {
    if ('model' in change || 'kind' in change) aui.thread.cancelRun()
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
    {menu === 'models' && <ComposerMenu open><ComposerInput placeholder={t('workbench.searchModels')} value={modelQuery} onChange={event => setModelQuery(event.target.value)} />{(['llm', 'asr', 'mt', 'tts'] as const).map(kind => <div key={kind}><p className="px-2.5 py-2 text-xs text-muted-foreground">{t(`workbench.${kind}`)}</p>{props.models.filter(model => model.kind === kind && model.name.toLowerCase().includes(modelQuery.toLowerCase())).map(model => <ComposerModelItem key={model.id} entry={{ name: model.name, meta: t(`workbench.${kind}`) }} selected={props.config.model === model.id} onClick={() => pick({ model: model.id, kind: model.kind, images: model.images, voice: '' })} />)}</div>)}<ComposerMenuItem onClick={props.onConfigure}><Settings2 className="size-4" aria-hidden="true" />{t('nav.models')}</ComposerMenuItem></ComposerMenu>}
    {menu === 'effort' && <ComposerMenu open className="w-80 gap-3 p-3"><ReasoningEffort variant="slider" levels={(['auto', 'low', 'medium', 'high'] as const).map(key => ({ key, label: t(key === 'auto' ? 'modelsSettingsUi.default' : `workbench.${key}`) }))} selectedKey={props.config.effort} title={t('workbench.reasoningTokens')} onSelect={effort => pick({ effort }, false)} /></ComposerMenu>}
    {menu === 'language' && <ComposerMenu open>{(props.config.kind === 'mt' ? targetCodes : sourceCodes).map(code => <ComposerMenuItem key={code} onClick={() => pick(props.config.kind === 'mt' ? { target: code } : { source: code })}>{code === 'auto' ? t('workbench.auto') : languageName(code, language)}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'source' && <ComposerMenu open>{sourceCodes.map(code => <ComposerMenuItem key={code} onClick={() => pick({ source: code })}>{code === 'auto' ? t('workbench.auto') : languageName(code, language)}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'voice' && <ComposerMenu open>{props.voices.map(voice => <ComposerMenuItem key={voice} onClick={() => pick({ voice })}>{voice}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'context' && <ComposerMenu open align="end"><ContextBreakdown limit={profile?.contextWindow ?? 0} segments={[{ label: t('workbench.inputTokens'), tokens: usage?.inputTokens ?? 0, tint: 'bg-blue-400' }, { label: t('workbench.outputTokens'), tokens: usage?.outputTokens ?? 0, tint: 'bg-blue-600' }]} /></ComposerMenu>}
    <ComposerBar>
      {attachments.length > 0 && <ComposerAttachments>{attachments.map(attachment => <ComposerAttachmentChip key={attachment.id} attachment={{ name: attachment.name, meta: attachment.contentType ?? '', state: attachment.status.type === 'running' ? 'uploading' : attachment.status.type === 'incomplete' ? 'error' : 'done', progress: attachment.status.type === 'running' ? attachment.status.progress : undefined, kind: attachment.type === 'image' ? 'image' : 'text' }} onRemove={() => aui.thread.composer().attachment({ id: attachment.id }).remove()} />)}</ComposerAttachments>}
      {dictation ? <ComposerVoice recording={dictation.status.type === 'running'} seconds={seconds} /> : <ComposerInput className="aui-composer-input" value={text} onChange={event => aui.thread.composer().setText(event.target.value)} onSubmit={send} placeholder={props.placeholder} readOnly={!props.config.model || props.config.kind === 'asr'} onPaste={event => {
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
          if (kind === 'asr') return file.type.startsWith('audio/')
          if (kind === 'mt') return file.type.startsWith('image/')
          return file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type.startsWith('text/') || /\.(md|json|txt)$/.test(name)
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
        <ComposerModelTrigger model={selected?.name ?? t('workbench.noModels')} open={menu === 'models'} onClick={() => setMenu(menu === 'models' ? '' : 'models')} />
        {props.config.kind === 'llm' && <ComposerModelTrigger model={t(props.config.effort === 'auto' ? 'modelsSettingsUi.default' : `workbench.${props.config.effort as 'low' | 'medium' | 'high'}`)} open={menu === 'effort'} onClick={() => setMenu(menu === 'effort' ? '' : 'effort')} />}
        {props.config.kind === 'mt' && <ComposerModelTrigger model={props.config.source === 'auto' ? t('workbench.auto') : languageName(props.config.source, language)} open={menu === 'source'} onClick={() => setMenu(menu === 'source' ? '' : 'source')} />}
        {(props.config.kind === 'asr' || props.config.kind === 'mt') && <ComposerModelTrigger model={languageName(props.config.kind === 'mt' ? props.config.target : props.config.source, language)} open={menu === 'language'} onClick={() => setMenu(menu === 'language' ? '' : 'language')} />}
        {props.config.kind === 'tts' && <ComposerModelTrigger model={props.config.voice || t('workbench.voice')} open={menu === 'voice'} onClick={chooseVoices} />}
      </ComposerActions><ComposerActions>
        {props.config.kind === 'llm' && <div><ComposerContext usage={{ system: 0, tools: 0, messages: (usage?.totalTokens ?? 0) / 1000, total: (profile?.contextWindow ?? 0) / 1000 }} /></div>}
        <ComposerVoiceButton active={!!dictation} aria-label={t(dictation ? 'workbench.stopDictation' : 'workbench.record')} onClick={() => { if (dictation) aui.thread.composer().stopDictation(); else aui.thread.composer().startDictation() }} />
        <ComposerSend className={running ? 'aui-composer-cancel' : 'aui-composer-send'} streaming={running} idle={!text.trim() && !attachments.length} disabled={!running && (!props.config.model || !text.trim() && !attachments.length)} onClick={send} />
      </ComposerActions></ComposerToolbar>
    </ComposerBar>
    <input ref={inputRef} type="file" className="hidden" multiple accept={props.config.kind === 'asr' ? 'audio/*' : props.config.images || props.config.kind === 'llm' ? 'image/*,audio/*,text/*,.md,.json' : 'text/*,.md,.json'} onChange={event => { for (const file of event.target.files ?? []) void aui.thread.composer().addAttachment(file).catch(error => notifyError(t('workbench.actionFailed'), { cause: error })); event.target.value = '' }} />
  </Composer>
}
