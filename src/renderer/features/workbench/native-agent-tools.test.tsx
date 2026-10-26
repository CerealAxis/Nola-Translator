import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { defaultGenerativeUILibrary } from '@assistant-ui/generative-ui/react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { createGenerativePresentationTools } from './native-agent-tools'

afterEach(cleanup)

it('rejects unsupported components instead of reporting an empty preview as successful', async () => {
  const tools = createGenerativePresentationTools(defaultGenerativeUILibrary)
  await expect(tools.present.execute!({ _type: 'MissingDashboard' })).rejects.toThrow(/MissingDashboard/)
})
it('validates nested component properties and renders accepted native cards', async () => {
  const tools = createGenerativePresentationTools(defaultGenerativeUILibrary)
  const args = { _type: 'Card', title: 'Dashboard', children: [{ _type: 'Fact', label: 'Requests', value: '42' }] }
  await expect(tools.present.execute!(args)).resolves.toEqual({})
  const Render = tools.present.render!
  const props = { type: 'tool-call', args, argsText: JSON.stringify(args), result: {}, status: { type: 'complete' }, toolName: 'present', toolCallId: 'preview',
    addResult: () => undefined, resume: () => undefined, respondToApproval: async () => undefined } as ToolCallMessagePartProps<Record<string, unknown>, Record<string, never>>
  render(<Render {...props} />)
  expect(screen.getByText('Dashboard')).toBeInTheDocument()
  expect(screen.getByText('42')).toBeInTheDocument()
})
