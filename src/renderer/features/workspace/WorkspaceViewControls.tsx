import { useEffect, useState } from 'react'
import { Minus, Pin, PinOff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getBridge } from '@/store'
import { useI18n } from '@/i18n'
import { notifyError } from '@/components/primitives/notify'
import type { WorkspaceView } from '../../../shared/workspace-view'

export function WorkspaceViewControls() {
  const { t } = useI18n()
  const api = getBridge()?.workspaceView
  const [view, setView] = useState<WorkspaceView>({ pinned: false, zoom: 1 })
  const standalone = new URLSearchParams(window.location.search).get('workspace') === '1'
  useEffect(() => {
    if (standalone) void api?.read().then(setView).catch(() => undefined)
  }, [api, standalone])
  if (!standalone || !api) return null
  const update = (patch: Partial<WorkspaceView>) => {
    void api.update(patch).then(setView).catch(error => notifyError(t('workspaceUi.windowFailed'), { cause: error }))
  }
  return <div className="flex items-center gap-2">
    <Button variant="outline" size="icon-sm" aria-label={t(view.pinned ? 'overlay.unpin' : 'overlay.pin')} aria-pressed={view.pinned} onClick={() => update({ pinned: !view.pinned })}>{view.pinned ? <PinOff /> : <Pin />}</Button>
    <Button variant="outline" size="icon-sm" aria-label={t('workspace.fontSmaller')} disabled={view.zoom <= 0.5} onClick={() => update({ zoom: Math.max(0.5, Math.round((view.zoom - 0.1) * 10) / 10) })}><Minus /></Button>
    <Button variant="outline" size="sm" aria-label={t('overlay.size')} onClick={() => update({ zoom: 1 })}>{Math.round(view.zoom * 100)}%</Button>
    <Button variant="outline" size="icon-sm" aria-label={t('workspace.fontLarger')} disabled={view.zoom >= 2} onClick={() => update({ zoom: Math.min(2, Math.round((view.zoom + 0.1) * 10) / 10) })}><Plus /></Button>
  </div>
}
