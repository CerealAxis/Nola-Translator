import { Spinner } from '@/components/ui/spinner'
import { Combobox } from '@base-ui/react/combobox'
import { SettingSwitch } from '../settings/SettingsPage'
import { ChevronDown, Check, X } from 'lucide-react'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ResourceRecord } from '@/bridge'
import { languageName } from '@/bridge'
import { actions } from '@/store'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { SettingsRow } from '../settings/SettingsRow'
import '../settings/settings.css'
import './models.css'
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
  /** Read-only mode disables edits and omits the save action. */
  readOnly?: boolean
}

export interface ModelLanguageSelectProps {
  label: ReactNode
  value: string[]
  codes: readonly string[]
  onChange: (value: string[]) => void
  multiple?: boolean
  /** Read-only mode disables the picker and omits tag removal. */
  readOnly?: boolean
}

export function ModelLanguageSelect({ label, value, codes, onChange, multiple = true, readOnly = false }: ModelLanguageSelectProps) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const { language, t } = useI18n()
  const name = (code: string) => languageName(code, language)
  const ariaLabel = typeof label === 'string' ? label : undefined
  const options = <>
    <div ref={fieldRef} className="model-language-field">
      {multiple ? <Combobox.Chips className="model-language-chips">
        {value.map(code => <Combobox.Chip key={code} className="model-language-chip">
          <span>{name(code)}</span>
          {readOnly ? null : <Combobox.ChipRemove className="model-language-chip-remove" aria-label={`${t('modelConfig.removeLanguage')} ${name(code)}`}><X aria-hidden="true" /></Combobox.ChipRemove>}
        </Combobox.Chip>)}
        {!value.length ? <span className="text-muted">{t('modelConfig.selectLanguages')}</span> : null}
      </Combobox.Chips> : <span>{value.length ? name(value[0]) : t('modelConfig.selectLanguages')}</span>}
      <Combobox.Trigger className="model-language-toggle" aria-label={ariaLabel}>
        <ChevronDown aria-hidden="true" className="size-4" />
      </Combobox.Trigger>
    </div>
    <Combobox.Portal><Combobox.Positioner anchor={fieldRef} className="z-popup" sideOffset={4}>
      <Combobox.Popup className="model-language-popup select__popover settings-select-content">
        <Combobox.Input className="input w-full" aria-label={ariaLabel} placeholder={t('modelConfig.selectLanguages')} />
        <Combobox.List className="nola-language-options">
          {(code: string) => <Combobox.Item key={code} value={code} className="list-box-item settings-select-item">{name(code)}<Combobox.ItemIndicator><Check aria-hidden="true" className="size-4" /></Combobox.ItemIndicator></Combobox.Item>}
        </Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </>
  return <SettingsRow className="model-configuration-dialog__language" label={label}>
    {multiple
      ? <Combobox.Root<string, true> items={codes} itemToStringLabel={name} multiple disabled={readOnly} value={value} onValueChange={keys => { if (!readOnly) onChange(keys) }}>{options}</Combobox.Root>
      : <Combobox.Root<string> items={codes} itemToStringLabel={name} disabled={readOnly} value={value[0] ?? null} onValueChange={key => { if (!readOnly) onChange(key === null ? [] : [key]) }}>{options}</Combobox.Root>}
  </SettingsRow>
}

