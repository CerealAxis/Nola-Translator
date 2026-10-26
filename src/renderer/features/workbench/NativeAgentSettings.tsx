import { useState } from 'react'
import { AgentCard } from '@/components/assistant-ui/native/agent-card'
import { SpecSheet } from '@/components/assistant-ui/native/spec-sheet'
import { TerminalBlock } from '@/components/assistant-ui/native/terminal-block'
import { ToolCall } from '@/components/assistant-ui/native/tool-call'
import { SubagentList } from '@/components/assistant-ui/native/subagent-list'
import { ComposerBar, ComposerInput, ComposerMenuItem } from '@/components/assistant-ui/native/composer'
import { field } from '@/components/assistant-ui/native/surfaces'
import { useI18n } from '@/i18n'
import { PromptLibrary } from '@/components/assistant-ui/native/prompt-library'
import { MemoryChips } from '@/components/assistant-ui/native/memory-chips'
import type { AgentWorkspaceSnapshot, SubagentDefinition, WorkspaceAction } from '../../../shared/agent-workspace'

export interface NativeAgentSettingsProps {
  page: string
  snapshot: AgentWorkspaceSnapshot | null
  onAction: (action: WorkspaceAction) => Promise<void>
  busy: boolean
  model: string
  onPrompt: (text: string) => void
  memories: readonly string[]
  onMemories: (memories: string[]) => void
}

