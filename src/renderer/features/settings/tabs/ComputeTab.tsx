import { translationEngine } from '../../../../shared/model-engines'
import { useCallback, useRef, useState } from 'react'
import { Alert, Button, Spinner } from '@heroui/react'
import { RefreshCw } from 'lucide-react'
import { useI18n } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import type { ComputeDevice } from '../../../../shared/compute'
import { deviceCandidates } from '../../../../shared/device-selection'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../../shared/compute'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch, type SettingsPanelProps } from '../SettingsPage'
import { RuntimeComponents } from './RuntimeComponents'

export function ComputeTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const snapshot = useStore(stores.settings, state => state.computeSnapshot)
  const runtimes = useStore(stores.settings, state => state.runtimes)
  const loading = useStore(stores.settings, state => state.computeChecking)
  const computeError = useStore(stores.settings, state => state.computeError)
  const deviceCheck = computeError ? 'failed' : loading || !snapshot ? 'loading' : 'ready'
  const [error, setError] = useState('')
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve())
  const resources = useStore(stores.models, state => state.resources)
  const adapter = resources.find(r => r.resourceId === settings.translation.localModelId)?.provider
  const compute = settings.compute ?? DEFAULT_COMPUTE_SETTINGS
  const useTorch = translationEngine(compute, adapter, settings.translation.localModelId) === 'pytorch'
  const engineOptions = [{ value: 'pytorch', label: 'PyTorch' }, { value: 'llama', label: 'llama.cpp' }]
  const refresh = useCallback(async () => {
    try {
      await actions.settings.loadRuntimeComponents()
      await actions.settings.refreshComputeDevices()
      setError('')
    } catch (error) { setError(String(error)) }
  }, [])
  function save(patch: Partial<typeof compute>) {
    pendingSave.current = pendingSave.current.catch(() => undefined).then(() => updateSettings({ compute: patch }))
    void pendingSave.current.catch(e => setError(`${t('compute.saveError')}: ${String(e)}`))
  }
  function options(task: 'recognition' | 'translation') {
    const supports = (d: ComputeDevice) => task === 'recognition'
      ? compute.recognitionEngine === 'pytorch' ? d.recognition && !!d.torchDevice : !!d.llamaDevice
      : d.translation && (d.id === 'cpu' || (useTorch ? !!d.torchDevice : !!d.llamaDevice))
    const choices: { value: string; label: string; isDisabled?: boolean }[] = [{ value: 'auto', label: t('compute.automatic') }, { value: 'cpu', label: t('compute.cpu') }]
    if (runtimes) for (const d of deviceCandidates(runtimes.hardware, (task === 'recognition' ? compute.recognitionEngine === 'pytorch' : useTorch) ? 'torch' : 'llama', runtimes)) {
      choices.push({ value: d.value, label: `${d.name} · ${d.backend === 'directml' ? 'DirectML' : d.backend.toUpperCase()}`, isDisabled: !d.supported })
    }
    const selected = task === 'recognition' ? compute.recognitionDevice : compute.translationDevice
    for (const d of snapshot?.devices ?? []) {
      if (d.id === 'cpu' || !supports(d)) continue
      const backend = (task === 'recognition' ? compute.recognitionEngine === 'llama' : !useTorch) && d.llamaDevice
        ? d.llamaDevice.replace(/\d+$/, '').toUpperCase() : d.backend.toUpperCase()
      const label = `${d.name} · ${backend}`
      const existing = choices.findIndex(choice => choice.label === label)
      const uniqueHardware = runtimes?.hardware.adapters.filter(a => a.name === d.name).length === 1
      if (existing >= 0 && uniqueHardware) {
        // Retain saved legacy IDs without rendering a second copy of the same device.
        if (selected === d.id) choices[existing] = { value: d.id, label }
      } else choices.push({ value: d.id, label })
    }
    if (!choices.some(d => d.value === selected)) {
      const label = deviceCheck === 'loading' ? t('compute.checkingDevices')
        : deviceCheck === 'failed' ? t('compute.deviceCheckFailed')
          : `${t('compute.unavailable')} · ${selected}`
      choices.push({ value: selected, label })
    }
    return choices
  }
  const plan = snapshot?.activePlan
  const actual = (value: unknown) => value === 'unknown' ? t('compute.planUnknown') : value === 'unloaded' ? t('compute.unloaded') : String(value ?? t('compute.noSession'))
  return <div className="settings-panel">
    {error || computeError ? <Alert status="danger"><Alert.Content><Alert.Description>{error || computeError}</Alert.Description></Alert.Content></Alert> : null}
    <SettingGroup legend={t('runtime.engines')}>
      <SettingsRow label={t('runtime.recognitionEngine')}><SettingSelect value={compute.recognitionEngine} options={engineOptions} ariaLabel={t('compute.recognition')} onChange={value => save({ recognitionEngine: value as 'pytorch' | 'llama', recognitionDevice: 'auto' })} /></SettingsRow>
      <SettingsRow label={t('runtime.translationEngine')}><SettingSelect value={useTorch ? 'pytorch' : 'llama'} options={engineOptions} ariaLabel={t('compute.translation')} onChange={value => save({ translationEngine: value as 'pytorch' | 'llama', translationDevice: 'auto' })} /></SettingsRow>
    </SettingGroup>
    <SettingGroup legend={t('compute.hardware')} >
      {runtimes?.hardware.adapters.map(d => <SettingsRow key={d.hardwareId} label={d.name} descriptionTooltip desc={`${d.vendor.toUpperCase()} · ${d.driver}`}><span>{d.vendor.toUpperCase()}</span></SettingsRow>)}
    </SettingGroup>
    <SettingGroup legend={t('compute.devices')} actions={<Button variant="secondary" size="sm" isDisabled={loading} onPress={() => void refresh()}>{loading ? <Spinner size="sm" /> : <RefreshCw size={16} aria-hidden="true" />}{t('compute.refresh')}</Button>}>
      <SettingsRow label={t('compute.recognition')} descriptionTooltip desc={t('compute.assignmentHint')}><SettingSelect value={compute.recognitionDevice} options={options('recognition')} ariaLabel={t('compute.recognition')} onChange={recognitionDevice => save({ recognitionDevice })} /></SettingsRow>
      <SettingsRow label={t('compute.translation')} descriptionTooltip desc={t('compute.assignmentHint')}><SettingSelect value={compute.translationDevice} options={options('translation')} ariaLabel={t('compute.translation')} onChange={translationDevice => save({ translationDevice })} /></SettingsRow>
      <SettingsRow label={t('compute.fallback')} descriptionTooltip desc={t('compute.fallbackHint')}><SettingSwitch isSelected={compute.allowCpuFallback} ariaLabel={t('compute.fallback')} onChange={allowCpuFallback => save({ allowCpuFallback })} /></SettingsRow>
    </SettingGroup>
    <SettingGroup legend={t('compute.detected')}>
      {!snapshot ? <p className="compute-hint" role="status">{loading ? <><Spinner size="sm" /> {t('compute.checkingDevices')}</> : t('compute.deviceCheckFailed')}</p> : null}
      {snapshot?.devices.map(d => <SettingsRow key={d.id} label={d.name} desc={d.reason || (!d.stableId ? t('compute.weakId') : d.integrated ? t('compute.shared') : undefined)}><span className="compute-device-info">{d.backend.toUpperCase()}{d.totalMemoryMb > 0 ? ` · ${t('compute.free')} ${Math.round(d.freeMemoryMb)} / ${Math.round(d.totalMemoryMb)} MiB` : ''}</span></SettingsRow>)}
      {snapshot?.notes.map((note, i) => <p className="compute-hint" key={i}>{note}</p>)}
    </SettingGroup>
    <SettingGroup legend={t('compute.actual')}>
      <SettingsRow label={t('compute.recognitionActual')}><span>{actual(plan?.recognitionActual)}</span></SettingsRow>
      <SettingsRow label={t('compute.translationActual')}><span>{actual(plan?.translationActual)}</span></SettingsRow>
      {Array.isArray(plan?.reasons) ? plan.reasons.map((reason, i) => <p className="compute-hint" key={i}>{String(reason)}</p>) : null}
    </SettingGroup>
    <RuntimeComponents />
  </div>
}
