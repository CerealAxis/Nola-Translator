import { useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Label, ListBox, Modal, Select, Switch, Tooltip, toast } from '@heroui/react'
import type { ResourceRecord } from '@/bridge'
import { languageName } from '@/bridge'
import { actions } from '@/store'
import { SettingsRow } from '../settings/SettingsRow'
import '../settings/settings.css'
import { CircleHelp } from 'lucide-react'
import { useI18n } from '@/i18n'
import { LANGUAGE_CODES, normalizeLanguage } from '../../../shared/languages'
import { INDEX_TRANSLATE_LANGUAGES } from '../../../shared/index-translate'
import { modelEngines } from '../../../shared/model-engines'
import { configurationOf, modelConfigurationSchema, QWEN_LANGUAGES, M2M100_LANGUAGES } from '../../../shared/model-capabilities'
import type { ModelConfiguration } from '../../../shared/model-capabilities'

export interface ModelConfigurationDialogProps {
  record: ResourceRecord
  onClose: () => void
}

export interface ModelLanguageSelectProps {
  label: ReactNode
  value: string[]
  codes: readonly string[]
  onChange: (value: string[]) => void
  multiple?: boolean
}

export function ModelLanguageSelect({ label, value, codes, onChange, multiple = true }: ModelLanguageSelectProps) {
  const { language, t } = useI18n()
  const name = (code: string) => languageName(code, language)
  const valueLabel = value.length > 1 && multiple
    ? t('modelConfig.selectedLanguageCount', { count: value.length })
    : value.length ? name(value[0]) : t('modelConfig.selectLanguages')
  return <SettingsRow className="model-configuration-dialog__row" label={label}><Select fullWidth selectionMode={multiple ? 'multiple' : 'single'} value={multiple ? value : value[0] ?? null} onChange={keys => {
    if (Array.isArray(keys)) onChange(keys.map(String))
    else onChange(keys === null ? [] : [String(keys)])
  }} placeholder={t('modelConfig.selectLanguages')}>
    <Select.Trigger><Select.Value>{valueLabel}</Select.Value><Select.Indicator /></Select.Trigger>
    <Select.Popover><ListBox className="nola-language-options">
      {codes.map(code => <ListBox.Item key={code} id={code} textValue={name(code)}>{name(code)}<ListBox.ItemIndicator /></ListBox.Item>)}
    </ListBox></Select.Popover>
  </Select></SettingsRow>
}

