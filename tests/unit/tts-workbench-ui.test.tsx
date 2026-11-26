import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NativeAgentSurface } from '../../src/renderer/features/workbench/NativeAgentSurface'
import { ttsCatalogCapabilities } from '../../src/shared/tts/catalog'

vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))
vi.mock('@/store', async original => ({ ...await original<typeof import('../../src/renderer/store')>(),
  getBridge: () => ({ voices: { compatibility: async (_binding: string, _language: string, refs: unknown[]) => refs.map(ref => ({ ref, compatible: true })), list: async () => [], capabilities: async (binding: string) => ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', binding) } }),
}))
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Workbench({ active }: { active: boolean }) {
  const runtime = useLocalRuntime({ async *run() { yield { content: [{ type: 'text' as const, text: 'OK' }] } } })
  const model = { id: 'cloud:mimo-v2.5-tts', kind: 'tts' as const, name: 'MiMo', targetLanguages: ['zh', 'en'] }
  return <AssistantRuntimeProvider runtime={runtime}><NativeAgentSurface active={active} sidebar={null} heading={null} actions={null} onBack={() => {}}
    config={{ model: model.id, kind: 'tts', effort: 'auto', source: 'auto', target: 'en', voiceRef: { kind: 'engine-default' } }}
    onChange={() => {}} profiles={[]} models={[model]} modelCatalog={[model]} onConfigure={() => {}} snapshot={null}
    onAction={async () => true} busy={false} placeholder="输入文本" memories={[]} onMemories={() => {}} /></AssistantRuntimeProvider>
}

it('uses a language selector and closes the TTS popup when the workbench is hidden', async () => {
  const user = userEvent.setup()
  const view = render(<Workbench active />)
  await user.click(screen.getByRole('button', { name: '音色' }))
  expect(await screen.findByRole('combobox', { name: '目标语言' })).toBeVisible()
  expect(screen.queryByRole('textbox', { name: '目标语言' })).not.toBeInTheDocument()
  view.rerender(<Workbench active={false} />)
  await waitFor(() => expect(screen.queryByRole('combobox', { name: '目标语言' })).not.toBeInTheDocument())
  view.rerender(<Workbench active />)
  expect(screen.queryByRole('combobox', { name: '目标语言' })).not.toBeInTheDocument()
})
