import { useEffect, useRef, useState } from 'react'
import { configurationOf } from '../../../shared/model-capabilities'
import { stores, useStore } from '@/store'
import { offlineActions, offlineStore } from '@/store/offlineStore'
import { ModelConfigurationDialog } from './ModelConfigurationDialog'

/** Opens configuration only for newly installed imported models. */
export function ModelCapabilityNotices() {
  const settings = useStore(stores.settings, state => state.settings)
  const deferForTour = useStore(stores.settings, state => state.onboardingActive || (!!state.settings && !state.settings.onboardingSeen && !state.onboardingAutoAttempted))
  const resources = useStore(stores.models, state => state.resources)
  const status = useStore(stores.session, state => state.status)
  const [configurationQueue, setConfigurationQueue] = useState<string[]>([])
  const previous = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (resources.length === 0) return
    const installed = new Set(resources.filter(record => record.installed).map(record => record.resourceId))
    const justInstalled = previous.current ? resources.filter(record => record.installed && record.resourceId.startsWith('hub:') && !configurationOf(record) && !previous.current?.has(record.resourceId)).map(record => record.resourceId) : []
    previous.current = installed
    if (justInstalled.length > 0) {
      const offline = offlineStore.getState()
      if (offline.mode === 'model' && offline.task?.state === 'completed') offlineActions.close()
      setConfigurationQueue(queue => [...new Set([...queue, ...justInstalled])])
    }
  }, [resources])
  if (!settings || deferForTour) return null
  const configuring = resources.find(record => record.resourceId === configurationQueue[0])
  const idle = status === 'idle' || status === 'error'
  return configuring && idle
    ? <ModelConfigurationDialog key={configuring.resourceId} record={configuring} onClose={() => setConfigurationQueue(queue => queue.slice(1))} />
    : null
}
