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
import { DEFAULT_SETTINGS, SOURCE_LANGUAGE_OPTIONS, type CustomTranslationModel } from '../../../shared/settings'
import { ALIYUN_LANGUAGES, remoteSourceLanguages, supportsRecognitionNativeTranslation } from '../../../shared/cloud-config'
import { INDEX_TRANSLATE_ENDPOINT, INDEX_TRANSLATE_LANGUAGES, INDEX_TRANSLATE_PUBLIC_MODEL } from '../../../shared/index-translate'
import { GOOGLE_TRANSLATE_ENDPOINT } from '../../../shared/google-translate'
import { targetLanguagePatch } from '../../session-config'
import { LANGUAGE_CODES } from '../../../shared/languages'
import { SettingsRow } from '../settings/SettingsRow'
import { AliyunConnection, MiniMaxConnection } from '../settings/tabs/AudioTab'
import { TextRow } from '../settings/tabs/TranslationTab'
import { ModelLanguageSelect } from './ModelConfigurationDialog'

import { customModelsOf, customModelSchema, customCredentialSlot, customModelPatch } from '../../../shared/custom-models'
import { CustomModelDialog } from './CustomModelDialog'

export type CloudModelId = `custom:${string}` | 'cloud' | 'microsoft' | 'mymemory' | 'google' | 'index-translate' | 'aliyun' | 'minimax' | 'recognition'
export interface CloudModel {
  id: CloudModelId
  profile?: CustomTranslationModel
  kind: 'recognitionModel' | 'translationModel'
  free: boolean
  ready: boolean
  active: boolean
}

function validEndpoint(value: string | undefined): boolean {
  try { return ['https:', 'http:'].includes(new URL(value ?? '').protocol) } catch { return false }
}

/** Saved connection readiness is independent of which service is currently selected. */
export function cloudModelsOf(settings: AppSettings | null, credentials: Readonly<Record<CredentialProvider, boolean>>): CloudModel[] {
  const translation = settings?.translation
  const recognition = settings?.recognition
  const aliyunReady = !!credentials['aliyun-asr'] && !!recognition?.aliyunWorkspaceId?.trim()
  const nativeReady = aliyunReady && supportsRecognitionNativeTranslation({ ...DEFAULT_SETTINGS.recognition, ...recognition, provider: 'aliyun' })
  return [
    { id: 'aliyun', kind: 'recognitionModel', free: false, ready: aliyunReady, active: recognition?.provider === 'aliyun' },
    { id: 'minimax', kind: 'recognitionModel', free: false, ready: !!credentials['minimax-asr'] && validEndpoint(recognition?.minimaxEndpoint), active: recognition?.provider === 'minimax' },
    ...(['cloud', 'microsoft', 'mymemory', 'google', 'index-translate', 'recognition'] as const).map(id => ({
      id, kind: 'translationModel' as const, free: id === 'mymemory' || id === 'index-translate',
      ready: id === 'cloud' ? false : id === 'microsoft' ? credentials.microsoft && validEndpoint(translation?.microsoftEndpoint)
        : id === 'google' ? credentials.google : id === 'recognition' ? nativeReady : true,
      active: id !== 'cloud' && translation?.provider === id && translation.targetLanguage !== 'none',
    })),
    ...(translation ? customModelsOf(translation).map(profile => ({
      id: `custom:${profile.id}` as const, profile, kind: 'translationModel' as const, free: false,
      ready: customModelSchema.safeParse(profile).success && (profile.apiFormat !== 'anthropic' || !!credentials[customCredentialSlot(profile.id)]),
      active: translation.provider === 'cloud' && translation.targetLanguage !== 'none' && (translation.customModelId === profile.id || (!translation.customModelId && profile.id === 'legacy')),
    })) : []),
  ]
}

function useCloudCopy(id: Exclude<CloudModelId, `custom:${string}`>) {
  const { t } = useI18n()
  const names = {
    cloud: t('modelsSettingsUi.cloudService'), microsoft: t('settings.providerMicrosoft'), mymemory: t('settings.providerMyMemory'),
    google: t('settings.providerGoogle'), 'index-translate': t('settings.providerIndexTranslate'),
    aliyun: t('modelsSettingsUi.aliyunAsr'), minimax: t('settings.providerMiniMax'), recognition: t('settings.providerRecognitionTranslation'),
  }
  const descriptions = {
    cloud: t('modelsSettingsUi.cloudDescription'), microsoft: t('modelsSettingsUi.microsoftDescription'),
    mymemory: t('modelsSettingsUi.mymemoryDescription'), google: t('modelsSettingsUi.googleDescription'),
    'index-translate': t('modelsSettingsUi.indexDescription'), aliyun: t('modelsSettingsUi.aliyunDescription'),
    minimax: t('modelsSettingsUi.minimaxDescription'), recognition: t('modelsSettingsUi.nativeTranslationDescription'),
  }
  return { name: names[id], description: descriptions[id] }
}

