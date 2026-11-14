import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComicBridge, ComicDrawingLayer } from '../../../shared/comic'
import { ComicDrawingPreview } from './ComicDrawingPreview'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('uses scaled backend layers for inactive boards and keeps the full-size local path', async () => {
  const drawImage = vi.fn(), save = vi.fn(), restore = vi.fn()
  const ctx = { clearRect: vi.fn(), save, restore, drawImage, globalAlpha: 1 }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.stubGlobal('Image', class { src = ''; decode = async () => {} })
  const layerImage = vi.fn(async () => 'data:image/png;base64,AA==')
  const api = { layerImage } as unknown as ComicBridge
  const layers: ComicDrawingLayer[] = [{ id: 'visible', name: 'Visible', visible: true, locked: false, opacity: 0.5, strokes: [] }, { id: 'hidden', name: 'Hidden', visible: false, locked: false, opacity: 1, strokes: [] }]
  const preview = { api, projectId: 'p', pageId: 'a', revision: 1, renderScale: 0.1 }
  const { container, rerender } = render(<ComicDrawingPreview layers={layers} width={2000} height={3000} preview={preview} />)
  const canvas = container.querySelector('canvas')!
  expect([canvas.width, canvas.height]).toEqual([200, 300])
  await waitFor(() => expect(layerImage).toHaveBeenCalledExactlyOnceWith('p', 'a', 'drawing', 'visible', 60000))
  await waitFor(() => expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 200, 300))
  expect(ctx.globalAlpha).toBe(0.5)
  layerImage.mockClear()
  rerender(<ComicDrawingPreview layers={layers} width={2000} height={3000} />)
  expect([canvas.width, canvas.height]).toEqual([2000, 3000])
  expect(layerImage).not.toHaveBeenCalled()
})

it('continues to render active strokes locally at full resolution', async () => {
  const stroke = vi.fn()
  const ctx = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  const layerImage = vi.fn()
  const api = { layerImage } as unknown as ComicBridge
  const layers: ComicDrawingLayer[] = [{ id: 'a', name: 'A', visible: true, locked: false, opacity: 1, strokes: [{ id: 's', mode: 'brush', points: [[5, 5]], color: '#000000', size: 5 }] }]
  const { container } = render(<div><img alt="page" src="data:image/png;base64,AA==" /><ComicDrawingPreview layers={layers} width={100} height={100} preview={{ api, projectId: 'p', pageId: 'a', revision: 1, renderScale: 1 }} /></div>)
  const image = container.querySelector('img')!
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 100 } })
  image.dispatchEvent(new Event('load'))
  await waitFor(() => expect(stroke).toHaveBeenCalled())
  expect(layerImage).not.toHaveBeenCalled()
})
