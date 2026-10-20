import { useEffect, useState } from 'react'
import { AlertDialog, Button, Tag, TagGroup, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react'
import { Check, CircleHelp } from 'lucide-react'
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
      requestAnimationFrame(() => document.getElementById(`runtime-${component}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
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
  const elapsedSeconds = operation?.startedAt ? Math.max(0, Math.floor((now - operation.startedAt) / 1000)) : null
  const elapsed = elapsedSeconds === null ? '' : `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`
  const speed = operation?.phase === 'download' ? downloadSpeed(operation.bytes, operation.startedAt) : ''
  const versions = runtimeVersionRows(local)
  return <>
    <SettingGroup legend={t('runtime.components')} actions={<Button variant="secondary" size="sm" isDisabled={busy} isPending={state.runtimeChecking}
      onPress={() => void actions.settings.loadRuntimeComponents(true).then(() => actions.settings.refreshComputeDevices()).catch(() => undefined)}>{t('runtime.recheck')}</Button>}>
      <SettingsRow label={t('runtime.python')} desc={runtimes?.python?.reason || undefined}><span>{t('runtime.builtInPython')}</span></SettingsRow>
      {versions.map(({ kind, version }) => <SettingsRow key={kind}
        label={t(kind === 'engine' ? 'runtime.pytorch' : kind === 'llama' ? 'runtime.llama' : 'runtime.crisp')}
        desc={sourceHint(local?.[kind])} descriptionTooltip={!!sourceHint(local?.[kind])}><span>{version}</span></SettingsRow>)}
    </SettingGroup>
    {sessionBusy ? <p className="compute-hint">{t('runtime.busy')}</p> : null}
    <SettingGroup legend={t('runtime.engines')} legendHint={<Tooltip delay={300}>
      <Button variant="secondary" size="sm" isIconOnly aria-label={`${t('runtime.engines')} — Info`} className="settings-row__help"><CircleHelp size={15} aria-hidden="true" /></Button>
      <Tooltip.Content placement="top" crossOffset={0} className="settings-row__tooltip">{t('runtime.enginesHint')}</Tooltip.Content>
    </Tooltip>}>
      <div className="runtime-picker">
        <ToggleButtonGroup className="nola-segmented runtime-picker__group" selectionMode="single" disallowEmptySelection
          selectedKeys={new Set([active])} aria-label={t('runtime.engines')}
          onSelectionChange={keys => { const next = [...keys][0]; if (typeof next === 'string') setActive(next as RuntimeKind) }}>
          {KINDS.map(kind => <ToggleButton key={kind} id={kind} data-onboarding={`runtime-${kind}`} className="runtime-picker__option">
            {brand(kind)}
            <span className="runtime-picker__state">{local?.[kind]?.status === 'ready' ? status(local[kind]) : t('runtime.missing')}</span>
          </ToggleButton>)}
        </ToggleButtonGroup>
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
        return <div key={kind} role="tabpanel" id={kind === active ? `runtime-${kind}` : undefined} hidden={kind !== active} className="runtime-panel-body">
          <SettingsRow label={t('runtime.current')} desc={sourceHint(component)} descriptionTooltip={!!sourceHint(component)}><span className="runtime-component-status">{component ? description(kind, component) : t('runtime.missing')}</span></SettingsRow>
          <SettingsRow onboardingTarget={`runtime-version-${kind}`} label={t('runtime.select')} desc={<a className="text-accent underline" href="https://nola.xaviermc.top/zh-CN/getting-started/environment" target="_blank" rel="noreferrer">{t('runtime.versionHelpLink')}</a>} descriptionTooltip><SettingSelect value={selected[kind]} options={choices} ariaLabel={t(kind === 'engine' ? 'runtime.installTorch' : kind === 'llama' ? 'runtime.installLlama' : 'runtime.installCrisp')} isDisabled={busy}
            onChange={value => { setSelected(previous => ({ ...previous, [kind]: value })); setForce(previous => ({ ...previous, [kind]: false })) }} /></SettingsRow>
          <SettingsRow label={t('runtime.force')}><SettingSwitch isSelected={force[kind]} isDisabled={busy || !owned} ariaLabel={t('runtime.force')}
            onChange={value => setForce(previous => ({ ...previous, [kind]: value }))} /></SettingsRow>
          <div className="runtime-actions gap-2">{uninstallable ? <Button variant="danger-soft" size="sm" isDisabled={busy}
            onPress={() => setConfirmKind(kind)}>{t('runtime.uninstall')}</Button> : null}<Button variant="primary" size="sm" isDisabled={busy || !selected[kind] || selected[kind] === 'current' || (same && !force[kind])}
            onPress={() => void actions.settings.installRuntimeComponent(selected[kind], force[kind])}>{same && !force[kind] ? <><Check aria-hidden="true" />{t('runtime.installed')}</> : force[kind] ? t('runtime.reinstall') : t('runtime.install')}</Button></div>
        </div>
      })}
    </SettingGroup>
    <AlertDialog isOpen={confirmKind !== null} onOpenChange={open => { if (!open) setConfirmKind(null) }}>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading className="nola-title text-foreground">{t('runtime.uninstallTitle')}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="nola-body text-muted">{t('runtime.uninstallBody')}</p>
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex justify-end gap-2">
              <Button variant="tertiary" size="sm" onPress={() => setConfirmKind(null)}>{t('common.cancel')}</Button>
              <Button variant="danger-soft" size="sm" isPending={state.runtimeBusy} onPress={() => { if (confirmKind) void uninstall(confirmKind) }}>
                {t('runtime.uninstall')}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
    {local && (local.engine.managed || local.llama.managed || local.crisp?.managed) ? <SettingGroup legend={t('runtime.repair')} actions={<Button variant="secondary" isDisabled={busy || !Object.values(repairs).some(Boolean)} onPress={() => void install((['engine', 'llama', 'crisp'] as const).filter(kind => repairs[kind] && local[kind]?.managed).map(kind => local[kind]!.id!))}>{t('runtime.repairAction')}</Button>}>
      <TagGroup aria-label={t('runtime.repair')} className="runtime-repair" variant="surface" selectionMode="multiple"
        selectedKeys={new Set(KINDS.filter(kind => repairs[kind]))}
        onSelectionChange={keys => { const next = new Set(keys === 'all' ? KINDS : keys); setRepairs({ engine: next.has('engine'), llama: next.has('llama'), crisp: next.has('crisp') }) }}>
        <TagGroup.List className="runtime-repair__list">
          {KINDS.filter(kind => local[kind]?.managed).map(kind => <Tag key={kind} id={kind} isDisabled={busy}>{brand(kind)}</Tag>)}
        </TagGroup.List>
      </TagGroup>
    </SettingGroup> : null}
    {operation ? <div role="status" className="runtime-progress">
      <div className="runtime-progress-copy">
        <strong>{operation.id === CRISP_RUNTIME_ID ? 'CrispASR 0.8.43 · Vulkan + CPU' : [...runtimes.recipes, ...runtimes.packages].find(component => component.id === operation.id)?.name}</strong>
        <span>{t(`compute.${operation.phase}`)}{operation.phase === 'download' ? ` · ${operation.totalBytes > 0 ? Math.round(operation.bytes / operation.totalBytes * 100) : 0}%` : ''}
          {speed ? ` · ${t('runtime.speed', { speed })}` : ''}
          {elapsed ? ` · ${t('runtime.elapsed', { time: elapsed })}` : ''}</span>
        {operation.phase === 'prepare' && operation.detail ? <small>{operation.detail}</small> : null}
      </div>
      <Button variant="secondary" size="sm" onPress={() => { void cancelInstallation() }}>{t('runtime.cancel')}</Button>
    </div> : null}
  </>
}
