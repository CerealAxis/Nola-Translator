import { useEffect, useState } from 'react'
import { Accordion, Alert, Button, Checkbox, Label } from '@heroui/react'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import type { LocalRuntime } from '../../../../shared/compute'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'

export function RuntimeComponents() {
  const { t } = useI18n()
  const state = useStore(stores.settings, s => s)
  const sessionBusy = useStore(stores.session, s => ['starting', 'running', 'paused', 'stopping'].includes(s.status))
  const runtimes = state.runtimes
  const operation = runtimes?.operation
  const [now, setNow] = useState(Date.now)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['engine']))
  const [selected, setSelected] = useState({ engine: '', llama: '' })
  const [force, setForce] = useState({ engine: false, llama: false })
  const [repairs, setRepairs] = useState({ engine: false, llama: false })
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
      if (component !== 'engine' && component !== 'llama') return
      setExpanded(previous => new Set([...previous, component]))
      requestAnimationFrame(() => document.getElementById(`runtime-${component}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    }
    focus()
    window.addEventListener('hashchange', focus)
    return () => window.removeEventListener('hashchange', focus)
  }, [])
  useEffect(() => {
    if (!local) return
    setSelected({ engine: local.engine.status === 'ready' ? local.engine.id ?? 'current' : '',
      llama: local.llama.status === 'ready' ? local.llama.id ?? 'current' : '' })
    setForce({ engine: false, llama: false })
    setRepairs({ engine: !!local.engine.managed && local.engine.status !== 'ready', llama: !!local.llama.managed && local.llama.status !== 'ready' })
  }, [local?.engine.path, local?.engine.id, local?.engine.status, local?.llama.path, local?.llama.id, local?.llama.status])
  const status = (component: LocalRuntime) => t(`runtime.${component.status === 'ready' ? 'installed' : component.status === 'incompatible' ? 'incompatible' : component.status === 'failed' ? 'failed' : 'missing'}`)
  const description = (kind: 'engine' | 'llama', component: LocalRuntime) => {
    if (component.status !== 'ready') return status(component)
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
    <SettingGroup legend={t('runtime.components')} actions={<Button variant="secondary" size="sm" isDisabled={busy} isPending={state.runtimeChecking}
      onPress={() => void actions.settings.loadRuntimeComponents(true).then(() => actions.settings.refreshComputeDevices()).catch(() => undefined)}>{t('runtime.recheck')}</Button>}>
      <SettingsRow label={t('runtime.python')} desc={runtimes?.python?.reason || undefined}><span>{t('runtime.builtInPython')}</span></SettingsRow>
      {local ? (['engine', 'llama'] as const).map(kind => <SettingsRow key={kind} label={kind === 'engine' ? 'PyTorch' : 'llama.cpp'} desc={local[kind].reason || undefined}>
        <span className="runtime-component-status">{description(kind, local[kind])}{local[kind].status === 'ready' ? <small>{t('runtime.installed')}</small> : null}</span>
      </SettingsRow>) : null}
    </SettingGroup>
    {state.runtimeError ? <Alert status="danger"><Alert.Content><Alert.Description>{state.runtimeError}</Alert.Description></Alert.Content></Alert> : null}
    {sessionBusy ? <p className="compute-hint">{t('runtime.busy')}</p> : null}
    <Accordion className="runtime-panels" allowsMultipleExpanded expandedKeys={expanded} onExpandedChange={keys => setExpanded(new Set([...keys].map(String)))}>
      {(['engine', 'llama'] as const).map(kind => {
        const component = local?.[kind]
        const choices = (kind === 'engine' ? runtimes?.recipes : runtimes?.packages)?.map(p => ({ value: p.id, label: p.name })) ?? []
        if (component?.status === 'ready' && !choices.some(p => p.value === component.id)) choices.unshift({ value: 'current', label: description(kind, component) })
        choices.unshift({ value: '', label: t('runtime.choose') })
        const same = component?.status === 'ready' && (selected[kind] === component.id || selected[kind] === 'current')
        const owned = selected[kind] !== 'current' && (kind === 'engine' ? runtimes?.recipes : runtimes?.packages)?.some(p => p.id === selected[kind] && p.installed)
        return <Accordion.Item key={kind} id={kind} className="runtime-panel">
          <Accordion.Heading><Accordion.Trigger id={`runtime-${kind}`} className="runtime-panel-heading">
            <span><strong>{t(kind === 'engine' ? 'runtime.installTorch' : 'runtime.installLlama')}</strong><small>{t(kind === 'engine' ? 'runtime.torchDescription' : 'runtime.llamaDescription')}</small></span><Accordion.Indicator />
          </Accordion.Trigger></Accordion.Heading>
          <Accordion.Panel><Accordion.Body className="runtime-panel-body">
            <SettingsRow label={t('runtime.current')}><span className="runtime-component-status">{component ? description(kind, component) : t('runtime.missing')}</span></SettingsRow>
            <SettingsRow label={t('runtime.select')}><SettingSelect value={selected[kind]} options={choices} ariaLabel={t(kind === 'engine' ? 'runtime.installTorch' : 'runtime.installLlama')} isDisabled={busy}
              onChange={value => { setSelected(previous => ({ ...previous, [kind]: value })); setForce(previous => ({ ...previous, [kind]: false })) }} /></SettingsRow>
            <SettingsRow label={t('runtime.force')}><SettingSwitch isSelected={force[kind]} isDisabled={busy || !owned} ariaLabel={t('runtime.force')}
              onChange={value => setForce(previous => ({ ...previous, [kind]: value }))} /></SettingsRow>
            <div className="runtime-actions"><Button variant="primary" isDisabled={busy || !selected[kind] || selected[kind] === 'current' || (same && !force[kind])}
              onPress={() => void actions.settings.installRuntimeComponent(selected[kind], force[kind])}>{same && !force[kind] ? t('runtime.installed') : force[kind] ? t('runtime.reinstall') : t('runtime.install')}</Button></div>
          </Accordion.Body></Accordion.Panel>
        </Accordion.Item>
      })}
      {local && (local.engine.managed || local.llama.managed) ? <Accordion.Item id="repair" className="runtime-panel">
        <Accordion.Heading><Accordion.Trigger className="runtime-panel-heading"><strong>{t('runtime.repair')}</strong><Accordion.Indicator /></Accordion.Trigger></Accordion.Heading>
        <Accordion.Panel><Accordion.Body className="runtime-panel-body">
          {(['engine', 'llama'] as const).filter(kind => local[kind].managed).map(kind => <Checkbox key={kind} isSelected={repairs[kind]} isDisabled={busy}
            onChange={value => setRepairs(previous => ({ ...previous, [kind]: value }))}><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Checkbox.Content><Label>{t(kind === 'engine' ? 'runtime.repairTorch' : 'runtime.repairLlama')}</Label></Checkbox.Content></Checkbox>)}
          <div className="runtime-actions"><Button variant="primary" isDisabled={busy || !Object.values(repairs).some(Boolean)} onPress={() => void install((['engine', 'llama'] as const).filter(kind => repairs[kind] && local[kind].managed).map(kind => local[kind].id!))}>{t('runtime.repairAction')}</Button></div>
        </Accordion.Body></Accordion.Panel>
      </Accordion.Item> : null}
    </Accordion>
    {operation ? <div role="status" className="runtime-progress">
      <div className="runtime-progress-copy">
        <strong>{[...runtimes.recipes, ...runtimes.packages].find(component => component.id === operation.id)?.name}</strong>
        <span>{t(`compute.${operation.phase}`)}{operation.phase === 'download' ? ` · ${Math.round(operation.bytes / operation.totalBytes * 100)}%` : ''}
          {elapsed ? ` · ${t('runtime.elapsed', { time: elapsed })}` : ''}</span>
        {operation.phase === 'prepare' && operation.detail ? <small>{operation.detail}</small> : null}
      </div>
      <Button variant="secondary" size="sm" onPress={() => void actions.settings.cancelRuntimeInstallation()}>{t('runtime.cancel')}</Button>
    </div> : null}
  </>
}
