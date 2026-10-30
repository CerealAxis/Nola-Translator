import { useEffect, useRef, useState } from 'react'

import type { ModelDownloadSource, ResourceRecord } from '@/bridge'
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { downloadSourcesFor } from '../../../shared/model-download-sources'
import { DownloadSourceTabs } from './DownloadSourceTabs'
import './models.css'

export interface DownloadSourceDialogProps {
  record: Pick<ResourceRecord, 'resourceId' | 'name'> | null
  onClose: () => void
  onSelect: (source: ModelDownloadSource) => void
}

export function DownloadSourceDialog({ record, onClose, onSelect }: DownloadSourceDialogProps) {
  const { t } = useI18n()
  const popupRef = useRef<HTMLDivElement>(null)
  const [selectedSource, setSelectedSource] = useState<ModelDownloadSource>('huggingface')
  const options = record ? downloadSourcesFor(record.resourceId) : []

  useEffect(() => { setSelectedSource('huggingface') }, [record?.resourceId])

  if (!record) return null
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
        <DialogContent
          ref={popupRef}
          initialFocus={popupRef}
          className="nola-dialog-content models-source-dialog modal__dialog"
        >
          <DialogCloseButton aria-label={t('common.close')} />
          <DialogHeader className="models-source-dialog__header">
            <DialogTitle className="modal__heading">
              {t('models.downloadSources.title')}
            </DialogTitle>
            <DialogDescription>{record.name}</DialogDescription>
          </DialogHeader>
          <div className="modal__body models-source-dialog__body">
            <DownloadSourceTabs
              options={options}
              value={selectedSource}
              onValueChange={setSelectedSource}
              ariaLabel={t('models.downloadSources.title')}
              getLabel={option => t(option.labelKey)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
            <Button disabled={options.length === 0} onClick={() => onSelect(selectedSource)}>{t('models.retry')}</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}
