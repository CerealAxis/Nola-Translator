import { z } from 'zod'

export const directModelRequestSchema = z.object({
  id: z.string().uuid(), model: z.string().min(1).max(512),
  kind: z.enum(['asr', 'mt', 'tts']), text: z.string().max(64000).default(''),
  source: z.string().max(32).default('auto'), target: z.string().max(32).default('zh'),
  voice: z.string().max(256).default(''), audio: z.string().max(24000000).optional(),
  image: z.string().max(16000000).optional(),
})
export type DirectModelRequest = z.input<typeof directModelRequestSchema>
export interface DirectModelResult { text: string; audio?: string; voices?: string[] }
export interface AgentProject { id: string; name: string; path: string }
export interface AgentSkill { name: string; description: string; path: string; enabled: boolean }
export interface SubagentDefinition { id: string; name: string; instructions: string; enabled: boolean }
export interface AgentActivity { id: string; kind: 'terminal' | 'subagent'; name: string; input: string; output?: string; status: 'running' | 'complete' | 'failed'; at: number }
export interface AgentWorkspaceSnapshot {
  projects: AgentProject[]; selectedProject: string | null; skills: AgentSkill[];
  subagents: SubagentDefinition[]; sandbox: { available: boolean; backend: string; reason?: string };
  activity: AgentActivity[]
}
export const workspaceActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snapshot') }),
  z.object({ action: z.literal('addProject') }),
  z.object({ action: z.literal('selectProject'), id: z.string().nullable() }),
  z.object({ action: z.literal('skill'), path: z.string().max(4096), enabled: z.boolean() }),
  z.object({ action: z.literal('subagent'), agent: z.object({ id: z.string().uuid(), name: z.string().min(1).max(80), instructions: z.string().min(1).max(16000), enabled: z.boolean() }) }),
  z.object({ action: z.literal('removeSubagent'), id: z.string().uuid() }),
])
export type WorkspaceAction = z.input<typeof workspaceActionSchema>
