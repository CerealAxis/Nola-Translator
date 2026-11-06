import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { screenConfigSchema, type ScreenSnapshot, type ScreenTranslationBridge } from '../../../shared/screen-translation'
import { ScreenToolbar } from './ScreenToolbar'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const snapshot: ScreenSnapshot = { status: 'running', config: screenConfigSchema.parse({}), sessionId: 'session', epoch: 1, blocks: [], shortcutError: false, frames: 0, ocrMs: 0, translationMs: 0 }
function setup(value = snapshot) {
  const command = vi.fn(async () => value)
  const api = { command, sources: async () => [] } as unknown as ScreenTranslationBridge
  render(<ScreenToolbar api={api} snapshot={value} />)
  return command
}
it('keeps read once, pause, stop and hiding as separate real commands', async () => {
  const command = setup()
  fireEvent.click(screen.getByRole('button', { name: '读一次' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'readOnce' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '暂停' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '暂停' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'pause' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '收起工具条' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '收起工具条' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'hideToolbar' }))
  fireEvent.click(screen.getByRole('button', { name: '停止' }))
  expect(command).toHaveBeenCalledWith({ action: 'stop' })
})
it('shows settings on demand and keeps overlay visibility independent from pause', async () => {
  const command = setup({ ...snapshot, status: 'paused', overlayVisible: false })
  expect(screen.getByRole('button', { name: '继续' })).toBeInTheDocument()
  expect(screen.queryByRole('switch')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '显示设置' }))
  const overlay = await screen.findByRole('switch', { name: '显示屏幕译文' })
  expect(overlay).not.toBeChecked()
  fireEvent.click(overlay)
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'toggleOverlay' }))
  expect(command).not.toHaveBeenCalledWith({ action: 'resume' })
})
it('measures expanded content synchronously even when the native window is not painting', async () => {
  vi.stubGlobal('ResizeObserver', undefined)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.querySelector('.screen-toolbar__settings') ? 200 : 50
    return { width: 400, height, x: 0, y: 0, top: 0, left: 0, right: 400, bottom: height, toJSON: () => ({}) }
  })
  const command = setup()
  expect(command).toHaveBeenCalledWith({ action: 'toolbarSize', width: 400, height: 50 })
  fireEvent.click(screen.getByRole('button', { name: '显示设置' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith({ action: 'toolbarSize', width: 400, height: 200 }))
  fireEvent.click(screen.getByRole('button', { name: '显示设置' }))
  await waitFor(() => expect(command).toHaveBeenLastCalledWith({ action: 'toolbarSize', width: 400, height: 50 }))
})
