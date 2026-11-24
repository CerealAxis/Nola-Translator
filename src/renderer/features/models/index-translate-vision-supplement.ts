import { useEffect } from 'react'
import type { ResourceRecord } from '@/bridge'
import { notifyError, notifyInfo } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { modelManagementPath } from '@/routes'
import { actions } from '@/store'
import { suppressNextDownloadStartNotice } from './ModelDownloadNotice'

const legacyWeights = [
  ['index-translate-2b-q4-k-m', 1_312_164_352],
  ['index-translate-9b-q4-k-m', 5_780_090_304],
  ['index-translate-35b-a3b-q4-k-m', 21_713_462_400],
] as const
const attempted = new Set<string>()

export function useIndexTranslateVisionSupplement(loaded: boolean, resources: readonly ResourceRecord[]) {
  const { t } = useI18n()
  useEffect(() => {
    if (!loaded) return
    for (const [resourceId, weightBytes] of legacyWeights) {
      const record = resources.find(item => item.resourceId === resourceId)
      if (!record || record.installed || record.state !== 'idle' || record.installedBytes < weightBytes) continue
      if (attempted.has(resourceId)) continue
      attempted.add(resourceId)
      const key = `nola:index-translate-vision-supplement:${resourceId}:v1`
      try {
        if (window.localStorage.getItem(key)) continue
        window.localStorage.setItem(key, 'started')
      } catch {
        // The in-memory guard still prevents repeated attempts when storage is unavailable.
      }
      notifyInfo(t('models.visionSupplementStarted'), {
        description: t('models.visionSupplementDescription', { name: record.name }),
        action: { label: t('models.viewProgress'), onPress: () => { window.location.hash = modelManagementPath('downloads') } },
        duration: 12000,
      })
      const restoreStartNotice = suppressNextDownloadStartNotice(resourceId)
      void actions.models.manageResource(resourceId, 'install').catch((cause: unknown) => {
        restoreStartNotice()
        notifyError(t('models.downloadFailed'), { cause, description: t('models.downloadFailedDescription') })
      })
    }
  }, [loaded, resources, t])
}
