import { translationEngine } from '../../../../shared/model-engines'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Spinner } from '@heroui/react'
import { RefreshCw } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import type { ComputeDevice, ComputeSnapshot, RuntimeSnapshot } from '../../../../shared/compute'
import { deviceCandidates } from '../../../../shared/device-selection'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../../shared/compute'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch, type SettingsPanelProps } from '../SettingsPage'
import { computeUi } from '../compute-ui'

export function ComputeTab({ settings }: SettingsPanelProps) {
  const { language } = useI18n()
  const c = language === 'en' ? computeUi.en : computeUi.zh
  const [snapshot, setSnapshot] = useState<ComputeSnapshot | null>(null)
  const [runtimes, setRuntimes] = useState<RuntimeSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve())
  const resources = useStore(stores.models, state => state.resources)
  const adapter = resources.find(r => r.resourceId === settings.translation.localModelId)?.provider
  const compute = settings.compute ?? DEFAULT_COMPUTE_SETTINGS
  const useTorch = translationEngine(compute, adapter, settings.translation.localModelId) === 'pytorch'
  const engineOptions = [{ value: 'pytorch', label: 'PyTorch' }, { value: 'llama', label: 'llama.cpp' }]

  const refresh = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge) { setError('IPC bridge unavailable'); return }
    setLoading(true)
    const results = await Promise.allSettled([bridge.engine.listComputeDevices(), bridge.runtimes.list()])
    const [devices, packages] = results
    if (devices.status === 'fulfilled') setSnapshot(devices.value)
    if (packages.status === 'fulfilled') setRuntimes(packages.value)
    setError(results.filter(r => r.status === 'rejected').map(r => String(r.reason)).join('\n'))
    setLoading(false)
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!installing && !runtimes?.operation) return
    const timer = setInterval(() => {
      void getBridge()?.runtimes.list().then(setRuntimes).catch(e => setError(String(e)))
    }, 1000)
    return () => clearInterval(timer)
  }, [installing, runtimes?.operation?.id])

  function save(patch: Partial<typeof compute>) {
    pendingSave.current = pendingSave.current.catch(() => undefined).then(() => updateSettings({ compute: patch }))
    void pendingSave.current.catch(e => setError(`${c.saveError}: ${String(e)}`))
  }
  function options(task: 'recognition' | 'translation') {
    const supports = (d: ComputeDevice) => task === 'recognition'
      ? compute.recognitionEngine === 'pytorch' ? d.recognition && !!d.torchDevice : !!d.llamaDevice
      : d.translation && (d.id === 'cpu' || (useTorch ? !!d.torchDevice : !!d.llamaDevice))
    const choices: { value: string; label: string; isDisabled?: boolean }[] = [{ value: 'auto', label: c.automatic }, { value: 'cpu', label: c.cpu }]
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
    if (!choices.some(d => d.value === selected)) choices.push({ value: selected, label: `${c.unavailable} · ${selected}` })
    return choices
  }
  function runtimeOptions(kind: 'engine' | 'llama') {
    const choices = [
      { value: 'auto', label: c.autoEnvironment },
      { value: 'bundled', label: (kind === 'engine' ? runtimes?.local.engine.source : runtimes?.local.llama.source) === 'project' ? c.project : c.bundled },
      ...(kind === 'engine' ? runtimes?.recipes.filter(p => p.installed).map(p => ({ value: p.id, label: p.name })) ?? [] : []),
      ...(runtimes?.packages.filter(p => p.kind === kind && p.installed).map(p => ({ value: p.id, label: p.name })) ?? []),
    ]
    const selected = kind === 'engine' ? compute.runtimeId : compute.llamaRuntimeId
    if (!choices.some(p => p.value === selected)) choices.push({ value: selected, label: `${c.unavailable} · ${selected}` })
    return choices
  }
  async function install(id?: string, repair = false) {
    setInstalling(true); setError('')
    try {
      const bridge = getBridge()
      if (!bridge) throw new Error('IPC bridge unavailable')
      if (id) await bridge.runtimes.install(id, repair)
      else await bridge.runtimes.import()
      await refresh()
    } catch (e) { setError(String(e)) }
    finally { setInstalling(false) }
  }
  async function prepare() {
    setInstalling(true); setError('')
    try {
      await pendingSave.current
      const bridge = getBridge()
      if (!bridge) throw new Error('IPC bridge unavailable')
      setRuntimes(await bridge.runtimes.prepare())
      await refresh()
    } catch (e) { setError(String(e)) }
    finally { setInstalling(false) }
  }
  const plan = snapshot?.activePlan
  const actual = (value: unknown) => value === 'unknown' ? c.planUnknown : value === 'unloaded' ? c.unloaded : String(value ?? c.noSession)
  return <div className="settings-panel">
    {error ? <Alert status="danger"><Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content></Alert> : null}
    <p className="compute-hint">{c.nextSession}</p>
    <SettingGroup legend={language === 'en' ? 'Inference engines' : '推理引擎'}>
      <SettingsRow label={language === 'en' ? 'Speech recognition engine' : '语音识别引擎'}><SettingSelect value={compute.recognitionEngine} options={engineOptions} ariaLabel={c.recognition} onChange={value => save({ recognitionEngine: value as 'pytorch' | 'llama', recognitionDevice: 'auto' })} /></SettingsRow>
      <SettingsRow label={language === 'en' ? 'Local translation engine' : '本地翻译引擎'}><SettingSelect value={useTorch ? 'pytorch' : 'llama'} options={engineOptions} ariaLabel={c.translation} isDisabled={settings.translation.provider !== 'local'} onChange={value => save({ translationEngine: value as 'pytorch' | 'llama', translationDevice: 'auto' })} /></SettingsRow>
    </SettingGroup>
    <SettingGroup legend={c.hardware} actions={<Button variant="primary" size="sm" isPending={installing} isDisabled={installing || !!runtimes?.operation} onPress={() => void prepare()}>{c.prepareRecommended}</Button>}>
      {runtimes?.hardware.adapters.map(d => <SettingsRow key={d.hardwareId} label={d.name} descriptionTooltip desc={`${d.vendor.toUpperCase()} · ${d.driver}`}><span>{d.vendor.toUpperCase()}</span></SettingsRow>)}
    </SettingGroup>
    <SettingGroup legend={c.devices} actions={<Button variant="secondary" size="sm" isDisabled={loading} onPress={() => void refresh()}>{loading ? <Spinner size="sm" /> : <RefreshCw size={16} />}{c.refresh}</Button>}>
      <SettingsRow label={c.recognition} descriptionTooltip desc={c.assignmentHint}><SettingSelect value={compute.recognitionDevice} options={options('recognition')} ariaLabel={c.recognition} onChange={recognitionDevice => save({ recognitionDevice })} /></SettingsRow>
      <SettingsRow label={c.translation} descriptionTooltip desc={settings.translation.provider === 'local' ? c.assignmentHint : c.network}><SettingSelect value={compute.translationDevice} options={options('translation')} ariaLabel={c.translation} isDisabled={settings.translation.provider !== 'local'} onChange={translationDevice => save({ translationDevice })} /></SettingsRow>
      <SettingsRow label={c.fallback} descriptionTooltip desc={c.fallbackHint}><SettingSwitch isSelected={compute.allowCpuFallback} ariaLabel={c.fallback} onChange={allowCpuFallback => save({ allowCpuFallback })} /></SettingsRow>
    </SettingGroup>
    <SettingGroup legend={c.detected}>
      {!snapshot ? <p className="compute-hint" role="status">{loading ? <><Spinner size="sm" /> {c.checkingDevices}</> : c.deviceCheckFailed}</p> : null}
      {snapshot?.devices.map(d => <SettingsRow key={d.id} label={d.name} desc={d.reason || (!d.stableId ? c.weakId : d.integrated ? c.shared : undefined)}><span className="compute-device-info">{d.backend.toUpperCase()}{d.totalMemoryMb > 0 ? ` · ${c.free} ${Math.round(d.freeMemoryMb)} / ${Math.round(d.totalMemoryMb)} MiB` : ''}</span></SettingsRow>)}
      {snapshot?.notes.map((note, i) => <p className="compute-hint" key={i}>{note}</p>)}
    </SettingGroup>
    <SettingGroup legend={c.actual}>
      <SettingsRow label={c.recognitionActual}><span>{actual(plan?.recognitionActual)}</span></SettingsRow>
      <SettingsRow label={c.translationActual}><span>{actual(plan?.translationActual)}</span></SettingsRow>
      {Array.isArray(plan?.reasons) ? plan.reasons.map((reason, i) => <p className="compute-hint" key={i}>{String(reason)}</p>) : null}
    </SettingGroup>
    <details><summary className="compute-hint">{language === 'en' ? 'Environment maintenance' : '环境维护（高级）'}</summary>
    <SettingGroup legend={c.environments} actions={<>
      <Button variant="secondary" size="sm" isDisabled={installing || !!runtimes?.operation} onPress={() => void prepare()}>{c.restart}</Button>
      <Button variant="secondary" size="sm" isDisabled={installing || !!runtimes?.operation || !runtimes?.packages.length} onPress={() => void install()}>{c.import}</Button>
      {installing || runtimes?.operation ? <Button variant="secondary" size="sm" onPress={() => void getBridge()?.runtimes.cancel().catch(e => setError(String(e)))}>{c.cancel}</Button> : null}
    </>}>
      <p className="compute-hint">{c.environmentHint}</p>
      {runtimes ? <>
        {[['engine', c.localPython], ['llama', c.localLlama]].map(([kind, label]) => {
          const local = runtimes.local[kind as 'engine' | 'llama']
          return <SettingsRow key={kind} label={label} desc={<>{local.path ? <code className="settings-code">{local.path}</code> : null}{local.reason ? <p role="status">{local.reason}</p> : null}</>}>
            <span>{local.status === 'ready' ? `${c.available} · ${local.backend.toUpperCase()} · ${local.version}` : c.notReady}</span>
          </SettingsRow>
        })}
      </> : null}
      {runtimes ? <SettingsRow label={c.environmentStorage} descriptionTooltip desc={c.environmentStorageHint}><code className="settings-code">{runtimes.directory}</code></SettingsRow> : null}
      <SettingsRow label={c.engineEnvironment}><SettingSelect value={compute.runtimeId} options={runtimeOptions('engine')} ariaLabel={c.engineEnvironment} onChange={runtimeId => save({ runtimeId })} /></SettingsRow>
      <SettingsRow label={c.llamaEnvironment}><SettingSelect value={compute.llamaRuntimeId} options={runtimeOptions('llama')} ariaLabel={c.llamaEnvironment} onChange={llamaRuntimeId => save({ llamaRuntimeId })} /></SettingsRow>
      <details><summary className="compute-hint">{c.optionalEnvironments}</summary>
      {runtimes?.recipes.map(p => {
        const localReady = runtimes.local.engine.status === 'ready' && runtimes.local.engine.gpuAvailable && runtimes.local.engine.backend === p.backend && runtimes.local.engine.version === p.torchVersion
        return <SettingsRow key={p.id} label={p.name} desc={localReady ? c.available : p.reason || `${p.torchVersion} · ${Math.round(p.wheel.bytes / 2 ** 20)} MiB`}>
          <Button variant="secondary" size="sm" isDisabled={localReady || !p.available || installing || !!runtimes.operation} onPress={() => void install(p.id, p.installed)}>{localReady ? c.available : p.installed ? c.repair : c.install}</Button>
        </SettingsRow>
      })}
      {!runtimes?.packages.length ? <p className="compute-hint">{c.noPackages}</p> : runtimes.packages.map(p => <SettingsRow key={p.id} label={p.name} desc={`${p.kind === 'llama' && runtimes.local.llama.status === 'ready' && runtimes.local.llama.backend === p.backend ? `${c.available} · ` : ''}${p.backend.toUpperCase()} · ${Math.round((p.bytes + (p.companions?.reduce((n, c) => n + c.bytes, 0) ?? 0)) / 2 ** 20)} MiB`}>
        <Button variant="secondary" size="sm" isDisabled={installing || !!runtimes.operation} onPress={() => void install(p.id, p.installed)}>{p.installed ? c.repair : c.install}</Button>
      </SettingsRow>)}
      </details>
      {runtimes?.operation ? <p role="status">{c[runtimes.operation.phase]}{runtimes.operation.phase === 'download' ? ` · ${Math.round(runtimes.operation.bytes / runtimes.operation.totalBytes * 100)}%` : ''}</p> : null}
      {runtimes?.lastError && !error ? <p role="alert">{runtimes.lastError}</p> : null}
    </SettingGroup>
    </details>
  </div>
}
