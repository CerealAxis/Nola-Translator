import { ModelAvailabilityLabel } from '@/features/workspace/ModelAvailabilityLabel'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ActionBarPrimitive, AttachmentPrimitive, BranchPickerPrimitive, ComposerPrimitive, AuiIf, MessagePrimitive, ThreadPrimitive, useAui, useAuiState, useMessageTiming, type ToolCallMessagePart, type ToolCallMessagePartProps } from '@assistant-ui/react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NavigationItem } from '@/components/primitives/NavigationItem'
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { ArrowLeft, Archive, BrainCircuit, ChevronLeft, ChevronRight, Check, Copy, Ellipsis, Pencil, Pin, Plus, Search, Settings2, SquarePen, X } from 'lucide-react'
import { Composer, ComposerActions, ComposerAttachButton, ComposerAttachments, ComposerBar, ComposerContext, ComposerMenu, ComposerMenuItem, ComposerModelTrigger, ComposerSend, ComposerToolbar, ComposerVoice, ComposerVoiceButton } from '@/components/assistant-ui/native/composer'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ThreadList } from '@/components/assistant-ui/native/thread-list'
import { NativeAgentSettings } from './NativeAgentSettings'
import { NativeComicSelector } from './NativeComicSelector'
import { cancelComicReads } from './language-model-transport'
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
import { ghostButton, iconSwap, iconSwapIn, iconSwapOut } from '@/components/assistant-ui/native/surfaces'
import { useI18n } from '@/i18n'
import { notifyError } from '@/components/primitives/notify'
import { languageName } from '../../../shared/languages'
import { intersectLanguages, modelTranslationLanguages } from '@/model-options'
import { stores, useStore } from '@/store'
import type { CustomTranslationModel } from '../../../shared/settings'
import type { AgentWorkspaceSnapshot, WorkspaceAction } from '../../../shared/agent-workspace'
import type { PlaygroundConfig } from './demo-runtime'
import type { PlaygroundModel } from './installed-models'

export interface WorkbenchPageProps {
  active: boolean
  sidebar: HTMLElement | null
  heading: HTMLElement | null
  actions: HTMLElement | null
  onBack: () => void
}

