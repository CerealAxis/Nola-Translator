import { useEffect, useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { TabsRoot, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '@/components/ui'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { Check, CircleHelp, LoaderCircle } from 'lucide-react'
import { notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import { CRISP_RUNTIME_ID, type LocalRuntime, type RuntimeSnapshot } from '../../../../shared/compute'
import { reportSettingsFailure } from '../settingsErrorChannel'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'

type RuntimeKind = 'engine' | 'llama' | 'crisp'
const KINDS = ['engine', 'llama', 'crisp'] as const
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
  const [selected, setSelected] = useState({ engine: '', llama: '', crisp: '' })
  const [force, setForce] = useState({ engine: false, llama: false, crisp: false })
  const [repairs, setRepairs] = useState({ engine: false, llama: false, crisp: false })
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
      if (component !== 'engine' && component !== 'llama' && component !== 'crisp') return
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
    setSelected({ engine: local.engine.status === 'ready' ? local.engine.id ?? 'current' : '',
      llama: local.llama.status === 'ready' ? local.llama.id ?? 'current' : '',
      crisp: local.crisp?.status === 'ready' ? local.crisp.id ?? 'current' : '' })
    setForce({ engine: false, llama: false, crisp: false })
    setRepairs({ engine: !!local.engine.managed && local.engine.status !== 'ready', llama: !!local.llama.managed && local.llama.status !== 'ready', crisp: !!local.crisp?.managed && local.crisp.status !== 'ready' })
  }, [local?.engine.path, local?.engine.id, local?.engine.status, local?.llama.path, local?.llama.id, local?.llama.status, local?.crisp?.path, local?.crisp?.id, local?.crisp?.status])
  const brand = (kind: RuntimeKind) => kind === 'engine' ? 'PyTorch' : kind === 'llama' ? 'llama.cpp' : 'CrispASR'
  const status = (component: LocalRuntime) => isExternalRuntime(component)
    ? t('runtime.external')
    : t(`runtime.${component.status === 'ready' ? 'installed' : component.status === 'failed' ? 'failed' : 'missing'}`)
  const sourceHint = (component: LocalRuntime | undefined) => isExternalRuntime(component) ? t('runtime.externalHint') : undefined
  const description = (kind: RuntimeKind, component: LocalRuntime) => {
    if (component.status !== 'ready') return status(component)
    if (kind === 'crisp') return `CrispASR ${component.version} · Windows x64 (${component.backend === 'vulkan' ? 'Vulkan + CPU' : 'CPU'})`
    const recipe = kind === 'engine' ? runtimes?.recipes.find(r => r.id === component.id) : runtimes?.packages.find(p => p.id === component.id)
    return recipe?.name ?? `${kind === 'engine' ? 'Torch' : 'llama.cpp'} ${component.version} (${component.backend === 'directml' ? 'DirectML' : component.backend.toUpperCase()})${component.xformersVersion ? ` + xFormers ${component.xformersVersion}` : ''}`
  }
  const install = async (ids: string[]) => {
    for (const id of ids) {
      await actions.settings.installRuntimeComponent(id, true)
      if (stores.settings.getState().runtimeError) break
    }
  }
  const uninstall = async (kind: RuntimeKind) => {
    setConfirmKind(null)
    await actions.settings.uninstallRuntimeComponent(kind)
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
   * A failure of either half is reported by the notice that owns it: the runtime notice
   * for the environment, the compute notice in the compute tab for the devices.
   */
  const recheck = async () => {
    try {
      await actions.settings.loadRuntimeComponents(true)
      await actions.settings.refreshComputeDevices()
      notifySuccess(t('common.refreshed'))
    } catch {
      // The runtime notice and the compute notice report these failures.
    }
  }
  const elapsedSeconds = operation?.startedAt ? Math.max(0, Math.floor((now - operation.startedAt) / 1000)) : null
  const elapsed = elapsedSeconds === null ? '' : `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`
  const speed = operation?.phase === 'download' ? downloadSpeed(operation.bytes, operation.startedAt) : ''
  const versions = runtimeVersionRows(local)
  return <>
    <SettingGroup legend={t('runtime.components')} actions={<Button variant="secondary" size="sm" className="bg-surface-tertiary" disabled={busy}
      onClick={() => void recheck()}>{state.runtimeChecking ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}{t('runtime.recheck')}</Button>}>
      <SettingsRow label={t('runtime.python')} desc={runtimes?.python?.reason || undefined}><span>{t('runtime.builtInPython')}</span></SettingsRow>
      {versions.map(({ kind, version }) => <SettingsRow key={kind}
        label={t(kind === 'engine' ? 'runtime.pytorch' : kind === 'llama' ? 'runtime.llama' : 'runtime.crisp')}
        desc={sourceHint(local?.[kind])} descriptionTooltip={!!sourceHint(local?.[kind])}><span>{version}</span></SettingsRow>)}
    </SettingGroup>
    {sessionBusy ? <p className="compute-hint">{t('runtime.busy')}</p> : null}
    <SettingGroup id="runtime-engines-section" legend={t('runtime.engines')} legendHint={<Tooltip>
      <TooltipTrigger render={<Button variant="secondary" size="icon" />} aria-label={t('runtime.enginesHint')} className="settings-row__help"><CircleHelp aria-hidden="true" /></TooltipTrigger>
      <TooltipContent side="top" className="settings-row__tooltip z-popup">{t('runtime.enginesHint')}</TooltipContent>
    </Tooltip>}>
      <div className="runtime-picker">
        <TabsRoot value={active} onValueChange={next => { if (next === 'engine' || next === 'llama' || next === 'crisp') setActive(next) }}>
          <TabsList className="nola-segmented runtime-picker__group" aria-label={t('runtime.engines')}>
            {KINDS.map(kind => <TabsTrigger key={kind} value={kind} data-onboarding={`runtime-${kind}`} className="runtime-picker__option">
              {brand(kind)}
              <span className="runtime-picker__state">{local?.[kind]?.status === 'ready' ? status(local[kind]) : t('runtime.missing')}</span>
            </TabsTrigger>)}
          </TabsList>
        </TabsRoot>
      </div>
      {KINDS.map(kind => {
        const component = local?.[kind]
        const choices = kind === 'crisp' ? [{ value: CRISP_RUNTIME_ID, label: 'CrispASR 0.8.43 · Windows x64 (Vulkan + CPU)' }]
          : (kind === 'engine' ? runtimes?.recipes : runtimes?.packages)?.map(p => ({ value: p.id, label: p.name })) ?? []
        if (component?.status === 'ready' && !choices.some(p => p.value === component.id)) choices.unshift({ value: 'current', label: description(kind, component) })
        choices.unshift({ value: '', label: t('runtime.choose') })
        const same = component?.status === 'ready' && (component.managed || component.bundled)
          && (selected[kind] === component.id || selected[kind] === 'current')
        const uninstallable = component?.status === 'ready' && (component.managed || component.bundled)
          && !!component.id && selected[kind] === component.id
        const owned = selected[kind] !== 'current' && (kind === 'crisp'
          ? (component?.managed || component?.bundled) && selected[kind] === CRISP_RUNTIME_ID
          : (component?.managed || component?.bundled) && selected[kind] === component?.id
            || (kind === 'engine' ? runtimes?.recipes : runtimes?.packages)?.some(p => p.id === selected[kind] && p.installed))
        return <div key={kind} role="region" aria-label={brand(kind)} id={kind === active ? `runtime-${kind}` : undefined} hidden={kind !== active} className="runtime-panel-body">
          <SettingsRow label={t('runtime.current')} desc={sourceHint(component)} descriptionTooltip={!!sourceHint(component)}><span className="runtime-component-status">{component ? description(kind, component) : t('runtime.missing')}</span></SettingsRow>
          <SettingsRow onboardingTarget={`runtime-version-${kind}`} label={t('runtime.select')} desc={<a className="text-accent underline" href="https://nola.xaviermc.top/zh-CN/getting-started/environment" target="_blank" rel="noreferrer">{t('runtime.versionHelpLink')}</a>} descriptionTooltip><SettingSelect value={selected[kind]} options={choices} ariaLabel={t(kind === 'engine' ? 'runtime.installTorch' : kind === 'llama' ? 'runtime.installLlama' : 'runtime.installCrisp')} isDisabled={busy}
            onChange={value => { setSelected(previous => ({ ...previous, [kind]: value })); setForce(previous => ({ ...previous, [kind]: false })) }} /></SettingsRow>
          <SettingsRow label={t('runtime.force')}><SettingSwitch isSelected={force[kind]} isDisabled={busy || !owned} ariaLabel={t('runtime.force')}
            onChange={value => setForce(previous => ({ ...previous, [kind]: value }))} /></SettingsRow>
          <div className="runtime-actions gap-2">{uninstallable ? <Button variant="danger" size="sm" disabled={busy}
            onClick={() => setConfirmKind(kind)}>{t('runtime.uninstall')}</Button> : null}<Button variant="default" size="sm" disabled={busy || !selected[kind] || selected[kind] === 'current' || (same && !force[kind])}
            onClick={() => void actions.settings.installRuntimeComponent(selected[kind], force[kind])}>{same && !force[kind] ? <><Check aria-hidden="true" />{t('runtime.installed')}</> : force[kind] ? t('runtime.reinstall') : t('runtime.install')}</Button></div>
        </div>
      })}
    </SettingGroup>
    <AlertDialog.Root open={confirmKind !== null} onOpenChange={open => { if (!open) setConfirmKind(null) }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-nola-ui-backdrop" />
          <AlertDialog.Popup className="nola-dialog-content max-w-md">
            <DialogHeader>
              <AlertDialog.Title className="nola-title text-foreground">{t('runtime.uninstallTitle')}</AlertDialog.Title>
            </DialogHeader>
            <AlertDialog.Description>
              {t('runtime.uninstallBody')}
            </AlertDialog.Description>
            <DialogFooter className="flex justify-end gap-2">
              <Button variant="tertiary" size="sm" onClick={() => setConfirmKind(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" size="sm" disabled={state.runtimeBusy} onClick={() => { if (confirmKind) void uninstall(confirmKind) }}>
                {t('runtime.uninstall')}
              </Button>
            </DialogFooter>
          </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    {local && (local.engine.managed || local.llama.managed || local.crisp?.managed) ? <SettingGroup legend={t('runtime.repair')} actions={<Button variant="secondary" className="bg-surface-tertiary" disabled={busy || !Object.values(repairs).some(Boolean)} onClick={() => void install((['engine', 'llama', 'crisp'] as const).filter(kind => repairs[kind] && local[kind]?.managed).map(kind => local[kind]!.id!))}>{t('runtime.repairAction')}</Button>}>
      <ToggleGroup multiple disabled={busy} aria-label={t('runtime.repair')} className="runtime-repair runtime-repair__list"
        value={KINDS.filter(kind => repairs[kind])}
        onValueChange={values => setRepairs({ engine: values.includes('engine'), llama: values.includes('llama'), crisp: values.includes('crisp') })}>
        {KINDS.filter(kind => local[kind]?.managed).map(kind => <ToggleGroupItem key={kind} value={kind}>{brand(kind)}</ToggleGroupItem>)}
      </ToggleGroup>
    </SettingGroup> : null}
    {operation ? <div role="status" className="runtime-progress">
      <div className="runtime-progress-copy">
        <strong>{operation.id === CRISP_RUNTIME_ID ? 'CrispASR 0.8.43 · Vulkan + CPU' : [...runtimes.recipes, ...runtimes.packages].find(component => component.id === operation.id)?.name}</strong>
        <span>{t(`compute.${operation.phase}`)}{operation.phase === 'download' ? ` · ${operation.totalBytes > 0 ? Math.round(operation.bytes / operation.totalBytes * 100) : 0}%` : ''}
          {speed ? ` · ${t('runtime.speed', { speed })}` : ''}
          {elapsed ? ` · ${t('runtime.elapsed', { time: elapsed })}` : ''}</span>
        {operation.phase === 'prepare' && operation.detail ? <small>{operation.detail}</small> : null}
      </div>
      <Button variant="secondary" size="sm" onClick={() => { void cancelInstallation() }}>{t('runtime.cancel')}</Button>
    </div> : null}
  </>
}
