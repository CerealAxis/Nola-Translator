import { useEffect, useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { AlertDialogContent, DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { Check, CircleHelp } from 'lucide-react'
import { notifyError, notifyRetryableFailure, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import { CRISP_RUNTIME_VERSIONS, DEFAULT_ONNX_RUNTIME_ID, isRuntimeKind, ONNX_RUNTIME_BACKENDS, ONNX_RUNTIME_VERSIONS, RUNTIME_KINDS as KINDS, type LocalRuntime, type OnnxBackend, type RuntimeKind, type RuntimeSnapshot } from '../../../../shared/compute'
import { claimRuntimeFailure, releaseRuntimeFailure, reportSettingsFailure } from '../settingsErrorChannel'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'

const BRANDS: Record<RuntimeKind, string> = { engine: 'PyTorch', llama: 'llama.cpp', crisp: 'CrispASR', onnx: 'ONNX Runtime' }
const ONNX_INSTALL_CHOICES = ONNX_RUNTIME_VERSIONS.filter(item => !item.legacy)
const BACKEND_LABELS: Record<string, string> = {
  ...ONNX_RUNTIME_BACKENDS, vulkan: 'Vulkan', sycl: 'SYCL', rocm: 'ROCm', xpu: 'Intel XPU',
}

function backendLabel(backend: string): string {
  if (/^cu\d+$/.test(backend)) return 'CUDA ' + backend.slice(2, -1) + '.' + backend.slice(-1)
  return BACKEND_LABELS[backend] ?? backend
}
const SPEED_UNITS = ['B/s', 'KB/s', 'MB/s', 'GB/s'] as const

/** Average throughput since the operation began, or an empty string while it cannot be measured yet. */
function downloadSpeed(bytes: number, startedAt: number | undefined): string {
  const elapsedSeconds = startedAt === undefined ? 0 : (Date.now() - startedAt) / 1000
  const speed = elapsedSeconds > 0 ? bytes / elapsedSeconds : Number.NaN
  if (!Number.isFinite(speed) || speed <= 0) return ''
  const step = Math.max(0, Math.floor(Math.log(speed) / Math.log(1024)))
  return `${(speed / 1024 ** step).toFixed(1)} ${SPEED_UNITS[Math.min(step, SPEED_UNITS.length - 1)]}`
}

export interface RuntimeVersionRow {
  kind: RuntimeKind
  version: string
}

export function isExternalRuntime(component: LocalRuntime | undefined): boolean {
  return component?.status === 'ready' && !component.managed && !component.bundled
}

/** Only components with a real version belong in the compact summary. */
export function runtimeVersionRows(local: RuntimeSnapshot['local'] | undefined): RuntimeVersionRow[] {
  return KINDS.flatMap(kind => {
    const component = local?.[kind]
    if (component?.status !== 'ready') return []
    const version = component?.version.trim() ?? ''
    return version ? [{ kind, version }] : []
  })
}

export function RuntimeComponents() {
  const { t } = useI18n()
  const state = useStore(stores.settings, s => s)
  const sessionBusy = useStore(stores.session, s => ['starting', 'running', 'paused', 'stopping'].includes(s.status))
  const runtimes = state.runtimes
  const operation = runtimes?.operation
  const [now, setNow] = useState(Date.now)
  const [active, setActive] = useState<RuntimeKind>('engine')
  const [selected, setSelected] = useState<Record<RuntimeKind, string>>({ engine: '', llama: '', crisp: '', onnx: DEFAULT_ONNX_RUNTIME_ID })
  const [force, setForce] = useState({ engine: false, llama: false, crisp: false, onnx: false })
  const [confirmKind, setConfirmKind] = useState<RuntimeKind | null>(null)
  const busy = state.runtimeBusy || !!runtimes?.operation || state.runtimeChecking || sessionBusy
  const local = runtimes?.local
  useEffect(() => {
    if (!operation?.startedAt) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [operation?.id, operation?.startedAt])
  useEffect(() => {
    const focus = () => {
      const component = new URLSearchParams(window.location.hash.split('?')[1]).get('component')
      if (!isRuntimeKind(component)) return
      setActive(component)
      requestAnimationFrame(() => {
        const section = document.getElementById('runtime-engines-section')
        const scroller = section?.closest<HTMLElement>('.nola-main')
        if (!section || !scroller) return
        const marginTop = Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0
        const top = scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - marginTop
        scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      })
    }
    focus()
    window.addEventListener('hashchange', focus)
    return () => window.removeEventListener('hashchange', focus)
  }, [])
  useEffect(() => {
    if (!local) return
    const onnxId = local.onnx?.status === 'ready' && local.onnx.managed ? local.onnx.id : undefined
    const onnxRelease = ONNX_RUNTIME_VERSIONS.find(item => item.id === onnxId)
    const onnxSelection = onnxRelease?.legacy ? ONNX_INSTALL_CHOICES.find(item => item.backend === onnxRelease.backend) : onnxRelease
    setSelected({ engine: local.engine.status === 'ready' ? local.engine.id ?? 'current' : '',
      llama: local.llama.status === 'ready' ? local.llama.id ?? 'current' : '',
      crisp: local.crisp?.status === 'ready' ? local.crisp.id ?? 'current' : '',
      onnx: onnxSelection?.id ?? DEFAULT_ONNX_RUNTIME_ID })
    setForce({ engine: false, llama: false, crisp: false, onnx: false })
  }, [local?.engine.path, local?.engine.id, local?.engine.status, local?.llama.path, local?.llama.id, local?.llama.status, local?.crisp?.path, local?.crisp?.id, local?.crisp?.status, local?.onnx?.path, local?.onnx?.id, local?.onnx?.status, local?.onnx?.managed])
  const status = (component: LocalRuntime) => isExternalRuntime(component)
    ? t('runtime.external')
    : t(`runtime.${component.status === 'ready' ? 'installed' : component.status === 'failed' ? 'failed' : 'missing'}`)
  const sourceHint = (component: LocalRuntime | undefined) => isExternalRuntime(component) ? t('runtime.externalHint') : undefined
  const description = (kind: RuntimeKind, component: LocalRuntime) => {
    if (component.status !== 'ready') return status(component)
    if (kind === 'onnx') return 'ONNX Runtime ' + component.version + ' (' + (ONNX_RUNTIME_BACKENDS[component.backend as OnnxBackend] ?? component.backend) + ')'
    if (kind === 'crisp') return CRISP_RUNTIME_VERSIONS.find(item => item.id === component.id)?.name
      ?? `CrispASR ${component.version} (${backendLabel(component.backend)})`
    const recipe = kind === 'engine' ? runtimes?.recipes.find(r => r.id === component.id) : runtimes?.packages.find(p => p.id === component.id)
    return recipe?.name ?? `${kind === 'engine' ? 'Torch' : 'llama.cpp'} ${component.version} (${component.backend === 'directml' ? 'DirectML' : component.backend.toUpperCase()})${component.xformersVersion ? ` + xFormers ${component.xformersVersion}` : ''}`
  }
  const installOne = async (id: string, reinstall: boolean) => {
    claimRuntimeFailure()
    try {
      await actions.settings.installRuntimeComponent(id, reinstall)
      const error = stores.settings.getState().runtimeError
      if (error) notifyRetryableFailure(t('runtime.operationFailed', { action: t('runtime.install') }), {
        cause: error,
        description: error.startsWith('PYTORCH_DEPENDENCY_TIMEOUT:') ? t('runtime.pipDependencyTimeout') : t('runtime.operationFailedDescription'),
        action: { label: t('runtime.retryOperation'), onPress: () => { void installOne(id, reinstall) } },
      })
    } finally {
      releaseRuntimeFailure()
    }
  }
  const uninstall = async (kind: RuntimeKind) => {
    setConfirmKind(null)
    claimRuntimeFailure()
    try {
      await actions.settings.uninstallRuntimeComponent(kind)
      const error = stores.settings.getState().runtimeError
      if (error) notifyRetryableFailure(t('runtime.operationFailed', { action: t('runtime.uninstall') }), {
        cause: error,
        description: t('runtime.operationFailedDescription'),
        action: { label: t('runtime.retryOperation'), onPress: () => { void uninstall(kind) } },
      })
    } finally {
      releaseRuntimeFailure()
    }
  }
  const cancelInstallation = async () => {
    try {
      await actions.settings.cancelRuntimeInstallation()
    } catch (error) {
      reportSettingsFailure(t('runtime.cancelFailed'), error)
    }
  }
  /**
   * Checks the runtime environment and the devices again.
   *
   * A failed environment or device check is reported by its corresponding settings notice.
   */
  const recheck = async () => {
    try {
      await actions.settings.loadRuntimeComponents(true)
      await actions.settings.refreshComputeDevices()
      notifySuccess(t('common.refreshed'))
    } catch {
      // The runtime operation and compute notices report these failures.
    }
  }
  const elapsedSeconds = operation?.startedAt ? Math.max(0, Math.floor((now - operation.startedAt) / 1000)) : null
  const elapsed = elapsedSeconds === null ? '' : `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`
  const speed = operation?.phase === 'download' ? downloadSpeed(operation.bytes, operation.startedAt) : ''
  const versions = runtimeVersionRows(local)
  const entries = {
    engine: runtimes?.recipes.map(item => ({
      id: item.id, backend: item.backend === 'cuda' ? item.indexUrl.split('/').at(-1) ?? 'cuda' : item.backend,
      version: item.torchVersion + (item.xformersVersion ? ' + xFormers ' + item.xformersVersion : ''), installed: item.installed,
    })) ?? [],
    llama: runtimes?.packages.map(item => ({
      id: item.id, backend: item.backend === 'cuda' ? item.name.match(/CUDA [\d.]+/)?.[0] ?? item.backend : item.backend,
      version: item.version, installed: item.installed,
    })) ?? [],
    crisp: CRISP_RUNTIME_VERSIONS.map(item => ({ ...item, backend: item.backend === 'cuda' ? 'CUDA 12' : item.backend })),
    onnx: ONNX_INSTALL_CHOICES,
  }
  return <>
    <SettingGroup legend={t('runtime.components')} headingAction={<Button variant="secondary" size="sm" disabled={busy}
      aria-busy={state.runtimeChecking} onClick={() => void recheck()}>{t('runtime.recheck')}</Button>}>
      <SettingsRow label={t('runtime.python')} desc={runtimes?.python?.reason || undefined}><span>{t('runtime.builtInPython')}</span></SettingsRow>
      {versions.map(({ kind, version }) => <SettingsRow key={kind}
        label={BRANDS[kind]}
        desc={sourceHint(local?.[kind])} descriptionTooltip={!!sourceHint(local?.[kind])}><span>{kind === 'onnx' && local?.onnx ? description(kind, local.onnx) : version}</span></SettingsRow>)}
      {local?.onnx && local.onnx.status !== 'ready' ? <SettingsRow label={BRANDS.onnx}><span>{status(local.onnx)}</span></SettingsRow> : null}
    </SettingGroup>
    {sessionBusy ? <p className="compute-hint">{t('runtime.busy')}</p> : null}
    <SettingGroup id="runtime-engines-section" legend={t('runtime.engines')} legendHint={<Tooltip>
      <TooltipTrigger render={<Button variant="secondary" size="icon" />} aria-label={t('runtime.enginesHint')} className="settings-row__help"><CircleHelp aria-hidden="true" /></TooltipTrigger>
      <TooltipContent side="top" className="settings-row__tooltip z-popup">{t('runtime.enginesHint')}</TooltipContent>
    </Tooltip>}>
      <div className="runtime-picker">
        <TabsRoot value={active} onValueChange={next => { if (isRuntimeKind(next)) setActive(next) }}>
          <TabsList className="nola-segmented runtime-picker__group" aria-label={t('runtime.engines')}>
            {KINDS.map(kind => <TabsTrigger key={kind} value={kind} data-onboarding={`runtime-${kind}`} className="runtime-picker__option">
              <span>{BRANDS[kind]}</span>
              <span className="runtime-picker__state">{local?.[kind] ? status(local[kind]) : t('runtime.missing')}</span>
            </TabsTrigger>)}
          </TabsList>
        </TabsRoot>
      </div>
      {KINDS.map(kind => {
        const component = local?.[kind]
        const releases = entries[kind]
        const currentChoice = releases.find(item => item.id === selected[kind])
        const preferredBackend = kind === 'engine' ? 'cpu' : kind === 'onnx' ? 'directml' : 'vulkan'
        const backend = currentChoice?.backend ?? (releases.some(item => item.backend === preferredBackend) ? preferredBackend : releases[0]?.backend ?? '')
        const backendChoices = [...new Set(releases.map(item => item.backend))].map(value => ({ value, label: backendLabel(value) }))
        const backendReleases = releases.filter(item => item.backend === backend)
        const choices = backendReleases.map(item => ({ value: item.id, label: item.version }))
        const currentIsUnlisted = selected[kind] === 'current'
        if (currentIsUnlisted && component) choices.unshift({ value: 'current', label: component.version })
        const selectedId = currentChoice?.id ?? (currentIsUnlisted ? 'current' : backendReleases[0]?.id ?? '')
        const same = component?.status === 'ready' && (component.managed || component.bundled)
          && (selectedId === component.id || selectedId === 'current')
        const uninstallable = component?.status === 'ready' && (component.managed || (kind !== 'onnx' && component.bundled))
          && !!component.id && (kind === 'onnx' || selectedId === component.id)
        const owned = selectedId !== 'current' && (same || (currentChoice && 'installed' in currentChoice && currentChoice.installed))
        const choose = (value: string) => {
          setSelected(previous => ({ ...previous, [kind]: value }))
          setForce(previous => ({ ...previous, [kind]: false }))
        }
        return <div key={kind} role="region" aria-label={BRANDS[kind]} id={kind === active ? `runtime-${kind}` : undefined} hidden={kind !== active} className="runtime-panel-body">
          <SettingsRow label={t('runtime.current')} desc={sourceHint(component)} descriptionTooltip={!!sourceHint(component)}><span className="runtime-component-status">{component ? description(kind, component) : t('runtime.missing')}</span></SettingsRow>
          <SettingsRow label={t('runtime.runtimeBackend')}><SettingSelect value={backend} options={backendChoices}
            ariaLabel={t('runtime.runtimeBackend')} isDisabled={busy || !backendChoices.length} onChange={value => {
              const release = releases.find(item => item.backend === value && item.id === component?.id)
                ?? releases.find(item => item.backend === value)
              if (release) choose(release.id)
            }} /></SettingsRow>
          <SettingsRow onboardingTarget={'runtime-version-' + kind} label={t('runtime.select')} desc={<a className="text-primary underline" href="https://nolax.org/zh-CN/getting-started/environment" target="_blank" rel="noreferrer">{t('runtime.versionHelpLink')}</a>} descriptionTooltip><SettingSelect value={selectedId} options={choices} ariaLabel={kind === 'onnx' ? BRANDS.onnx : t(kind === 'engine' ? 'runtime.installTorch' : kind === 'llama' ? 'runtime.installLlama' : 'runtime.installCrisp')} isDisabled={busy || !choices.length}
            onChange={choose} /></SettingsRow>
          <SettingsRow label={t('runtime.force')}><SettingSwitch isSelected={force[kind]} isDisabled={busy || !owned} ariaLabel={t('runtime.force')}
            onChange={value => setForce(previous => ({ ...previous, [kind]: value }))} /></SettingsRow>
          <div className="runtime-actions gap-2">{uninstallable ? <Button variant="danger" size="sm" disabled={busy}
            onClick={() => setConfirmKind(kind)}>{t('runtime.uninstall')}</Button> : null}<Button variant="default" size="sm" disabled={busy || !selectedId || selectedId === 'current' || (same && !force[kind])}
            onClick={() => void installOne(selectedId, force[kind])}>{same && !force[kind] ? <><Check aria-hidden="true" />{t('runtime.installed')}</> : force[kind] ? t('runtime.reinstall') : t('runtime.install')}</Button></div>
        </div>
      })}
    </SettingGroup>
    <AlertDialog.Root open={confirmKind !== null} onOpenChange={open => { if (!open) setConfirmKind(null) }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-nola-ui-backdrop" />
          <AlertDialogContent className="max-w-md">
            <DialogHeader>
              <AlertDialog.Title className="type-h4 text-foreground">{t('runtime.uninstallTitle')}</AlertDialog.Title>
            </DialogHeader>
            <AlertDialog.Description>
              {t(confirmKind === 'onnx' ? 'runtime.uninstallOnnxBody' : 'runtime.uninstallBody')}
            </AlertDialog.Description>
            <DialogFooter className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmKind(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" size="sm" disabled={state.runtimeBusy} onClick={() => { if (confirmKind) void uninstall(confirmKind) }}>
                {t('runtime.uninstall')}
              </Button>
            </DialogFooter>
          </AlertDialogContent>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    {operation ? <div role="status" className="runtime-progress">
      <div className="runtime-progress-copy">
        <strong>{[...runtimes.recipes, ...runtimes.packages, ...CRISP_RUNTIME_VERSIONS, ...ONNX_RUNTIME_VERSIONS].find(component => component.id === operation.id)?.name}</strong>
        <span>{t(`compute.${operation.phase}`)}{operation.phase === 'download' ? ` · ${operation.totalBytes > 0 ? Math.round(operation.bytes / operation.totalBytes * 100) : 0}%` : ''}
          {speed ? ` · ${t('runtime.speed', { speed })}` : ''}
          {elapsed ? ` · ${t('runtime.elapsed', { time: elapsed })}` : ''}</span>
        {operation.phase === 'prepare' && operation.detail ? <small>{operation.detail}</small> : null}
      </div>
      <Button variant="secondary" size="sm" onClick={() => { void cancelInstallation() }}>{t('runtime.cancel')}</Button>
    </div> : null}
  </>
}
