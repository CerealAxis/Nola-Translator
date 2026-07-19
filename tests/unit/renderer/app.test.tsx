import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from '../../../src/renderer/app/App'

describe('App', () => {
  it('renders the primary caption session controls', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '实时字幕', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('音频来源')).toBeInTheDocument()
    expect(screen.getByLabelText('识别模式')).toBeInTheDocument()
    expect(screen.getByLabelText('源语言')).toBeInTheDocument()
    expect(screen.getByLabelText('主要翻译语言')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始字幕' })).toBeInTheDocument()
    expect(screen.getByText('所有处理都在你的设备上本地完成。')).toBeInTheDocument()
  })

  it('changes session state when the user starts and stops captions', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '开始字幕' }))
    expect(screen.getByRole('status')).toHaveTextContent('正在监听系统声音')
    expect(screen.getByRole('button', { name: '停止字幕' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '停止字幕' }))
    expect(screen.getByRole('status')).toHaveTextContent('准备就绪')
  })

  it('navigates to translation, appearance, and history pages', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(screen.getByRole('heading', { name: '本地语言包' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '外观' }))
    expect(screen.getByRole('heading', { name: '字幕样式' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '历史记录' }))
    expect(screen.getByText('默认不保存任何字幕内容。')).toBeInTheDocument()
  })

  it('navigates to recognition and diagnostics pages', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '语音识别' }))
    expect(screen.getByRole('heading', { name: '实时模式' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '诊断' }))
    expect(screen.getByText('Python 引擎')).toBeInTheDocument()
    expect(screen.getByText('等待接入')).toBeInTheDocument()
  })
})