export interface CloudMarkProps { id: CloudModelId }

export function CloudMark({ id }: CloudMarkProps) {
  const Mark = id === 'aliyun' || id === 'recognition' ? Alibaba : id === 'minimax' ? MiniMax
    : id === 'google' ? Google : id === 'microsoft' ? Microsoft : id === 'index-translate' ? Bilibili : Globe
  return <Mark aria-hidden="true" />
}

export interface CloudModelCardProps { model: CloudModel; installed?: boolean; onOpen: (id: CloudModelId) => void }

export function CloudModelCard({ model, installed = false, onOpen }: CloudModelCardProps) {
  const { t } = useI18n()
  const { name, description } = useCloudCopy(model.profile ? 'cloud' : model.id as Exclude<CloudModelId, `custom:${string}`>)
  const aliyunAsr = model.id === 'aliyun'
  const nativeTranslation = model.id === 'recognition'
  const recommendedActionLabel = aliyunAsr
    ? t('modelsSettingsUi.configureAliyunAsr')
    : t('modelsSettingsUi.startConfiguration')
  const [removing, setRemoving] = useState(false)
  const remove = async () => {
    setRemoving(true)
    try { await removeCloudModel(model); notifySuccess(t('common.done')) }
    catch (cause) { notifyError(t('modelsSettingsUi.removeFailed'), { cause }) }
    finally { setRemoving(false) }
  }
  const setDefault = async () => {
    if (!model.ready || model.active) return
    try {
      await setCloudModelDefault(model)
      notifySuccess(t('modelsSettingsUi.cloudProviderEnabled', { name }))
    } catch (cause) { notifyError(t('modelsSettingsUi.saveError'), { cause }) }
  }
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
      {model.active && model.ready ? <Badge variant="accent">{t('modelsSettingsUi.default')}</Badge> : null}
    </div></CardContent>
    <CardFooter className="card__footer">
      {installed ? <>
        <Button disabled={removing || !model.ready || model.active} onClick={() => void setDefault()}>{model.active ? t('modelsSettingsUi.current') : t(model.profile ? 'workbench.useForTranslation' : 'models.setDefault')}</Button>
        {!model.free && !nativeTranslation ? <Button variant="danger" size="icon" className="models-card__remove" disabled={removing} aria-label={t('modelsSettingsUi.deleteInterface', { name: model.profile?.name ?? name })} onClick={() => void remove()}><Trash2 aria-hidden="true" /></Button> : null}
        <div className="models-card__details"><Button variant="secondary" disabled={removing} onClick={() => onOpen(model.id)}>{t('models.openDetails')}</Button></div>
      </> : <Button disabled={removing || (nativeTranslation && model.ready && model.active)} onClick={() => onOpen(model.id)}>{recommendedActionLabel}</Button>}
    </CardFooter>
  </Card>
}

export interface CloudModelDialogProps { id: CloudModelId; onClose: () => void }

export function CloudModelDialog({ id, onClose }: CloudModelDialogProps) {
  if (id === 'cloud' || id.startsWith('custom:')) return <CustomModelDialog modelId={id === 'cloud' ? undefined : id.slice(7)} onClose={onClose} />
  return <FixedCloudModelDialog id={id as Exclude<CloudModelId, `custom:${string}` | 'cloud'>} onClose={onClose} />
}

