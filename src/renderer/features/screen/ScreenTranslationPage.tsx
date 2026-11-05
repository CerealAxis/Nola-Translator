import { useEffect, useMemo, useRef, useState } from 'react'
import { Crop, Keyboard, Play, Save, Square, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import { useAvailableModels } from '@/available-models'
import { PageHeader } from '@/components/primitives'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogCloseButton } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { LANGUAGE_CODES, languageName } from '../../../shared/languages'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { defaultModelBinding, isModelEnabled } from '../../../shared/model-policy'
import { screenConfigSchema, type ScreenCommand, type ScreenConfig, type ScreenSnapshot } from '../../../shared/screen-translation'
import { layoutScreenOverlay } from './overlay-layout'
import './screen.css'

export function ScreenTranslationPage() {
  const { t, language } = useI18n()
  const api = getBridge()?.screenTranslation
  const available = useAvailableModels()
  const models = available.mt.filter(model => model.binding !== 'cloud:recognition')
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const resources = useStore(stores.models, state => state.resources)
  const ocrModels = resources.filter(resource => resource.kind === 'ocrModel' && resource.installed
    && isModelEnabled(settings, 'ocr', `resource:${resource.resourceId}`))
    .map(resource => ({ value: `resource:${resource.resourceId}`, label: resource.name }))
  for (const model of available.ocr) {
    if (!ocrModels.some(option => option.value === model.binding)) ocrModels.push({ value: model.binding, label: model.name })
  }
  const configuredOcr = settings.modelGateway.ocrModel || defaultModelBinding(settings, 'ocr')
  const ocrBinding = ocrModels.some(option => option.value === configuredOcr) ? configuredOcr : available.ocr[0]?.binding ?? ''
  const ocr = available.ocr.find(model => model.binding === ocrBinding)
  const [snapshot, setSnapshot] = useState<ScreenSnapshot>()
  const [config, setConfig] = useState<ScreenConfig>(() => screenConfigSchema.parse({}))
  const [presetDialog, setPresetDialog] = useState<'save' | 'rename' | 'delete'>()
  const [presetName, setPresetName] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const savedConfig = useRef('')
  const accept = (value: ScreenSnapshot) => {
    setSnapshot(value)
    const serialized = JSON.stringify(value.config)
    if (serialized !== savedConfig.current) { savedConfig.current = serialized; setConfig(value.config) }
  }
  useEffect(() => {
    if (!api) return
    let active = true
    let changed = false
    const unsubscribe = api.onChanged(value => { changed = true; if (active) accept(value) })
    void api.snapshot().then(value => { if (active && !changed) accept(value) }).catch(() => { if (active) setLoadError(true) })
    return () => { active = false; unsubscribe() }
  }, [api])
  useEffect(() => {
    if (!ocr?.sourceLanguages?.length || ['running', 'waiting', 'starting', 'editing'].includes(snapshot?.status ?? '')) return
    if (config.sourceLanguage !== 'auto' && !ocr.sourceLanguages.includes(config.sourceLanguage)) {
      setConfig(previous => ({ ...previous, sourceLanguage: 'auto' }))
    }
  }, [ocr?.binding, ocr?.sourceLanguages, config.sourceLanguage, snapshot?.status])
  const patch = <K extends keyof ScreenConfig>(key: K, value: ScreenConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }))
  const run = async (command: ScreenCommand, save = false) => {
    if (!api || busy) return
    setBusy(true); setLoadError(false)
    try {
      if (save) accept(await api.command({ action: 'configure', config: { ...config, model: config.model || models[0]?.binding || '' } }))
      accept(await api.command(command))
      return true
    } catch (error) { notifyError(t(error instanceof Error && error.message.includes('presetNameExists') ? 'screen.presetNameExists' : command.action.includes('Preset') ? 'screen.presetFailed' : 'screen.errors.backendUnavailable'), { cause: error }); return false }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!api || busy) return
    setBusy(true)
    try {
      accept(await api.command({ action: 'configure', config: { ...config, model: config.model || models[0]?.binding || '' } }))
      notifySuccess(t('screen.saved'))
    } catch (error) { notifyError(t('screen.errors.invalidConfig'), { cause: error }) }
    finally { setBusy(false) }
  }
  const selectOcr = async (binding: string) => {
    if (busy || !ocrModels.some(model => model.value === binding)) return
    setBusy(true)
    try { await updateSettings({ modelGateway: { ocrModel: binding, ocr: true } }) }
    catch (error) { notifyError(t('gateway.actionFailed'), { cause: error }) }
    finally { setBusy(false) }
  }
  const running = snapshot?.status === 'running' || snapshot?.status === 'waiting'
  const active = running || snapshot?.status === 'starting' || snapshot?.status === 'editing'
  const canStop = active || snapshot?.status === 'paused'
  const presets = snapshot?.presets ?? []
  const selectedPreset = presets.find(preset => preset.id === config.presetId)
  const presetDirty = !!selectedPreset && JSON.stringify(selectedPreset.regions) !== JSON.stringify(config.regions)
  const openPresetDialog = (kind: 'save' | 'rename' | 'delete') => { setPresetName(selectedPreset?.name ?? ''); setPresetDialog(kind) }
  const confirmPreset = async (copy = false) => {
    if (!presetDialog) return
    const result = presetDialog === 'delete' ? await run({ action: 'deletePreset', id: selectedPreset!.id })
      : presetDialog === 'rename' ? await run({ action: 'renamePreset', id: selectedPreset!.id, name: presetName })
        : await run({ action: 'savePreset', name: presetName, id: copy ? undefined : selectedPreset?.id }, !canStop)
    if (result) setPresetDialog(undefined)
  }
  const textOverflow = useMemo(() => {
    const display = snapshot?.config.display
    if (!display || !snapshot.blocks.length) return false
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return false
    const style = getComputedStyle(document.documentElement)
    const font = style.getPropertyValue('--font-ui').trim()
    const padding = Number.parseFloat(style.getPropertyValue('--space-1')) || 8
    return layoutScreenOverlay(snapshot.blocks, display, config.fontSize, config.showSource,
      (text, size) => { context.font = `${size}px ${font}`; return context.measureText(text).width }, padding, config.regions).some(block => block.overflow)
  }, [snapshot?.blocks, snapshot?.config.display, config.fontSize, config.showSource, config.regions])
  const select = (id: string, label: string, value: string, options: Array<{ value: string; label: string }>, onChange: (value: string) => void) => (
    <Field className="screen-setting-field"><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value || null} onValueChange={value => { if (value) onChange(value) }} disabled={active || busy || !options.length}>
      <SelectTrigger id={id}><SelectValue placeholder={t('screen.select')}>{options.find(option => option.value === value)?.label}</SelectValue></SelectTrigger>
      <SelectContent><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select></Field>
  )
  return <div className="screen-page" data-slot="screen-page">
    <PageHeader title={t('screen.title')} subtitle={t('screen.description')} actions={
      <Button variant={canStop ? 'destructive' : 'default'}
        disabled={busy || !api || (!canStop && (!config.regions.length || !models.length || !ocr))}
        onClick={() => void run({ action: canStop ? 'stop' : 'start' }, !canStop)}>
        {busy ? <Spinner data-icon="inline-start" /> : canStop ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}
        {t(canStop ? 'screen.stop' : 'screen.start')}
      </Button>
    } />
    {(snapshot?.error || loadError || snapshot?.shortcutError) && <Alert><AlertDescription>
      {snapshot?.error ? t(`screen.errors.${snapshot.error}`) : loadError ? t('screen.errors.backendUnavailable') : t('screen.errors.shortcutConflict')}
    </AlertDescription></Alert>}
    {textOverflow && <Alert><AlertDescription>{t('screen.layoutHint')}</AlertDescription></Alert>}
    <Card className="screen-settings"><CardContent>
      <section className="screen-settings__section" aria-label={t('screen.regions')}>
        <FieldGroup>
          <Field className="screen-setting-field screen-regions-field"><FieldLabel htmlFor="screen-preset">{t('screen.regions')}</FieldLabel>
            <div className="screen-region-controls">
              <Select value={config.presetId || 'draft'} disabled={busy || snapshot?.status === 'editing' || !api} onValueChange={id => { if (id) void run({ action: 'loadPreset', id }, !canStop) }}>
                <SelectTrigger id="screen-preset"><SelectValue>{selectedPreset ? `${selectedPreset.name}${presetDirty ? ` · ${t('screen.presetModified')}` : ''}` : t('screen.presetDraft')}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="draft">{t('screen.presetDraft')}</SelectItem>{presets.map(preset => <SelectItem value={preset.id} key={preset.id}>{preset.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <Button variant="outline" disabled={busy || !api || snapshot?.status === 'editing'} onClick={() => void run({ action: 'edit' }, !canStop)}><Crop data-icon="inline-start" />{t('screen.edit')}</Button>
              <Tooltip><TooltipTrigger render={<Button variant="outline" size="icon" aria-label={t('screen.presetSave')} disabled={busy || !config.regions.length || config.reviewRequired || snapshot?.status === 'editing'} onClick={() => openPresetDialog('save')}><Save /></Button>} /><TooltipContent>{t('screen.presetSave')}</TooltipContent></Tooltip>
              {selectedPreset && <Popover><PopoverTrigger render={<Button variant="outline" size="icon" aria-label={t('screen.presetManage')} disabled={busy}><MoreHorizontal /></Button>} /><PopoverContent className="screen-preset-menu">
                <Button variant="outline" onClick={() => openPresetDialog('rename')}><Pencil data-icon="inline-start" />{t('screen.presetRename')}</Button>
                <Button variant="destructive" onClick={() => openPresetDialog('delete')}><Trash2 data-icon="inline-start" />{t('screen.presetDelete')}</Button>
              </PopoverContent></Popover>}
            </div>
          </Field>
        </FieldGroup>
      </section>
      <section className="screen-settings__section" aria-labelledby="screen-translation-heading">
        <div className="screen-settings__heading"><h2 id="screen-translation-heading">{t('screen.translation')}</h2></div>
        <FieldGroup className="screen-settings__fields">
            {select('screen-source-language', t('screen.sourceLanguage'), config.sourceLanguage, [...new Set(['auto', ...(ocr?.sourceLanguages ?? []), config.sourceLanguage])].map(value => ({ value, label: value === 'auto' ? t('screen.auto') : languageName(value, language) })), value => patch('sourceLanguage', value as ScreenConfig['sourceLanguage']))}
            {select('screen-target-language', t('screen.targetLanguage'), config.targetLanguage, LANGUAGE_CODES.map(value => ({ value, label: languageName(value, language) })), value => patch('targetLanguage', value))}
          {select('screen-model', t('screen.model'), config.model || models[0]?.binding || '', models.map(model => ({ value: model.binding, label: model.name })), value => patch('model', value))}
          {select('screen-ocr-model', t('screen.ocrTitle'), ocrBinding, ocrModels, value => void selectOcr(value))}
        </FieldGroup>
      </section>
      <section className="screen-settings__section" aria-labelledby="screen-style-heading">
        <div className="screen-settings__heading"><h2 id="screen-style-heading">{t('screen.style')}</h2></div>
        <FieldGroup className="screen-settings__fields">
        {select('screen-fontSize', t('screen.fontSize'), String(config.fontSize), [{ value: '0', label: t('screen.fontAuto') }, ...[12, 14, 16, 18, 20, 24, 28, 32, 36].map(value => ({ value: String(value), label: String(value) }))], value => patch('fontSize', Number(value)))}
        {(['opacity', 'intervalMs'] as const).map(key => <Field key={key} className="screen-setting-field"><FieldLabel htmlFor={`screen-${key}`}>{t(key === 'intervalMs' ? 'screen.interval' : `screen.${key}`)}</FieldLabel>
          <Input id={`screen-${key}`} type="number" min={key === 'opacity' ? 0.35 : 250} max={key === 'opacity' ? 1 : 3000} step={key === 'opacity' ? 0.05 : 1} value={config[key]} disabled={active || busy} onChange={event => patch(key, Number(event.target.value))} />
        </Field>)}
        <Field className="screen-setting-field"><FieldLabel htmlFor="screen-show-source">{t('screen.showSource')}</FieldLabel><Switch id="screen-show-source" checked={config.showSource} disabled={active || busy} onCheckedChange={value => patch('showSource', value)}><SwitchThumb /></Switch></Field>
        </FieldGroup>
      </section>
      <div className="screen-settings__footer screen-page__actions"><Button nativeButton={false} variant="outline" render={<a href="#/settings/shortcuts" />}><Keyboard data-icon="inline-start" />{t('shortcuts.title')}</Button><Button variant="outline" disabled={active || busy || !api} onClick={() => void save()}><Save data-icon="inline-start" />{t('screen.save')}</Button></div>
    </CardContent></Card>
    <Dialog open={!!presetDialog} onOpenChange={open => { if (!open && !busy) setPresetDialog(undefined) }}>
      <DialogContent><DialogHeader><DialogTitle>{t(presetDialog === 'rename' ? 'screen.presetRename' : presetDialog === 'delete' ? 'screen.presetDelete' : 'screen.presetSave')}</DialogTitle><DialogCloseButton disabled={busy} />
        <DialogDescription>{presetDialog === 'delete' ? t('screen.presetDeleteHint') : t('screen.presetSaveHint')}</DialogDescription></DialogHeader>
        <CardContent className="screen-preset-dialog">
          {presetDialog === 'delete' ? <p>{selectedPreset?.name}</p> : <Field><FieldLabel htmlFor="screen-preset-name">{t('screen.presetName')}</FieldLabel><Input id="screen-preset-name" value={presetName} maxLength={80} disabled={busy} onChange={event => setPresetName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && presetName.trim()) { event.preventDefault(); void confirmPreset() } }} /></Field>}
          <div className="screen-page__actions">
            {presetDialog === 'save' && selectedPreset && <Button variant="outline" disabled={busy || !presetName.trim()} onClick={() => void confirmPreset(true)}>{t('screen.presetSaveAs')}</Button>}
            <Button variant={presetDialog === 'delete' ? 'destructive' : 'default'} disabled={busy || (presetDialog !== 'delete' && !presetName.trim())} onClick={() => void confirmPreset()}>{busy && <Spinner data-icon="inline-start" />}{t(presetDialog === 'delete' ? 'screen.presetDelete' : presetDialog === 'rename' ? 'screen.presetRename' : presetDialog === 'save' && selectedPreset ? 'screen.presetUpdate' : 'screen.presetSave')}</Button>
          </div>
        </CardContent>
      </DialogContent>
    </Dialog>
  </div>
}