export function NativeAgentSettings({ page, snapshot, onAction, busy, model, onPrompt, memories, onMemories }: NativeAgentSettingsProps) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<SubagentDefinition | null>(null)
  const [openActivity, setOpenActivity] = useState('')
  const [promptQuery, setPromptQuery] = useState('')
  const [selectedPrompt, setSelectedPrompt] = useState('suggestionDashboard')
  const [memoryDraft, setMemoryDraft] = useState('')
  const prompts = (['suggestionDashboard', 'suggestionDiagram', 'suggestionTrip', 'suggestionDinner'] as const).map(id => ({ id, name: t(`workbench.${id}`), body: t(`workbench.${id}`), variables: [] }))
  const executions = snapshot?.activity.filter(item => item.kind === 'subagent') ?? []
  return <div className="mx-auto flex w-full max-w-3xl flex-wrap items-start gap-6 py-8" data-testid={`native-settings-${page}`}>
    {page === 'prompts' && <PromptLibrary prompts={prompts} query={promptQuery} selectedId={selectedPrompt} onQueryChange={setPromptQuery} onSelect={setSelectedPrompt} onInsert={id => { const prompt = prompts.find(item => item.id === id); if (prompt) onPrompt(prompt.body) }} />}
    {page === 'memory' && <div className="flex w-full max-w-sm flex-col gap-5"><p className="text-sm text-muted-foreground">{t('workbench.memoryHint')}</p><MemoryChips chips={memories.map((text, index) => ({ id: String(index), text, change: 'existing' }))} onForget={id => onMemories(memories.filter((_, index) => index !== Number(id)))} /><ComposerBar><ComposerInput value={memoryDraft} onChange={event => setMemoryDraft(event.target.value)} placeholder={t('workbench.addMemory')} maxLength={4000} /><ComposerMenuItem disabled={!memoryDraft.trim()} onClick={() => { onMemories([...memories, memoryDraft.trim()]); setMemoryDraft('') }}>{t('workbench.save')}</ComposerMenuItem></ComposerBar></div>}
    {page === 'sandbox' && <SpecSheet title={t(snapshot?.sandbox.available ? 'workbench.sandboxReady' : 'workbench.sandboxUnavailable')} rows={[{ label: t('workbench.sandbox'), value: snapshot?.sandbox.backend ?? '' }, { label: t('workbench.workspace'), value: snapshot?.sandbox.reason ?? t('workbench.sandboxHint') }]} visibleCount={2} />}
    {page === 'skills' && <>{!snapshot?.skills.length && <SpecSheet title={t('workbench.noSkills')} rows={[{ label: t('workbench.skills'), value: t('workbench.skillHint') }]} visibleCount={1} />}{snapshot?.skills.map(skill => <div key={skill.path} className="flex w-full max-w-sm flex-col gap-2"><AgentCard name={skill.name} description={skill.description} provider={t('workbench.skills')} version="1" model={model} endpoint={skill.path} skills={[]} connected={skill.enabled} onConnect={() => { void onAction({ action: 'skill', path: skill.path, enabled: true }) }} /><ComposerMenuItem disabled={busy} onClick={() => { void onAction({ action: 'skill', path: skill.path, enabled: !skill.enabled }) }}>{t(skill.enabled ? 'workbench.disable' : 'workbench.enable')}</ComposerMenuItem></div>)}</>}
    {page === 'subagents' && <>
      <ComposerMenuItem className="max-w-sm" onClick={() => setEditing({ id: crypto.randomUUID(), name: '', instructions: '', enabled: true })}>{t('workbench.addSubagent')}</ComposerMenuItem>
      {!!executions.length && <SubagentList agents={executions.map(item => ({ name: item.name, model }))} completedCount={executions.filter(item => item.status === 'complete').length} progress={executions.map(item => item.status === 'complete' ? 100 : 0)} showSummary={false} summaryAgent={{ name: '', model: '' }} />}
      {snapshot?.subagents.map(agent => <div className="flex w-full max-w-sm flex-col gap-2" key={agent.id}><AgentCard name={agent.name} description={agent.instructions} provider={t('workbench.subagents')} version="1" model={model} endpoint="" skills={[]} connected={agent.enabled} onConnect={() => { void onAction({ action: 'subagent', agent: { ...agent, enabled: true } }) }} /><div className="flex"><ComposerMenuItem onClick={() => setEditing(agent)}>{t('workbench.edit')}</ComposerMenuItem><ComposerMenuItem onClick={() => { void onAction({ action: 'subagent', agent: { ...agent, enabled: !agent.enabled } }) }}>{t(agent.enabled ? 'workbench.disable' : 'workbench.enable')}</ComposerMenuItem><ComposerMenuItem onClick={() => { void onAction({ action: 'removeSubagent', id: agent.id }) }}>{t('workbench.delete')}</ComposerMenuItem></div></div>)}
      {editing && <form className="w-full max-w-sm" onSubmit={event => { event.preventDefault(); void onAction({ action: 'subagent', agent: editing }).then(() => setEditing(null)) }}><ComposerBar><ComposerInput required aria-label={t('workbench.agentName')} placeholder={t('workbench.agentName')} maxLength={80} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /><textarea className={`${field} min-h-32 rounded-xl p-3 text-sm outline-none`} required maxLength={16000} aria-label={t('workbench.instructions')} placeholder={t('workbench.instructions')} value={editing.instructions} onChange={event => setEditing({ ...editing, instructions: event.target.value })} /><ComposerMenuItem type="submit" disabled={busy}>{t('workbench.save')}</ComposerMenuItem><ComposerMenuItem onClick={() => setEditing(null)}>{t('common.cancel')}</ComposerMenuItem></ComposerBar></form>}
    </>}
    {page === 'activity' && <>{!snapshot?.activity.length && <SpecSheet title={t('workbench.noActivity')} rows={[]} visibleCount={0} />}{snapshot?.activity.slice().reverse().map(item => item.kind === 'terminal' ? <TerminalBlock key={item.id} command={item.input} lines={(item.output ?? '').split('\n')} visibleCount={(item.output ?? '').split('\n').length} done={item.status !== 'running'} /> : <ToolCall labels={{ request: t('workbench.requestLabel'), result: t('workbench.resultLabel') }} key={item.id} label={item.name} activeLabel={item.name} query={item.input} request={item.input} result={item.output ?? ''} running={item.status === 'running'} open={openActivity === item.id} onOpenChange={open => setOpenActivity(open ? item.id : '')} />)}</>}
  </div>
}
