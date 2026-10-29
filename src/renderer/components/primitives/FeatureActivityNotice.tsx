import { useEffect, useState } from 'react'
import { getBridge } from '@/store'
import { useI18n } from '@/i18n'
import type { ActiveFeature } from '../../../shared/feature-activity'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notifyError, notifyInfo, notifySuccess } from './notify'
import type { ModelGatewaySnapshot } from '../../../shared/model-gateway'

/** Independent consumers share gateway capabilities without stopping another feature. */
export async function requestFeatureStart<T>(action: () => Promise<T>, _feature?: ActiveFeature): Promise<T> {
  return action()
}

export function FeatureActivityNotice() {
  const { t } = useI18n()
  const [quit, setQuit] = useState(false)
  const [busy, setBusy] = useState(false)
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
        const stopping = snapshot.state === 'stopping' || snapshot.state === 'stopped'
        for (const kind of ['asr', 'mt', 'tts', 'llm'] as const) {
          const service = snapshot.services[kind]
          const before = previous.services[kind]
          if (!stopping && service.state === 'failed' && (before.state !== 'failed' || before.error !== service.error)) {
            console.error(`[gateway.${kind}]`, service.error)
            notifyError(t('gateway.capabilityFailed', { name: t(`gateway.${kind}`) }), {
              description: t(service.errorCode === 'model_disabled' ? 'modelsPolicy.modelDisabled'
                : service.errorCode === 'model_not_loaded' || service.errorCode === 'model_not_found' ? 'modelsPolicy.modelNotLoaded'
                  : /memory|oom|cuda.*alloc/i.test(service.error ?? '') ? 'gateway.memoryFailed' : 'gateway.serviceFailed'),
            })
          }
        }
        if (!stopping && snapshot.state === 'failed' && previous.state !== 'failed' && !Object.values(snapshot.services).some(service => service.state === 'failed')) notifyError(t('gateway.actionFailed'))
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
      await getBridge()?.confirmQuit?.(); setQuit(false)
    } catch (error) { console.error('[feature-activity]', error); if (quit) notifyError(t('gateway.actionFailed')) }
    finally { setBusy(false) }
  }
  return <Dialog open={quit} onOpenChange={open => { if (!open && !busy) setQuit(false) }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t('gateway.quitTitle')}</DialogTitle>
        <DialogDescription>{t('gateway.quitDescription')}</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="secondary" disabled={busy} onClick={() => setQuit(false)}>{t('common.cancel')}</Button>
        <Button disabled={busy} onClick={() => void confirm()}>{t('gateway.quit')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
