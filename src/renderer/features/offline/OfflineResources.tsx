import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Label, Modal, Spinner, toast } from '@heroui/react'
import { FolderInput, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { stores, useStore } from '@/store'
import { offlineActions, offlineStore } from '@/store/offlineStore'
import { SettingSelect } from '../settings/SettingsPage'
import { SettingsRow } from '../settings/SettingsRow'
import { SettingGroup } from '../settings/SettingsPage'
import { modelEngines } from '../../../shared/model-engines'
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
  return <><SettingGroup legend={t('offline.title')}><SettingsRow label={t('offline.description')}>
    <div className="offline-actions"><Button variant="secondary" onPress={() => { offlineActions.reset(); offlineActions.open('prepare') }}>{t('offline.prepare')}</Button>
      <Button variant="secondary" onPress={() => { offlineActions.reset(); offlineActions.open('bundle') }}>{t('offline.bundleImport')}</Button></div>
  </SettingsRow>{task ? <SettingsRow label={t('offline.task')}><Button variant="secondary" onPress={() => offlineActions.open('bundle')}>{t(`offline.${task.state === 'running' ? task.phase : task.state === 'idle' ? 'ready' : task.state}`)}</Button></SettingsRow> : null}</SettingGroup><OfflineDialog scope="runtime" /></>
}
export interface OfflineDialogProps { scope: 'model' | 'runtime' }
export function OfflineDialog({ scope }: OfflineDialogProps) {
  const { t } = useI18n()
  const state = useStore(offlineStore, value => value)
  const notice = useRef<unknown>(null)
  useEffect(() => {
    if (scope !== 'model') return
    const preview = state.preview
    const task = state.task
    const failure = preview && !preview.compatible ? preview : task?.state === 'failed' ? task : null
    if (!failure || notice.current === failure) return
    notice.current = failure
    const issue = preview && failure === preview ? preview.issues[0] : task?.issue
    toast.danger(t(`offline.${issue ?? 'failed'}`), { description: task?.reason ?? preview?.items.find(item => item.reason)?.reason })
  }, [scope, state.preview, state.task, t])
  const resources = useStore(stores.models, value => value.resources)
  const settings = useStore(stores.settings, value => value.settings)
  const runtimes = useStore(stores.settings, value => value.runtimes)
  const [step, setStep] = useState(0)
  const [recognition, setRecognition] = useState('')
  const [translation, setTranslation] = useState('')
  const [include, setInclude] = useState(true)
  const [target, setTarget] = useState('current')
  const [hardware, setHardware] = useState('cpu')
  const [engine, setEngine] = useState('')
  const [llama, setLlama] = useState('')
  const visible = state.mode !== null && (scope === 'model' ? state.mode === 'model' : state.mode !== 'model')
  useEffect(() => {
    if (!visible) return
    setStep(0)
    setInclude(true)
    setTarget('current')
    setHardware('cpu')
    setEngine('')
    setLlama('')
    const known = (id: string | undefined) => resources.some(resource => resource.resourceId === id && !id?.startsWith('hub:')) ? id ?? '' : ''
    setRecognition(!settings?.recognition.provider || settings.recognition.provider === 'local' ? known(settings?.recognition.modelId) : '')
    setTranslation(settings?.translation.provider === 'local' ? known(settings.translation.localModelId) : '')
  }, [visible])
  const modelIds = [recognition, translation].filter(Boolean)
  const selected = resources.filter(resource => modelIds.includes(resource.resourceId))
  const needsEngine = !selected.length || selected.some(resource => modelEngines(resource).includes('pytorch'))
  const needsLlama = !selected.length || selected.some(resource => modelEngines(resource).includes('llama'))
  const engineOptions = runtimes?.recipes.filter(item => target === 'current' || item.backend === (hardware === 'vulkan' ? 'cpu' : hardware)) ?? []
  const llamaOptions = runtimes?.packages.filter(item => target === 'current' || item.backend === (hardware === 'directml' ? 'cpu' : hardware === 'xpu' ? 'sycl' : hardware)) ?? []
  const preferredEngine = runtimes?.local.engine.status === 'ready' ? runtimes.local.engine.id : runtimes?.recommendation.engineId
  const preferredLlama = runtimes?.local.llama.status === 'ready' ? runtimes.local.llama.id : runtimes?.recommendation.llamaId
  const engineId = engineOptions.some(item => item.id === engine) ? engine : target === 'current'
    ? engineOptions.find(item => item.id === preferredEngine)?.id ?? engineOptions.find(item => item.backend === 'cpu')?.id ?? ''
    : engineOptions[0]?.id ?? ''
  const llamaId = llamaOptions.some(item => item.id === llama) ? llama : target === 'current'
    ? llamaOptions.find(item => item.id === preferredLlama)?.id ?? llamaOptions.find(item => item.backend === 'cpu')?.id ?? ''
    : llamaOptions[0]?.id ?? ''
  const runtimeIds = include ? [needsEngine ? engineId : '', needsLlama ? llamaId : ''].filter(Boolean) : []
  const runtimeBytes = runtimeIds.reduce((sum, id) => {
    const recipe = runtimes?.recipes.find(item => item.id === id)
    if (recipe) return sum + recipe.wheel.bytes + recipe.companions.reduce((total, file) => total + file.bytes, 0)
    const archive = runtimes?.packages.find(item => item.id === id)
    return sum + (archive?.bytes ?? 0) + (archive?.companions ?? []).reduce((total, file) => total + file.bytes, 0)
  }, 0)
  const estimatedBytes = runtimeBytes + selected.reduce((sum, item) => sum + (item.downloadBytes ?? item.installedBytes), 0)
  const valid = !!(modelIds.length + runtimeIds.length) && (!include || ((!needsEngine || !!engineId) && (!needsLlama || !!llamaId)))
  const task = state.task
  const running = task?.state === 'running'
  const title = state.mode === 'model' ? 'modelImport' : state.mode === 'prepare' ? 'prepare' : 'bundleImport'
  const modelOptions = (kind: 'recognitionModel' | 'translationModel') => [{ value: '', label: t('offline.none') }, ...resources.filter(item => item.kind === kind && !item.resourceId.startsWith('hub:')).map(item => ({ value: item.resourceId, label: item.name }))]
  const modelPreview = state.preview ? <section className="model-import-preview" aria-label={t('offline.inspectPath')}>
    <ul className="model-import-results">{state.preview.items.map(item => <li key={item.id}>
      <strong>{resources.find(resource => resource.resourceId === item.id)?.name ?? item.name}</strong>
      <span className="nola-caption text-muted">{t(`offline.${item.status}`)} · {bytes(item.bytes)}</span>
      {item.issue ? <p role="alert">{t(`offline.${item.issue}`)}</p> : null}
      {item.reason ? <p className="nola-caption text-muted">{item.reason}</p> : null}
      {item.files?.length ? <ul>{item.files.map(file => <li key={file}>{file}</li>)}</ul> : null}
    </li>)}</ul>
    <dl className="model-import-space">
      <div><dt>{t('offline.requiredSpace')}</dt><dd>{bytes(state.preview.totalBytes)}</dd></div>
      {state.preview.availableBytes !== undefined ? <div><dt>{t('offline.availableSpace')}</dt><dd>{bytes(state.preview.availableBytes)}</dd></div> : null}
    </dl>
    {state.preview.items.some(item => { const record = resources.find(resource => resource.resourceId === item.id); return record && modelEngines(record).some(engine => runtimes?.local[engine === 'pytorch' ? 'engine' : 'llama'].status !== 'ready') }) ? <p role="status">{t('offline.missingRuntime')}</p> : null}
    {state.preview.issues.map(issue => <p key={issue} role="alert">{t(`offline.${issue}`)}</p>)}
  </section> : null
  return <Modal.Backdrop isOpen={visible} onOpenChange={open => { if (!open) offlineActions.close() }} className="z-overlay"><Modal.Container size="lg" placement="center" scroll="inside"><Modal.Dialog className={state.mode === 'model' ? 'model-import-dialog' : undefined}>
    {state.mode === 'model' ? <Modal.CloseTrigger aria-label={t('offline.close')}><X aria-hidden="true" /></Modal.CloseTrigger> : null}
    <Modal.Header><div className="model-import-heading"><Modal.Heading>{t(`offline.${title}`)}</Modal.Heading>{state.mode === 'model' ? <ImportHelp label={t('offline.importInfo')}>{t('offline.modelHelp')}</ImportHelp> : null}</div>{state.mode === 'prepare' && !task ? <p className="nola-caption text-muted">{t(`offline.${(['resources', 'target', 'confirm'] as const)[step]}`)} · {step + 1} / 3</p> : null}</Modal.Header>
    <Modal.Body className="offline-body">
      {!state.available && state.mode !== 'model' ? <p>{t('offline.unavailable')}</p> : task && task.state !== 'idle' ? <div className="offline-task">
        <OfflineTaskProgress task={task} workflow={state.workflow} />
        {task.outputPath ? <Button variant="secondary" onPress={() => void offlineActions.openOutput()}>{t('offline.output')}</Button> : null}
      </div> : state.mode === 'prepare' ? <>
        {step === 0 ? <><SettingsRow label={t('offline.recognition')}><SettingSelect value={recognition} options={modelOptions('recognitionModel')} ariaLabel={t('offline.recognition')} onChange={setRecognition} /></SettingsRow>
          <SettingsRow label={t('offline.translation')}><SettingSelect value={translation} options={modelOptions('translationModel')} ariaLabel={t('offline.translation')} onChange={setTranslation} /></SettingsRow>
          <p className="nola-caption text-muted">{t('offline.runtimeOnly')}</p><Checkbox isSelected={include} onChange={setInclude}><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Checkbox.Content><Label>{t('offline.includeRuntime')}</Label></Checkbox.Content></Checkbox></> : null}
        {step === 1 ? <><SettingSelect value={target} onChange={value => { setTarget(value); setEngine(''); setLlama('') }} ariaLabel={t('offline.target')} options={['current', 'other'].map(value => ({ value, label: t(`offline.${value === 'current' ? 'current' : 'other'}`) }))} />
          <p className="nola-caption text-muted">{t('offline.targetHelp')}</p>
          {target === 'other' ? <SettingsRow label={t('offline.hardware')}><SettingSelect value={hardware} onChange={value => { setHardware(value); setEngine(''); setLlama('') }} ariaLabel={t('offline.hardware')} options={(['cpu', 'cuda', 'xpu', 'directml', 'vulkan'] as const).map(value => ({ value, label: t(`offline.${value}`) }))} /></SettingsRow> : null}
          <p className="nola-caption text-muted">{t('offline.runtimeHelp')}</p>{!valid && include ? <p role="alert">{t('offline.incompatible')}</p> : null}
          {include ? <details><summary>{t('offline.advanced')}</summary>{needsEngine ? <SettingsRow label="PyTorch"><SettingSelect value={engineId} options={engineOptions.map(item => ({ value: item.id, label: item.name }))} ariaLabel="PyTorch" onChange={setEngine} /></SettingsRow> : null}{needsLlama ? <SettingsRow label="llama.cpp"><SettingSelect value={llamaId} options={llamaOptions.map(item => ({ value: item.id, label: item.name }))} ariaLabel="llama.cpp" onChange={setLlama} /></SettingsRow> : null}</details> : null}</> : null}
        {step === 2 ? <><ul className="offline-items">{selected.map(item => <li key={item.resourceId}><strong>{item.name}</strong><span>{bytes(item.downloadBytes ?? item.installedBytes)}</span></li>)}{runtimeIds.map(id => <li key={id}>{[...(runtimes?.recipes ?? []), ...(runtimes?.packages ?? [])].find(item => item.id === id)?.name}</li>)}</ul><SettingsRow label={t('offline.target')}><span>{t(target === 'current' ? 'offline.current' : 'offline.other')}{target === 'other' ? ` · ${hardware.toUpperCase()}` : ''}</span></SettingsRow><SettingsRow label={t('offline.estimatedSize')}><span>{bytes(estimatedBytes)}</span></SettingsRow><p className="nola-caption text-muted">{t('offline.estimatedHelp')}</p></> : null}
      </> : <>
        {state.mode === 'model' ? <><ModelImportPanel>{modelPreview}</ModelImportPanel>{state.busy ? <div className="model-import-checking" role="status"><Spinner size="sm" />{t('offline.check')}</div> : null}</> : <><p className="nola-caption text-muted">{t('offline.readyHelp')}</p><div className="offline-actions"><Button variant="secondary" isPending={state.busy} onPress={() => void offlineActions.selectBundle()}>{t('offline.selectBundle')}</Button></div></>}
        {state.mode !== 'model' ? state.preview ? <><ul className="offline-items">{state.preview.items.map(item => <li key={item.id}><div><strong>{resources.find(resource => resource.resourceId === item.id)?.name ?? item.name}</strong><p className="nola-caption text-muted">{t(`offline.${item.status}`)} · {bytes(item.bytes)}</p>{item.issue ? <p>{t(`offline.${item.issue}`)}</p> : null}{item.reason ? <p className="nola-caption text-muted">{item.reason}</p> : null}{item.files?.length ? <ul>{item.files.map(file => <li key={file}>{file}</li>)}</ul> : null}</div></li>)}</ul><SettingsRow label={t('offline.requiredSpace')}><span>{bytes(state.preview.totalBytes)}</span></SettingsRow>{state.preview.availableBytes !== undefined ? <SettingsRow label={t('offline.availableSpace')}><span>{bytes(state.preview.availableBytes)}</span></SettingsRow> : null}{state.preview.issues.map(issue => <p key={issue} role="alert">{t(`offline.${issue}`)}</p>)}</> : null : null}
      </>}
      {state.failed ? <Alert status="danger"><Alert.Content><Alert.Description>{t('offline.failed')}</Alert.Description></Alert.Content></Alert> : null}
    </Modal.Body>{state.mode !== 'model' || task || state.preview ? <Modal.Footer>
      {state.mode === 'model' && state.preview && !task ? <Button variant="secondary" isDisabled={state.busy} onPress={() => offlineActions.clearPreview()}>{t('offline.retry')}</Button> : <Button variant="secondary" onPress={() => offlineActions.close()}>{t(running ? 'offline.background' : 'offline.close')}</Button>}
      {running ? <Button variant="secondary" isPending={state.busy} onPress={() => void offlineActions.cancel()}>{t('offline.cancel')}</Button> : task && task.state !== 'idle' ? <Button variant="secondary" onPress={() => offlineActions.reset()}>{t('offline.retry')}</Button> : state.available && state.mode === 'prepare' ? <>{step > 0 ? <Button variant="secondary" onPress={() => setStep(step - 1)}>{t('offline.back')}</Button> : null}<Button variant="primary" isPending={state.busy} isDisabled={step === 0 ? !modelIds.length && !include : !valid} onPress={() => step < 2 ? setStep(step + 1) : void offlineActions.prepare({ modelIds, runtimeIds })}>{t(step === 2 ? 'offline.start' : 'offline.next')}</Button></> : state.available && state.preview ? <Button variant="primary" isPending={state.busy} isDisabled={!state.preview.compatible || !!state.preview.issues.length} onPress={() => void offlineActions.install()}>{t('offline.install')}</Button> : null}
    </Modal.Footer> : null}
  </Modal.Dialog></Modal.Container></Modal.Backdrop>
}
