import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { BROWSER_PROTOCOL_VERSION } from '../../src/shared/browser'
import { showToast } from '../../src/renderer/components/ui/toast'
import { browserText } from './i18n'
import { ConnectionStatus } from './settings-fields'

const request = vi.fn()
const close = vi.fn()
vi.mock('./bridge', () => ({ createBridge: () => ({ request, close }), BrowserFailure: class extends Error { code = 'browserConnectionUnavailable' } }))
vi.mock('../../src/renderer/components/ui/toast', () => ({ showToast: vi.fn() }))

it('probes the desktop connection and reports a failed retest', async () => {
  request.mockResolvedValueOnce({ protocolVersion: BROWSER_PROTOCOL_VERSION, textTranslation: true })
  const user = userEvent.setup()
  render(<ConnectionStatus t={browserText('en')} />)
  expect(await screen.findByText('Nola is connected')).toBeVisible()
  request.mockRejectedValueOnce(new Error('disconnected'))
  await user.click(screen.getByRole('button', { name: 'Nola is connected · Test connection' }))
  expect(await screen.findByText('Nola is disconnected')).toBeVisible()
  await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })))
  expect(close).toHaveBeenCalledTimes(2)
})
