import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceRecord } from '@/bridge'
import { DEFAULT_COMPUTE_SETTINGS, type RuntimeSnapshot } from '../../../shared/compute'
import { RecommendedFamilyDialog } from './RecommendedFamilies'

vi.mock('@lobehub/icons/es/features/IconAvatar', () => ({ default: () => null }))
afterEach(cleanup)

it('orders supported runtimes and explains their installed state on hover', async () => {
  const records: ResourceRecord[] = ['pytorch', 'crisp', 'llama'].map((engine, index) => ({
    resourceId: `qwen3-asr-test-${index}`, kind: 'recognitionModel', provider: engine === 'pytorch' ? 'qwen3-asr' : engine === 'crisp' ? 'crisp-asr' : 'llama-asr',
    name: 'Qwen3-ASR 0.6B', description: '', languages: [], installed: false, installedBytes: 0, state: 'idle', cancellable: false,
  }))
  const runtime = (status: 'ready' | 'missing') => ({ path: '', status, backend: '', version: '', gpuAvailable: false, reason: '' })
  render(<RecommendedFamilyDialog family="qwen" records={records} compute={DEFAULT_COMPUTE_SETTINGS}
    runtimes={{ local: { llama: runtime('ready'), crisp: runtime('ready'), engine: runtime('missing') } } as RuntimeSnapshot}
    busyIds={[]} onClose={() => {}} onInstall={() => {}} onCancel={() => {}} onManualDownload={() => {}} />)
  const choices = within(screen.getByRole('region', { name: '运行引擎' })).getAllByRole('tab')
  expect(choices.map(choice => choice.textContent)).toEqual(['llama.cpp', 'CrispASR', 'PyTorch'])
  const user = userEvent.setup()
  await user.hover(choices[0])
  expect(await screen.findByRole('tooltip')).toHaveTextContent('已安装 llama.cpp 运行引擎')
  await user.unhover(choices[0])
  await user.hover(choices[2])
  expect(await screen.findByRole('tooltip')).toHaveTextContent('未安装 PyTorch 运行引擎，不推荐使用')
})
