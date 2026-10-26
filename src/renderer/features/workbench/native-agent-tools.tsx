import { defineToolkit, type ToolCallMessagePartProps, type ToolCallMessagePartComponent } from '@assistant-ui/react'
import { JSONGenerativeUI, type GenerativeUILibrary } from '@assistant-ui/generative-ui/react'
import { normalizeUINode } from '@assistant-ui/generative-ui'
import { Component, type ReactNode } from 'react'
import { z } from 'zod'
import { AgentPlan } from '@/components/assistant-ui/native/agent-plan'
import { TodoList } from '@/components/assistant-ui/native/todo-list'
import { ArtifactCard } from '@/components/assistant-ui/native/artifact-card'
import { CodeDiff } from '@/components/assistant-ui/native/code-diff'
import { MathBlock } from '@/components/assistant-ui/native/math-block'
import { ToolFallback } from '@/components/assistant-ui/native/tool-fallback.aui'

/** Validate the completed tree before acknowledging it; the library silently drops unknown nodes. */
function validatePresentation(value: unknown, library: GenerativeUILibrary, depth = 0): number {
  if (depth > 32) throw new Error('UI tree exceeds 32 levels')
  if (value == null || typeof value === 'boolean') return 0
  if (typeof value === 'string' || typeof value === 'number') return 1
  if (Array.isArray(value)) return value.reduce((count, child) => count + validatePresentation(child, library, depth + 1), 0)
  const node = normalizeUINode(value)
  if (!node || typeof node !== 'object' || !('type' in node)) throw new Error('UI nodes must select a component with _type and pass its props inline')
  const entry = Object.hasOwn(library, node.type) ? library[node.type] : undefined
  if (!entry) throw new Error(`Unknown UI component ${node.type}. Available components: ${Object.keys(library).join(', ')}`)
  const schema = entry.properties
  if (schema && 'safeParse' in schema && typeof schema.safeParse === 'function') {
    const result = schema.safeParse(node.props)
    if (!result.success) throw new Error(`Invalid ${node.type} properties: ${result.error.issues.map((issue: { path: PropertyKey[]; message: string }) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  const raw = value as Record<string, unknown>
  return 1 + validatePresentation(raw.children, library, depth + 1)
}

class PresentationBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/** Desktop IPC uploads schemas directly; no generative compiler or backend renderer is required. */
export function createGenerativePresentationTools(library: GenerativeUILibrary) {
  const ui = new JSONGenerativeUI({ library })
  const present = ui.present({ display: 'standalone' })
  const prompt = ui.promptUser()
  const presentParameters = present.parameters
  const promptParameters = prompt.parameters
  if (!presentParameters || !promptParameters || !present.render || !prompt.render) throw new Error('Generative UI tools are missing their schema or renderer')
  const guardedRender = <Args extends Record<string, unknown>, Result,>(Render: ToolCallMessagePartComponent<Args, Result>) => (props: ToolCallMessagePartProps<Args, Result>) => {
    let error: string | undefined
    if (props.status.type !== 'running') {
      try {
        if (!validatePresentation(props.args, library)) throw new Error('UI tree is empty')
      } catch (cause) { error = cause instanceof Error ? cause.message : 'Invalid UI tree' }
    }
    const fallback = <ToolFallback {...props} isError result={error ?? props.result} />
    if (error || props.isError) return fallback
    return <PresentationBoundary key={`${props.toolCallId}:${props.status.type}`} fallback={fallback}><Render {...props} /></PresentationBoundary>
  }
  return {
    present: { type: 'frontend' as const, description: present.description, parameters: presentParameters,
      display: 'standalone' as const, unstable_backendDefault: { parameters: false }, render: guardedRender(present.render!),
      execute: async (args: Record<string, unknown>) => {
        const components = validatePresentation(args, library)
        if (!components) throw new Error('UI tree is empty')
        return {}
      } },
    prompt_user: { type: 'human' as const, description: prompt.description, parameters: promptParameters,
      unstable_backendDefault: { parameters: false }, render: guardedRender(prompt.render!) },
  }
}

/** These client tools persist their real arguments in the conversation; they never execute model-written code. */
export const nativePresentationTools = defineToolkit({
  update_plan: {
    type: 'frontend',
    description: 'Create or update the visible execution plan for a complex task. activeIndex is the current step, or steps.length when all are complete. Only mark work complete after actual results.',
    parameters: z.object({ title: z.string(), steps: z.array(z.string()).min(1).max(24), activeIndex: z.number().int().nonnegative() }),
    execute: async ({ steps, activeIndex }) => ({ steps: steps.length, completed: Math.min(activeIndex, steps.length) }),
    render: ({ args }) => <AgentPlan title={args.title} steps={args.steps ?? []} activeIndex={args.activeIndex ?? 0} />,
    unstable_backendDefault: { parameters: false },
  },
  update_tasks: {
    type: 'frontend',
    description: 'Display the actual task checklist. Update pending, active, done, failed or cancelled states as work progresses.',
    parameters: z.object({ title: z.string(), items: z.array(z.object({ id: z.string(), text: z.string(), status: z.enum(['pending', 'active', 'done', 'failed', 'cancelled']), description: z.string().optional() })).max(32) }),
    execute: async ({ items }) => ({ tasks: items.length, completed: items.filter((item: { status: string }) => item.status === 'done').length }),
    render: ({ args }) => <TodoList title={args.title} items={args.items ?? []} />,
    unstable_backendDefault: { parameters: false },
  },
  create_artifact: {
    type: 'frontend',
    description: 'Create a downloadable text, Markdown or source-code document from actual generated content. This previews/downloads content; it does not write into a project or execute it.',
    parameters: z.object({ filename: z.string().max(160), content: z.string().max(200000) }),
    execute: async ({ filename, content }) => ({ filename, characters: content.length }),
    render: ({ args, status }) => {
      const download = () => {
        if (!args.content) return
        const url = URL.createObjectURL(new Blob([args.content], { type: 'text/plain;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url; link.download = (args.filename || 'document.txt').replace(/[\\/:*?"<>|]/g, '_'); link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      return <ArtifactCard title={args.filename ?? ''} meta={`${args.content?.length ?? 0} characters`} generating={status.type === 'running'} words={args.content?.split(/\s+/).length ?? 0} role="button" tabIndex={0} onClick={download} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); download() } }} />
    },
    unstable_backendDefault: { parameters: false },
  },
  show_code_diff: {
    type: 'frontend',
    description: 'Show an actual proposed or completed code diff. This is a preview and does not modify project files.',
    parameters: z.object({ filename: z.string(), lines: z.array(z.object({ kind: z.enum(['context', 'added', 'removed']), text: z.string() })).max(2000) }),
    execute: async ({ filename, lines }) => ({ filename, additions: lines.filter((line: { kind: string }) => line.kind === 'added').length, deletions: lines.filter((line: { kind: string }) => line.kind === 'removed').length }),
    render: ({ args }) => <CodeDiff filename={args.filename ?? ''} additions={args.lines?.filter((line: { kind: string }) => line.kind === 'added').length ?? 0} deletions={args.lines?.filter((line: { kind: string }) => line.kind === 'removed').length ?? 0} lines={args.lines ?? []} cycle={0} />,
    unstable_backendDefault: { parameters: false },
  },
  show_math: {
    type: 'frontend',
    description: 'Display mathematical derivation steps as a native math card, using plain Unicode mathematical expressions and explanatory notes.',
    parameters: z.object({ label: z.string(), steps: z.array(z.object({ expression: z.string(), note: z.string().optional() })).max(24) }),
    execute: async ({ steps }) => ({ steps: steps.length }),
    render: ({ args }) => <MathBlock label={args.label} steps={args.steps ?? []} visibleSteps={args.steps?.length ?? 0} />,
    unstable_backendDefault: { parameters: false },
  },
})
