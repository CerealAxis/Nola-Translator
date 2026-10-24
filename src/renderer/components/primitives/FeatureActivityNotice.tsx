import { useEffect, useState } from 'react'
import { getBridge } from '@/store'
import { useI18n } from '@/i18n'
import type { ActiveFeature } from '../../../shared/feature-activity'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notifyError, notifyInfo, notifySuccess } from './notify'
import type { ModelGatewaySnapshot } from '../../../shared/model-gateway'

interface FeatureRequest { owner: ActiveFeature; retry: () => Promise<void>; cancel: () => void }
const listeners = new Set<(request: FeatureRequest | null) => void>()
let pending: FeatureRequest | null = null
function publish(request: FeatureRequest | null) { pending = request; listeners.forEach(listener => listener(request)) }

/** A conflict is a recoverable user choice; all other failures retain the caller's error path. */
export async function requestFeatureStart<T>(action: () => Promise<T>, feature?: ActiveFeature): Promise<T | undefined> {
  try {
    const activity = feature ? await getBridge()?.activity?.snapshot() : undefined
    if (activity?.owner && activity.owner !== feature) throw new Error(`FEATURE_CONFLICT:${activity.owner}`)
    return await action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const owner = /FEATURE_CONFLICT:(workbench|interpretation|browser-captions|model-gateway)/.exec(message)?.[1] as ActiveFeature | undefined
    if (!owner) throw error
    return new Promise<T | undefined>((resolve, reject) => {
      pending?.cancel()
      publish({ owner, cancel: () => { publish(null); resolve(undefined) }, retry: async () => {
        const activity = getBridge()?.activity
        if (!activity) { reject(new Error('Feature activity is unavailable')); publish(null); return }
        try { await activity.stop(); const result = await action(); publish(null); resolve(result) }
        catch (cause) { publish(null); reject(cause); throw cause }
      } })
    })
  }
}

export function FeatureActivityNotice() {
  const { t } = useI18n()
  const [request, setRequest] = useState(pending)
  const [quit, setQuit] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { listeners.add(setRequest); return () => { listeners.delete(setRequest) } }, [])
  useEffect(() => getBridge()?.onQuitRequested?.(() => setQuit(true)), [])
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('workspace') === '1') return
    const gateway = getBridge()?.gateway
    if (!gateway) return
    let previous: ModelGatewaySnapshot | null = null
    let alive = true
    let received = false
    const receive = (snapshot: ModelGatewaySnapshot) => {
      received = true
      if (previous && document.visibilityState !== 'hidden') {
        for (const kind of ['asr', 'mt', 'tts'] as const) {
          const service = snapshot.services[kind]
          const before = previous.services[kind]
          if (service.state === 'failed' && (before.state !== 'failed' || before.error !== service.error)) {
            console.error(`[gateway.${kind}]`, service.error)
            notifyError(t('gateway.capabilityFailed', { name: t(`gateway.${kind}`) }), {
              description: t(/memory|oom|cuda.*alloc/i.test(service.error ?? '') ? 'gateway.memoryFailed' : 'gateway.serviceFailed'),
            })
          }
        }
        if (snapshot.state === 'failed' && previous.state !== 'failed' && !Object.values(snapshot.services).some(service => service.state === 'failed')) notifyError(t('gateway.actionFailed'))
        if (snapshot.state === 'running' && previous.state !== 'running') notifySuccess(t('gateway.startedNotice'))
        if (snapshot.state === 'stopped' && previous.state !== 'stopped') notifyInfo(t('gateway.stoppedNotice'))
      }
      previous = snapshot
    }
    const off = gateway.onChanged(receive)
    void gateway.snapshot().then(snapshot => { if (alive && !received) previous = snapshot }).catch(error => console.error('[gateway.snapshot]', error))
    return () => { alive = false; off() }
  }, [t])
  const confirm = async () => {
    setBusy(true)
    try {
      if (quit) { await getBridge()?.confirmQuit?.(); setQuit(false) }
      else await request?.retry()
    } catch (error) { console.error('[feature-activity]', error); if (quit) notifyError(t('gateway.actionFailed')) }
    finally { setBusy(false) }
  }
  return <Dialog open={!!request || quit} onOpenChange={open => { if (!open && !busy) { request?.cancel(); setQuit(false) } }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t(quit ? 'gateway.quitTitle' : 'gateway.conflictTitle')}</DialogTitle>
        <DialogDescription>{quit ? t('gateway.quitDescription') : t('gateway.conflictDescription', { name: request ? t(`gateway.${request.owner}`) : '' })}</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="secondary" disabled={busy} onClick={() => { request?.cancel(); setQuit(false) }}>{t('common.cancel')}</Button>
        <Button disabled={busy} onClick={() => void confirm()}>{t(quit ? 'gateway.quit' : 'gateway.switchFeature')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
