import { useState } from 'react'
import { Button, Label, ListBox, Modal, Select } from '@heroui/react'
import type { ComputeSettings } from '../../../shared/compute'
import { isModelReady, recognitionLanguages, supportsTranslation } from '../../../shared/model-capabilities'
import { supportsSelectedEngine } from '../../../shared/model-engines'
import { LANGUAGE_LABELS } from '@/bridge'
import type { ResourceRecord } from '@/bridge'
import { useI18n } from '@/i18n'

export interface TranslationCompatibilityDialogProps {
  isOpen: boolean
  onClose: () => void
  source: string
  target: string
  recognition: ResourceRecord | undefined
  translation: ResourceRecord | undefined
  resources: readonly ResourceRecord[]
  compute: ComputeSettings
  onChangeSource: (source: string) => void
  onChangeModel: (modelId: string) => void
  onDisableTranslation: () => void
}

export function TranslationCompatibilityDialog(props: TranslationCompatibilityDialogProps) {
  const { t, language } = useI18n()
  const [choice, setChoice] = useState<'model' | 'language' | null>(null)
  const label = (code: string) => LANGUAGE_LABELS[code]?.[language === 'zh-CN' ? 'zh' : 'en'] ?? code
  return <Modal isOpen={props.isOpen} onOpenChange={open => { if (!open) props.onClose() }}>
    <Modal.Backdrop className="z-overlay"><Modal.Container size="lg"><Modal.Dialog>
      <Modal.Header><Modal.Heading>{t('modelConfig.incompatibleTitle')}</Modal.Heading></Modal.Header>
      <Modal.Body className="flex flex-col gap-[var(--space-2)]">
        <p>{t('modelConfig.incompatibleBody', { name: props.translation?.name ?? '', source: label(props.source), target: label(props.target) })}</p>
        {choice === 'model' ? <Select fullWidth value={props.translation?.resourceId ?? null} onChange={key => { if (typeof key === 'string') { props.onChangeModel(key); props.onClose() } }}>
          <Label>{t('session.translationModel')}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover><ListBox>{props.resources.filter(model => model.kind === 'translationModel' && model.installed).map(model => <ListBox.Item id={model.resourceId} key={model.resourceId} textValue={model.name} isDisabled={!isModelReady(model) || !supportsSelectedEngine(model, props.compute, model.resourceId) || !supportsTranslation(model, props.source, props.target)}>{model.name}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover>
        </Select> : null}
        {choice === 'language' ? <Select fullWidth value={props.source} onChange={key => { if (typeof key === 'string') { props.onChangeSource(key); props.onClose() } }}>
          <Label>{t('session.sourceLanguage')}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover><ListBox>{recognitionLanguages(props.recognition).map(code => <ListBox.Item id={code} key={code} textValue={label(code)} isDisabled={!supportsTranslation(props.translation, code, props.target)}>{label(code)}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover>
        </Select> : null}
      </Modal.Body>
      <Modal.Footer className="flex flex-wrap">
        <Button variant="secondary" onPress={() => setChoice('model')}>{t('modelConfig.changeModel')}</Button>
        <Button variant="secondary" onPress={() => setChoice('language')}>{t('modelConfig.changeLanguage')}</Button>
        <Button onPress={() => { props.onDisableTranslation(); props.onClose() }}>{t('modelConfig.disableTranslation')}</Button>
        <Button variant="tertiary" onPress={props.onClose}>{t('common.close')}</Button>
      </Modal.Footer>
    </Modal.Dialog></Modal.Container></Modal.Backdrop>
  </Modal>
}
