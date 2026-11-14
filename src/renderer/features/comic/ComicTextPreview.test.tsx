import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComicBridge, ComicRegion } from '../../../shared/comic'
import { ComicTextPreview } from './ComicTextPreview'

const region: ComicRegion = { id: 'r', x: 10, y: 20, width: 40, height: 40, sourceText: '', targetText: '译文', confidence: null, locked: false, ignored: false, style: { fontSize: 16, color: '#000000', direction: 'horizontal', align: 'center' }, qa: [] }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('avoids a canvas and image request when no text is visible', () => {
  const layerImage = vi.fn()
  const api = { layerImage } as unknown as ComicBridge
  const { container, rerender } = render(<ComicTextPreview api={api} projectId="p" pageId="a" revision={1} regions={[]} width={2000} height={3000} />)
  expect(container.querySelector('canvas')).toBeNull()
  rerender(<ComicTextPreview api={api} projectId="p" pageId="a" revision={1} regions={[region]} hiddenRegionId="r" width={2000} height={3000} />)
  expect(container.querySelector('canvas')).toBeNull()
  expect(layerImage).not.toHaveBeenCalled()
})

it('uses a bounded scaled overlay while preserving the default full-resolution request', async () => {
  const drawImage = vi.fn()
  const ctx = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage, globalAlpha: 1 }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.stubGlobal('Image', class { src = ''; decode = async () => {} })
  const layerImage = vi.fn(async () => 'data:image/png;base64,AA==')
  const api = { layerImage } as unknown as ComicBridge
  const { container, rerender } = render(<ComicTextPreview api={api} projectId="p" pageId="a" revision={1} regions={[region]} width={2000} height={3000} renderScale={0.1} />)
  const canvas = container.querySelector('canvas')!
  expect([canvas.width, canvas.height]).toEqual([200, 300])
  await waitFor(() => expect(layerImage).toHaveBeenCalledWith('p', 'a', 'text', 'r', 60000))
  await waitFor(() => expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 200, 300))
  layerImage.mockClear()
  rerender(<ComicTextPreview api={api} projectId="p" pageId="a" revision={1} regions={[region]} width={2000} height={3000} />)
  expect([canvas.width, canvas.height]).toEqual([2000, 3000])
  await waitFor(() => expect(layerImage).toHaveBeenCalledWith('p', 'a', 'text', 'r'))
})

it('renders a draft at reduced resolution without changing its region geometry', async () => {
  const drawImage = vi.fn()
  const ctx = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage, globalAlpha: 1 }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.stubGlobal('Image', class { src = ''; decode = async () => {} })
  const draft = { ...region, targetText: '新译文' }
  const previewRegion = vi.fn(async () => ({ image: 'data:image/png;base64,AA==' }))
  const layerImage = vi.fn()
  const api = { layerImage, previewRegion } as unknown as ComicBridge
  const { container } = render(<ComicTextPreview api={api} projectId="p" pageId="a" revision={1} regions={[region]} draft={draft} width={2000} height={3000} renderScale={0.01} />)
  expect([container.querySelector('canvas')!.width, container.querySelector('canvas')!.height]).toEqual([20, 30])
  await waitFor(() => expect(previewRegion).toHaveBeenCalledWith('p', 'a', draft))
  await waitFor(() => expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 20, 30))
  expect(layerImage).not.toHaveBeenCalled()
  expect(draft).toMatchObject({ x: 10, y: 20, width: 40, height: 40 })
})
