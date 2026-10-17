import { OfflineResources } from '../../offline'
import { useEffect, useState } from 'react'
import { Alert, Button, Tag, TagGroup, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { Check } from 'lucide-react'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import { CRISP_RUNTIME_ID, type LocalRuntime } from '../../../../shared/compute'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'

type RuntimeKind = 'engine' | 'llama' | 'crisp'
const KINDS = ['engine', 'llama', 'crisp'] as const

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
      crisp: local.crisp?.status === 'ready' ? local.crisp.managed ? local.crisp.id ?? 'current' : 'current' : '' })
    setForce({ engine: false, llama: false, crisp: false })
    setRepairs({ engine: !!local.engine.managed && local.engine.status !== 'ready', llama: !!local.llama.managed && local.llama.status !== 'ready', crisp: !!local.crisp?.managed && local.crisp.status !== 'ready' })
  }, [local?.engine.path, local?.engine.id, local?.engine.status, local?.llama.path, local?.llama.id, local?.llama.status, local?.crisp?.path, local?.crisp?.id, local?.crisp?.status])
  const brand = (kind: RuntimeKind) => kind === 'engine' ? 'PyTorch' : kind === 'llama' ? 'llama.cpp' : 'CrispASR'
  const status = (component: LocalRuntime) => t(`runtime.${component.status === 'ready' ? 'installed' : component.status === 'incompatible' ? 'incompatible' : component.status === 'failed' ? 'failed' : 'missing'}`)
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
  const elapsedSeconds = operation?.startedAt ? Math.max(0, Math.floor((now - operation.startedAt) / 1000)) : null
  const elapsed = elapsedSeconds === null ? '' : `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`
  return <>
    <OfflineResources />
    <SettingGroup legend={t('runtime.components')} actions={<Button variant="secondary" size="sm" isDisabled={busy} isPending={state.runtimeChecking}
      onPress={() => void actions.settings.loadRuntimeComponents(true).then(() => actions.settings.refreshComputeDevices()).catch(() => undefined)}>{t('runtime.recheck')}</Button>}>
      <SettingsRow label={t('runtime.python')} desc={runtimes?.python?.reason || undefined}><span>{t('runtime.builtInPython')}</span></SettingsRow>
    </SettingGroup>
    {state.runtimeError ? <Alert status="danger"><Alert.Content><Alert.Description>{state.runtimeError}</Alert.Description></Alert.Content></Alert> : null}
    {sessionBusy ? <p className="compute-hint">{t('runtime.busy')}</p> : null}
    <SettingGroup legend={t('runtime.engines')}>
      <div className="runtime-picker">
        <ToggleButtonGroup className="nola-segmented runtime-picker__group" selectionMode="single" disallowEmptySelection
          selectedKeys={new Set([active])} aria-label={t('runtime.engines')}
          onSelectionChange={keys => { const next = [...keys][0]; if (typeof next === 'string') setActive(next as RuntimeKind) }}>
          {KINDS.map(kind => <ToggleButton key={kind} id={kind} data-onboarding={`runtime-${kind}`} className="runtime-picker__option">
            {brand(kind)}
            <span className="runtime-picker__state">{local?.[kind]?.status === 'ready' ? t('runtime.installed') : t('runtime.missing')}</span>
          </ToggleButton>)}
        </ToggleButtonGroup>
      </div>
      {KINDS.map(kind => {
        const component = local?.[kind]
        const choices = kind === 'crisp' ? [{ value: CRISP_RUNTIME_ID, label: 'CrispASR 0.8.43 · Windows x64 (Vulkan + CPU)' }]
          : (kind === 'engine' ? runtimes?.recipes : runtimes?.packages)?.map(p => ({ value: p.id, label: p.name })) ?? []
        if (component?.status === 'ready' && !choices.some(p => p.value === component.id)) choices.unshift({ value: 'current', label: description(kind, component) })
        choices.unshift({ value: '', label: t('runtime.choose') })
        const same = component?.status === 'ready' && (selected[kind] === component.id || selected[kind] === 'current')
        const owned = selected[kind] !== 'current' && (kind === 'crisp' ? component?.managed && selected[kind] === CRISP_RUNTIME_ID
          : (kind === 'engine' ? runtimes?.recipes : runtimes?.packages)?.some(p => p.id === selected[kind] && p.installed))
        return <div key={kind} role="tabpanel" id={kind === active ? `runtime-${kind}` : undefined} hidden={kind !== active} className="runtime-panel-body">
          <SettingsRow label={t('runtime.current')}><span className="runtime-component-status">{component ? description(kind, component) : t('runtime.missing')}</span></SettingsRow>
          <SettingsRow label={t('runtime.select')} desc={kind === 'engine' ? <>
            {t('runtime.versionHelpPrefix')} <a className="text-accent underline" href="https://licyk.github.io/SDNote/sd_launcher/advance/env/#pytorch" target="_blank" rel="noreferrer">{t('runtime.versionHelpLink')}</a><br />
            {t('runtime.versionHelpSuffix')}
          </> : undefined} descriptionTooltip={kind === 'engine'}><SettingSelect value={selected[kind]} options={choices} ariaLabel={t(kind === 'engine' ? 'runtime.installTorch' : kind === 'llama' ? 'runtime.installLlama' : 'runtime.installCrisp')} isDisabled={busy}
            onChange={value => { setSelected(previous => ({ ...previous, [kind]: value })); setForce(previous => ({ ...previous, [kind]: false })) }} /></SettingsRow>
          <SettingsRow label={t('runtime.force')}><SettingSwitch isSelected={force[kind]} isDisabled={busy || !owned} ariaLabel={t('runtime.force')}
            onChange={value => setForce(previous => ({ ...previous, [kind]: value }))} /></SettingsRow>
          <div className="runtime-actions"><Button variant="primary" isDisabled={busy || !selected[kind] || selected[kind] === 'current' || (same && !force[kind])}
            onPress={() => void actions.settings.installRuntimeComponent(selected[kind], force[kind])}>{same && !force[kind] ? <><Check aria-hidden="true" />{t('runtime.installed')}</> : force[kind] ? t('runtime.reinstall') : t('runtime.install')}</Button></div>
        </div>
      })}
    </SettingGroup>
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
        <span>{t(`compute.${operation.phase}`)}{operation.phase === 'download' ? ` · ${Math.round(operation.bytes / operation.totalBytes * 100)}%` : ''}
          {elapsed ? ` · ${t('runtime.elapsed', { time: elapsed })}` : ''}</span>
        {operation.phase === 'prepare' && operation.detail ? <small>{operation.detail}</small> : null}
      </div>
      <Button variant="secondary" size="sm" onPress={() => void actions.settings.cancelRuntimeInstallation()}>{t('runtime.cancel')}</Button>
    </div> : null}
  </>
}
