import { useEffect, useRef, useState } from 'react'
import { FolderInput, LoaderCircle } from 'lucide-react'
import { useI18n } from '@/i18n'
import { stores, useStore } from '@/store'
import { offlineActions, offlineStore } from '@/store/offlineStore'
import { Button } from '@/components/ui/button'
import { Dialog, DialogCloseButton, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectFieldLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingGroup, SettingSelect } from '../settings/SettingsPage'
import { SettingsRow } from '../settings/SettingsRow'
import { CRISP_RUNTIME_ID, CRISP_RUNTIME_FILES } from '../../../shared/compute'
import type { ResourceRecord } from '../../../shared/contracts'
import { modelEngines } from '../../../shared/model-engines'
import { ImportHelp, ModelImportPanel } from './ModelImportPanel'
import { OfflineTaskProgress } from './OfflineTaskProgress'
import './offline.css'

function bytes(value: number): string { return `${(value / 1024 ** 3).toFixed(2)} GB` }

/** Loader tag for a model. The soft variant of the old chip was a muted fill with inherited text. */
function LoaderChip({ loaders, className }: { loaders: string; className?: string }) {
  return <span className={['inline-flex w-fit shrink-0 items-center rounded-2xl bg-default px-1 py-0 text-xs font-medium leading-5 text-foreground', className ?? ''].filter(Boolean).join(' ')}>{loaders}</span>
}

/** Busy marker for a button that starts an operation; the button itself carries the disabled state. */
function BusyIcon({ busy }: { busy: boolean }) {
  return busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null
}

export function LocalModelImport() {
  const { t } = useI18n()
  return <><Button className="offline-import-button" variant="secondary" onClick={() => { offlineActions.reset(); offlineActions.open('model') }}><FolderInput aria-hidden="true" />{t('offline.modelImport')}</Button><OfflineDialog scope="model" /></>
}
export function OfflineResources() {
  const { t } = useI18n()
  const task = useStore(offlineStore, state => state.task)
  return <><SettingGroup legend={t('offline.title')}><SettingsRow label={t('offline.packageContents')} desc={t('offline.description')} descriptionTooltip>
    <div className="offline-actions"><Button variant="secondary" onClick={() => { offlineActions.reset(); offlineActions.open('prepare') }}>{t('offline.prepare')}</Button>
      <Button variant="secondary" onClick={() => { offlineActions.reset(); void offlineActions.pickBundle() }}>{t('offline.bundleImport')}</Button></div>
  </SettingsRow>{task ? <SettingsRow label={t('offline.task')}><Button variant="secondary" onClick={() => offlineActions.open('bundle')}>{t(`offline.${task.state === 'running' ? task.phase : task.state === 'idle' ? 'ready' : task.state}`)}</Button></SettingsRow> : null}</SettingGroup><OfflineDialog scope="runtime" /></>
}
export interface OfflineDialogProps { scope: 'model' | 'runtime' }

