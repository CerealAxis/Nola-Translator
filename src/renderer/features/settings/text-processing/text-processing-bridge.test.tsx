import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import * as notifications from '@/components/primitives/notify'
import { parseRoute } from '@/routes'
import * as store from '@/store'
import type { TextProcessingBridge } from '../../../../shared/text-processing'
import { TextProcessingTab } from './TextProcessingTab'
import { initTextProcessing } from './text-processing-preview'

it('runs the preview through the desktop bridge and reports backend failures with a Toast', async () => {
  const preview = vi.fn(async () => ({ text: '后端结果', skip: false, issues: [] }))
  let receiveError: Parameters<TextProcessingBridge['onError']>[0] | undefined
  const config = { revision: 1, values: { enabled: { normalize: true } } }
  const textProcessing: TextProcessingBridge = {
    snapshot: vi.fn(async () => config),
    save: vi.fn(),
    preview,
    onChanged: () => () => {},
    onError: listener => {
      receiveError = listener
      return () => {}
    },
  }
  vi.spyOn(store, 'getBridge').mockReturnValue({ textProcessing } as NonNullable<ReturnType<typeof store.getBridge>>)
  const errorToast = vi.spyOn(notifications, 'notifyError').mockReturnValue('test-toast')
  document.documentElement.lang = 'zh-CN'
  initTextProcessing()
  render(<TextProcessingTab route={parseRoute('#/settings/text-processing')} />)
  fireEvent.change(await screen.findByRole('textbox', { name: '测试原文' }), { target: { value: 'ＡＢＣ' } })
  await waitFor(() => expect(screen.getByRole('textbox', { name: '处理结果' })).toHaveValue('后端结果'))
  expect(preview).toHaveBeenCalledWith('ＡＢＣ', undefined)
  act(() => receiveError?.({ feature: 'python-pre', reason: 'script' }))
  expect(errorToast).toHaveBeenCalledWith('Python 脚本运行失败，已跳过该脚本。', expect.any(Object))
  vi.restoreAllMocks()
})
