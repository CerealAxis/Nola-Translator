import { useEffect, useState } from 'react'
import { Button, Chip, Label, ListBox, Modal, Select } from '@heroui/react'
import { FolderInput, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { stores, useStore } from '@/store'
import { offlineActions, offlineStore } from '@/store/offlineStore'
import { SettingSelect } from '../settings/SettingsPage'
import { SettingsRow } from '../settings/SettingsRow'
import { SettingGroup } from '../settings/SettingsPage'
import { CRISP_RUNTIME_ID, CRISP_RUNTIME_FILES } from '../../../shared/compute'
import type { ResourceRecord } from '../../../shared/contracts'
import { modelEngines } from '../../../shared/model-engines'
import { dismissNotice, notifyError } from '@/components/primitives/notify'
import { ImportHelp, ModelImportPanel } from './ModelImportPanel'
import { OfflineTaskProgress } from './OfflineTaskProgress'
import './offline.css'

function bytes(value: number): string { return `${(value / 1024 ** 3).toFixed(2)} GB` }
export function LocalModelImport() {
  const { t } = useI18n()
  return <><Button className="offline-import-button" variant="secondary" onPress={() => { offlineActions.reset(); offlineActions.open('model') }}><FolderInput aria-hidden="true" />{t('offline.modelImport')}</Button><OfflineDialog scope="model" /></>
}
export function OfflineResources() {
  const { t } = useI18n()
  const task = useStore(offlineStore, state => state.task)
  return <><SettingGroup legend={t('offline.title')}><SettingsRow label={t('offline.packageContents')} desc={t('offline.description')} descriptionTooltip>
    <div className="offline-actions"><Button variant="secondary" onPress={() => { offlineActions.reset(); offlineActions.open('prepare') }}>{t('offline.prepare')}</Button>
      <Button variant="secondary" onPress={() => { offlineActions.reset(); void offlineActions.pickBundle() }}>{t('offline.bundleImport')}</Button></div>
  </SettingsRow>{task ? <SettingsRow label={t('offline.task')}><Button variant="secondary" onPress={() => offlineActions.open('bundle')}>{t(`offline.${task.state === 'running' ? task.phase : task.state === 'idle' ? 'ready' : task.state}`)}</Button></SettingsRow> : null}</SettingGroup><OfflineDialog scope="runtime" /></>
}
export interface OfflineDialogProps { scope: 'model' | 'runtime' }

/**
 * The failure that was announced, and the notice that announced it.
 *
 * They live outside the dialog: the dialog belongs to the page that opened it, and a
 * failure that is still in the store would be announced a second time by the next
 * dialog that mounts.
 */
let announcedFailure: unknown = null
let announcedNotice: string | null = null

export function OfflineDialog({ scope }: OfflineDialogProps) {
  const { t } = useI18n()
  const state = useStore(offlineStore, value => value)
  useEffect(() => {
    const preview = state.preview
    const task = state.task
    const failure = preview && !preview.compatible ? preview : task?.state === 'failed' ? task : state.failed ? 'failed' : null
    if (!failure) {
      announcedFailure = null
      /*
       * An error notice never leaves on its own, so a failure that is dealt with would
       * keep crying on the screen. The retry that cleared it takes the notice down.
       */
      if (announcedNotice) { dismissNotice(announcedNotice); announcedNotice = null }
      return
    }
    if (announcedFailure === failure) return
    announcedFailure = failure
    /*
     * A failure here has no way out of its own: the modal's footer offers a
     * fresh start, and the notice says so too, so a user who only sees the
     * notice can still recover.
     */
    const retry = {
      label: t('offline.retry'),
      onPress: () => {
        offlineActions.reset()
        if (announcedNotice) { dismissNotice(announcedNotice); announcedNotice = null }
      },
    }
    // One failure at a time: the notice that is on screen is replaced, not stacked on.
    if (announcedNotice) dismissNotice(announcedNotice)
    if (failure === 'failed') { announcedNotice = notifyError(t('offline.failed'), { action: retry }); return }
    const issue = preview && failure === preview ? preview.issues[0] : task?.issue
    announcedNotice = notifyError(t(`offline.${issue ?? 'failed'}`), {
      description: task?.reason ?? preview?.items.find(item => item.reason)?.reason,
      action: retry,
    })
    /*
     * `state.failed` is one of the three sources of a failure, so it belongs to the
     * dependencies: without it the effect would not run when only that flag turned,
     * and the failure would go unreported.
     */
  }, [scope, state.preview, state.task, state.failed, t])
  const resources = useStore(stores.models, value => value.resources)
  const runtimes = useStore(stores.settings, value => value.runtimes)
  const [step, setStep] = useState(0)
  const [recognition, setRecognition] = useState('')
  const [translation, setTranslation] = useState('')
  const [engine, setEngine] = useState('')
  const [llama, setLlama] = useState('')
  const [crisp, setCrisp] = useState('')
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
    return <Select fullWidth aria-label={label} value={current?.resourceId ?? 'none'}
      disabledKeys={options.filter(item => !supportsModel(item)).map(item => item.resourceId)}
      onChange={key => { if (typeof key === 'string') onChange(key === 'none' ? '' : key) }}>
      <Label>{label}</Label><Select.Trigger><Select.Value>{current ? <span className="offline-model-option"><span>{current.name}</span><Chip size="sm" variant="soft">{modelEngines(current).map(loaderName).join(' / ')}</Chip></span> : t('offline.none')}</Select.Value><Select.Indicator /></Select.Trigger>
      <Select.Popover className="offline-model-popover"><ListBox>
        <ListBox.Item id="none" textValue={t('offline.none')}>{t('offline.none')}<ListBox.ItemIndicator /></ListBox.Item>
        {options.map(item => <ListBox.Item key={item.resourceId} id={item.resourceId} textValue={item.name}>
          <span className="offline-model-option"><Label>{item.name}</Label><Chip size="sm" variant="soft">{modelEngines(item).map(loaderName).join(' / ')}</Chip></span><ListBox.ItemIndicator />
        </ListBox.Item>)}
      </ListBox></Select.Popover>
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
  return <Modal.Backdrop isOpen={visible} onOpenChange={open => { if (!open) offlineActions.close() }} className="z-overlay"><Modal.Container size="lg" placement="center" scroll="inside"><Modal.Dialog className={state.mode === 'model' ? 'model-import-dialog' : 'offline-dialog'}>
    <Modal.CloseTrigger aria-label={t('offline.close')}><X aria-hidden="true" /></Modal.CloseTrigger>
    <Modal.Header><div className="model-import-heading"><Modal.Heading>{t(`offline.${title}`)}</Modal.Heading><ImportHelp label={t('offline.importInfo')}>{t(state.mode === 'model' ? 'offline.modelHelp' : state.mode === 'prepare' ? 'offline.packageHelp' : 'offline.readyHelp')}</ImportHelp></div>
      {state.mode === 'prepare' && !task ? <ol className="offline-wizard-steps" aria-label={t('offline.prepare')}>
        {(['dependencies', 'modelChoice', 'confirm'] as const).map((key, index) => <li key={key} data-active={step === index} data-completed={step > index} aria-current={step === index ? 'step' : undefined}><span>{index + 1}</span>{t(`offline.${key}`)}</li>)}
      </ol> : null}
    </Modal.Header>
    <Modal.Body className="offline-body">
      {!state.available && state.mode !== 'model' ? <p>{t('offline.unavailable')}</p> : task && task.state !== 'idle' ? <div className="offline-task">
        <OfflineTaskProgress task={task} workflow={state.workflow} />
        {task.outputPath ? <Button variant="secondary" onPress={() => void offlineActions.openOutput()}>{t('offline.output')}</Button> : null}
      </div> : state.mode === 'prepare' ? <>
        {step === 0 ? <div className="offline-loader-fields">
          <SettingsRow label="PyTorch"><SettingSelect value={engine} onChange={value => updateLoader(setEngine, value)} ariaLabel="PyTorch" options={[{ value: '', label: t('offline.none') }, ...engineOptions.map(item => ({ value: item.id, label: item.name }))]} /></SettingsRow>
          <SettingsRow label="llama.cpp"><SettingSelect value={llama} onChange={value => updateLoader(setLlama, value)} ariaLabel="llama.cpp" options={[{ value: '', label: t('offline.none') }, ...llamaOptions.map(item => ({ value: item.id, label: item.name }))]} /></SettingsRow>
          <SettingsRow label="CrispASR"><SettingSelect value={crisp} onChange={value => updateLoader(setCrisp, value)} ariaLabel="CrispASR" options={[{ value: '', label: t('offline.none') }, { value: CRISP_RUNTIME_ID, label: '0.8.43 · Vulkan' }]} /></SettingsRow>
        </div> : null}
        {step === 1 ? <div className="offline-model-fields"><div className="model-import-section-heading"><Label>{t('offline.modelChoice')}</Label><ImportHelp label={t('offline.modelChoice')}>{t('offline.loaderRequired')}</ImportHelp></div>
          {modelPicker('recognitionModel', recognition, setRecognition, t('offline.recognition'))}
          {modelPicker('translationModel', translation, setTranslation, t('offline.translation'))}
        </div> : null}
        {step === 2 ? <><ul className="offline-items">{runtimeIds.map(id => <li key={id}><strong>{runtimeNames.get(id)}</strong></li>)}{selected.map(item => <li key={item.resourceId}><div className="offline-model-option"><strong>{item.name}</strong><Chip size="sm" variant="soft">{modelEngines(item).map(loaderName).join(' / ')}</Chip></div><span>{bytes(item.downloadBytes ?? item.installedBytes)}</span></li>)}</ul>
          <SettingsRow label={t('offline.archiveFormat')}><Chip size="sm" variant="soft">ZIP</Chip></SettingsRow>
          <SettingsRow label={t('offline.estimatedSize')} desc={t('offline.estimatedHelp')} descriptionTooltip><span>{bytes(estimatedBytes)}</span></SettingsRow>
        </> : null}
      </> : <>
        {state.mode === 'model' ? <ModelImportPanel>{modelPreview}</ModelImportPanel> : <><div className="offline-actions"><Button variant="secondary" isPending={state.busy} onPress={() => void offlineActions.pickBundle()}>{t('offline.selectBundle')}</Button></div></>}
        {state.mode !== 'model' ? state.preview ? <><ul className="offline-items">{state.preview.items.map(item => <li key={item.id}><div><strong>{resources.find(resource => resource.resourceId === item.id)?.name ?? item.name}</strong><p className="nola-caption text-muted">{t(`offline.${item.status}`)} · {bytes(item.bytes)}</p>{item.reason || item.files?.length ? <ImportHelp label={t('offline.importInfo')}>{item.reason}{item.files?.length ? <ul>{item.files.map(file => <li key={file}>{file}</li>)}</ul> : null}</ImportHelp> : null}</div></li>)}</ul><SettingsRow label={t('offline.requiredSpace')}><span>{bytes(state.preview.totalBytes)}</span></SettingsRow>{state.preview.availableBytes !== undefined ? <SettingsRow label={t('offline.availableSpace')}><span>{bytes(state.preview.availableBytes)}</span></SettingsRow> : null}</> : null : null}
      </>}
    </Modal.Body>{!completedModelImport && (state.mode !== 'model' || task || state.preview) ? <Modal.Footer>
      {state.mode === 'model' && state.preview && !task ? <Button variant="secondary" isDisabled={state.busy} onPress={() => offlineActions.clearPreview()}>{t('offline.retry')}</Button> : <Button variant="secondary" onPress={() => offlineActions.close()}>{t(running ? 'offline.background' : 'offline.close')}</Button>}
      {running ? <Button variant="secondary" onPress={() => void offlineActions.cancel()}>{t('offline.cancel')}</Button> : task && task.state !== 'idle' ? <Button variant="secondary" onPress={() => offlineActions.reset()}>{t('offline.retry')}</Button> : state.available && state.mode === 'prepare' ? <>{step > 0 ? <Button variant="secondary" onPress={() => setStep(step - 1)}>{t('offline.back')}</Button> : null}<Button variant="primary" isPending={state.busy} isDisabled={step > 0 && !valid} onPress={() => step < 2 ? setStep(step + 1) : void offlineActions.prepare({ modelIds, runtimeIds })}>{t(step === 2 ? 'offline.start' : 'offline.next')}</Button></> : state.available && state.preview ? <Button variant="primary" isPending={state.busy} isDisabled={!state.preview.compatible || !!state.preview.issues.length} onPress={() => void offlineActions.install()}>{t('offline.install')}</Button> : null}
    </Modal.Footer> : null}
  </Modal.Dialog></Modal.Container></Modal.Backdrop>
}