export function OfflineDialog({ scope }: OfflineDialogProps) {
  const { t } = useI18n()
  const state = useStore(offlineStore, value => value)
  const resources = useStore(stores.models, value => value.resources)
  const runtimes = useStore(stores.settings, value => value.runtimes)
  const [step, setStep] = useState(0)
  const [recognition, setRecognition] = useState('')
  const [translation, setTranslation] = useState('')
  const [engine, setEngine] = useState('')
  const [llama, setLlama] = useState('')
  const [crisp, setCrisp] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)
  const visible = state.mode !== null && (scope === 'model' ? state.mode === 'model' : state.mode !== 'model')
  useEffect(() => {
    if (!visible) return
    setStep(0)
    setEngine('')
    setLlama('')
    setCrisp('')
    setRecognition('')
    setTranslation('')
  }, [visible])
  const engineOptions = runtimes?.recipes ?? []
  const llamaOptions = runtimes?.packages ?? []
  const runtimeIds = [engine, llama, crisp].filter(Boolean)
  const supportsModel = (resource: ResourceRecord) => modelEngines(resource).some(loader => ({ pytorch: engine, llama, crisp })[loader])
  const modelIds = [recognition, translation].filter(id => id && resources.some(resource => resource.resourceId === id && supportsModel(resource)))
  const selected = resources.filter(resource => modelIds.includes(resource.resourceId))
  const runtimeNames = new Map([
    ...engineOptions.map(item => [item.id, item.name] as const),
    ...llamaOptions.map(item => [item.id, item.name] as const),
    [CRISP_RUNTIME_ID, 'CrispASR 0.8.43 · Vulkan'] as const,
  ])
  const runtimeBytes = runtimeIds.reduce((sum, id) => {
    const recipe = engineOptions.find(item => item.id === id)
    if (recipe) return sum + recipe.wheel.bytes + recipe.companions.reduce((total, file) => total + file.bytes, 0)
    if (id === CRISP_RUNTIME_ID) return sum + CRISP_RUNTIME_FILES.reduce((total, file) => total + file.bytes, 0)
    const archive = llamaOptions.find(item => item.id === id)
    return sum + (archive?.bytes ?? 0) + (archive?.companions ?? []).reduce((total, file) => total + file.bytes, 0)
  }, 0)
  const estimatedBytes = runtimeBytes + selected.reduce((sum, item) => sum + (item.downloadBytes ?? item.installedBytes), 0)
  const valid = modelIds.length + runtimeIds.length > 0
  const updateLoader = (setter: (value: string) => void, value: string) => {
    setter(value)
    setRecognition('')
    setTranslation('')
  }
  const task = state.task
  const running = task?.state === 'running'
  const title = state.mode === 'model' ? 'modelImport' : state.mode === 'prepare' || (task && state.workflow === 'bundle-prepare') ? 'prepare' : 'bundleImport'
  const completedModelImport = state.mode === 'model' && task?.state === 'completed'
  const loaderName = (loader: string) => loader === 'pytorch' ? 'PyTorch' : loader === 'crisp' ? 'CrispASR' : 'llama.cpp'
  const modelPicker = (kind: 'recognitionModel' | 'translationModel', value: string, onChange: (value: string) => void, label: string) => {
    const options = resources.filter(item => item.kind === kind && !item.resourceId.startsWith('hub:'))
    const current = options.find(item => item.resourceId === value && supportsModel(item))
    const loaders = (item: ResourceRecord) => modelEngines(item).map(loaderName).join(' / ')
    const itemClass = 'flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-overlay-foreground data-[highlighted]:bg-surface-tertiary data-[selected]:bg-accent-soft aria-disabled:opacity-50'
    return <Select value={current?.resourceId ?? 'none'} onValueChange={key => { if (typeof key === 'string') onChange(key === 'none' ? '' : key) }}>
      <div className="flex w-full flex-col gap-1">
        <SelectFieldLabel className="w-fit text-sm font-medium text-foreground">{label}</SelectFieldLabel>
        <SelectTrigger className="select__trigger w-full">
          <SelectValue className="select__value">{selected => {
            const item = options.find(option => option.resourceId === selected)
            return item ? <span className="offline-model-option"><span>{item.name}</span><LoaderChip loaders={loaders(item)} className="ms-auto" /></span> : t('offline.none')
          }}</SelectValue>
        </SelectTrigger>
      </div>
      <SelectContent className="offline-model-popover max-h-72 overflow-auto rounded-xl border border-border bg-overlay p-1 text-overlay-foreground shadow-overlay">
        <SelectGroup className="flex flex-col">
          <SelectItem value="none" className={itemClass}>{t('offline.none')}</SelectItem>
          {options.map(item => <SelectItem key={item.resourceId} value={item.resourceId} disabled={!supportsModel(item)} className={itemClass}>
            <span className="offline-model-option"><Label className="text-sm">{item.name}</Label><LoaderChip loaders={loaders(item)} className="ms-auto" /></span>
          </SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  }
  const previewModelNames = state.preview?.items.map(item => resources.find(resource => resource.resourceId === item.id)?.name ?? item.name).join(' · ') ?? ''
  const modelPreview = state.preview ? <section className="model-import-preview" aria-label={t('offline.inspectPath')}>
    <dl className="model-import-space">
      <div><dt>{t('offline.modelChoice')}</dt><dd>{previewModelNames}</dd></div>
      <div><dt>{t('offline.requiredSpace')}</dt><dd>{bytes(state.preview.totalBytes)}</dd></div>
      {state.preview.availableBytes !== undefined ? <div><dt>{t('offline.availableSpace')}</dt><dd>{bytes(state.preview.availableBytes)}</dd></div> : null}
    </dl>
    {state.preview.items.some(item => { const record = resources.find(resource => resource.resourceId === item.id); return record && modelEngines(record).some(engine => runtimes?.local[engine === 'pytorch' ? 'engine' : engine === 'crisp' ? 'crisp' : 'llama']?.status !== 'ready') }) ? <p role="status">{t('offline.missingRuntime')}</p> : null}
  </section> : null
  return <Dialog open={visible} onOpenChange={open => { if (!open) offlineActions.close() }}>
    <DialogContent ref={popupRef} initialFocus={popupRef} className={state.mode === 'model' ? 'model-import-dialog max-w-lg' : 'offline-dialog max-w-lg'}>
    <DialogCloseButton aria-label={t('offline.close')} />
      <DialogHeader>
        <div className="model-import-heading"><DialogTitle>{t(`offline.${title}`)}</DialogTitle><ImportHelp label={t('offline.importInfo')}>{t(state.mode === 'model' ? 'offline.modelHelp' : state.mode === 'prepare' ? 'offline.packageHelp' : 'offline.readyHelp')}</ImportHelp></div>
        {state.mode === 'prepare' && !task ? <ol className="offline-wizard-steps" aria-label={t('offline.prepare')}>
          {(['dependencies', 'modelChoice', 'confirm'] as const).map((key, index) => <li key={key} data-active={step === index} data-completed={step > index} aria-current={step === index ? 'step' : undefined}><span>{index + 1}</span>{t(`offline.${key}`)}</li>)}
        </ol> : null}
      </DialogHeader>
      <div className="offline-body">
        {!state.available && state.mode !== 'model' ? <p>{t('offline.unavailable')}</p> : task && task.state !== 'idle' ? <div className="offline-task">
        <OfflineTaskProgress task={task} workflow={state.workflow} />
        {task.outputPath ? <Button variant="secondary" onClick={() => void offlineActions.openOutput()}>{t('offline.output')}</Button> : null}
      </div> : state.mode === 'prepare' ? <>
        {step === 0 ? <div className="offline-loader-fields">
          <SettingsRow label="PyTorch"><SettingSelect value={engine} onChange={value => updateLoader(setEngine, value)} ariaLabel="PyTorch" options={[{ value: '', label: t('offline.none') }, ...engineOptions.map(item => ({ value: item.id, label: item.name }))]} /></SettingsRow>
          <SettingsRow label="llama.cpp"><SettingSelect value={llama} onChange={value => updateLoader(setLlama, value)} ariaLabel="llama.cpp" options={[{ value: '', label: t('offline.none') }, ...llamaOptions.map(item => ({ value: item.id, label: item.name }))]} /></SettingsRow>
          <SettingsRow label="CrispASR"><SettingSelect value={crisp} onChange={value => updateLoader(setCrisp, value)} ariaLabel="CrispASR" options={[{ value: '', label: t('offline.none') }, { value: CRISP_RUNTIME_ID, label: '0.8.43 · Vulkan' }]} /></SettingsRow>
        </div> : null}
        {step === 1 ? <div className="offline-model-fields"><div className="model-import-section-heading"><Label className="text-sm">{t('offline.modelChoice')}</Label><ImportHelp label={t('offline.modelChoice')}>{t('offline.loaderRequired')}</ImportHelp></div>
          {modelPicker('recognitionModel', recognition, setRecognition, t('offline.recognition'))}
          {modelPicker('translationModel', translation, setTranslation, t('offline.translation'))}
        </div> : null}
        {step === 2 ? <><ul className="offline-items">{runtimeIds.map(id => <li key={id}><strong>{runtimeNames.get(id)}</strong></li>)}{selected.map(item => <li key={item.resourceId}><div className="offline-model-option"><strong>{item.name}</strong><LoaderChip loaders={modelEngines(item).map(loaderName).join(' / ')} className="ms-auto" /></div><span>{bytes(item.downloadBytes ?? item.installedBytes)}</span></li>)}</ul>
          <SettingsRow label={t('offline.archiveFormat')}><LoaderChip loaders="ZIP" /></SettingsRow>
          <SettingsRow label={t('offline.estimatedSize')} desc={t('offline.estimatedHelp')} descriptionTooltip><span>{bytes(estimatedBytes)}</span></SettingsRow>
        </> : null}
      </> : <>
        {state.mode === 'model' ? <ModelImportPanel>{modelPreview}</ModelImportPanel> : <><div className="offline-actions"><Button variant="secondary" disabled={state.busy} onClick={() => void offlineActions.pickBundle()}><BusyIcon busy={state.busy} />{t('offline.selectBundle')}</Button></div></>}
        {state.mode !== 'model' ? state.preview ? <><ul className="offline-items">{state.preview.items.map(item => <li key={item.id}><div><strong>{resources.find(resource => resource.resourceId === item.id)?.name ?? item.name}</strong><p className="nola-caption text-muted">{t(`offline.${item.status}`)} · {bytes(item.bytes)}</p>{item.reason || item.files?.length ? <ImportHelp label={t('offline.importInfo')}>{item.reason}{item.files?.length ? <ul>{item.files.map(file => <li key={file}>{file}</li>)}</ul> : null}</ImportHelp> : null}</div></li>)}</ul><SettingsRow label={t('offline.requiredSpace')}><span>{bytes(state.preview.totalBytes)}</span></SettingsRow>{state.preview.availableBytes !== undefined ? <SettingsRow label={t('offline.availableSpace')}><span>{bytes(state.preview.availableBytes)}</span></SettingsRow> : null}</> : null : null}
      </>}
      </div>
      {!completedModelImport && (state.mode !== 'model' || task || state.preview) ? <DialogFooter>
      {state.mode === 'model' && state.preview && !task ? <Button variant="secondary" disabled={state.busy} onClick={() => offlineActions.clearPreview()}>{t('offline.retry')}</Button> : <Button variant="secondary" onClick={() => offlineActions.close()}>{t(running ? 'offline.background' : 'offline.close')}</Button>}
      {running ? <Button variant="secondary" onClick={() => void offlineActions.cancel()}>{t('offline.cancel')}</Button> : task && task.state !== 'idle' ? <Button variant="secondary" onClick={() => offlineActions.reset()}>{t('offline.retry')}</Button> : state.available && state.mode === 'prepare' ? <>{step > 0 ? <Button variant="secondary" onClick={() => setStep(step - 1)}>{t('offline.back')}</Button> : null}<Button variant="default" disabled={state.busy || (step > 0 && !valid)} onClick={() => step < 2 ? setStep(step + 1) : void offlineActions.prepare({ modelIds, runtimeIds })}><BusyIcon busy={state.busy} />{t(step === 2 ? 'offline.start' : 'offline.next')}</Button></> : state.available && state.preview ? <Button variant="default" disabled={state.busy || !state.preview.compatible || !!state.preview.issues.length} onClick={() => void offlineActions.install()}><BusyIcon busy={state.busy} />{t('offline.install')}</Button> : null}
    </DialogFooter> : null}
    </DialogContent>
  </Dialog>
}