export function ModelConfigurationDialog({ record, onClose }: ModelConfigurationDialogProps) {
  const { t, language } = useI18n()
  const engines = modelEngines(record)
  const [draft, setDraft] = useState<ModelConfiguration>(() => configurationOf(record) ?? {
    slot: record.kind === 'recognitionModel' ? 'recognition' : 'translation',
    engine: engines[0] ?? 'pytorch',
    languages: record.kind === 'recognitionModel' ? record.languages.map(normalizeLanguage) : [],
    supportsAutoDetection: record.kind === 'recognitionModel',
    sourceLanguages: record.kind === 'translationModel' ? record.languages.map(normalizeLanguage) : [],
    targetLanguages: record.kind === 'translationModel' ? record.languages.map(normalizeLanguage) : [],
  })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pairSource, setPairSource] = useState('')
  const [pairTarget, setPairTarget] = useState('')
  const patch = (value: Partial<ModelConfiguration>) => { setDraft(previous => ({ ...previous, ...value })); setFailed(false) }
  // A saved subset must not shrink the vocabulary available when editing the model again.
  const codes = [...new Set([...LANGUAGE_CODES, ...INDEX_TRANSLATE_LANGUAGES].map(normalizeLanguage))]
  const loaderCodes = record.provider === 'qwen3-asr' ? QWEN_LANGUAGES
    : record.provider === 'sensevoice' ? ['zh', 'en', 'yue', 'ja', 'ko']
      : record.provider === 'm2m100' ? M2M100_LANGUAGES : codes
  const slot = record.kind === 'recognitionModel' ? 'recognition' : 'translation'
  const selectedCodes = draft.slot === 'recognition' ? draft.languages : [...draft.sourceLanguages, ...draft.targetLanguages]
  const valid = modelConfigurationSchema.safeParse(draft).success && engines.includes(draft.engine)
    && draft.slot === slot && selectedCodes.every(code => loaderCodes.includes(normalizeLanguage(code)))
  const loaderHelp = `${t('modelConfig.modelHelp')} ${t('modelConfig.slot')}: ${t(slot === 'recognition' ? 'modelConfig.recognition' : 'modelConfig.translation')} · ${t('modelConfig.engine')}: ${engines.map(engine => engine === 'llama' ? 'llama.cpp' : 'PyTorch').join(' / ')}`
  const name = (code: string) => languageName(code, language)
  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await actions.models.configureModel(record.resourceId, draft)
      toast.success(t('modelConfig.saved'))
      onClose()
    } catch { setFailed(true) }
    finally { setSaving(false) }
  }
  return <Modal isOpen onOpenChange={open => { if (!open && !saving) onClose() }}>
    <Modal.Backdrop className="z-overlay"><Modal.Container size="lg" scroll="inside"><Modal.Dialog>
      <Modal.Header><div className="settings-row__title"><Modal.Heading>{t('modelConfig.title')}</Modal.Heading><Tooltip delay={300}><Button variant="secondary" size="sm" isIconOnly className="settings-row__help" aria-label={t('modelConfig.title')}><CircleHelp aria-hidden="true" /></Button><Tooltip.Content className="settings-row__tooltip z-overlay">{t('modelConfig.description')}</Tooltip.Content></Tooltip></div></Modal.Header>
      <Modal.Body className="model-configuration-dialog__body flex flex-col gap-[var(--space-2)]">
        <SettingsRow className="model-configuration-dialog__row" label={t('modelConfig.slot')} desc={loaderHelp} descriptionTooltip>
        <Select aria-label={t('modelConfig.slot')} fullWidth value={draft.slot} onChange={key => { if (key === 'recognition' || key === 'translation') patch({ slot: key }) }}>
          <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover><ListBox>
            <ListBox.Item id="recognition" textValue={t('modelConfig.recognition')}>{t('modelConfig.recognition')}</ListBox.Item>
            <ListBox.Item id="translation" textValue={t('modelConfig.translation')}>{t('modelConfig.translation')}</ListBox.Item>
          </ListBox></Select.Popover>
        </Select>
        </SettingsRow>
        <SettingsRow className="model-configuration-dialog__row" label={t('modelConfig.engine')} desc={loaderHelp} descriptionTooltip>
        <Select aria-label={t('modelConfig.engine')} fullWidth value={draft.engine} onChange={key => { if (key === 'pytorch' || key === 'llama') patch({ engine: key }) }}>
          <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover><ListBox><ListBox.Item id="pytorch" textValue="PyTorch">PyTorch</ListBox.Item><ListBox.Item id="llama" textValue="llama.cpp">llama.cpp</ListBox.Item></ListBox></Select.Popover>
        </Select>
        </SettingsRow>
        {draft.slot === 'recognition' ? <>
          <ModelLanguageSelect label={t('modelConfig.languages')} value={draft.languages} codes={codes} onChange={languages => patch({ languages })} />
          <Switch isSelected={draft.supportsAutoDetection} onChange={supportsAutoDetection => patch({ supportsAutoDetection })}><Switch.Content><Label>{t('modelConfig.autoDetection')}</Label><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
        </> : <>
          <ModelLanguageSelect label={t('modelConfig.sourceLanguages')} value={draft.sourceLanguages} codes={codes} onChange={sourceLanguages => patch({ sourceLanguages, translationPairs: draft.translationPairs?.filter(pair => sourceLanguages.includes(pair.source)) })} />
          <ModelLanguageSelect label={t('modelConfig.targetLanguages')} value={draft.targetLanguages} codes={codes} onChange={targetLanguages => patch({ targetLanguages, translationPairs: draft.translationPairs?.filter(pair => targetLanguages.includes(pair.target)) })} />
          <SettingsRow label={t('modelConfig.restrictPairs')} desc={t('modelConfig.pairsHint')} descriptionTooltip>
          <Switch aria-label={t('modelConfig.restrictPairs')} isSelected={draft.translationPairs !== undefined} onChange={enabled => patch({ translationPairs: enabled ? [] : undefined })}><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
          </SettingsRow>
          {draft.translationPairs !== undefined ? <>
            <ModelLanguageSelect multiple={false} label={t('session.sourceLanguage')} value={pairSource ? [pairSource] : []} codes={draft.sourceLanguages} onChange={values => setPairSource(values[0] ?? '')} />
            <ModelLanguageSelect multiple={false} label={t('session.targetLanguage')} value={pairTarget ? [pairTarget] : []} codes={draft.targetLanguages} onChange={values => setPairTarget(values[0] ?? '')} />
            <Button variant="secondary" isDisabled={!draft.sourceLanguages.includes(pairSource) || !draft.targetLanguages.includes(pairTarget) || draft.translationPairs.length >= 512} onPress={() => {
              if (!draft.translationPairs?.some(pair => pair.source === pairSource && pair.target === pairTarget)) patch({ translationPairs: [...draft.translationPairs ?? [], { source: pairSource, target: pairTarget }] })
            }}>{t('modelConfig.addPair')}</Button>
            {draft.translationPairs.map(pair => <div className="flex items-center justify-between gap-[var(--space-1)]" key={`${pair.source}:${pair.target}`}>
              <span>{name(pair.source)} → {name(pair.target)}</span><Button variant="tertiary" onPress={() => patch({ translationPairs: draft.translationPairs?.filter(item => item !== pair) })} aria-label={`${t('modelConfig.removePair')}: ${name(pair.source)} → ${name(pair.target)}`}>{t('modelConfig.removePair')}</Button>
            </div>)}
          </> : null}
        </>}
        {failed ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Description>{t('modelConfig.saveFailed')}</Alert.Description></Alert.Content></Alert> : null}
      </Modal.Body>
      <Modal.Footer><Button variant="tertiary" isDisabled={saving} onPress={onClose}>{t('session.cancel')}</Button><Button isDisabled={!valid} isPending={saving} onPress={() => void save()}>{t('modelConfig.save')}</Button></Modal.Footer>
    </Modal.Dialog></Modal.Container></Modal.Backdrop>
  </Modal>
}
