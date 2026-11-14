import { useEffect, useRef } from 'react'
import { useI18n } from '@/i18n'
import { notifyError } from '@/components/primitives/notify'
import type { ComicBridge, ComicRegion } from '../../../shared/comic'

export function ComicTextPreview({ api, projectId, pageId, revision, regions, width, height, excludeId, hiddenRegionId, draft, onDraftLayout, renderScale = 1 }: {
  api: ComicBridge; projectId: string; pageId: string; revision: number; regions: ComicRegion[]; width: number; height: number; excludeId?: string; hiddenRegionId?: string; draft?: ComicRegion; renderScale?: number
  onDraftLayout?: (regionId: string, layout: NonNullable<ComicRegion['resolvedLayout']>) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const identity = useRef('')
  const onLayout = useRef(onDraftLayout); onLayout.current = onDraftLayout
  const draftKey = draft ? JSON.stringify({ ...draft, resolvedLayout: undefined }) : ''
  const { t } = useI18n()
  const pixelScale = Math.max(0, Math.min(1, Number.isFinite(renderScale) ? renderScale : 1))
  const pixelWidth = Math.max(1, Math.round(width * pixelScale))
  const pixelHeight = Math.max(1, Math.round(height * pixelScale))
  const hasText = regions.some(region => {
    const current = draft?.id === region.id ? draft : region
    return region.id !== excludeId && region.id !== hiddenRegionId && current.visible !== false && !current.ignored && !!current.targetText
  })
  useEffect(() => {
    let live = true
    const key = `${projectId}:${pageId}:${revision}:${pixelWidth}:${pixelHeight}`
    if (identity.current !== key) { identity.current = key; ref.current?.getContext('2d')?.clearRect(0, 0, pixelWidth, pixelHeight) }
    const render = async () => {
      const canvas = ref.current
      if (!canvas || !api.layerImage) return
      const ctx = canvas.getContext('2d')!
      const next = document.createElement('canvas'); next.width = pixelWidth; next.height = pixelHeight
      const target = next.getContext('2d')!
      for (const region of regions) {
        const current = draft?.id === region.id ? draft : region
        if (!live || region.id === excludeId || region.id === hiddenRegionId || current.visible === false || current.ignored || !current.targetText) continue
        try {
          const preview = draft?.id === region.id && api.previewRegion ? await api.previewRegion(projectId, pageId, draft) : undefined
          const src = preview?.image ?? (pixelScale < 1 ? await api.layerImage(projectId, pageId, 'text', region.id, Math.max(10000, Math.min(4000000, pixelWidth * pixelHeight))) : await api.layerImage(projectId, pageId, 'text', region.id))
          if (!live) return
          if (preview?.layout) onLayout.current?.(region.id, preview.layout)
          const image = new Image()
          image.src = src
          await image.decode()
          if (!live) return
          target.save(); target.globalAlpha = (draft?.id === region.id ? draft.opacity : region.opacity) ?? 1; target.drawImage(image, 0, 0, pixelWidth, pixelHeight); target.restore()
        } catch (error) { if (live) notifyError(t('suite.actionFailed'), { cause: error }); return }
      }
      if (live) { ctx.clearRect(0, 0, pixelWidth, pixelHeight); ctx.drawImage(next, 0, 0) }
    }
    const timer = window.setTimeout(() => { void render() }, draft || pixelScale < 1 ? 120 : 0)
    return () => { live = false; window.clearTimeout(timer) }
  }, [api, projectId, pageId, revision, regions, pixelWidth, pixelHeight, pixelScale, hasText, excludeId, hiddenRegionId, draftKey, t])
  return hasText ? <canvas ref={ref} className="comic-canvas__overlay" width={pixelWidth} height={pixelHeight} aria-hidden="true" /> : null
}
