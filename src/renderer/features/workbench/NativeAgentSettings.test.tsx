import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NativeAgentSettings } from './NativeAgentSettings'

vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)

it('keeps the subagent editor open after a failed save', async () => {
  const onAction = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  render(<NativeAgentSettings page="subagents" snapshot={null} onAction={onAction} busy={false}
    model="" onPrompt={() => {}} memories={[]} onMemories={() => {}} />)
  fireEvent.click(screen.getByText('workbench.addSubagent'))
  const name = screen.getByRole('textbox', { name: 'workbench.agentName' })
  fireEvent.change(name, { target: { value: 'Editor' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'workbench.instructions' }), { target: { value: 'Help edit.' } })
  fireEvent.submit(name.closest('form')!)
  await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
  expect(name).toHaveValue('Editor')
  fireEvent.submit(name.closest('form')!)
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'workbench.agentName' })).not.toBeInTheDocument())
})
