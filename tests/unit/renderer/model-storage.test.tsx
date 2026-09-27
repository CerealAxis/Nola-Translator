import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ModelStorageSettings } from '../../../src/renderer/components/ModelStorageSettings'

describe('model storage controls', () => {
  const originalApi = window.fluentCaptions
  afterEach(() => { window.fluentCaptions = originalApi; vi.restoreAllMocks() })

  it('shows current and pending paths and restarts only after confirmation', async () => {
    const restartApp = vi.fn().mockResolvedValue(undefined)
    window.fluentCaptions = {
      ...originalApi!,
      getModelStorage: vi.fn().mockResolvedValue({ activePath: 'C:\\Old', configuredPath: 'C:\\Old', restartRequired: false }),
      chooseModelStorageDirectory: vi.fn().mockResolvedValue({ activePath: 'C:\\Old', configuredPath: 'D:\\Models', restartRequired: true }),
      restartApp,
    }
    render(<ModelStorageSettings />)
    fireEvent.click(await screen.findByRole('button', { name: '更改目录' }))
    expect(await screen.findByText('D:\\Models')).toBeInTheDocument()
    expect(screen.getByText('C:\\Old')).toBeInTheDocument()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: '重启并应用' }))
    expect(restartApp).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '重启并应用' }))
    await waitFor(() => expect(restartApp).toHaveBeenCalledOnce())
  })

  it('leaves the active location unchanged when the picker is cancelled', async () => {
    window.fluentCaptions = {
      ...originalApi!,
      getModelStorage: vi.fn().mockResolvedValue({ activePath: 'D:\\Models', configuredPath: 'D:\\Models', restartRequired: false }),
      chooseModelStorageDirectory: vi.fn().mockResolvedValue(null),
    }
    render(<ModelStorageSettings />)
    fireEvent.click(await screen.findByRole('button', { name: '更改目录' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '更改目录' })).toBeEnabled())
    expect(screen.queryByRole('button', { name: '重启并应用' })).not.toBeInTheDocument()
    expect(screen.getByText('D:\\Models')).toBeInTheDocument()
  })
})
