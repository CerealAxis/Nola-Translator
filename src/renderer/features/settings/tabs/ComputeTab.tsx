import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { RefreshCw } from 'lucide-react'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import { encodeHardwarePreference, preferredHardwareId, sameAdapterName } from '../../../../shared/device-selection'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../../shared/compute'
import type { AppSettingsPatch } from '../../../../shared/settings'
import { claimRuntimeFailure, releaseRuntimeFailure } from '../settingsErrorChannel'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch, type SettingsPanelProps } from '../SettingsPage'
import { RuntimeComponents } from './RuntimeComponents'

export function ComputeTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const snapshot = useStore(stores.settings, state => state.computeSnapshot)
  const runtimes = useStore(stores.settings, state => state.runtimes)
  const loading = useStore(stores.settings, state => state.computeChecking)
  const computeError = useStore(stores.settings, state => state.computeError)
  const [refreshing, setRefreshing] = useState(false)
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve())
  const compute = settings.compute ?? DEFAULT_COMPUTE_SETTINGS
  const hardware = runtimes?.hardware.adapters ?? []
  const hardwareLabel = (adapter: (typeof hardware)[number]) =>
    hardware.filter(item => item.name === adapter.name).length > 1
      ? adapter.name + ' · ' + adapter.hardwareId.slice(-8) : adapter.name
  /**
   * Reads the runtime list for the refresh button.
   *
   * The runtime notice names the check button in its failure message, so the failure is
   * claimed before the read and reported here in the words of this button instead.
   */
  const loadRuntimes = useCallback(async (): Promise<boolean> => {
    claimRuntimeFailure()
    try {
      await actions.settings.loadRuntimeComponents()
      return true
    } catch (error) {
      notifyError(t('common.refreshFailed'), { cause: error })
      return false
    } finally {
      releaseRuntimeFailure()
    }
  }, [t])
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (!await loadRuntimes()) return
      try {
        await actions.settings.refreshComputeDevices()
      } catch {
        // The device failure is reported by the compute notice below.
        return
      }
      notifySuccess(t('common.refreshed'))
    } finally {
      setRefreshing(false)
    }
  }, [loadRuntimes])
  function save(patch: AppSettingsPatch): void {
    pendingSave.current = pendingSave.current.catch(() => undefined).then(() => updateSettings(patch))
    void pendingSave.current.catch(() => undefined)
  }
  function options(selected: string) {
    const choices = [
      { value: 'auto', label: t('compute.automatic') },
      { value: 'cpu', label: t('compute.cpu') },
      ...hardware.map(adapter => ({ value: encodeHardwarePreference(adapter.hardwareId), label: hardwareLabel(adapter) })),
    ]
    const selectedId = preferredHardwareId(selected)
    const normalized = selectedId ? encodeHardwarePreference(selectedId) : selected
    if (!choices.some(choice => choice.value === normalized)) {
      choices.push({ value: normalized, label: t('compute.unavailable') })
    }
    return { choices, normalized }
  }
  const recognition = options(compute.recognitionDevice)
  const translation = options(compute.translationDevice)
  const plan = snapshot?.activePlan
  const actual = (value: unknown) => value === 'unknown' ? t('compute.planUnknown') : value === 'unloaded' ? t('compute.unloaded') : String(value ?? t('compute.noSession'))
  const reportedComputeError = useRef<string | null>(null)
  useEffect(() => {
    // The effect reads `t`, which changes with the interface language. Without the guard the
    // same failure would be announced a second time, in the language the user just picked.
    if (!computeError) {
      reportedComputeError.current = null
      return
    }
    if (reportedComputeError.current === computeError) return
    reportedComputeError.current = computeError
    notifyError(t('compute.deviceCheckFailed'), {
      cause: computeError,
      action: { label: t('models.retry'), onPress: () => void refresh() },
    })
  }, [computeError, refresh, t])
  return <div className="settings-panel">
    <SettingGroup legend={t('compute.devices')} actions={<Button variant="secondary" size="sm" isDisabled={loading || refreshing} onPress={() => void refresh()}>{loading || refreshing ? <Spinner size="sm" /> : <RefreshCw size={16} aria-hidden="true" />}{t('compute.refresh')}</Button>}>
      <SettingsRow label={t('compute.recognition')} descriptionTooltip desc={t('compute.assignmentHint')}><SettingSelect value={recognition.normalized} options={recognition.choices} ariaLabel={t('compute.recognition')} onChange={recognitionDevice => save({ compute: { recognitionDevice } })} /></SettingsRow>
      <SettingsRow label={t('compute.translation')} descriptionTooltip desc={t('compute.assignmentHint')}><SettingSelect value={translation.normalized} options={translation.choices} ariaLabel={t('compute.translation')} onChange={translationDevice => save({ compute: { translationDevice } })} /></SettingsRow>
      <SettingsRow label={t('compute.fallback')} descriptionTooltip desc={t('compute.fallbackHint')}><SettingSwitch isSelected={compute.allowCpuFallback} ariaLabel={t('compute.fallback')} onChange={allowCpuFallback => save({ compute: { allowCpuFallback } })} /></SettingsRow>
    </SettingGroup>
    <SettingGroup legend={t('compute.detected')}>
      <SettingsRow label={t('compute.cpu')}><span>CPU</span></SettingsRow>
      {hardware.map(adapter => {
        const matching = snapshot?.devices.filter(device => sameAdapterName(device.name, adapter.name) && device.id !== 'cpu') ?? []
        const backends = [...new Set(matching.map(device => device.backend.toUpperCase()))]
        const memory = matching.find(device => device.totalMemoryMb > 0)
        return <SettingsRow key={adapter.hardwareId} label={hardwareLabel(adapter)} descriptionTooltip desc={adapter.vendor.toUpperCase() + ' · ' + adapter.driver}>
          <span className="compute-device-info">{backends.join(' / ') || t('compute.unavailable')}{memory ? ' · ' + t('compute.free') + ' ' + Math.round(memory.freeMemoryMb) + ' / ' + Math.round(memory.totalMemoryMb) + ' MiB' : ''}</span>
        </SettingsRow>
      })}
      {loading && (!runtimes || !snapshot) ? <p className="compute-hint" role="status"><Spinner size="sm" /> {t('compute.checkingDevices')}</p> : null}
      {snapshot?.notes.map((note, index) => <p className="compute-hint" key={index}>{note}</p>)}
    </SettingGroup>
    {plan ? <SettingGroup legend={t('compute.actual')}>
      <SettingsRow label={t('compute.recognitionActual')}><span>{actual(plan.recognitionActual)}</span></SettingsRow>
      <SettingsRow label={t('compute.translationActual')}><span>{actual(plan.translationActual)}</span></SettingsRow>
      {Array.isArray(plan.reasons) ? plan.reasons.map((reason, index) => <p className="compute-hint" key={index}>{String(reason)}</p>) : null}
    </SettingGroup> : null}
    <RuntimeComponents />
  </div>
}