export function ModelConfigurationDialog({ record, onClose, readOnly = false }: ModelConfigurationDialogProps) {
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
  const [pairSource, setPairSource] = useState('')
  const [pairTarget, setPairTarget] = useState('')
  const patch = (value: Partial<ModelConfiguration>) => { setDraft(previous => ({ ...previous, ...value })) }
  // A saved subset must not shrink the vocabulary available when editing the model again.
  const codes = [...new Set([...LANGUAGE_CODES, ...INDEX_TRANSLATE_LANGUAGES].map(normalizeLanguage))]
  const loaderCodes = record.provider === 'qwen3-asr' ? QWEN_LANGUAGES
    : record.provider === 'sensevoice' ? ['zh', 'en', 'yue', 'ja', 'ko']
      : record.provider === 'm2m100' ? M2M100_LANGUAGES : codes
  const slot = record.kind === 'recognitionModel' ? 'recognition' : 'translation'
  const selectedCodes = draft.slot === 'recognition' ? draft.languages : [...draft.sourceLanguages, ...draft.targetLanguages]
  const valid = modelConfigurationSchema.safeParse(draft).success && engines.includes(draft.engine)
    && draft.slot === slot && selectedCodes.every(code => loaderCodes.includes(normalizeLanguage(code)))
  const engineLabel = (engine: typeof engines[number]) => engine === 'llama' ? 'llama.cpp' : engine === 'crisp' ? 'CrispASR' : 'PyTorch'
  const loaderHelp = `${t('modelConfig.modelHelp')} ${t('modelConfig.slot')}: ${t(slot === 'recognition' ? 'modelConfig.recognition' : 'modelConfig.translation')} · ${t('modelConfig.engine')}: ${engines.map(engineLabel).join(' / ')}`
  const name = (code: string) => languageName(code, language)
  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await actions.models.configureModel(record.resourceId, draft)
      notifySuccess(t('modelConfig.saved'))
      onClose()
    } catch (cause) {
      notifyError(t('modelConfig.saveFailed'), { cause })
    }
    finally { setSaving(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
    <DialogContent className="model-configuration-dialog modal__dialog modal__dialog--lg">
      <DialogCloseButton disabled={saving} />
      <DialogHeader><div className="settings-row__title"><DialogTitle>{t(readOnly ? 'modelConfig.viewTitle' : 'modelConfig.title')}</DialogTitle><Tooltip><TooltipTrigger delay={300} render={<Button variant="secondary" size="sm" className="settings-row__help" aria-label={t(readOnly ? 'modelConfig.viewTitle' : 'modelConfig.title')}><CircleHelp aria-hidden="true" /></Button>} /><TooltipContent  role="tooltip" className="settings-row__tooltip z-popup">{t(readOnly ? 'modelConfig.viewDescription' : 'modelConfig.description')}</TooltipContent></Tooltip></div></DialogHeader>
      <div className="model-configuration-dialog__body flex flex-col gap-[var(--space-2)]">
        {readOnly ? <p className="nola-caption text-muted">{t('modelConfig.viewDescription')}</p> : null}
        {draft.slot === 'recognition' ? <ModelLanguageSelect label={t('modelConfig.languages')} value={draft.languages} codes={codes} onChange={languages => patch({ languages })} readOnly={readOnly} /> : <>
          <ModelLanguageSelect label={t('modelConfig.sourceLanguages')} value={draft.sourceLanguages} codes={codes} onChange={sourceLanguages => patch({ sourceLanguages, translationPairs: draft.translationPairs?.filter(pair => sourceLanguages.includes(pair.source)) })} readOnly={readOnly} />
          <ModelLanguageSelect label={t('modelConfig.targetLanguages')} value={draft.targetLanguages} codes={codes} onChange={targetLanguages => patch({ targetLanguages, translationPairs: draft.translationPairs?.filter(pair => targetLanguages.includes(pair.target)) })} readOnly={readOnly} />
        </>}
        <SettingsRow label={t('modelConfig.slot')} desc={loaderHelp} descriptionTooltip>
        <div className="select"><Select disabled={readOnly} value={draft.slot} onValueChange={key => { if (readOnly) return; if (key === 'recognition' || key === 'translation') patch({ slot: key }) }}><SelectTrigger className="select__trigger settings-select-trigger w-full" aria-label={t('modelConfig.slot')}><SelectValue className="select__value">{value => t(value === 'recognition' ? 'modelConfig.recognition' : value === 'translation' ? 'modelConfig.translation' : 'modelConfig.synthesis')}</SelectValue></SelectTrigger>
          <SelectContent className="settings-select-content"><SelectGroup>
            <SelectItem className="settings-select-item" value="recognition" label={t('modelConfig.recognition')}>{t('modelConfig.recognition')}</SelectItem>
            <SelectItem className="settings-select-item" value="translation" label={t('modelConfig.translation')}>{t('modelConfig.translation')}</SelectItem>
            <SelectItem className="settings-select-item" value="synthesis" label={t('modelConfig.synthesis')} disabled>{t('modelConfig.synthesis')}</SelectItem>
          </SelectGroup></SelectContent>
        </Select></div>
        </SettingsRow>
        <SettingsRow label={t('modelConfig.engine')} desc={loaderHelp} descriptionTooltip>
        <div className="select"><Select disabled={readOnly} value={draft.engine} onValueChange={key => { if (readOnly) return; if (key === 'pytorch' || key === 'llama' || key === 'crisp') patch({ engine: key }) }}><SelectTrigger className="select__trigger settings-select-trigger w-full" aria-label={t('modelConfig.engine')}><SelectValue className="select__value">{value => engines.includes(value) ? engineLabel(value) : ''}</SelectValue></SelectTrigger>
          <SelectContent className="settings-select-content"><SelectGroup>{engines.map(engine => <SelectItem className="settings-select-item" key={engine} value={engine} label={engineLabel(engine)}>{engineLabel(engine)}</SelectItem>)}</SelectGroup></SelectContent>
        </Select></div>
        </SettingsRow>
        {draft.slot === 'recognition' ? <>
          <SettingsRow label={t('modelConfig.autoDetection')}><SettingSwitch ariaLabel={t('modelConfig.autoDetection')} isDisabled={readOnly} isSelected={draft.supportsAutoDetection} onChange={supportsAutoDetection => { if (!readOnly) patch({ supportsAutoDetection }) }} /></SettingsRow>
        </> : <>
          <SettingsRow label={t('modelConfig.restrictPairs')} desc={t('modelConfig.pairsHint')} descriptionTooltip>
          <SettingSwitch ariaLabel={t('modelConfig.restrictPairs')} isDisabled={readOnly} isSelected={draft.translationPairs !== undefined} onChange={enabled => { if (!readOnly) patch({ translationPairs: enabled ? [] : undefined }) }} />
          </SettingsRow>
          {draft.translationPairs !== undefined ? <>
            {readOnly ? null : <>
              <ModelLanguageSelect multiple={false} label={t('session.sourceLanguage')} value={pairSource ? [pairSource] : []} codes={draft.sourceLanguages} onChange={values => setPairSource(values[0] ?? '')} />
              <ModelLanguageSelect multiple={false} label={t('session.targetLanguage')} value={pairTarget ? [pairTarget] : []} codes={draft.targetLanguages} onChange={values => setPairTarget(values[0] ?? '')} />
              <Button variant="secondary" disabled={!draft.sourceLanguages.includes(pairSource) || !draft.targetLanguages.includes(pairTarget) || draft.translationPairs.length >= 512} onClick={() => {
                if (!draft.translationPairs?.some(pair => pair.source === pairSource && pair.target === pairTarget)) patch({ translationPairs: [...draft.translationPairs ?? [], { source: pairSource, target: pairTarget }] })
              }}>{t('modelConfig.addPair')}</Button>
            </>}
            {draft.translationPairs.map(pair => <div className="flex items-center justify-between gap-[var(--space-1)]" key={`${pair.source}:${pair.target}`}>
              <span>{name(pair.source)} → {name(pair.target)}</span>{readOnly ? null : <Button variant="tertiary" onClick={() => patch({ translationPairs: draft.translationPairs?.filter(item => item !== pair) })} aria-label={`${t('modelConfig.removePair')}: ${name(pair.source)} → ${name(pair.target)}`}>{t('modelConfig.removePair')}</Button>}
            </div>)}
          </> : null}
        </>}
      </div>
      {readOnly ? null : <DialogFooter><Button variant="tertiary" disabled={saving} onClick={onClose}>{t('session.cancel')}</Button><Button disabled={(!valid) || (saving)} aria-busy={saving}  onClick={() => void save()}>{saving ? <Spinner /> : null}{t('modelConfig.save')}</Button></DialogFooter>}
    </DialogContent>
  </Dialog>
}
