import { useEffect, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Button, InputGroup, Label, ListBox, Select, Tabs, Tooltip } from '@heroui/react'
import { CircleHelp } from 'lucide-react'
import { useI18n } from '@/i18n'
import { offlineActions, offlineStore } from '@/store/offlineStore'
import { useStore } from '@/store'
import { MODEL_IMPORT_CATALOG, modelImportEntry } from '../../../shared/model-import-catalog'
import { downloadSourcesFor } from '../../../shared/model-download-sources'
import type { ModelDownloadSource } from '../../../shared/contracts'

export interface ImportHelpProps { label: string; children: ReactNode }
export function ImportHelp({ label, children }: ImportHelpProps) {
  return <Tooltip delay={250}>
    <Tooltip.Trigger<'button'> render={props => <Button {...(props as ComponentProps<typeof Button>)} variant="secondary" size="sm" isIconOnly />} aria-label={label} className="model-import-help settings-row__help"><CircleHelp aria-hidden="true" /></Tooltip.Trigger>
    <Tooltip.Content className="z-overlay model-import-tooltip settings-row__tooltip">{children}</Tooltip.Content>
  </Tooltip>
}

export interface ModelImportPanelProps { children?: ReactNode }
export function ModelImportPanel({ children }: ModelImportPanelProps) {
  const { t } = useI18n()
  const { busy, downloadModelId, preview, available, task, destination } = useStore(offlineStore, state => state)
  const [view, setView] = useState('import')
  const [modelId, setModelId] = useState(MODEL_IMPORT_CATALOG[0]?.id ?? '')
  const [importPath, setImportPath] = useState(preview?.sourcePath ?? '')
  const [savePath, setSavePath] = useState(destination?.label ?? '')
  useEffect(() => { if (preview?.sourcePath) setImportPath(preview.sourcePath) }, [preview?.sourcePath])
  useEffect(() => { if (destination) setSavePath(destination.label) }, [destination])
  const [source, setSource] = useState<ModelDownloadSource>('huggingface')
  useEffect(() => {
    if (downloadModelId) { setModelId(downloadModelId); setView('download') }
    else setView('import')
  }, [downloadModelId])
  const model = modelImportEntry(modelId)
  const sources = downloadSourcesFor(modelId).filter(option => model?.sources[option.source])
  const selectedSource = model?.sources[source] ? source : 'huggingface'
  const files = model?.sources[selectedSource]
  return <Tabs selectedKey={view} onSelectionChange={key => { setView(String(key)); offlineActions.clearPreview() }} variant="secondary" className="model-import-tabs">
    <Tabs.ListContainer><Tabs.List aria-label={t('offline.modelImport')}>
      <Tabs.Tab id="import">{t('offline.importTab')}<Tabs.Indicator /></Tabs.Tab>
      <Tabs.Tab id="download">{t('offline.manualDownload')}<Tabs.Indicator /></Tabs.Tab>
    </Tabs.List></Tabs.ListContainer>
    <Tabs.Panel id="import" className="model-import-panel">
      <div className="model-import-path-row">
        <div className="model-import-section-heading"><Label>{t('offline.modelPath')}</Label><ImportHelp label={t('offline.modelPath')}>{t('offline.modelHelp')}</ImportHelp></div>
        <div className="model-import-path-controls">
          <InputGroup className="model-import-path-input">
            <InputGroup.Input value={importPath} disabled={!available || busy} aria-label={t('offline.modelPath')} placeholder={t('offline.pathPlaceholder')}
              onChange={event => { setImportPath(event.target.value); offlineActions.clearPreview() }}
              onKeyDown={event => { if (event.key === 'Enter' && importPath.trim()) void offlineActions.selectModel('directory', undefined, importPath.trim()) }} />
          </InputGroup>
          <Button variant="secondary" className="model-import-path" isDisabled={!available || busy} onPress={() => void offlineActions.selectModel('directory')}>{t('offline.choosePath')}</Button>
        </div>
      </div>
      {!preview ? <Button variant="primary" className="model-import-download" isDisabled={!available || busy || !importPath.trim()} onPress={() => void offlineActions.selectModel('directory', undefined, importPath.trim())}>{t('offline.inspectPath')}</Button> : null}
      {children}
    </Tabs.Panel>
    <Tabs.Panel id="download" className="model-import-panel">
      <div className="model-import-selectors">
        <Select value={modelId} onChange={value => { if (typeof value === 'string') setModelId(value) }} fullWidth aria-label={t('offline.modelChoice')}>
          <Label>{t('offline.modelChoice')}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover><ListBox>{MODEL_IMPORT_CATALOG.map(item => <ListBox.Item key={item.id} id={item.id} textValue={item.name}>{item.name}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover>
        </Select>
        <Select value={selectedSource} onChange={value => { if (value === 'huggingface' || value === 'hf-mirror' || value === 'modelscope') setSource(value) }} fullWidth aria-label={t('offline.downloadSource')}>
          <Label>{t('offline.downloadSource')}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover><ListBox>{sources.map(option => <ListBox.Item key={option.source} id={option.source} textValue={t(option.labelKey)}>{t(option.labelKey)}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover>
        </Select>
      </div>
      <div className="model-import-path-row">
        <div className="model-import-section-heading"><strong>{t('offline.savePath')}</strong>
        <ImportHelp label={t('offline.downloadInfo')}><p>{t('offline.downloadHelp')}</p>{files ? <p>{t('offline.requiredFiles')} · {files.files.length}<br />{t('offline.versionInfo')}<br /><code>{files.revision}</code></p> : null}</ImportHelp>
        </div>
        <div className="model-import-path-controls">
          <InputGroup className="model-import-path-input">
            <InputGroup.Input value={savePath} disabled={busy || task?.state === 'running'} onChange={event => { setSavePath(event.target.value); offlineActions.clearDestination() }} aria-label={t('offline.savePath')} placeholder={t('offline.pathPlaceholder')} />
          </InputGroup>
          <Button variant="secondary" className="model-import-path" isDisabled={busy || task?.state === 'running'} onPress={() => void offlineActions.selectDestination()}>{t('offline.choosePath')}</Button>
        </div>
        <span className="nola-micro text-muted">{t('offline.pathAfterChoose')}</span>
      </div>
      {!task || task.state === 'idle' || task.state === 'failed' || task.state === 'cancelled' ? <Button variant="primary" className="model-import-download" isDisabled={!available || !model || !files || !savePath.trim() || busy} isPending={busy} onPress={() => { if (task?.state === 'failed' || task?.state === 'cancelled') offlineActions.reset(); void offlineActions.downloadModel(modelId, selectedSource, savePath.trim()) }}>{t('offline.downloadModel')}</Button> : null}
    </Tabs.Panel>
  </Tabs>
}
