import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogCloseButton, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import { CLOUD_API_FORMATS, CLOUD_FORMAT_DEFAULTS, DEFAULT_SETTINGS, SOURCE_LANGUAGE_OPTIONS, type CustomTranslationModel, type CloudApiFormat } from '../../../shared/settings'
import { customCredentialSlot, customModelPatch, customModelsOf, customModelSchema } from '../../../shared/custom-models'
import { LANGUAGE_CODES } from '../../../shared/languages'
import { targetLanguagePatch } from '../../session-config'
import { SettingSelect } from '../settings/SettingsPage'
import { SettingsRow } from '../settings/SettingsRow'
import { NumberRow } from '../settings/tabs/TranslationTab'
import { ModelLanguageSelect } from './ModelConfigurationDialog'

export interface CustomModelDialogProps { modelId?: string; onClose: () => void }

export function CustomModelDialog({ modelId, onClose }: CustomModelDialogProps) {
  const { t } = useI18n()
  const settings = useStore(stores.settings, state => state.settings)
  const credentials = useStore(stores.models, state => state.credentials)
  const [draft, setDraft] = useState<CustomTranslationModel>(() => {
    const saved = settings && customModelsOf(settings.translation).find(model => model.id === modelId)
    return saved ? { ...saved, sourceLanguages: saved.sourceLanguages ?? [...SOURCE_LANGUAGE_OPTIONS] } : { id: crypto.randomUUID(), name: '', endpoint: DEFAULT_SETTINGS.translation.cloudEndpoint,
      model: '', apiFormat: 'chat-completions', contextWindow: DEFAULT_SETTINGS.translation.cloudContextWindow,
      maxOutputTokens: DEFAULT_SETTINGS.translation.cloudMaxOutputTokens, languages: [...LANGUAGE_CODES], sourceLanguages: [...SOURCE_LANGUAGE_OPTIONS] }
  })
  const [key, setKey] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const patch = (value: Partial<CustomTranslationModel>) => setDraft(previous => ({ ...previous, ...value }))
  const slot = customCredentialSlot(draft.id)
  const stored = !!credentials[slot]
  const valid = customModelSchema.safeParse(draft).success && (draft.apiFormat !== 'anthropic' || stored || !!key.trim())
  const save = async (activate: boolean) => {
    if (!valid || saving || !settings) return
    setSaving(true)
    try {
      if (key.trim()) await actions.models.setTranslationCredential(slot, key.trim())
      const translation = stores.settings.getState().settings!.translation
      const current = customModelsOf(translation)
      const model = customModelSchema.parse(draft)
      const customModels = current.some(item => item.id === model.id) ? current.map(item => item.id === model.id ? model : item) : [...current, model]
      const selected = translation.customModelId === model.id || (model.id === 'legacy' && !translation.customModelId && translation.provider === 'cloud')
      const activePatch = activate || selected ? customModelPatch(translation, model) : {}
      const visibility = activate ? targetLanguagePatch(activePatch.targetLanguage!, translation.targetLanguage) : {}
      await updateSettings({ ...visibility, translation: { ...visibility.translation, customModels, ...activePatch,
        ...(!activate ? { provider: translation.provider, targetLanguage: translation.targetLanguage } : {}),
      } })
      notifySuccess(t('modelConfig.saved'))
      onClose()
    } catch (cause) { notifyError(t('modelConfig.saveFailed'), { cause }) }
    finally { setSaving(false) }
  }
  const formats = {
    'chat-completions': t('settings.apiFormatChatCompletions'), 'chat-responses': t('settings.apiFormatChatResponses'),
    anthropic: t('settings.apiFormatAnthropic'), ollama: t('settings.apiFormatOllama'),
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
    <DialogContent className="model-configuration-dialog model-provider-dialog modal__dialog modal__dialog--lg">
      <DialogCloseButton disabled={saving} aria-label={t('common.close')} />
      <DialogHeader><DialogTitle>{modelId ? draft.name : t('modelsSettingsUi.cloudService')}</DialogTitle><p className="models-family-dialog__intro">{t('modelsSettingsUi.cloudDescription')}</p></DialogHeader>
      <div className="model-configuration-dialog__body models-family-dialog__body">
        <ModelLanguageSelect label={t('modelConfig.sourceLanguages')} codes={[...SOURCE_LANGUAGE_OPTIONS]} value={draft.sourceLanguages ?? [...SOURCE_LANGUAGE_OPTIONS]} onChange={sourceLanguages => patch({ sourceLanguages })} />
        <ModelLanguageSelect label={t('modelConfig.targetLanguages')} codes={[...LANGUAGE_CODES]} value={draft.languages} onChange={languages => patch({ languages })} />
        <div className="models-language-actions"><span className="nola-caption text-muted">{t('modelConfig.selectedLanguageCount', { count: draft.languages.length })}</span>
          <Button variant="secondary" size="sm" onClick={() => patch({ sourceLanguages: [...SOURCE_LANGUAGE_OPTIONS], languages: [...LANGUAGE_CODES] })}>{t('modelsSettingsUi.selectAllLanguages')}</Button>
          <Button variant="secondary" size="sm" onClick={() => patch({ sourceLanguages: [], languages: [] })}>{t('modelsSettingsUi.clearLanguages')}</Button>
        </div>
        <SettingsRow label={t('settings.apiName')}><Input aria-label={t('settings.apiName')} className="settings-control-field" maxLength={64} value={draft.name} onValueChange={name => patch({ name })} /></SettingsRow>
        <SettingsRow label={t('settings.endpoint')}><Input aria-label={t('settings.endpoint')} className="settings-control-field" value={draft.endpoint} onValueChange={endpoint => patch({ endpoint })} /></SettingsRow>
        <SettingsRow label={t('settings.apiKey')}><div className="model-api-key-field">
          <Input aria-label={t('settings.apiKey')} type={keyVisible ? 'text' : 'password'} autoComplete="off" className="settings-control-field" value={key} onValueChange={setKey} placeholder={stored ? t('modelsSettingsUi.savedKeyPlaceholder') : t('settings.apiKeyPlaceholder')} />
          <Button type="button" variant="secondary" size="icon" className="model-api-key-field__toggle" aria-label={t(keyVisible ? 'modelsSettingsUi.hideApiKey' : 'modelsSettingsUi.showApiKey')} aria-pressed={keyVisible} onClick={() => setKeyVisible(visible => !visible)}>
            {keyVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div></SettingsRow>
        <SettingsRow label={t('settings.apiFormat')}><SettingSelect value={draft.apiFormat} options={CLOUD_API_FORMATS.map(value => ({ value, label: formats[value] }))} ariaLabel={t('settings.apiFormat')} onChange={value => {
          const apiFormat = value as CloudApiFormat, from = CLOUD_FORMAT_DEFAULTS[draft.apiFormat], to = CLOUD_FORMAT_DEFAULTS[apiFormat]
          patch({ apiFormat, ...(draft.endpoint === from.cloudEndpoint ? { endpoint: to.cloudEndpoint } : {}), ...(draft.model === from.cloudModel ? { model: to.cloudModel } : {}) })
        }} /></SettingsRow>
        <SettingsRow label={t('settings.modelId')}><Input aria-label={t('settings.modelId')} className="settings-control-field" value={draft.model} onValueChange={model => patch({ model })} /></SettingsRow>
        <NumberRow label={t('settings.contextWindow')} value={draft.contextWindow} onCommit={contextWindow => patch({ contextWindow })} />
        <NumberRow label={t('settings.maxOutputTokens')} value={draft.maxOutputTokens} onCommit={maxOutputTokens => patch({ maxOutputTokens })} />
      </div>
      <DialogFooter><Button variant="secondary" disabled={saving} onClick={onClose}>{t('session.cancel')}</Button>
        <Button variant="secondary" disabled={!valid || saving} aria-busy={saving} onClick={() => void save(false)}>{t('modelConfig.save')}</Button>
        <Button disabled={!valid || saving} aria-busy={saving} onClick={() => void save(true)}>{t('models.setDefault')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
