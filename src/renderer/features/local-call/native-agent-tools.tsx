import { defineToolkit } from '@assistant-ui/react'
import { z } from 'zod'
import { AgentPlan } from '@/components/assistant-ui/native/agent-plan'
import { TodoList } from '@/components/assistant-ui/native/todo-list'
import { ArtifactCard } from '@/components/assistant-ui/native/artifact-card'
import { CodeDiff } from '@/components/assistant-ui/native/code-diff'
import { MathBlock } from '@/components/assistant-ui/native/math-block'

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