export interface FixedCloudModelDialogProps { id: Exclude<CloudModelId, `custom:${string}` | 'cloud'>; onClose: () => void }

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
  const { name, description } = useCloudCopy(id)
  if (!settings) return null
  const recognition = { ...settings.recognition, ...draft.recognition }
  const translation = { ...settings.translation, ...draft.translation, fallback: { ...settings.translation.fallback, ...draft.translation?.fallback } }
  const slot: CredentialProvider | null = id === 'aliyun' || id === 'recognition' ? 'aliyun-asr' : id === 'minimax' ? 'minimax-asr' : id === 'microsoft' || id === 'google' ? id : null
  const stored = slot ? !!credentials[slot] : false
  const draftCredentials = slot ? { ...credentials, [slot]: stored || !!key.trim() } : credentials
  const model = cloudModelsOf({ ...settings, recognition, translation }, draftCredentials).find(model => model.id === id)!
  const canSave = model.ready && (id !== 'mymemory' || validEndpoint(translation.mymemoryEndpoint))
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
  const save = async (activate: boolean) => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      if (slot && key.trim()) await actions.models.setTranslationCredential(slot, key.trim())
      let patch = draftRef.current
      const current = stores.settings.getState().settings!
      if (id === 'aliyun') {
        const nextRecognition = { ...current.recognition, ...patch.recognition, ...(activate ? { provider: 'aliyun' as const } : {}) }
        if (current.translation.provider === 'recognition' && !supportsRecognitionNativeTranslation(nextRecognition)) {
          patch = { ...patch, translation: { ...patch.translation, provider: 'mymemory' } }
        }
      }
      if (activate && (id === 'aliyun' || id === 'minimax')) {
        const nextRecognition = { ...current.recognition, ...patch.recognition, provider: id }
        patch = { ...patch, recognition: { ...patch.recognition, provider: id, sourceLanguage: 'auto' },
          ...(!supportsRecognitionNativeTranslation(nextRecognition) && current.translation.provider === 'recognition' ? { translation: { ...patch.translation, provider: 'mymemory' } } : {}),
        }
      } else if (activate && id !== 'aliyun' && id !== 'minimax') {
        const restored = current.translation.targetLanguage === 'none' ? 'zh' : current.translation.targetLanguage
        const supported = id === 'recognition' ? ALIYUN_LANGUAGES : id === 'index-translate' ? INDEX_TRANSLATE_LANGUAGES : undefined
        const visibility = targetLanguagePatch(supported && !supported.includes(restored) ? 'zh' : restored, current.translation.targetLanguage)
        patch = { ...patch, ...visibility, translation: { ...patch.translation, ...visibility.translation, provider: id },
          ...(id === 'recognition' ? { recognition: { ...patch.recognition, provider: 'aliyun', sourceLanguage: 'auto' } } : {}),
        }
      }
      await updateSettings(patch)
      notifySuccess(activate ? t('modelsSettingsUi.cloudProviderEnabled', { name }) : t('common.saved'))
      onClose()
    } catch (cause) { notifyError(t('modelsSettingsUi.saveError'), { cause }) }
    finally { setSaving(false) }
  }
  const credentialField = <SettingsRow label={t('settings.apiKey')}><div className="model-api-key-field">
    <Input aria-label={t('settings.apiKey')} type={keyVisible ? 'text' : 'password'} autoComplete="off" className="settings-control-field" value={key} onValueChange={setKey} placeholder={stored ? t('modelsSettingsUi.savedKeyPlaceholder') : t('settings.apiKeyPlaceholder')} />
    <Button type="button" variant="secondary" size="icon" className="model-api-key-field__toggle" aria-label={t(keyVisible ? 'modelsSettingsUi.hideApiKey' : 'modelsSettingsUi.showApiKey')} aria-pressed={keyVisible} onClick={() => setKeyVisible(visible => !visible)}>
      {keyVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </Button>
  </div></SettingsRow>
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}>
    <DialogContent className="model-configuration-dialog model-provider-dialog modal__dialog modal__dialog--lg">
      <DialogCloseButton disabled={saving} aria-label={t('common.close')} />
      <DialogHeader><DialogTitle>{name}</DialogTitle><p className="models-family-dialog__intro">{description}</p></DialogHeader>
      <div className="model-configuration-dialog__body models-family-dialog__body">
        {id === 'aliyun' ? <><CloudRecognitionLanguageSupport codes={remoteSourceLanguages(recognition)} /><AliyunConnection recognition={recognition} stored={stored} onUpdate={edit} credentialField={credentialField} nativeTranslationSelected={translation.provider === 'recognition'} /></>
          : id === 'recognition' ? <><CloudLanguageSupport sourceCodes={['auto', ...ALIYUN_LANGUAGES]} targetCodes={ALIYUN_LANGUAGES} /><SettingsRow label={t('settings.providerAliyun')}><span className="nola-caption text-muted">{description}</span></SettingsRow></>
          : id === 'minimax' ? <><CloudRecognitionLanguageSupport codes={remoteSourceLanguages(recognition)} /><MiniMaxConnection recognition={recognition} stored={stored} onUpdate={edit} credentialField={credentialField} showNotice={false} /></>
          : id === 'microsoft' ? <>
            <CloudLanguageSupport sourceCodes={SOURCE_LANGUAGE_OPTIONS} targetCodes={LANGUAGE_CODES} />
            <TextRow label={t('settings.endpoint')} value={translation.microsoftEndpoint} onCommit={microsoftEndpoint => { void edit({ translation: { microsoftEndpoint: microsoftEndpoint.trim() } }) }} />
            <TextRow label={t('settings.region')} value={translation.microsoftRegion} onCommit={microsoftRegion => { void edit({ translation: { microsoftRegion: microsoftRegion.trim() } }) }} />
            {credentialField}
          </> : id === 'mymemory' ? <>
            <CloudLanguageSupport sourceCodes={SOURCE_LANGUAGE_OPTIONS} targetCodes={LANGUAGE_CODES} />
            <TextRow label={t('settings.endpoint')} value={translation.mymemoryEndpoint ?? DEFAULT_SETTINGS.translation.mymemoryEndpoint!} onCommit={mymemoryEndpoint => { void edit({ translation: { mymemoryEndpoint: mymemoryEndpoint.trim() } }) }} />
          </> : id === 'google' ? <>
            <CloudLanguageSupport sourceCodes={SOURCE_LANGUAGE_OPTIONS} targetCodes={LANGUAGE_CODES} />
            <SettingsRow label={t('settings.endpoint')}><span className="nola-caption text-muted">{GOOGLE_TRANSLATE_ENDPOINT}</span></SettingsRow>
            {credentialField}
          </> : <>
            <CloudLanguageSupport sourceCodes={INDEX_TRANSLATE_LANGUAGES} targetCodes={INDEX_TRANSLATE_LANGUAGES} />
            <SettingsRow label={t('settings.model')}><span className="nola-caption">{INDEX_TRANSLATE_PUBLIC_MODEL}</span></SettingsRow>
            <SettingsRow label={t('settings.endpoint')}><span className="nola-caption text-muted">{INDEX_TRANSLATE_ENDPOINT}</span></SettingsRow>
          </>}
      </div>
      <DialogFooter><Button variant="secondary" disabled={saving} onClick={onClose}>{t('common.close')}</Button>
        {id !== 'index-translate' && id !== 'recognition' ? <Button variant="secondary" disabled={!canSave || saving} aria-busy={saving} onClick={() => void save(false)}>{t('modelConfig.save')}</Button> : null}
        <Button disabled={!canSave || model.active || saving} aria-busy={saving} onClick={() => void save(true)}>{t(model.active && model.ready ? 'modelsSettingsUi.default' : 'models.setDefault')}</Button>
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
  await updateSettings(patch)
  await actions.models.setTranslationCredential(credential, '')
}

