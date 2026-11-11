import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { cropScreenshot, ImageTranslation, viewportRect } from './image-translation'
import { DEFAULT_PREFERENCES } from './preferences'
import { showToast } from '../../src/renderer/components/ui/toast'
import { browserText } from './i18n'
import { translateImage } from './provider-client'

vi.mock('../../src/renderer/components/ui/toast', () => ({ showToast: vi.fn() }))
vi.mock('./provider-client', () => ({ translateImage: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('clips the requested area to the visible viewport', () => {
  expect(viewportRect({ x: -10, y: 20, width: 80, height: 100 }, 100, 80)).toEqual({ x: 0, y: 20, width: 70, height: 60 })
})

it('crops using the viewport captured with the screenshot', async () => {
  const bitmap = { width: 400, height: 200, close: vi.fn() }
  const drawImage = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob() }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,test')
  await expect(cropScreenshot('data:image/png;base64,test', { x: 10, y: 20, width: 50, height: 30 }, { width: 200, height: 100 })).resolves.toBe('data:image/png;base64,test')
  expect(drawImage).toHaveBeenCalledWith(bitmap, 20, 40, 100, 60, 0, 0, 100, 60)
  expect(bitmap.close).toHaveBeenCalledOnce()
})

it('shows a preview before sending the image', async () => {
  vi.mocked(translateImage).mockResolvedValue('译文')
  const image = 'data:image/png;base64,aGVsbG8='
  const capture = vi.fn().mockResolvedValue(image)
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const container = document.createElement('div')
  document.body.append(container)
  const view = render(<ImageTranslation initialRect={{ x: 1, y: 2, width: 20, height: 30 }} preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'zh-CN' }} container={container} capture={capture} close={vi.fn()} />)
  try {
    expect(screen.queryByText(/index-translate\.bilibili\.com\/v1/)).toBeNull()
    await screen.findByRole('img', { name: '翻译图片' })
    expect(translateImage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '翻译图片' }))
    await waitFor(() => expect(translateImage).toHaveBeenCalledWith(image, 'zh', expect.any(AbortSignal)))
    expect(await screen.findByText('译文')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '复制译文' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('译文'))
  } finally { view.unmount(); container.remove(); if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard); else Reflect.deleteProperty(navigator, 'clipboard') }
})

it('explains that a changed viewport requires a new selection', async () => {
  const container = document.createElement('div'); document.body.append(container)
  const view = render(<ImageTranslation initialRect={{ x: 0, y: 0, width: 50, height: 50 }} preferences={{ ...DEFAULT_PREFERENCES, uiLanguage: 'zh-CN' }} container={container} capture={vi.fn().mockRejectedValue(new Error('imageCaptureChanged'))} close={vi.fn()} />)
  try {
    await waitFor(() => expect(showToast).toHaveBeenCalledWith({ type: 'error', description: browserText('zh-CN')('imageCaptureChanged') }))
    expect(screen.getByRole('button', { name: '翻译图片' })).toBeDisabled()
  } finally { view.unmount(); container.remove() }
})
