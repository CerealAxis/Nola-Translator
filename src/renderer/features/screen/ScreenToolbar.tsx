import { useLayoutEffect, useRef, useState } from 'react'
import { GripVertical, Pause, Play, ScanText, Settings2, Square, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import type { ScreenCommand, ScreenConfig, ScreenSnapshot, ScreenSource, ScreenTranslationBridge } from '../../../shared/screen-translation'

export function ScreenToolbar({ api, snapshot }: { api: ScreenTranslationBridge; snapshot: ScreenSnapshot }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const pending = useRef(false)
  const surface = useRef<HTMLElement>(null)
  const lastSize = useRef('')
  const { config, status } = snapshot
  const paused = status === 'paused'
  const reading = status === 'running' || status === 'waiting'
  const issue = snapshot.error
  const issueText = issue === 'gatewayNotReady' || issue === 'ocrNotReady' || issue === 'translationModelMissing' || issue === 'translationModelNotReady'
    ? t('suite.modelsNeeded') : issue ? t(`screen.errors.${issue}`) : undefined
  useLayoutEffect(() => {
    const element = surface.current
    if (!element) return
    const resize = () => {
      const { width, height } = element.getBoundingClientRect()
      if (!width || !height) return
      const size = { width: Math.ceil(width), height: Math.ceil(height) }
      const key = `${size.width}:${size.height}`
      if (key === lastSize.current) return
      lastSize.current = key
      void api.command({ action: 'toolbarSize', ...size }).catch(() => {})
    }
    resize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [api, expanded, failed, issueText, config.captureMode, sources, paused, reading, t])
  const run = async (command: ScreenCommand) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setFailed(false)
    try { await api.command(command) }
    catch { setFailed(true) }
    finally { pending.current = false; setBusy(false) }
  }
  const configure = async (next: ScreenConfig) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setFailed(false)
    try { await api.command({ action: 'configure', config: next }); await api.command({ action: 'start' }) }
    catch { setFailed(true) }
    finally { pending.current = false; setBusy(false) }
  }
  const toggleSettings = async () => {
    const next = !expanded
    setExpanded(next)
    try {
      if (next) setSources((await api.sources()).filter(source => source.kind === 'window'))
    } catch { setFailed(true) }
  }
  return <section ref={surface} className="screen-toolbar" aria-label={t('suite.toolbar')}>
    <div className="screen-toolbar__main">
      <span className="screen-toolbar__drag" title={t(`screen.states.${status}`)} aria-label={t(`screen.states.${status}`)}><GripVertical /></span>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggleSettings()}>{t(`suite.${config.captureMode}`)}</Button>
      <Button variant="outline" size="sm" title={t('suite.readOnce')} disabled={busy || status === 'editing' || status === 'starting'} onClick={() => void run({ action: 'readOnce' })}><ScanText data-icon="inline-start" />{t('suite.readOnceAction')}</Button>
      <Button variant="outline" size="sm" title={t(paused || !reading ? 'suite.resume' : 'suite.pause')} disabled={busy || status === 'editing'} onClick={() => void run({ action: paused ? 'resume' : reading ? 'pause' : 'start' })}>{paused || !reading ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}{t(paused || !reading ? 'suite.resumeAction' : 'suite.pauseAction')}</Button>
      <Button variant="destructive" size="sm" onClick={() => void api.command({ action: 'stop' }).catch(() => setFailed(true))}><Square data-icon="inline-start" />{t('screen.stop')}</Button>
      <Button variant="outline" size="icon-sm" aria-label={t('suite.display')} aria-expanded={expanded} onClick={() => void toggleSettings()}><Settings2 /></Button>
      <Button variant="outline" size="icon-sm" aria-label={t('suite.hideToolbar')} onClick={() => void run({ action: 'hideToolbar' })}><X /></Button>
    </div>
    {(failed || issueText) && <div className="screen-toolbar__status" role="alert">{busy && <Spinner />}{failed ? t('suite.actionFailed') : issueText}</div>}
    {expanded && <div className="screen-toolbar__settings">
      <Field><FieldLabel htmlFor="toolbar-capture-mode">{t('suite.captureMode')}</FieldLabel>
        <Select value={config.captureMode} disabled={busy} onValueChange={value => { if (value) void configure({ ...config, captureMode: value as ScreenConfig['captureMode'] }) }}>
          <SelectTrigger id="toolbar-capture-mode"><SelectValue>{t(`suite.${config.captureMode}`)}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{(['cursor', 'regions', 'window'] as const).map(mode => <SelectItem value={mode} key={mode}>{t(`suite.${mode}`)}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      {config.captureMode === 'window' && <Field><FieldLabel htmlFor="toolbar-target-window">{t('suite.selectWindow')}</FieldLabel>
        <Select value={config.sourceId || null} disabled={busy || !sources.length} onValueChange={value => { if (value) void configure({ ...config, sourceId: value, sourceName: sources.find(source => source.id === value)?.name ?? '' }) }}>
          <SelectTrigger id="toolbar-target-window"><SelectValue placeholder={t('suite.selectWindow')}>{sources.find(source => source.id === config.sourceId)?.name}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{sources.map(source => <SelectItem value={source.id} key={source.id}>{source.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>{!sources.length && <span>{t('suite.noWindows')}</span>}
      </Field>}
      {config.captureMode === 'regions' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run({ action: 'edit' })}>{t('screen.edit')}</Button>}
      <Field className="screen-toolbar__switch"><FieldLabel htmlFor="toolbar-overlay">{t('suite.overlayVisible')}</FieldLabel><Switch id="toolbar-overlay" checked={snapshot.overlayVisible !== false} disabled={busy} onCheckedChange={() => void run({ action: 'toggleOverlay' })}><SwitchThumb /></Switch></Field>
    </div>}
  </section>
}
