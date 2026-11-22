import { TextProcessingSceneField } from '../settings/text-processing/TextProcessingSceneField'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Crop, Gamepad2, Play, Save, Square, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import { useAvailableModels } from '@/available-models'
import { PageHeader } from '@/components/primitives'
import { notifyError } from '@/components/primitives/notify'
import { LanguageDirectionSelect } from '@/components/primitives/LanguageDirectionSelect'
import { useScreenLanguageModels } from '@/model-options'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogCloseButton } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { ModelAvailabilityLabel } from '../workspace/ModelAvailabilityLabel'
import { normalizeLanguage } from '../../../shared/languages'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import { defaultModelBinding, isModelEnabled } from '../../../shared/model-policy'
import { SUPPORT_ERROR_CATALOG, type SupportErrorCode } from '../../../shared/error-catalog'
import { normalizeThrownError, stripIpcErrorMessage } from '../../../shared/ipc-error'
import { screenConfigSchema, screenProcessingMode, screenTranslationModel, type ScreenCommand, type ScreenConfig, type ScreenSource, type ScreenSnapshot } from '../../../shared/screen-translation'
import { layoutScreenOverlay } from './overlay-layout'
import { HarborScene } from './HarborScene'

const presetMenuItem = 'nola-menu-item flex cursor-pointer items-center gap-2 rounded-nola-ui-md px-3 py-2 type-body data-disabled:opacity-50'
let configurationWrites = Promise.resolve(true)

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
  const [snapshot, setSnapshot] = useState<ScreenSnapshot>()
  const [config, setConfig] = useState<ScreenConfig>(() => screenConfigSchema.parse({}))
  const draft = useRef(config)
  const pendingConfig = useRef<ScreenConfig | undefined>(undefined)
  const processingMode = screenProcessingMode(config)
  const modelBinding = screenTranslationModel(config, settings)
  const { sourceLanguages, targetLanguages, targetsFor, unavailable, requiredModels } = useScreenLanguageModels({
    source: config.sourceLanguage, binding: modelBinding || (processingMode === 'cascade' ? models[0]?.binding : undefined),
  })
  const incompatible = unavailable === 'pair' || !unavailable && (!sourceLanguages.includes(normalizeLanguage(config.sourceLanguage))
    || !targetLanguages.includes(normalizeLanguage(config.targetLanguage)))
  const canSwap = config.sourceLanguage !== 'auto' && sourceLanguages.includes(config.targetLanguage) && targetLanguages.includes(config.sourceLanguage)
  const [presetDialog, setPresetDialog] = useState<'save' | 'rename' | 'delete'>()
  const [presetName, setPresetName] = useState('')
  const [busy, setBusy] = useState(false)
  const [ocrSaving, setOcrSaving] = useState(false)
  const [intervalInput, setIntervalInput] = useState<string>()
  const [thresholdInput, setThresholdInput] = useState<string>()
  const [opacityPreview, setOpacityPreview] = useState<number>()
  const [sources, setSources] = useState<ScreenSource[]>([])
  useEffect(() => {
    if (!api || config.captureMode !== 'window') return
    let live = true
    void api.sources().then(value => { if (live) setSources(value.filter(source => source.kind === 'window')) }).catch(error => notifyError(t('suite.actionFailed'), { cause: error }))
    return () => { live = false }
  }, [api, config.captureMode])
  const savedConfig = useRef<ScreenConfig | undefined>(undefined)
  const commandPending = useRef(false)
  const setDraft = (value: ScreenConfig) => {
    draft.current = value
    setConfig(value)
  }
  const accept = (value: ScreenSnapshot, syncDraft = false) => {
    setSnapshot(value)
    const changed = JSON.stringify(value.config) !== JSON.stringify(savedConfig.current)
    savedConfig.current = value.config
    if ((changed || syncDraft) && !pendingConfig.current) setDraft(value.config)
  }
  useEffect(() => {
    if (!api) return
    let active = true
    let unsubscribe: (() => void) | undefined
    void configurationWrites.then(async () => {
      if (!active) return
      let changed = false
      unsubscribe = api.onChanged(value => { changed = true; if (active) accept(value) })
      const value = await api.snapshot()
      if (active && !changed) accept(value)
    }).catch(error => { if (active) notifyError(t('screen.errors.backendUnavailable'), { cause: error }) })
    return () => { active = false; unsubscribe?.() }
  }, [api])
  useEffect(() => {
    if (!snapshot || unavailable || pendingConfig.current || ['running', 'waiting', 'starting', 'editing'].includes(snapshot.status)) return
    const source = sourceLanguages.includes(config.sourceLanguage) ? config.sourceLanguage : sourceLanguages[0]
    const target = targetLanguages.includes(config.targetLanguage) ? config.targetLanguage : targetLanguages[0]
    if (source && source !== config.sourceLanguage || target && target !== config.targetLanguage) {
      setDraft({ ...draft.current, sourceLanguage: source ?? draft.current.sourceLanguage, targetLanguage: target ?? draft.current.targetLanguage })
    }
  }, [sourceLanguages.join('|'), targetLanguages.join('|'), config.sourceLanguage, config.targetLanguage, snapshot?.status, unavailable])
  const reportCommandError = (error: unknown, preset = false) => {
    const failure = normalizeThrownError({ message: stripIpcErrorMessage(error instanceof Error ? error.message : '') })
    const title = failure.code === 'presetNameExists' ? t('screen.presetNameExists') : t(preset ? 'screen.presetFailed' : 'suite.actionFailed')
    const code = failure.supportCode as SupportErrorCode
    const detail = t(SUPPORT_ERROR_CATALOG[code].messageKey)
    notifyError(title, { description: detail !== title && !/\{\w+\}/.test(detail) ? detail : undefined, supportCode: code })
  }
  const updatedConfig = (value: ScreenConfig) => ({
    ...value, model: value.model || (screenProcessingMode(value) === 'cascade' ? models[0]?.binding : '') || '',
  })
  const saveChanges = (changes: Partial<ScreenConfig>) => {
    if (!api || !savedConfig.current || commandPending.current) return
    const previous = draft.current
    const next = updatedConfig({ ...previous, ...changes })
    if (next.sourceId !== previous.sourceId) {
      next.regions = []
      next.windowIdentity = ''
    }
    if (JSON.stringify(next) === JSON.stringify(previous)) return
    setDraft(next)
    pendingConfig.current = next
    configurationWrites = configurationWrites.then(async () => {
      if (pendingConfig.current !== next) return true
      try {
        const result = await api.command({ action: 'configure', config: next })
        const latest = pendingConfig.current === next
        if (latest) pendingConfig.current = undefined
        accept(result, latest)
        return true
      } catch (error) {
        if (pendingConfig.current === next) {
          pendingConfig.current = undefined
          if (savedConfig.current) setDraft(savedConfig.current)
          reportCommandError(error)
        }
        return false
      }
    })
  }
  const patch = <K extends keyof ScreenConfig>(key: K, value: ScreenConfig[K]) => saveChanges({ [key]: value })
  const run = async (command: ScreenCommand, save = false) => {
    if (!api || busy || commandPending.current || command.action === 'start' && (incompatible || ocrSaving)) return
    commandPending.current = true
    setBusy(true)
    try {
      if (pendingConfig.current && !await configurationWrites) return false
      const next = updatedConfig(draft.current)
      if (save && JSON.stringify(next) !== JSON.stringify(savedConfig.current)) {
        accept(await api.command({ action: 'configure', config: next }))
      }
      accept(await api.command(command))
      return true
    } catch (error) { reportCommandError(error, command.action.includes('Preset')); return false }
    finally { commandPending.current = false; setBusy(false) }
  }
  const selectOcr = async (binding: string) => {
    if (busy || ocrSaving || !ocrModels.some(model => model.value === binding)) return
    setOcrSaving(true)
    try { await updateSettings({ modelGateway: { ocrModel: binding, ocr: true } }) }
    catch (error) { notifyError(t('gateway.actionFailed'), { cause: error }) }
    finally { setOcrSaving(false) }
  }
  const running = snapshot?.status === 'running' || snapshot?.status === 'waiting'
  const active = running || snapshot?.status === 'starting' || snapshot?.status === 'editing'
  const settingsDisabled = !snapshot || active || busy
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
  const select = (id: string, label: string, value: string, options: Array<{ value: string; label: string }>, onChange: (value: string) => void, action?: ReactNode) => (
    <Field className="nola-settings-field"><FieldLabel htmlFor={id}>{label}</FieldLabel><div className="nola-inline-field-controls"><Select value={value || null} onValueChange={value => { if (value) onChange(value) }} disabled={settingsDisabled || id === 'screen-ocr-model' && ocrSaving || !options.length}>
      <SelectTrigger id={id}><SelectValue placeholder={t('screen.select')}>{options.find(option => option.value === value)?.label}</SelectValue></SelectTrigger>
      <SelectContent><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>{action}</div></Field>
  )
  const areaActionsDisabled = busy || !api || snapshot?.status === 'editing'
  const editArea = <Tooltip>
    <TooltipTrigger render={<Button variant="bare" size="icon-sm" aria-label={t('screen.edit')} disabled={areaActionsDisabled}
      onClick={() => void run({ action: 'edit' }, !canStop)}><Crop /></Button>} />
    <TooltipContent>{t('screen.edit')}</TooltipContent>
  </Tooltip>
  return <div className="screen-page" data-slot="screen-page">
    <PageHeader title={t('screen.title')} warning={t('suite.experimentalInDevelopment')} subtitle={t('screen.description')} actions={<div className="screen-page__actions">
      {canStop && <Button variant="outline" disabled={busy || !api} onClick={() => void run({ action: 'showToolbar' })}>{t('suite.showToolbar')}</Button>}
      <Button variant={canStop ? 'destructive' : 'default'}
        disabled={!snapshot || busy || !api || !canStop && (incompatible || ocrSaving)}
        onClick={() => void run({ action: canStop ? 'stop' : 'start' }, !canStop)}>
        {busy ? <Spinner data-icon="inline-start" /> : canStop ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}
        {t(canStop ? 'screen.stop' : 'screen.start')}
      </Button></div>
    } />
    <Card data-slot="screen-stage">
      <CardContent>
        <div className="screen-scene-window">
          <div className="screen-scene-titlebar">
            <Gamepad2 aria-hidden="true" /><span>Tideglass Harbor</span>
          </div>
          <HarborScene />
        </div>
      </CardContent>
    </Card>
    {textOverflow && <Alert><AlertDescription>{t('screen.layoutHint')}</AlertDescription></Alert>}
    <Card data-slot="screen-settings" className="nola-section-card nola-settings-card">
      <CardContent className="nola-settings-content">
        <FieldGroup className="nola-settings-fields" role="region" aria-labelledby="screen-translation-heading">
          <h2 id="screen-translation-heading" className="nola-settings-heading">{t('screen.translationSettings')}</h2>
          {select('screen-processing', t('session.pipeline'), processingMode, [{ value: 'default', label: t('session.followDefault') }, { value: 'cascade', label: t('screen.cascade') }], value => patch('processingMode', value as 'default' | 'cascade'))}
          <Field className="nola-settings-field nola-language-pair-field">
            <ModelAvailabilityLabel label={t('shellUi.languageDirection')} hint={t('shellUi.languageDirectionHint')} />
            <LanguageDirectionSelect source={config.sourceLanguage} target={config.targetLanguage} sourceCodes={sourceLanguages} targetCodes={targetLanguages} unavailable={unavailable} requiredModels={requiredModels} disabled={settingsDisabled}
              sourceLabel={t('screen.sourceLanguage')} targetLabel={t('screen.targetLanguage')}
              onSourceChange={value => {
                const targets = targetsFor(value)
                const target = targets.includes(config.targetLanguage) ? config.targetLanguage : targets[0] ?? config.targetLanguage
                saveChanges({ sourceLanguage: value, targetLanguage: target })
              }} onTargetChange={value => patch('targetLanguage', value)}
              onSwap={canSwap ? () => saveChanges({ sourceLanguage: config.targetLanguage, targetLanguage: config.sourceLanguage }) : undefined} />
          </Field>
          {processingMode === 'cascade' && select('screen-model', t('screen.model'), config.model || models[0]?.binding || '', models.map(model => ({ value: model.binding, label: model.name })), value => patch('model', value))}
          <TextProcessingSceneField scene="screen" disabled={settingsDisabled} />
        </FieldGroup>
        <FieldGroup className="nola-settings-fields" role="region" aria-labelledby="screen-ocr-heading">
          <h2 id="screen-ocr-heading" className="nola-settings-heading">{t('screen.ocrSettings')}</h2>
          {select('screen-capture-mode', t('suite.captureMode'), config.captureMode, ['cursor', 'regions', 'window'].map(value => ({ value, label: t(`suite.${value as 'cursor' | 'regions' | 'window'}`) })), value => patch('captureMode', value as ScreenConfig['captureMode']))}
          {config.captureMode === 'window' && select('screen-target-window', t('suite.selectWindow'), config.sourceId, sources.map(source => ({ value: source.id, label: source.name })), value => saveChanges({ sourceId: value, sourceName: sources.find(source => source.id === value)?.name ?? '' }), config.sourceId ? editArea : undefined)}
          {config.captureMode === 'regions' && <Field className="nola-settings-field"><FieldLabel htmlFor="screen-preset">{t('screen.regions')}</FieldLabel>
            <div className="nola-inline-field-controls screen-region-controls">
              <Select value={config.presetId || 'draft'} disabled={areaActionsDisabled} onValueChange={id => { if (id) void run({ action: 'loadPreset', id }, !canStop) }}>
                <SelectTrigger id="screen-preset"><SelectValue>{selectedPreset ? `${selectedPreset.name}${presetDirty ? ` · ${t('screen.presetModified')}` : ''}` : t('screen.presetDraft')}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="draft">{t('screen.presetDraft')}</SelectItem>{presets.map(preset => <SelectItem value={preset.id} key={preset.id}>{preset.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              {editArea}
              <Menu.Root>
                <Tooltip>
                  <TooltipTrigger render={<Menu.Trigger render={<Button variant="bare" size="icon-sm" aria-label={t('screen.presetManage')} disabled={areaActionsDisabled}><MoreHorizontal /></Button>} />} />
                  <TooltipContent>{t('screen.presetManage')}</TooltipContent>
                </Tooltip>
                <Menu.Portal>
                  <Menu.Positioner className="z-dropdown" align="end" sideOffset={4}>
                    <Menu.Popup data-slot="dropdown-menu-content" className="min-w-40 rounded-nola-ui-xl bg-overlay p-1 text-overlay-foreground shadow-overlay">
                      <Menu.Item className={presetMenuItem} disabled={!config.regions.length || config.reviewRequired} onClick={() => openPresetDialog('save')}><Save className="size-4" />{t('screen.presetSave')}</Menu.Item>
                      {selectedPreset && <>
                        <Menu.Item className={presetMenuItem} onClick={() => openPresetDialog('rename')}><Pencil className="size-4" />{t('screen.presetRename')}</Menu.Item>
                        <Menu.Item className={`${presetMenuItem} text-destructive`} onClick={() => openPresetDialog('delete')}><Trash2 className="size-4" />{t('screen.presetDelete')}</Menu.Item>
                      </>}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
          </Field>}
          {select('screen-ocr-mode', t('screen.ocrMode'), config.ocrMode, [
            { value: 'period', label: t('screen.ocrPeriod') },
            { value: 'analysis', label: t('screen.ocrAnalysis') },
            { value: 'trigger', label: t('screen.ocrTrigger') },
          ], value => patch('ocrMode', value as ScreenConfig['ocrMode']))}
          {processingMode === 'cascade' && select('screen-ocr-model', t('screen.ocrTitle'), ocrBinding, ocrModels, value => void selectOcr(value))}
          {config.ocrMode === 'period' && <Field className="nola-settings-field">
            <FieldLabel htmlFor="screen-intervalMs">{t('screen.ocrInterval')}</FieldLabel>
            <Input id="screen-intervalMs" type="number" min={100} max={100000} step={100}
              value={intervalInput ?? config.intervalMs} disabled={settingsDisabled}
              onBlur={() => setIntervalInput(undefined)} onChange={event => {
                setIntervalInput(event.currentTarget.value)
                const value = event.currentTarget.valueAsNumber
                if (Number.isInteger(value) && value >= 100 && value <= 100000) patch('intervalMs', value)
              }} />
          </Field>}
          <Field className="nola-settings-field">
            <ModelAvailabilityLabel label={t('screen.textChangeThreshold')} hint={t('screen.textChangeHint')} />
            <Input id="screen-text-threshold" type="number" min={0} max={100000} step={1} value={thresholdInput ?? config.textChangeThreshold}
              aria-label={t('screen.textChangeThreshold')} disabled={settingsDisabled}
              onBlur={() => setThresholdInput(undefined)} onChange={event => {
                setThresholdInput(event.currentTarget.value)
                if (event.currentTarget.validity.valid && Number.isFinite(event.currentTarget.valueAsNumber)) patch('textChangeThreshold', event.currentTarget.valueAsNumber)
              }} />
          </Field>
        </FieldGroup>
        <FieldGroup className="nola-settings-fields" role="region" aria-labelledby="screen-style-heading">
          <h2 id="screen-style-heading" className="nola-settings-heading">{t('screen.translationDisplay')}</h2>
          {select('screen-fontSize', t('screen.fontSize'), String(config.fontSize), [{ value: '0', label: t('screen.fontAuto') }, ...[12, 14, 16, 18, 20, 24, 28, 32, 36].map(value => ({ value: String(value), label: String(value) }))], value => patch('fontSize', Number(value)))}
          <Field className="nola-settings-field">
            <FieldLabel id="screen-opacity-label">{t('screen.blurOpacity')}</FieldLabel>
            <div className="nola-meeting-volume-control">
              <SliderRoot className="px-4" min={0.35} max={1} step={0.01} value={opacityPreview ?? config.opacity}
                disabled={settingsDisabled}
                locale={language} format={{ style: 'percent' }}
                onValueChange={setOpacityPreview} onValueCommitted={value => {
                  setOpacityPreview(undefined)
                  patch('opacity', value)
                }}>
                <SliderControl><SliderTrack><SliderIndicator /><SliderThumb aria-labelledby="screen-opacity-label" /></SliderTrack></SliderControl>
              </SliderRoot>
              <span className="nola-meeting-volume-value">{new Intl.NumberFormat(language, { style: 'percent' }).format(opacityPreview ?? config.opacity)}</span>
            </div>
          </Field>
          <Field className="nola-settings-field">
            <FieldLabel htmlFor="screen-show-source">{t('screen.showSource')}</FieldLabel>
            <Switch id="screen-show-source" checked={config.showSource} disabled={settingsDisabled} onCheckedChange={value => patch('showSource', value)}><SwitchThumb /></Switch>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
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
