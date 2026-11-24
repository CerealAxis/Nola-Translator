import { beforeEach, expect, it, vi } from 'vitest'
import { PerformanceMonitorWindow } from '../../../src/main/performance-monitor-window'

const native = vi.hoisted(() => ({
  windows: [] as {
    loadFile: ReturnType<typeof vi.fn>
    isMinimized: ReturnType<typeof vi.fn>
    restore: ReturnType<typeof vi.fn>
    maximize: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    webContents: { mainFrame: object }
    close: () => void
  }[],
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: class {
    private closed = false
    private onClose?: () => void
    loadURL = vi.fn().mockResolvedValue(undefined)
    loadFile = vi.fn().mockResolvedValue(undefined)
    isMinimized = vi.fn().mockReturnValue(false)
    restore = vi.fn()
    maximize = vi.fn()
    show = vi.fn()
    focus = vi.fn()
    webContents = { setWindowOpenHandler: vi.fn(), mainFrame: {} }

    constructor() { native.windows.push(this) }
    isDestroyed() { return this.closed }
    once(_event: string, callback: () => void) { this.onClose = callback }
    close() { this.closed = true; this.onClose?.() }
    destroy() { this.close() }
  },
}))

beforeEach(() => { native.windows.length = 0 })

it('opens one monitor window, restores it when reopened, and creates a new one after closing', async () => {
  vi.stubEnv('ELECTRON_RENDERER_URL', undefined)
  try {
    let available = false
    const monitor = new PerformanceMonitorWindow(process.cwd(), () => available)
    await expect(monitor.open('dark')).rejects.toThrow('Gateway performance data unavailable')
    expect(native.windows).toHaveLength(0)
    available = true
    await Promise.all([monitor.open('dark'), monitor.open('dark')])

    expect(native.windows).toHaveLength(1)
    const first = native.windows[0]
    expect(first.loadFile).toHaveBeenCalledWith(expect.stringMatching(/performance-monitor\.html$/), { query: { theme: 'dark' } })
    expect(first.show).toHaveBeenCalled()
    expect(first.maximize).toHaveBeenCalledOnce()
    first.isMinimized.mockReturnValue(true)
    await monitor.open('dark')
    expect(first.restore).toHaveBeenCalledOnce()
    expect(first.focus).toHaveBeenCalled()
    expect(first.maximize).toHaveBeenCalledOnce()

    const event = { sender: first.webContents, senderFrame: first.webContents.mainFrame } as Electron.IpcMainInvokeEvent
    const signal = monitor.snapshotSignal(event)
    expect(signal.aborted).toBe(false)
    expect(() => monitor.snapshotSignal({ ...event, senderFrame: {} } as Electron.IpcMainInvokeEvent)).toThrow('Access denied')
    available = false
    expect(() => monitor.snapshotSignal(event)).toThrow('Gateway performance data unavailable')
    monitor.close()
    expect(signal.aborted).toBe(true)
    available = true
    await monitor.open('light')
    expect(native.windows).toHaveLength(2)
    expect(() => monitor.snapshotSignal(event)).toThrow('Access denied')
    expect(native.windows[1].loadFile).toHaveBeenCalledWith(expect.any(String), { query: { theme: 'light' } })
  } finally { vi.unstubAllEnvs() }
})
