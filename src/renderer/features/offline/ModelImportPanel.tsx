import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { useI18n } from '@/i18n'
import { offlineActions, offlineStore } from '@/store/offlineStore'
import { useStore } from '@/store'
import { MODEL_IMPORT_CATALOG, modelImportEntry } from '../../../shared/model-import-catalog'
import { downloadSourcesFor } from '../../../shared/model-download-sources'
import type { ModelDownloadSource } from '../../../shared/contracts'

export interface ImportHelpProps { label: string; children: ReactNode }
export function ImportHelp({ label, children }: ImportHelpProps) {
  return <Tooltip>
    <TooltipTrigger delay={250} render={<Button variant="secondary" size="icon" aria-label={label} className="model-import-help settings-row__help"><CircleHelp aria-hidden="true" /></Button>} />
    <TooltipContent  role="tooltip" className="z-popup model-import-tooltip settings-row__tooltip">{children}</TooltipContent>
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
  return <Tabs value={view} onValueChange={key => { setView(String(key)); offlineActions.clearPreview() }}  className="model-import-tabs">
    <div className="tabs__list-container"><TabsList className="tabs__list" aria-label={t('offline.modelImport')}>
      <TabsTrigger className="tabs__tab" value="import">{t('offline.importTab')}</TabsTrigger>
      <TabsTrigger className="tabs__tab" value="download">{t('offline.manualDownload')}</TabsTrigger>
    </TabsList></div>
    <TabsContent value="import" className="tabs__panel model-import-panel">
      <div className="model-import-path-row">
        <div className="model-import-section-heading"><Label>{t('offline.modelPath')}</Label><ImportHelp label={t('offline.modelPath')}>{t('offline.modelHelp')}</ImportHelp></div>
        <div className="model-import-path-controls">
          <div className="input-group model-import-path-input">
            <Input value={importPath} disabled={!available || busy} aria-label={t('offline.modelPath')} placeholder={t('offline.pathPlaceholder')}
              onChange={event => { setImportPath(event.target.value); offlineActions.clearPreview() }}
              onKeyDown={event => { if (event.key === 'Enter' && importPath.trim()) void offlineActions.selectModel('directory', undefined, importPath.trim()) }} />
          </div>
          <Button variant="secondary" className="model-import-path" disabled={!available || busy} onClick={() => void offlineActions.selectModel('directory')}>{t('offline.choosePath')}</Button>
        </div>
      </div>
      {!preview ? <Button variant="default" className="model-import-download" disabled={!available || busy || !importPath.trim()} onClick={() => void offlineActions.selectModel('directory', undefined, importPath.trim())}>{t('offline.inspectPath')}</Button> : null}
      {children}
    </TabsContent>
    <TabsContent value="download" className="tabs__panel model-import-panel">
      <div className="model-import-selectors">
        <div className="select"><Select value={modelId} onValueChange={value => { if (typeof value === 'string') setModelId(value) }}>
          <Label>{t('offline.modelChoice')}</Label><SelectTrigger className="select__trigger w-full" aria-label={t('offline.modelChoice')}><SelectValue className="select__value">{value => MODEL_IMPORT_CATALOG.find(item => item.id === value)?.name ?? ''}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{MODEL_IMPORT_CATALOG.map(item => <SelectItem key={item.id} value={item.id} label={item.name}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select></div>
        <div className="select"><Select value={selectedSource} onValueChange={value => { if (value === 'huggingface' || value === 'hf-mirror' || value === 'modelscope') setSource(value) }}>
          <Label>{t('offline.downloadSource')}</Label><SelectTrigger className="select__trigger w-full" aria-label={t('offline.downloadSource')}><SelectValue className="select__value">{value => { const option = sources.find(item => item.source === value); return option ? t(option.labelKey) : '' }}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{sources.map(option => <SelectItem key={option.source} value={option.source} label={t(option.labelKey)}>{t(option.labelKey)}</SelectItem>)}</SelectGroup></SelectContent>
        </Select></div>
      </div>
      <div className="model-import-path-row">
        <div className="model-import-section-heading"><strong>{t('offline.savePath')}</strong>
        <ImportHelp label={t('offline.downloadInfo')}><p>{t('offline.downloadHelp')}</p>{files ? <p>{t('offline.requiredFiles')} · {files.files.length}<br />{t('offline.versionInfo')}<br /><code>{files.revision}</code></p> : null}</ImportHelp>
        </div>
        <div className="model-import-path-controls">
          <div className="input-group model-import-path-input">
            <Input value={savePath} disabled={busy || task?.state === 'running'} onChange={event => { setSavePath(event.target.value); offlineActions.clearDestination() }} aria-label={t('offline.savePath')} placeholder={t('offline.pathPlaceholder')} />
          </div>
          <Button variant="secondary" className="model-import-path" disabled={busy || task?.state === 'running'} onClick={() => void offlineActions.selectDestination()}>{t('offline.choosePath')}</Button>
        </div>
        <span className="nola-micro text-muted">{t('offline.pathAfterChoose')}</span>
      </div>
      {!task || task.state === 'idle' || task.state === 'failed' || task.state === 'cancelled' ? <Button variant="default" className="model-import-download" disabled={(!available || !model || !files || !savePath.trim() || busy) || (busy)} aria-busy={busy}  onClick={() => { if (task?.state === 'failed' || task?.state === 'cancelled') offlineActions.reset(); void offlineActions.downloadModel(modelId, selectedSource, savePath.trim()) }}>{busy ? <Spinner /> : null}{t('offline.downloadModel')}</Button> : null}
    </TabsContent>
  </Tabs>
}
