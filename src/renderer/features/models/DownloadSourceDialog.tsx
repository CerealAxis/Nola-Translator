import { Description, Label, ListBox, Modal, Tooltip } from '@heroui/react'
import HuggingFace from '@lobehub/icons/es/HuggingFace/components/Color'
import ModelScope from '@lobehub/icons/es/ModelScope/components/Color'
import { ChevronRight, Network, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { ModelDownloadSource, ResourceRecord } from '@/bridge'
import { useI18n } from '@/i18n'
import { downloadSourcesFor } from '../../../shared/model-download-sources'
import './models.css'

export interface DownloadSourceDialogProps {
  record: Pick<ResourceRecord, 'resourceId' | 'name'> | null
  onClose: () => void
  onSelect: (source: ModelDownloadSource) => void
}

export function DownloadSourceDialog({ record, onClose, onSelect }: DownloadSourceDialogProps) {
  const { t } = useI18n()
  const icons = { huggingface: HuggingFace, 'hf-mirror': Network, modelscope: ModelScope } as const
  if (!record) return null
  return (
    <Modal.Backdrop isOpen onOpenChange={open => { if (!open) onClose() }} className="z-overlay">
      <Modal.Container size="sm" placement="center">
        <Modal.Dialog className="models-source-dialog">
          <Modal.CloseTrigger aria-label={t('common.close')} className="models-source-dialog__close">
            <X aria-hidden="true" />
          </Modal.CloseTrigger>
          <Modal.Header className="models-source-dialog__header">
            <Modal.Heading>{t('models.downloadSources.title')}</Modal.Heading>
            <p className="models-source-dialog__model">{record.name}</p>
          </Modal.Header>
          <Modal.Body>
            <ListBox aria-label={t('models.downloadSources.title')} selectionMode="none" className="models-source-list">
              {downloadSourcesFor(record.resourceId).map(option => {
                const Icon = icons[option.source]
                return (
                  <ListBox.Item key={option.source} id={option.source} textValue={t(option.labelKey)} aria-label={t(option.labelKey)}
                    className="models-source-list__item" onAction={() => onSelect(option.source)}>
                    {({ isFocused, isFocusVisible }) => <>
                      <span className="models-source-list__icon" aria-hidden="true"><Icon aria-hidden="true" /></span>
                      <SourceNameTooltip label={t(option.labelKey)} hint={t(option.tooltipKey)} keyboardFocused={isFocused && isFocusVisible} />
                      <Description className="sr-only">{t(option.tooltipKey)}</Description>
                      <ChevronRight aria-hidden="true" className="models-source-list__arrow" />
                    </>}
                  </ListBox.Item>
                )
              })}
            </ListBox>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

export interface SourceNameTooltipProps {
  label: string
  hint: string
  keyboardFocused: boolean
}

function SourceNameTooltip({ label, hint, keyboardFocused }: SourceNameTooltipProps) {
  const [open, setOpen] = useState(false)
  // ListBox owns the keyboard focus; its presentation-only name cannot receive it.
  useEffect(() => { setOpen(keyboardFocused) }, [keyboardFocused])
  return (
    <Tooltip delay={250} isOpen={open} onOpenChange={setOpen}>
      <Tooltip.Trigger<'span'> render={props => <span {...props} />} role="presentation" tabIndex={-1} className="models-source-list__name">
        <Label>{label}</Label>
      </Tooltip.Trigger>
      <Tooltip.Content className="z-overlay max-w-96 whitespace-normal">{hint}</Tooltip.Content>
    </Tooltip>
  )
}
