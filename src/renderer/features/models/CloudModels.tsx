import { Input } from '@/components/ui/input'
import { useRef, useState } from 'react'
import Alibaba from '@lobehub/icons/es/Alibaba/components/Mono'
import Bilibili from '@lobehub/icons/es/Bilibili/components/Mono'
import Google from '@lobehub/icons/es/Google/components/Mono'
import Microsoft from '@lobehub/icons/es/Microsoft/components/Mono'
import MiniMax from '@lobehub/icons/es/Minimax/components/Mono'
import { Eye, EyeOff, Globe, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogCloseButton, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import type { AppSettings, AppSettingsPatch, CredentialProvider } from '@/bridge'
import { DEFAULT_SETTINGS, MIMO_TTS_BINDING, MIMO_TTS_MODEL, MIMO_TTS_NAME, REALTIME_S2S_MODELS, SOURCE_LANGUAGE_OPTIONS } from '../../../shared/settings'
import { ALIYUN_LANGUAGES, remoteSourceLanguages, supportsRecognitionNativeTranslation } from '../../../shared/cloud-config'
import { INDEX_TRANSLATE_ENDPOINT, INDEX_TRANSLATE_LANGUAGES, INDEX_TRANSLATE_PUBLIC_MODEL } from '../../../shared/index-translate'
import { GOOGLE_TRANSLATE_ENDPOINT } from '../../../shared/google-translate'
import { targetLanguagePatch } from '../../session-config'
import { LANGUAGE_CODES } from '../../../shared/languages'
import { SettingsRow } from '../settings/SettingsRow'
import { SettingSelect } from '../settings/SettingsPage'
import { AliyunConnection, MiniMaxConnection } from '../settings/tabs/AudioTab'
import { TextRow } from '../settings/tabs/TranslationTab'
import { ModelLanguageSelect } from './ModelConfigurationDialog'

import { customModelsOf, customCredentialSlot, customModelPatch } from '../../../shared/custom-models'
import { CustomModelDialog } from './CustomModelDialog'
import { modelEnablePatch } from '../../../shared/model-policy'

export { cloudModelsOf, type CloudModel, type CloudModelId } from '../../../shared/cloud-models'
import { cloudModelsOf, validEndpoint, type CloudModel, type CloudModelId } from '../../../shared/cloud-models'

export type CatalogCloudModelId = CloudModelId | 'aliyun-s2s' | typeof MIMO_TTS_MODEL
export type CatalogCloudModel = (CloudModel | {
  id: 'aliyun-s2s'; kind: 's2sModel'; profile?: never; ready: boolean; free: false
} | {
  id: typeof MIMO_TTS_MODEL; kind: 'ttsModel'; profile?: never; ready: boolean; free: false
}) & { runtimeState?: 'running' | 'loading' | 'ready' | 'failed' }

function useCloudCopy(id: Exclude<CatalogCloudModelId, `custom:${string}`>) {
  const { t } = useI18n()
  const names = {
    cloud: t('modelsSettingsUi.cloudService'), microsoft: t('settings.providerMicrosoft'), mymemory: t('settings.providerMyMemory'),
    google: t('settings.providerGoogle'), 'index-translate': t('settings.providerIndexTranslate'),
    aliyun: t('modelsSettingsUi.aliyunAsr'), minimax: t('settings.providerMiniMax'), recognition: t('settings.providerRecognitionTranslation'),
    'aliyun-s2s': t('models.aliyunS2s'),
    [MIMO_TTS_MODEL]: MIMO_TTS_NAME,
  }
  const descriptions = {
    cloud: t('modelsSettingsUi.cloudDescription'), microsoft: t('modelsSettingsUi.microsoftDescription'),
    mymemory: t('modelsSettingsUi.mymemoryDescription'), google: t('modelsSettingsUi.googleDescription'),
    'index-translate': t('modelsSettingsUi.indexDescription'), aliyun: t('modelsSettingsUi.aliyunDescription'),
    minimax: t('modelsSettingsUi.minimaxDescription'), recognition: t('modelsSettingsUi.nativeTranslationDescription'),
    'aliyun-s2s': t('models.s2sModelsHint'),
    [MIMO_TTS_MODEL]: t('models.mimoTtsHint'),
  }
  return { name: names[id], description: descriptions[id] }
}

export interface CloudMarkProps { id: CatalogCloudModelId }

export function CloudMark({ id }: CloudMarkProps) {
  const Mark = id === 'aliyun' || id === 'recognition' || id === 'aliyun-s2s' ? Alibaba : id === 'minimax' ? MiniMax
    : id === 'google' ? Google : id === 'microsoft' ? Microsoft : id === 'index-translate' ? Bilibili : Globe
  return <Mark aria-hidden="true" />
}

export interface CloudModelCardProps { model: CatalogCloudModel; installed?: boolean; onOpen: (id: CatalogCloudModelId) => void }

export function CloudModelCard({ model, installed = false, onOpen }: CloudModelCardProps) {
  const { t } = useI18n()
  const { name, description } = useCloudCopy(model.profile ? 'cloud' : model.id as Exclude<CatalogCloudModelId, `custom:${string}`>)
  const aliyunAsr = model.id === 'aliyun'
  const recommendedActionLabel = aliyunAsr
    ? t('modelsSettingsUi.configureAliyunAsr')
    : t('modelsSettingsUi.startConfiguration')
  return <Card className="models-card models-family-card models-cloud-card" data-cloud-model={model.id}>
    <CardHeader>
      <CardAction><span aria-hidden="true" className={['models-card__icon', model.kind === 'translationModel' && 'models-card__icon--translation'].filter(Boolean).join(' ')}><CloudMark id={model.id} /></span></CardAction>
      <CardTitle>{model.profile?.name ?? name}</CardTitle><CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent><div className="models-card__status">
      <Badge>{t('modelsSettingsUi.cloudModels')}</Badge>
      {!model.free ? <Badge>{t('modelsSettingsUi.paid')}</Badge> : null}
      {model.free ? <Badge variant="success">{t('modelsSettingsUi.free')}</Badge> : null}
      {model.ready ? <Badge variant="success">{t('models.installed')}</Badge> : null}
      {model.runtimeState ? <Badge variant={model.runtimeState === 'failed' ? 'danger' : 'accent'}>{t(`gateway.${model.runtimeState}`)}</Badge> : null}
    </div></CardContent>
    <CardFooter className="card__footer">
      <Button onClick={() => onOpen(model.id)}>
        {installed ? t('models.openDetails') : recommendedActionLabel}
      </Button>
    </CardFooter>
  </Card>
}

export interface CloudModelDialogProps { id: CatalogCloudModelId; onClose: () => void }

export function CloudModelDialog({ id, onClose }: CloudModelDialogProps) {
  if (id === 'cloud' || id.startsWith('custom:')) return <CustomModelDialog modelId={id === 'cloud' ? undefined : id.slice(7)} onClose={onClose} />
  return <FixedCloudModelDialog id={id as FixedCloudModelDialogProps['id']} onClose={onClose} />
}

interface FixedCloudModelDialogProps { id: Exclude<CatalogCloudModelId, `custom:${string}` | 'cloud'>; onClose: () => void }

interface CloudLanguageSupportProps { sourceCodes: readonly string[]; targetCodes: readonly string[] }
export interface CloudRecognitionLanguageSupportProps { codes: readonly string[] }

function CloudLanguageSupport({ sourceCodes, targetCodes }: CloudLanguageSupportProps) {
  const { t } = useI18n()
  return <>
    <ModelLanguageSelect label={t('modelConfig.sourceLanguages')} value={[...sourceCodes]} codes={sourceCodes} onChange={() => undefined} readOnly />
    <ModelLanguageSelect label={t('modelConfig.targetLanguages')} value={[...targetCodes]} codes={targetCodes} onChange={() => undefined} readOnly />
  </>
}

function CloudRecognitionLanguageSupport({ codes }: CloudRecognitionLanguageSupportProps) {
  const { t } = useI18n()
  return <ModelLanguageSelect label={t('modelConfig.languages')} value={[...codes]} codes={codes} onChange={() => undefined} readOnly />
}

function FixedCloudModelDialog({ id, onClose }: FixedCloudModelDialogProps) {
  const { t } = useI18n()
  const settings = useStore(stores.settings, state => state.settings)
  const credentials = useStore(stores.models, state => state.credentials)
  const [draft, setDraft] = useState<AppSettingsPatch>({})
  const draftRef = useRef(draft)
  const [key, setKey] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const { name, description } = useCloudCopy(id)
  if (!settings) return null
  const s2s = id === 'aliyun-s2s'
  const s2sModel = draft.realtime?.s2sModel ?? settings.realtime?.s2sModel ?? REALTIME_S2S_MODELS[0]
  const recognition = { ...settings.recognition, ...draft.recognition }
  const translation = { ...settings.translation, ...draft.translation, fallback: { ...settings.translation.fallback, ...draft.translation?.fallback } }
  const mimo = id === MIMO_TTS_MODEL
  const slot: CredentialProvider | null = mimo ? 'mimo-tts' : s2s || id === 'aliyun' || id === 'recognition' ? 'aliyun-asr' : id === 'minimax' ? 'minimax-asr' : null
  const stored = slot ? !!credentials[slot] : false
  const draftCredentials = slot ? { ...credentials, [slot]: stored || !!key.trim() } : credentials
  const model = cloudModelsOf({ ...settings, recognition, translation }, draftCredentials).find(model => model.id === (s2s ? 'aliyun' : id))
  const canSave = mimo ? stored || !!key.trim() : !!model?.ready && (id !== 'mymemory' || validEndpoint(translation.mymemoryEndpoint))
  const canRemove = mimo ? stored : !s2s && !!model && !model.free && model.id !== 'recognition'
  // A blur commits into the ref before the following save click is handled.
  const edit = async (patch: AppSettingsPatch) => {
    const previous = draftRef.current
    const next: AppSettingsPatch = { ...previous, ...patch,
      ...(patch.recognition ? { recognition: { ...previous.recognition, ...patch.recognition } } : {}),
      ...(patch.translation ? { translation: { ...previous.translation, ...patch.translation } } : {}),
    }
    draftRef.current = next
    setDraft(next)
  }
  const save = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      if (slot && key.trim()) await actions.models.setTranslationCredential(slot, key.trim())
      const patch = draftRef.current
      if (Object.keys(patch).length) await updateSettings(patch)
      notifySuccess(t('common.saved'))
      onClose()
    } catch (cause) { notifyError(t('modelsSettingsUi.saveError'), { cause }) }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!canRemove || saving || removing) return
    setRemoving(true)
    try {
      if (mimo) {
        await updateSettings({ ...modelEnablePatch(settings, 'tts', MIMO_TTS_BINDING, false) })
        await actions.models.setTranslationCredential('mimo-tts', '')
      } else if (model) await removeCloudModel(model)
      notifySuccess(t('common.done'))
      onClose()
    } catch (cause) { notifyError(t('modelsSettingsUi.removeFailed'), { cause }) }
    finally { setRemoving(false) }
  }
  const credentialField = <SettingsRow label={t('settings.apiKey')}><div className="model-api-key-field">
    <Input aria-label={t('settings.apiKey')} type={keyVisible ? 'text' : 'password'} autoComplete="off" className="settings-control-field" value={key} onValueChange={setKey} placeholder={stored ? t('modelsSettingsUi.savedKeyPlaceholder') : t('settings.apiKeyPlaceholder')} />
    <Button type="button" variant="bare" size="icon" className="model-api-key-field__toggle" aria-label={t(keyVisible ? 'modelsSettingsUi.hideApiKey' : 'modelsSettingsUi.showApiKey')} aria-pressed={keyVisible} onClick={() => setKeyVisible(visible => !visible)}>
      {keyVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </Button>
  </div></SettingsRow>
  return <Dialog open onOpenChange={open => { if (!open && !saving && !removing) onClose() }}>
    <DialogContent className="model-configuration-dialog model-provider-dialog modal__dialog modal__dialog--lg">
      <DialogCloseButton disabled={saving || removing} aria-label={t('common.close')} />
      <DialogHeader><DialogTitle>{name}</DialogTitle><p className="models-family-dialog__intro">{description}</p></DialogHeader>
      <div className="model-configuration-dialog__body models-family-dialog__body">
        {mimo ? credentialField : id === 'aliyun' || s2s ? <>
          {s2s ? <SettingsRow label={t('settings.model')}>
            <SettingSelect value={s2sModel} ariaLabel={t('settings.model')} options={REALTIME_S2S_MODELS.map(value => ({ value, label: value }))} onChange={value => {
              const selected = REALTIME_S2S_MODELS.find(model => model === value)
              if (selected) void edit({ realtime: { s2sModel: selected } })
            }} />
          </SettingsRow> : <CloudRecognitionLanguageSupport codes={remoteSourceLanguages(recognition)} />}
          <AliyunConnection recognition={recognition} stored={stored} onUpdate={edit} credentialField={credentialField} showModel={!s2s} nativeTranslationSelected={translation.provider === 'recognition'} />
        </>
          : id === 'recognition' ? <><CloudLanguageSupport sourceCodes={['auto', ...ALIYUN_LANGUAGES]} targetCodes={ALIYUN_LANGUAGES} /><SettingsRow label={t('settings.providerAliyun')}><span className="nola-caption text-muted">{description}</span></SettingsRow></>
          : id === 'minimax' ? <><CloudRecognitionLanguageSupport codes={remoteSourceLanguages(recognition)} /><MiniMaxConnection recognition={recognition} stored={stored} onUpdate={edit} credentialField={credentialField} showNotice={false} /></>
          : id === 'microsoft' ? <>
            <CloudLanguageSupport sourceCodes={SOURCE_LANGUAGE_OPTIONS} targetCodes={LANGUAGE_CODES} />
            <SettingsRow label={t('settings.endpoint')}><span className="nola-caption text-muted">{DEFAULT_SETTINGS.translation.microsoftEndpoint}/translatetext</span></SettingsRow>
          </> : id === 'mymemory' ? <>
            <CloudLanguageSupport sourceCodes={LANGUAGE_CODES} targetCodes={LANGUAGE_CODES} />
            <TextRow label={t('settings.endpoint')} value={translation.mymemoryEndpoint ?? DEFAULT_SETTINGS.translation.mymemoryEndpoint!} onCommit={mymemoryEndpoint => { void edit({ translation: { mymemoryEndpoint: mymemoryEndpoint.trim() } }) }} />
          </> : id === 'google' ? <>
            <CloudLanguageSupport sourceCodes={SOURCE_LANGUAGE_OPTIONS} targetCodes={LANGUAGE_CODES} />
            <SettingsRow label={t('settings.endpoint')}><span className="nola-caption text-muted">{GOOGLE_TRANSLATE_ENDPOINT}</span></SettingsRow>
          </> : <>
            <CloudLanguageSupport sourceCodes={['auto', ...INDEX_TRANSLATE_LANGUAGES]} targetCodes={INDEX_TRANSLATE_LANGUAGES} />
            <SettingsRow label={t('settings.model')}><span className="nola-caption">{INDEX_TRANSLATE_PUBLIC_MODEL}</span></SettingsRow>
            <SettingsRow label={t('settings.endpoint')}><span className="nola-caption text-muted">{INDEX_TRANSLATE_ENDPOINT}</span></SettingsRow>
          </>}
      </div>
      <DialogFooter>
        {canRemove ? <Button variant="danger" disabled={saving || removing} aria-busy={removing} onClick={() => void remove()}><Trash2 aria-hidden="true" />{t('modelsSettingsUi.deleteModel')}</Button> : null}
        <Button variant="secondary" disabled={saving || removing} onClick={onClose}>{t('common.close')}</Button>
        {id !== 'index-translate' && id !== 'recognition' && id !== 'microsoft' && id !== 'google' ? <Button variant="secondary" disabled={!canSave || saving || removing} aria-busy={saving} onClick={() => void save()}>{t('modelConfig.save')}</Button> : null}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

/** Delete the configured connection, including its secret; free built-ins have no removal action. */
export async function removeCloudModel(model: CloudModel): Promise<void> {
  const settings = stores.settings.getState().settings
  if (!settings || model.free || model.id === 'cloud' || model.id === 'recognition') return
  let patch: AppSettingsPatch
  let credential: CredentialProvider
  if (model.profile) {
    credential = customCredentialSlot(model.profile.id)
    const active = settings.translation.customModelId === model.profile.id || (model.profile.id === 'legacy' && !settings.translation.customModelId)
    patch = { translation: { customModels: customModelsOf(settings.translation).filter(item => item.id !== model.profile!.id),
      ...(active ? { customModelId: '', cloudName: '', cloudModel: DEFAULT_SETTINGS.translation.cloudModel, cloudEndpoint: DEFAULT_SETTINGS.translation.cloudEndpoint, cloudLanguages: [...LANGUAGE_CODES], cloudSourceLanguages: [...SOURCE_LANGUAGE_OPTIONS],
        ...(settings.translation.provider === 'cloud' ? { provider: 'mymemory' } : {}),
      } : {}),
    } }
  } else if (model.id === 'aliyun' || model.id === 'minimax') {
    const aliyun = model.id !== 'minimax'
    credential = aliyun ? 'aliyun-asr' : 'minimax-asr'
    patch = { recognition: {
      ...(aliyun ? { aliyunWorkspaceId: '', aliyunRegion: DEFAULT_SETTINGS.recognition.aliyunRegion, aliyunModel: DEFAULT_SETTINGS.recognition.aliyunModel }
        : { minimaxEndpoint: DEFAULT_SETTINGS.recognition.minimaxEndpoint, minimaxModel: DEFAULT_SETTINGS.recognition.minimaxModel }),
      ...(settings.recognition.provider === (aliyun ? 'aliyun' : 'minimax') ? { provider: 'local' } : {}),
    }, ...(aliyun && settings.translation.provider === 'recognition' ? { translation: { provider: 'mymemory' } } : {}) }
  } else {
    credential = model.id === 'microsoft' ? 'microsoft' : 'google'
    patch = { translation: {
      ...(model.id === 'microsoft' ? { microsoftEndpoint: DEFAULT_SETTINGS.translation.microsoftEndpoint, microsoftRegion: '' } : {}),
      ...(settings.translation.provider === model.id ? { provider: 'mymemory' } : {}),
      ...(settings.translation.fallback.provider === model.id ? { fallback: { provider: 'disabled' } } : {}),
    } }
  }
  const kind = model.kind === 'recognitionModel' ? 'asr' : 'mt'
  patch = { ...patch, ...modelEnablePatch(settings, kind, model.profile ? `mt-custom:${model.profile.id}` : `cloud:${model.id}`, false) }
  if (model.profile) {
    const policy = patch.modelPolicy!
    patch = { ...patch, modelPolicy: { ...policy, enabled: { ...policy.enabled, [`llm:${model.id}`]: false } } }
  }
  await updateSettings(patch)
  await actions.models.setTranslationCredential(credential, '')
}

/** Shared by model management and quick captions so switching keeps connection fields together. */
export function cloudModelSettingsPatch(settings: AppSettings, model: CloudModel): AppSettingsPatch | null {
  if (!model.ready) return null
  const previousTarget = settings.translation.targetLanguage
  if (model.kind === 'recognitionModel') {
    return model.id === 'aliyun' || model.id === 'minimax'
      ? { recognition: { provider: model.id, sourceLanguage: 'auto' } } : null
  }
  if (model.id === 'recognition') {
    if (!supportsRecognitionNativeTranslation({ ...settings.recognition, provider: 'aliyun' })) return null
    const target = previousTarget === 'none' || !ALIYUN_LANGUAGES.includes(previousTarget as typeof ALIYUN_LANGUAGES[number]) ? 'zh' : previousTarget
    const visibility = targetLanguagePatch(target, previousTarget)
    return { ...visibility, recognition: { provider: 'aliyun', sourceLanguage: 'auto' },
      translation: { ...visibility.translation, provider: 'recognition' } }
  }
  if (model.profile) {
    const selected = customModelPatch(settings.translation, model.profile)
    const visibility = targetLanguagePatch(selected.targetLanguage ?? 'zh', previousTarget)
    return { ...visibility, translation: { ...visibility.translation, ...selected } }
  }
  const target = previousTarget === 'none' ? 'zh' : previousTarget
  const supported = model.id === 'index-translate' ? INDEX_TRANSLATE_LANGUAGES : undefined
  const visibility = targetLanguagePatch(supported && !supported.includes(target) ? 'zh' : target, previousTarget)
  return { ...visibility, translation: { ...visibility.translation, provider: model.id as AppSettings['translation']['provider'] } }
}

