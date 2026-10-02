import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { App } from '../../../src/renderer/app/App'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

describe('App', () => {
  it('waits for resource inspection before showing the main window', async () => {
    const api = window.nolaTranslator!
    const original = api.listResources
    let finish!: (value: Awaited<ReturnType<typeof api.listResources>>) => void
    const pending = new Promise<Awaited<ReturnType<typeof api.listResources>>>((resolve) => { finish = resolve })
    const listResources = vi.spyOn(api, 'listResources').mockReturnValue(pending)

    render(<App />)
    expect(screen.getByText('正在加载本地引擎与资源…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '实时字幕' })).not.toBeInTheDocument()

    finish(await original())
    expect(await screen.findByRole('heading', { name: '实时字幕' })).toBeInTheDocument()
    listResources.mockRestore()
  })

  it('renders the primary caption session controls', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    expect(screen.getByRole('heading', { name: '实时字幕', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('音频来源')).toBeInTheDocument()
    expect(screen.getByLabelText('源语言')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '目标语言' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始字幕' })).toBeInTheDocument()
    expect(screen.getByText('开始会话后，识别原文会显示在这里。')).toBeInTheDocument()
  })

  it('changes session state when the user starts and stops captions', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    await waitFor(() => expect(screen.getByRole('button', { name: '开始字幕' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '开始字幕' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('正在监听音频'))
    expect(screen.getByRole('button', { name: '停止字幕' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '停止字幕' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('准备就绪'))
  })

  it('starts without translation targets when translated text is hidden', async () => {
    const api = window.nolaTranslator!
    const getSettings = vi.spyOn(api, 'getSettings').mockResolvedValue({
      ...DEFAULT_SETTINGS,
      overlay: { ...DEFAULT_SETTINGS.overlay, showTranslation: false },
    })
    const startSession = vi.spyOn(api, 'startSession')
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '译文' })).not.toBeChecked())
    await waitFor(() => expect(screen.getByRole('button', { name: '开始字幕' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: '开始字幕' }))
    await waitFor(() => expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ targetLanguages: [] })))
    getSettings.mockRestore()
    startSession.mockRestore()
  })

  it('keeps a global stop action available after navigating away from captions', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    await waitFor(() => expect(screen.getByRole('button', { name: '开始字幕' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '开始字幕' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('正在监听音频'))
    fireEvent.click(screen.getByRole('button', { name: '外观' }))

    expect(screen.getByRole('button', { name: '停止字幕服务' })).toBeInTheDocument()
  })

  it('navigates to translation, appearance, and history pages', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(screen.getByRole('heading', { name: '本地翻译模型' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '外观' }))
    expect(screen.getByRole('heading', { name: '字幕样式' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '会议记录' }))
    expect(await screen.findByRole('heading', { name: '会议记录', level: 1 })).toBeInTheDocument()
    // Every caption session is recorded; there is no switch to turn that off anymore.
    expect(screen.getAllByText('周会')).toHaveLength(1)
  })

  it('offers explicit controls to hide and adjust the subtitle overlay', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '外观' }))

    expect(screen.getByRole('button', { name: '隐藏浮层' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '调整位置和大小' })).toBeInTheDocument()
  })

  it('hides the overlay and enters free unlocked adjustment mode', async () => {
    const api = window.nolaTranslator!
    const hideOverlay = vi.spyOn(api, 'hideOverlay')
    const showOverlay = vi.spyOn(api, 'showOverlay')
    const updateSettings = vi.spyOn(api, 'updateSettings').mockImplementation(async (patch) => ({
      ...DEFAULT_SETTINGS,
      ...patch,
      recognition: { ...DEFAULT_SETTINGS.recognition, ...patch.recognition },
      overlay: { ...DEFAULT_SETTINGS.overlay, ...patch.overlay },
      translation: { ...DEFAULT_SETTINGS.translation, ...patch.translation },
    }))

    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '外观' }))

    fireEvent.click(screen.getByRole('button', { name: '隐藏浮层' }))
    await waitFor(() => expect(hideOverlay).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: '调整位置和大小' }))
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ overlay: { mode: 'free', locked: false } })
      expect(showOverlay).toHaveBeenCalledOnce()
    })

    hideOverlay.mockRestore()
    showOverlay.mockRestore()
    updateSettings.mockRestore()
  })

  it('navigates to recognition and diagnostics pages', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '语音识别' }))
    expect(screen.getByRole('heading', { name: 'Qwen3-ASR 1.7B' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '诊断' }))
    expect(await screen.findByText('引擎状态')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  it('shows a dedicated resources page with the local translation model section', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '实时字幕', level: 1 })
    fireEvent.click(screen.getByRole('button', { name: '模型与资源' }))
    expect(screen.getByRole('heading', { name: '模型与资源', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Qwen3-ASR 1.7B')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '本地翻译模型' })).toBeInTheDocument()
    expect(await screen.findByText('Hy-MT2 1.8B Q4_K_M')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(screen.getByRole('checkbox', { name: '翻译中间结果' })).toBeInTheDocument()
  })
})