export interface NativeAgentSurfaceProps extends WorkbenchPageProps {
  config: PlaygroundConfig
  onChange: (config: PlaygroundConfig) => void
  profiles: readonly CustomTranslationModel[]
  models: readonly PlaygroundModel[]
  modelCatalog: readonly PlaygroundModel[]
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
const WorkbenchModelReadyContext = createContext(false)
const WorkbenchBranchContext = createContext({ browsing: false, setBrowsing: (_value: boolean) => {} })
const WorkbenchStorageContext = createContext('nola.local-call:')

function messageDates(prefix: string, remoteId: string | undefined): Record<string, string> {
  if (!remoteId) return {}
  try { return JSON.parse(localStorage.getItem(`${prefix}message-dates:${JSON.stringify([remoteId, 'ai-sdk/v6'])}`) ?? '{}') as Record<string, string> }
  catch { return {} }
}

function useMessageDates() {
  const prefix = useContext(WorkbenchStorageContext)
  const remoteId = useAuiState(state => state.threadListItem.remoteId)
  const [, setRevision] = useState(0)
  useEffect(() => {
    const update = () => setRevision(value => value + 1)
    window.addEventListener('nola-workbench-dates', update)
    return () => window.removeEventListener('nola-workbench-dates', update)
  }, [])
  return messageDates(prefix, remoteId)
}

/** Connect runtime state and localized labels to the Elements components. */
export function NativeAgentSurface(props: NativeAgentSurfaceProps) {
  const { t } = useI18n()
  const aui = useAui()
  const items = useAuiState(s => s.threads.threadItems)
  const activeId = useAuiState(s => s.threads.mainThreadId)
  const previousThread = useRef(activeId)
  useEffect(() => {
    if (previousThread.current === activeId) return
    previousThread.current = activeId
    cancelComicReads()
    if (props.config.comicProjectId) props.onChange({ ...props.config, comicProjectId: null })
  }, [activeId, props.config.comicProjectId])
  useEffect(() => () => cancelComicReads(), [])
  const title = useAuiState(s => s.threadListItem.title)
  const first = useAuiState(s => s.thread.messages.find(message => message.role === 'user'))
  const remoteId = useAuiState(s => s.threadListItem.remoteId)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [threadQuery, setThreadQuery] = useState('')
  const [, setDatesRevision] = useState(0)
  useEffect(() => {
    const update = () => setDatesRevision(value => value + 1)
    window.addEventListener('nola-workbench-dates', update)
    return () => window.removeEventListener('nola-workbench-dates', update)
  }, [])
  const storagePrefix = props.snapshot?.selectedProject ? `nola.local-call:project:${props.snapshot.selectedProject}:` : 'nola.local-call:'
  let storedDates: Record<string, string> = {}
  try {
    const stored = JSON.parse(localStorage.getItem(`${storagePrefix}threads`) ?? '[]') as { remoteId: string; custom?: { createdAt?: string } }[]
    storedDates = Object.fromEntries(stored.filter(item => item.custom?.createdAt).map(item => [item.remoteId, item.custom!.createdAt!]))
  } catch { /* Missing or invalid metadata has no reliable date. */ }
  const groupOf = (item: typeof items[number]) => {
    const timestamps = Object.values(messageDates(storagePrefix, item.remoteId)).sort()
    const value = timestamps.at(-1) ?? item.custom?.createdAt ?? (item.remoteId && storedDates[item.remoteId])
    const date = typeof value === 'string' ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) return 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    return date >= today ? 0 : date >= yesterday ? 1 : 2
  }
  const visibleItems = items.filter(item => item.status === 'regular' && (item.title ?? '').toLowerCase().includes(threadQuery.toLowerCase())).sort((a, b) => groupOf(a) - groupOf(b) || Number(Boolean(b.custom?.pinned)) - Number(Boolean(a.custom?.pinned)))
  const currentItem = items.find(item => item.id === activeId)
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
  useEffect(() => {
    if (!props.active) { setHeaderMenu(false); setRenaming(false) }
  }, [props.active])
  return <>
    {props.active && props.sidebar && createPortal(<div className="nola-workbench-sidebar">
      <SidebarGroup><SidebarMenu>
        <SidebarMenuItem><NavigationItem icon={ArrowLeft} label={t('suite.back')} onPress={props.onBack} /></SidebarMenuItem>
      </SidebarMenu></SidebarGroup>
      <div className="nola-workbench-sidebar__search relative"><Input type="search" className="ps-9" value={threadQuery} onChange={event => setThreadQuery(event.target.value)} placeholder={t('workbench.searchThreads')} aria-label={t('workbench.searchThreads')} /><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></div>
      <SidebarGroup><SidebarMenu><SidebarMenuItem><NavigationItem icon={SquarePen} label={t('workbench.newThread')} onPress={() => { setMemoryOpen(false); void aui.threads.switchToNewThread() }} /></SidebarMenuItem></SidebarMenu></SidebarGroup>
      <div className="nola-workbench-sidebar__threads"><ThreadList className="max-w-none" dateLabel={t('workbench.earlier')} threads={visibleItems.map(item => ({ id: item.id, title: item.title ?? t('workbench.newThread'), time: '', dateLabel: t((['workbench.today', 'workbench.yesterday', 'workbench.earlier'] as const)[groupOf(item)]), unread: item.isRunning, pinned: Boolean(item.custom?.pinned) }))} activeIndex={visibleItems.findIndex(item => item.id === activeId)} onActiveIndexChange={index => { setMemoryOpen(false); void aui.threads.switchToThread(visibleItems[index].id) }} onRename={(index, nextTitle) => { if (nextTitle.trim()) void aui.threads.item({ id: visibleItems[index].id }).rename(nextTitle.trim().slice(0, 80)) }} onPin={index => togglePin(visibleItems[index].id)} onArchive={index => { void aui.threads.item({ id: visibleItems[index].id }).archive() }} onDelete={index => { void aui.threads.item({ id: visibleItems[index].id }).delete() }} labels={{ more: t('workbench.moreOptions'), rename: t('workbench.renameThread'), pin: t('workbench.pin'), unpin: t('workbench.unpin'), archive: t('workbench.archive'), delete: t('workbench.delete') }} /></div>
    </div>, props.sidebar)}
    {props.active && props.heading && createPortal(renaming
      ? <input autoFocus value={titleDraft} onChange={event => setTitleDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') renameCurrent(titleDraft); if (event.key === 'Escape') setRenaming(false) }} onBlur={() => renameCurrent(titleDraft)} className="nola-no-drag w-full min-w-0 bg-transparent outline-none" aria-label={t('workbench.renameThread')} />
      : <span className="block truncate">{memoryOpen ? t('workbench.memory') : title || t('workbench.newThread')}</span>, props.heading)}
    {props.active && props.actions && createPortal(<>
        <Popover open={props.active && headerMenu} onOpenChange={setHeaderMenu}>
          <PopoverTrigger render={<Button variant="bare" size="icon" className="nola-titlebar-icon" aria-label={t('workbench.moreOptions')} aria-expanded={headerMenu} />}><Ellipsis className="size-4" aria-hidden="true" /></PopoverTrigger>
          <PopoverContent align="end" side="bottom" sideOffset={6} className="w-64 gap-0.5 rounded-2xl p-1.5">
            <ComposerMenuItem onClick={() => { void aui.threads.switchToNewThread(); setHeaderMenu(false) }}><Plus className="size-4" aria-hidden="true" />{t('workbench.newThread')}</ComposerMenuItem>
            <ComposerMenuItem disabled={visibleItems.findIndex(item => item.id === activeId) <= 0} onClick={() => { switchRelative(-1); setHeaderMenu(false) }}><ChevronLeft className="size-4" aria-hidden="true" />{t('workbench.previousThread')}</ComposerMenuItem>
            <ComposerMenuItem disabled={visibleItems.findIndex(item => item.id === activeId) < 0 || visibleItems.findIndex(item => item.id === activeId) >= visibleItems.length - 1} onClick={() => { switchRelative(1); setHeaderMenu(false) }}><ChevronRight className="size-4" aria-hidden="true" />{t('workbench.nextThread')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => { setTitleDraft(title ?? ''); setRenaming(true); setHeaderMenu(false) }}><Settings2 className="size-4" aria-hidden="true" />{t('workbench.renameThread')}</ComposerMenuItem>
            <ComposerMenuItem onClick={toggleArchive}><Archive className="size-4" aria-hidden="true" />{t('workbench.archiveRestore')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => togglePin(activeId)}><Pin className="size-4" aria-hidden="true" />{t(currentItem?.custom?.pinned ? 'workbench.unpin' : 'workbench.pin')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => { document.querySelector<HTMLInputElement>('.aui-composer-input')?.focus(); setHeaderMenu(false) }}><Search className="size-4" aria-hidden="true" />{t('workbench.focusMessage')}</ComposerMenuItem>
            <ComposerMenuItem onClick={() => { setMemoryOpen(value => !value); setHeaderMenu(false) }}><BrainCircuit className="size-4" aria-hidden="true" />{t('workbench.memory')}</ComposerMenuItem>
          </PopoverContent>
        </Popover>
    </>, props.actions)}
    <div className="native-agent-app flex h-full min-h-0 flex-col text-foreground" data-testid="native-agent-app">
      <WorkbenchStorageContext.Provider value={storagePrefix}><NativeConversation {...props} memoryOpen={memoryOpen} onMemoryClose={() => setMemoryOpen(false)} /></WorkbenchStorageContext.Provider>
    </div>
  </>
}

function NativeConversation(props: NativeAgentSurfaceProps & { memoryOpen: boolean; onMemoryClose: () => void }) {
  const { t } = useI18n()
  const aui = useAui()
  const empty = useAuiState(s => s.thread.messages.length === 0)
  const threadId = useAuiState(s => s.threads.mainThreadId)
  const [browsing, setBrowsing] = useState(false)
  useEffect(() => setBrowsing(false), [threadId])
  return <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col" data-testid="native-conversation">
    <ThreadPrimitive.Viewport data-hide-scrollbar className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6" turnAnchor="top" autoScroll>
      {props.memoryOpen ? <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6"><Breadcrumb aria-label={t('workbench.chats')} className="py-5"><BreadcrumbList><BreadcrumbItem><button type="button" className="rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={props.onMemoryClose}>{t('workbench.chats')}</button></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{t('workbench.memory')}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><div className="flex flex-1 items-start justify-center"><NativeAgentSettings page="memory" snapshot={props.snapshot} onAction={props.onAction} busy={props.busy} model={props.models.find(model => model.id === props.config.model)?.name ?? ''} onPrompt={() => undefined} memories={props.memories} onMemories={props.onMemories} /></div></div> : <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col">
        {empty ? <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8"><h1 className="type-h3">{t('workbench.welcomeHeading')}</h1><div className="w-full px-6"><NativeComposer key={threadId} {...props} /></div></div> : <>
          <WorkbenchBranchContext.Provider value={{ browsing, setBrowsing }}><WorkbenchConfigContext.Provider value={props.config}><WorkbenchModelReadyContext.Provider value={props.models.some(model => model.id === props.config.model && model.kind === props.config.kind)}><div className="flex-1 py-8"><ThreadPrimitive.Messages components={{ UserMessage: NativeUserMessage, UserEditComposer: NativeUserEditComposer, AssistantMessage: NativeAssistantMessage }} /></div></WorkbenchModelReadyContext.Provider></WorkbenchConfigContext.Provider></WorkbenchBranchContext.Provider>
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
  const { t } = useI18n()
  const hasAttachments = useAuiState(s => !!s.message.attachments?.length)
  const copied = useAuiState(s => s.message.isCopied)
  return <div className="mb-8"><NativeDaySeparator /><MessagePrimitive.Root data-role="user" className="group/message flex w-full flex-col items-end gap-2">
    <div className={['min-w-0 rounded-2xl bg-muted px-3.5 py-2 type-body', hasAttachments ? 'w-full max-w-sm' : 'max-w-[85%]'].join(' ')}>
      <MessagePrimitive.Attachments components={{ Image: NativeUserAttachment, File: NativeUserAttachment, Document: NativeUserAttachment }} /><MessagePrimitive.Parts components={{ Text: NativeMarkdown }} />
    </div>
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
      <BranchPickerPrimitive.Root hideWhenSingleBranch className="flex items-center gap-1 text-muted-foreground">
        <BranchPickerPrimitive.Previous aria-label={t('workbench.previous')} className={`${ghostButton} size-7 disabled:opacity-50`}><ChevronLeft aria-hidden="true" className="size-4" /></BranchPickerPrimitive.Previous>
        <span className="type-small tabular-nums"><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
        <BranchPickerPrimitive.Next aria-label={t('workbench.next')} className={`${ghostButton} size-7 disabled:opacity-50`}><ChevronRight aria-hidden="true" className="size-4" /></BranchPickerPrimitive.Next>
      </BranchPickerPrimitive.Root>
      <ActionBarPrimitive.Root className="flex items-center gap-1">
        <ActionBarPrimitive.Copy aria-label={t(copied ? 'workbench.copiedResponse' : 'workbench.copyMessage')} className={`${ghostButton} grid size-7 place-items-center ${copied ? 'text-chart-2' : ''}`}>
          <Copy aria-hidden="true" className={`${iconSwap} size-3.5 ${copied ? iconSwapOut : iconSwapIn}`} />
          <Check aria-hidden="true" className={`${iconSwap} size-3.5 ${copied ? iconSwapIn : iconSwapOut}`} />
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Edit aria-label={t('workbench.editMessage')} className={`${ghostButton} size-7`}><Pencil aria-hidden="true" className="size-3.5" /></ActionBarPrimitive.Edit>
      </ActionBarPrimitive.Root>
      <NativeMessageTimestamp />
    </div>
  </MessagePrimitive.Root></div>
}

function NativeUserEditComposer() {
  const { t } = useI18n()
  const aui = useAui()
  const modelReady = useContext(WorkbenchModelReadyContext)
  const inputRef = useRef<HTMLInputElement>(null)
  const attachments = useAuiState(s => s.composer.attachments)
  return <div className="mb-8 w-full"><NativeDaySeparator /><ComposerPrimitive.Root className="flex w-full flex-col gap-2 rounded-[var(--radius-lg)] bg-muted p-3">
    {attachments.length > 0 && <div className="flex flex-wrap gap-2"><ComposerPrimitive.Attachments components={{ Attachment: NativeComposerAttachment }} /></div>}
    <ComposerPrimitive.Input autoFocus aria-label={t('workbench.editMessage')} className="min-h-16 w-full resize-y bg-transparent px-1 py-1 type-body outline-none" />
    <div className="flex items-center gap-2">
      <Button type="button" variant="bare" size="icon-sm" aria-label={t('workbench.addAttachment')} onClick={() => inputRef.current?.click()}><Plus aria-hidden="true" /></Button>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={event => { for (const file of event.target.files ?? []) void aui.composer.addAttachment(file).catch(error => notifyError(t('workbench.actionFailed'), { cause: error })); event.target.value = '' }} />
      <div className="ms-auto flex gap-2">
        <ComposerPrimitive.Cancel render={<Button type="button" variant="outline" size="sm" />}>{t('workbench.cancel')}</ComposerPrimitive.Cancel>
        <Button type="button" size="sm" onClick={() => { if (!modelReady) notifyError(t('workbench.noModels')); else void aui.composer.send() }}>{t('workbench.send')}</Button>
      </div>
    </div>
  </ComposerPrimitive.Root></div>
}

function NativeDaySeparator() {
  const { language } = useI18n()
  const current = useAuiState(state => state.message)
  const messages = useAuiState(state => state.thread.messages)
  const dates = useMessageDates()
  const value = dates[current.id]
  const previous = messages[current.index - 1]
  const previousValue = previous && dates[previous.id]
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (previousValue && new Date(previousValue).toDateString() === date.toDateString()) return null
  const day = date.toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' })
  return <DaySeparator className="max-w-none [&>div>div:last-child]:min-h-0 [&>div>div:last-child]:gap-0 [&>div>div:last-child>span:first-child]:hidden [&>div>div:last-child>span:last-child]:hidden" messages={[{ id: current.id, day, time: '', role: 'assistant', text: '' }]} />
}

function NativeMessageTimestamp() {
  const { language } = useI18n()
  const id = useAuiState(state => state.message.id)
  const dates = useMessageDates()
  if (!dates[id]) return null
  const createdAt = new Date(dates[id])
  if (Number.isNaN(createdAt.getTime())) return null
  const time = createdAt.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
  return <time dateTime={createdAt.toISOString()} className="shrink-0 type-muted tabular-nums text-muted-foreground">{time}</time>
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
  const src = useAttachmentSrc()
  return <AttachmentPrimitive.Root className="flex min-w-0 max-w-full flex-col gap-1">
    {src && <img src={src} alt={attachment.name} className="max-h-32 max-w-40 rounded-[var(--radius-md)] object-contain" />}
    <File.Root className="max-w-full min-w-0"><File.Icon mimeType={attachment.contentType} /><File.Name title={attachment.name}><AttachmentPrimitive.Name /></File.Name>{attachment.file && <File.Size bytes={attachment.file.size} />}<AttachmentPrimitive.Remove aria-label={t('workbench.removeAttachment', { name: attachment.name })} className={ghostButton}><X className="size-4" aria-hidden="true" /></AttachmentPrimitive.Remove></File.Root>
    {attachment.status.type === 'incomplete' && <p role="alert" className="type-body text-destructive">{attachment.status.message || t('workbench.actionFailed')}</p>}
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
  if (part.isError || (!running && part.result === undefined)) return <div className="type-body text-muted-foreground"><p>{label} · {t(part.isError ? 'workbench.taskFailed' : 'workbench.cancel')}</p>{part.isError && <p role="alert">{errorDetail(part.result)}</p>}</div>
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

function NativeQuestionBranches() {
  const { t } = useI18n()
  const aui = useAui()
  const user = useAuiState(s => s.thread.messages.slice(0, s.message.index).reverse().find(message => message.role === 'user'))
  if (!user) return null
  const message = aui.thread.message({ id: user.id })
  const { branchCount, branchNumber } = message.getState()
  if (branchCount < 2) return null
  return <div className="flex items-center gap-1 text-muted-foreground">
    <button type="button" aria-label={t('workbench.previous')} disabled={branchNumber <= 1} onClick={() => message.switchToBranch({ position: 'previous' })} className={`${ghostButton} size-7 disabled:opacity-50`}><ChevronLeft aria-hidden="true" className="size-4" /></button>
    <span className="type-small tabular-nums">{branchNumber} / {branchCount}</span>
    <button type="button" aria-label={t('workbench.next')} disabled={branchNumber >= branchCount} onClick={() => message.switchToBranch({ position: 'next' })} className={`${ghostButton} size-7 disabled:opacity-50`}><ChevronRight aria-hidden="true" className="size-4" /></button>
  </div>
}

function NativeAssistantMessage() {
  const { t } = useI18n()
  const config = useContext(WorkbenchConfigContext)
  const modelReady = useContext(WorkbenchModelReadyContext)
  const { browsing, setBrowsing } = useContext(WorkbenchBranchContext)
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
  const retry = () => {
    if (!modelReady) { notifyError(t('workbench.noModels')); return }
    setBrowsing(false)
    aui.message.reload()
  }
  const notifiedError = useRef('')
  useEffect(() => {
    if (!browsing && errorText && !projectorDownloadStarted && notifiedError.current !== errorText) {
      notifyError(errorTitle, { cause: error })
    }
    notifiedError.current = errorText
  }, [browsing, error, errorText, errorTitle, projectorDownloadStarted])
  return <div className="mb-8"><NativeDaySeparator /><MessagePrimitive.Root data-role="assistant" className="group/message flex w-full flex-col items-start gap-3">
    <NativeMediaWorkflow />
    {running && !hasContent && <ThinkingIndicator role="status" label={t(audioRequest ? 'workbench.transcribingMedia' : 'workbench.thinkingProcess')} />}
    {!running && !hasContent && (!error || browsing) && <p role="status" className="type-body text-muted-foreground">{t('workbench.emptyResult')}</p>}
    <MessagePrimitive.Parts components={{ Text: NativeMarkdown, Reasoning: NativeReasoning, tools: { Fallback: NativeTool }, File, Image: NativeImage, Source: Sources }} />
    {!hasWorkflow && <NativeMessageTiming />}
    {error && !browsing && <ErrorState
      title={projectorDownloadStarted ? errorTitle : t('workbench.actionFailed')}
      detail={projectorDownloadStarted ? t('workbench.imageProjectorDownloadStarted') : missingProjector || projectorDownloadFailed ? t('workbench.imageProjectorMissingDetail')
        : errorText === t('workbench.noModels') ? errorText : localTtsNoAudio ? `${t('workbench.localTtsNoAudio')} ${errorText}` : errorText ? `${errorTitle} ${errorText}` : errorTitle}
      retryLabel={t('workbench.retry')} retryingLabel={t('workbench.retrying')}
      retrying={running} onRetry={retry}
    />}
    {!running && <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100"><NativeQuestionBranches /><BranchPickerPrimitive.Root hideWhenSingleBranch className="flex items-center gap-1 text-muted-foreground">
      <BranchPickerPrimitive.Previous onClick={() => setBrowsing(true)} aria-label={t('workbench.previous')} className={`${ghostButton} size-7 disabled:opacity-50`}><ChevronLeft aria-hidden="true" className="size-4" /></BranchPickerPrimitive.Previous>
      <span className="type-small tabular-nums"><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
      <BranchPickerPrimitive.Next onClick={() => setBrowsing(true)} aria-label={t('workbench.next')} className={`${ghostButton} size-7 disabled:opacity-50`}><ChevronRight aria-hidden="true" className="size-4" /></BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root><MessageActions labels={{ copied: t('workbench.copiedResponse'), copy: t('workbench.copyResponse'), helpful: t('workbench.helpfulResponse'), unhelpful: t('workbench.unhelpfulResponse'), regenerate: t('workbench.regenerateResponse'), more: t('workbench.moreOptions') }} copied={copied} regenerating={false} onCopy={() => { void navigator.clipboard.writeText(content.filter(part => part.type === 'text').map(part => part.text).join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} onRegenerate={retry} /><NativeMessageTimestamp /></div>}
  </MessagePrimitive.Root></div>
}

function NativeMessageTiming() {
  const { t } = useI18n()
  const timing = useMessageTiming()
  const milliseconds = timing?.totalStreamTime
  if (milliseconds === undefined) return null
  const duration = milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(1)} s`
  return <span className="type-muted tabular-nums text-muted-foreground">{t('workbench.nativeReplyTime', { duration })}</span>
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
  const resources = useStore(stores.models, state => state.resources)
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
  const sourceCodes = intersectLanguages(selected?.sourceLanguages ?? [])
  const translation = selected?.kind === 'mt' ? resources.find(resource => `resource:${resource.resourceId}` === selected.id) : undefined
  const targetsFor = (source: string) => translation ? modelTranslationLanguages(undefined, translation, source) : intersectLanguages(selected?.targetLanguages ?? [])
  const targetCodes = targetsFor(props.config.source)
  const chooseSource = (source: string) => {
    const targets = targetsFor(source)
    pick({ source, target: targets.includes(props.config.target) ? props.config.target : targets[0] ?? props.config.target })
  }
  const languageMenuCodes = props.config.kind === 'mt' ? targetCodes : sourceCodes
  const languageTrigger = (anchor: 'source' | 'language', label: string, codes: readonly string[]) => {
    const trigger = <ComposerModelTrigger data-menu-anchor={anchor} model={label} disabled={!codes.length}
      open={menu === anchor} onClick={() => setMenu(menu === anchor ? '' : anchor)} />
    return codes.length ? trigger : <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" tabIndex={0}>{trigger}</span>} />
      <TooltipContent>{t('gateway.languageModelsHint')}</TooltipContent>
    </Tooltip>
  }
  const chooseVoices = () => {
    setMenu(menu === 'voice' ? '' : 'voice')
    if (!props.voices.length) void import('@/store').then(async ({ getBridge }) => {
      const result = await getBridge()?.app.directModel?.({ id: crypto.randomUUID(), model: props.config.model, kind: 'tts' }, true)
      props.onVoices(result?.voices ?? [])
    }).catch(error => notifyError(t('workbench.actionFailed'), { cause: error }))
  }
  return <Composer className="max-w-none" data-testid="native-composer">
    {!!savedDraft && !text && <DraftRestore draft={savedDraft} savedAt={t('workbench.nativeDraft')} onRestore={() => { aui.thread.composer().setText(savedDraft); setSavedDraft('') }} onDiscard={() => { setSavedDraft(''); try { localStorage.removeItem(`nola.native.draft:${threadId}`) } catch { /* Keep dismissing usable when storage is unavailable. */ } }} />}
    {menu === 'models' && <ComposerMenu open anchor="models" className="max-h-[min(70vh,32rem)] overflow-y-auto"><p className="px-2.5 py-2 type-muted text-muted-foreground"><ModelAvailabilityLabel label={t('nav.modelGateway')} hint={t('gateway.modelNoneHint')} /></p><TooltipProvider>{(['llm', 'asr', 'mt', 'tts'] as const).map(kind => <div key={kind}><p className="px-2.5 py-2 type-muted text-muted-foreground">{t(`workbench.${kind}`)}</p>{props.modelCatalog.filter(model => model.kind === kind).map(model => {
      const available = props.models.some(item => item.id === model.id && item.kind === model.kind)
      const item = <ComposerMenuItem className="nola-menu-item" active={props.config.model === model.id} aria-disabled={!available} onClick={() => { if (available) pick({ model: model.id, kind: model.kind, images: model.images, voice: '' }) }}><span className="min-w-0 flex-1 truncate text-start">{model.name}</span><Badge variant={available ? 'success' : 'secondary'}>{t(available ? 'workbench.modelAvailable' : 'workbench.modelNotStarted')}</Badge></ComposerMenuItem>
      return available ? <div key={model.id}>{item}</div> : <Tooltip key={model.id}><TooltipTrigger render={item} /><TooltipContent>{t('gateway.modelGatewayStartHint')}</TooltipContent></Tooltip>
    })}</div>)}</TooltipProvider><ComposerMenuItem className="nola-menu-item" onClick={props.onConfigure}><Settings2 className="size-4" aria-hidden="true" />{t('nav.modelGateway')}</ComposerMenuItem></ComposerMenu>}
    {menu === 'effort' && <ComposerMenu open anchor="effort" className="w-80 gap-3 p-3"><ReasoningEffort variant="slider" levels={(['auto', 'low', 'medium', 'high'] as const).map(key => ({ key, label: t(key === 'auto' ? 'modelsSettingsUi.default' : `workbench.${key}`) }))} selectedKey={props.config.effort} title={t('workbench.reasoningTokens')} onSelect={effort => pick({ effort }, false)} /></ComposerMenu>}
    {menu === 'language' && languageMenuCodes.length > 0 && <ComposerMenu open anchor="language">{languageMenuCodes.map(code => <ComposerMenuItem key={code} active={code === (props.config.kind === 'mt' ? props.config.target : props.config.source)} onClick={() => props.config.kind === 'mt' ? pick({ target: code }) : chooseSource(code)}>{code === 'auto' ? t('workbench.auto') : languageName(code, language)}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'source' && sourceCodes.length > 0 && <ComposerMenu open anchor="source">{sourceCodes.map(code => <ComposerMenuItem key={code} active={code === props.config.source} onClick={() => chooseSource(code)}>{code === 'auto' ? t('workbench.auto') : languageName(code, language)}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'voice' && <ComposerMenu open anchor="voice">{props.voices.map(voice => <ComposerMenuItem key={voice} active={voice === props.config.voice} onClick={() => pick({ voice })}>{voice}</ComposerMenuItem>)}</ComposerMenu>}
    {menu === 'context' && <ComposerMenu open align="end"><ContextBreakdown limit={contextWindow} segments={[{ label: t('workbench.inputTokens'), tokens: usage?.inputTokens ?? 0, tint: 'bg-chart-2' }, { label: t('workbench.outputTokens'), tokens: usage?.outputTokens ?? 0, tint: 'bg-chart-1' }]} /></ComposerMenu>}
    <ComposerBar>
      {attachments.length > 0 && <ComposerAttachments><ComposerPrimitive.Attachments components={{ Attachment: NativeComposerAttachment }} /></ComposerAttachments>}
      {dictation ? <ComposerVoice recording={dictation.status.type === 'running'} seconds={seconds} /> : <ComposerPrimitive.Input data-slot="composer-input" className="aui-composer-input min-h-11 max-h-40 w-full resize-none bg-transparent px-3 py-2 type-body caret-primary outline-none placeholder:text-muted-foreground" rows={1} addAttachmentOnPaste={false} placeholder={props.placeholder} readOnly={!props.config.model} onPaste={event => {
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
      <ComposerToolbar className="flex-wrap gap-2"><ComposerActions className="min-w-0 max-w-full flex-wrap">
        <ComposerAttachButton aria-label={t('workbench.addAttachment')} disabled={props.config.kind === 'tts' || props.config.kind === 'mt' && !props.config.images} onClick={() => inputRef.current?.click()} />
        <ComposerModelTrigger data-menu-anchor="models" model={selected?.name ?? t('workbench.noModels')} open={menu === 'models'} onClick={() => setMenu(menu === 'models' ? '' : 'models')} />
        {props.config.kind === 'llm' && <ComposerModelTrigger data-menu-anchor="effort" model={t(props.config.effort === 'auto' ? 'modelsSettingsUi.default' : `workbench.${props.config.effort as 'low' | 'medium' | 'high'}`)} open={menu === 'effort'} onClick={() => setMenu(menu === 'effort' ? '' : 'effort')} />}
        {props.config.kind === 'llm' && <NativeComicSelector active={props.active} value={props.config.comicProjectId ?? null} disabled={preparing || running} onChange={comicProjectId => { cancelComicReads(); if (comicProjectId === null) props.onChange({ ...props.config, comicProjectId }); else pick({ comicProjectId }) }} />}
        {props.config.kind === 'mt' && languageTrigger('source', props.config.source === 'auto' ? t('workbench.auto') : languageName(props.config.source, language), sourceCodes)}
        {(props.config.kind === 'asr' || props.config.kind === 'mt') && languageTrigger('language', languageName(props.config.kind === 'mt' ? props.config.target : props.config.source, language), languageMenuCodes)}
        {props.config.kind === 'tts' && <ComposerModelTrigger data-menu-anchor="voice" model={props.config.voice || t('workbench.voice')} open={menu === 'voice'} onClick={chooseVoices} />}
      </ComposerActions><ComposerActions className="ms-auto shrink-0">
        {props.config.kind === 'llm' && <div><ComposerContext labels={{ context: t('workbench.contextUsage'), system: t('workbench.contextSystem'), tools: t('workbench.contextTools'), messages: t('workbench.contextMessages'), total: t('workbench.contextTotal') }} usage={{ system: 0, tools: 0, messages: (usage?.totalTokens ?? 0) / 1000, total: contextWindow / 1000 }} /></div>}
        <ComposerVoiceButton active={!!dictation} aria-label={t(dictation ? 'workbench.stopDictation' : 'workbench.record')} onClick={() => { if (dictation) aui.thread.composer().stopDictation(); else aui.thread.composer().startDictation() }} />
        <ComposerSend aria-label={t(running || preparing ? 'workbench.stopGenerating' : 'workbench.sendMessage')} className={running || preparing ? 'aui-composer-cancel' : 'aui-composer-send'} streaming={running || preparing} idle={!preparing && !text.trim() && !attachments.length} disabled={!running && !preparing && (!props.config.model || !text.trim() && !attachments.length)} onClick={send} />
      </ComposerActions></ComposerToolbar>
    </ComposerBar>
    <input ref={inputRef} type="file" className="hidden" multiple accept={props.config.kind === 'asr' ? 'audio/*,video/*' : props.config.images || props.config.kind === 'llm' ? 'image/*,audio/*,video/*,text/*,.md,.json' : 'text/*,.md,.json'} onChange={event => { for (const file of event.target.files ?? []) void aui.thread.composer().addAttachment(file).catch(error => notifyError(t('workbench.actionFailed'), { cause: error })); event.target.value = '' }} />
  </Composer>
}