async function setCloudModelDefault(model: CloudModel): Promise<void> {
  const settings = stores.settings.getState().settings
  if (!settings || !model.ready || model.active) return
  const translation = settings.translation
  const previousTarget = translation.targetLanguage
  if (model.kind === 'recognitionModel') {
    if (model.id === 'aliyun' || model.id === 'minimax') {
      await updateSettings({ recognition: { provider: model.id, sourceLanguage: 'auto' } })
      return
    }
    return
  }
  if (model.id === 'recognition') {
    if (!supportsRecognitionNativeTranslation(settings.recognition)) return
    const target = previousTarget === 'none' || !ALIYUN_LANGUAGES.includes(previousTarget as typeof ALIYUN_LANGUAGES[number]) ? 'zh' : previousTarget
    const visibility = targetLanguagePatch(target, previousTarget)
    await updateSettings({ ...visibility,
      recognition: { provider: 'aliyun', sourceLanguage: 'auto' },
      translation: { ...visibility.translation, provider: 'recognition' },
    })
    return
  }
  if (model.profile) {
    const selected = customModelPatch(translation, model.profile)
    const visibility = targetLanguagePatch(selected.targetLanguage ?? 'zh', previousTarget)
    await updateSettings({ ...visibility, translation: { ...visibility.translation, ...selected } })
    return
  }
  const target = previousTarget === 'none' ? 'zh' : previousTarget
  const supported = model.id === 'index-translate' ? INDEX_TRANSLATE_LANGUAGES : undefined
  const visibility = targetLanguagePatch(supported && !supported.includes(target) ? 'zh' : target, previousTarget)
  await updateSettings({ ...visibility, translation: { ...visibility.translation, provider: model.id as AppSettings['translation']['provider'] } })
}
