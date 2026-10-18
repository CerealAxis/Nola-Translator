import { isModelReady, supportsTranslation } from '../../../../shared/model-capabilities'
import { supportsSelectedEngine } from '../../../../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../../shared/compute'
/**
 * Translation: provider, intermediate translation, per-provider connection fields, API key.
 * Local model families share `local`; `localModelId` selects their engine adapter.
 * Ollama is a `CloudApiFormat`, not a provider. Keys live in `credentials.json` rather than
 * `AppSettings`, so the check button can only ask whether a key is stored: no endpoint probe.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Input, TextField, toast } from '@heroui/react'

import { CLOUD_API_FORMATS, CLOUD_FORMAT_DEFAULTS, NO_TRANSLATION_LANGUAGE, TRANSLATION_PROVIDERS } from '@/bridge'
import type { CloudApiFormat, CredentialProvider, TranslationProvider, TranslationSettings } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { useI18n } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'
import { ALIYUN_LANGUAGES, supportsIntermediateTranslation, supportsRecognitionNativeTranslation } from '../../../../shared/cloud-config'
import { targetLanguagePatch } from '../../../session-config'
import { INDEX_TRANSLATE_ENDPOINT, INDEX_TRANSLATE_LANGUAGES, INDEX_TRANSLATE_PUBLIC_MODEL } from '../../../../shared/index-translate'
import { GOOGLE_TRANSLATE_ENDPOINT } from '../../../../shared/google-translate'

export function TranslationTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const translation = settings.translation
  const credentials = useStore(stores.models, (state) => state.credentials)
  const resources = useStore(stores.models, (state) => state.resources)

  // Keep the settings picker in sync with the providers accepted by the main sanitizer.
  const providerLabels = useMemo<Record<TranslationProvider, string>>(() => ({
    local: t('settings.providerLocal'),
    cloud: t('settings.providerCloud'),
    microsoft: t('settings.providerMicrosoft'),
    mymemory: t('settings.providerMyMemory'),
    google: t('settings.providerGoogle'),
    'index-translate': t('settings.providerIndexTranslate'),
    recognition: t('settings.providerRecognitionTranslation'),
  }), [t])

  const providerOptions = useMemo<PickerOption[]>(
    () => [
      { value: 'disabled', label: t('settings.providerDisabled') },
      // Only Aliyun's recognition connection carries its own translation; the other providers would
      // leave the chosen target language untranslated, so the option is unavailable rather than
      // selectable and then reverted.
      ...TRANSLATION_PROVIDERS.map((id) => ({ value: id, label: providerLabels[id], isDisabled: id === 'recognition' && !supportsRecognitionNativeTranslation(settings.recognition.provider) })),
    ],
    [providerLabels, settings.recognition.provider, t],
  )

  const apiFormatLabels = useMemo<Record<CloudApiFormat, string>>(() => ({
    'chat-completions': t('settings.apiFormatChatCompletions'),
    'chat-responses': t('settings.apiFormatChatResponses'),
    anthropic: t('settings.apiFormatAnthropic'),
    ollama: t('settings.apiFormatOllama'),
  }), [t])

  const apiFormatOptions = useMemo<PickerOption[]>(
    () => CLOUD_API_FORMATS.map((id) => ({ value: id, label: apiFormatLabels[id] })),
    [apiFormatLabels],
  )

  // The dropdown lists what is actually installed, from the models store, so an uninstalled
  // id can never be selected and size or quality text baked into a label cannot go stale.
  // M2M100 and hub GGUF models travel the same `resourceId` route as the Hy-MT2 tiers.
  // Option text is the model name alone: size, parameters and quantisation are read off the
  // model card.
  const localModelOptions = useMemo<PickerOption[]>(() => {
    const installed = resources
      .filter((item) => item.kind === 'translationModel' && item.installed)
      .map((item) => ({ value: item.resourceId, label: item.name, isDisabled: !isModelReady(item) || !supportsSelectedEngine(item, settings.compute ?? DEFAULT_COMPUTE_SETTINGS, item.resourceId) || !supportsTranslation(item, settings.recognition.sourceLanguage, translation.targetLanguage) }))
    /*
     * The current value is patched in even when it is not among the installed models (just
     * uninstalled, or settings synced from another machine): it is the current value rather
     * than a candidate, and dropping it leaves the dropdown blank, which looks broken. It is
     * disabled, and when nothing at all is installed the empty branch below takes over.
     */
    if (installed.length > 0 && !installed.some((option) => option.value === translation.localModelId)) {
      installed.push({ value: translation.localModelId, label: translation.localModelId, isDisabled: true })
    }
    return installed
  }, [resources, translation.localModelId, translation.targetLanguage, settings.recognition.sourceLanguage, settings.compute])

  const fallbackProviderOptions = useMemo<PickerOption[]>(() => [
    { value: 'disabled', label: t('settings.fallbackDisabled') },
    ...TRANSLATION_PROVIDERS.filter((id) => id !== 'recognition').map((id) => ({
      value: id,
      label: providerLabels[id],
      isDisabled: id === 'local'
        ? !localModelOptions.some((option) => option.value === translation.localModelId && !option.isDisabled)
        : id === translation.provider && id !== 'cloud',
    })),
  ], [localModelOptions, providerLabels, t, translation.localModelId, translation.provider])

  /*
   * How deep the address goes depends on the format: Anthropic takes a bare origin and Ollama
   * a bare host, while the OpenAI shapes include the version segment. Getting that depth wrong
   * is hard to read off an error, so each format gets its own hint.
   */
  const endpointHint = useMemo(() => {
    switch (translation.cloudApiFormat) {
      case 'chat-responses': return t('settings.endpointHintChatResponses')
      case 'anthropic': return t('settings.endpointHintAnthropic')
      case 'ollama': return t('settings.endpointHintOllama')
      default: return t('settings.endpointHintChatCompletions')
    }
  }, [translation.cloudApiFormat, t])

  const setProvider = (value: string) => {
    if (value === 'disabled') {
      void updateSettings(targetLanguagePatch(NO_TRANSLATION_LANGUAGE, translation.targetLanguage)).catch(() => undefined)
      return
    }
    const restoredTarget = translation.targetLanguage === NO_TRANSLATION_LANGUAGE ? 'zh' : translation.targetLanguage
    const supportedTargets = value === 'recognition' ? ALIYUN_LANGUAGES : value === 'index-translate' ? INDEX_TRANSLATE_LANGUAGES : undefined
    const targetLanguage = supportedTargets && !supportedTargets.includes(restoredTarget)
      ? 'zh' : restoredTarget
    const languagePatch = targetLanguagePatch(targetLanguage, translation.targetLanguage)
    void updateSettings({
      ...languagePatch,
      translation: { ...languagePatch.translation, provider: value as TranslationProvider },
    }).catch(() => undefined)
  }

  /**
   * Switching format moves the endpoint and model together: the engine appends the path
   * each format needs, so a leftover base is silently wrong (an OpenAI base plus
   * `/api/chat` reaches OpenAI, not Ollama). A field is replaced only while it still equals
   * the default of the format being left, so swapping the two OpenAI shapes changes nothing.
   */
  const setApiFormat = (value: string) => {
    const next = value as CloudApiFormat
    const previous = translation.cloudApiFormat
    if (next === previous) return
    const from = CLOUD_FORMAT_DEFAULTS[previous]
    const to = CLOUD_FORMAT_DEFAULTS[next]
    const patch: Partial<TranslationSettings> = { cloudApiFormat: next }
    if (translation.cloudEndpoint === from.cloudEndpoint) patch.cloudEndpoint = to.cloudEndpoint
    if (translation.cloudModel === from.cloudModel) patch.cloudModel = to.cloudModel
    void updateSettings({ translation: patch }).catch(() => undefined)
  }

  const setFallbackApiFormat = (value: string) => {
    const next = value as CloudApiFormat
    const previous = translation.fallback.cloudApiFormat
    if (next === previous) return
    const from = CLOUD_FORMAT_DEFAULTS[previous]
    const to = CLOUD_FORMAT_DEFAULTS[next]
    const patch: Partial<TranslationSettings['fallback']> = { cloudApiFormat: next }
    if (translation.fallback.cloudEndpoint === from.cloudEndpoint) patch.cloudEndpoint = to.cloudEndpoint
    if (translation.fallback.cloudModel === from.cloudModel) patch.cloudModel = to.cloudModel
    void updateSettings({ translation: { fallback: patch } }).catch(() => undefined)
  }

  return (
    <div className="settings-panel" data-onboarding="translation-settings">
      <SettingGroup onboardingTarget="translation-service" legend={t('settings.groupProvider')}>
        <SettingsRow
          onboardingTarget="translation-provider"
          label={t('settings.provider')}
          desc={t('settings.aliyunTranslationHint')}
          descriptionTooltip
        >
          <SettingSelect
            value={translation.targetLanguage === NO_TRANSLATION_LANGUAGE ? 'disabled' : translation.provider}
            options={providerOptions}
            ariaLabel={t('settings.provider')}
            onChange={setProvider}
          />
        </SettingsRow>
        {translation.provider === 'local' && translation.targetLanguage !== NO_TRANSLATION_LANGUAGE ? (localModelOptions.length === 0 ? (
          <SettingsRow onboardingTarget="translation-model" label={t('settings.model')}>
            <span className="nola-caption text-muted">{t('settings.localModelEmpty')}</span>
          </SettingsRow>
        ) : (
          <SettingsRow onboardingTarget="translation-model" label={t('settings.model')}>
            <SettingSelect
              value={translation.localModelId}
              options={localModelOptions}
              ariaLabel={t('settings.model')}
              onChange={(value) => {
                void updateSettings({ translation: { localModelId: value } }).catch(() => undefined)
              }}
            />
          </SettingsRow>
        )) : null}
        {translation.targetLanguage !== NO_TRANSLATION_LANGUAGE && supportsIntermediateTranslation(translation.provider) ? <SettingsRow label={t('settings.translateIntermediate')} desc={t('settings.translateIntermediateHint')} descriptionTooltip>
          <SettingSwitch
            isSelected={translation.translateIntermediate}
            ariaLabel={t('settings.translateIntermediate')}
            onChange={(next) => {
              void updateSettings({ translation: { translateIntermediate: next } }).catch(() => undefined)
            }}
          />
        </SettingsRow> : null}
      </SettingGroup>

      <SettingGroup legend={t('settings.fallbackTranslation')}>
        <SettingsRow label={t('settings.fallbackProvider')} desc={t('settings.fallbackTranslationHint')} descriptionTooltip>
          <SettingSelect
            value={translation.fallback?.provider ?? 'disabled'}
            options={fallbackProviderOptions}
            ariaLabel={t('settings.fallbackProvider')}
            onChange={(value) => { void updateSettings({ translation: { fallback: { provider: value as TranslationSettings['fallback']['provider'] } } }).catch(() => undefined) }}
          />
        </SettingsRow>
        {translation.fallback?.provider === 'local' ? <SettingsRow onboardingTarget="translation-model" label={t('settings.model')} desc={t('settings.fallbackLocalModelHint')} descriptionTooltip>
          <span className="nola-caption text-muted">{localModelOptions.find((option) => option.value === translation.localModelId)?.label ?? translation.localModelId}</span>
        </SettingsRow> : null}
        {translation.fallback?.provider === 'cloud' ? <>
          <TextRow label={t('settings.endpoint')} value={translation.fallback.cloudEndpoint} onCommit={(value) => { void updateSettings({ translation: { fallback: { cloudEndpoint: value } } }).catch(() => undefined) }} />
          <ApiKeyRow provider="fallback-cloud" stored={credentials['fallback-cloud']} />
          <SettingsRow label={t('settings.apiFormat')}><SettingSelect value={translation.fallback.cloudApiFormat} options={apiFormatOptions} ariaLabel={t('settings.apiFormat')} onChange={setFallbackApiFormat} /></SettingsRow>
          <TextRow label={t('settings.modelId')} value={translation.fallback.cloudModel} onCommit={(value) => { void updateSettings({ translation: { fallback: { cloudModel: value } } }).catch(() => undefined) }} />
          <NumberRow label={t('settings.contextWindow')} value={translation.fallback.cloudContextWindow} onCommit={(value) => { void updateSettings({ translation: { fallback: { cloudContextWindow: value } } }).catch(() => undefined) }} />
          <NumberRow label={t('settings.maxOutputTokens')} value={translation.fallback.cloudMaxOutputTokens} onCommit={(value) => { void updateSettings({ translation: { fallback: { cloudMaxOutputTokens: value } } }).catch(() => undefined) }} />
        </> : null}
        {translation.fallback?.provider === 'microsoft' ? <>
          <TextRow label={t('settings.endpoint')} value={translation.fallback.microsoftEndpoint} onCommit={(value) => { void updateSettings({ translation: { fallback: { microsoftEndpoint: value } } }).catch(() => undefined) }} />
          <TextRow label={t('settings.region')} value={translation.fallback.microsoftRegion} onCommit={(value) => { void updateSettings({ translation: { fallback: { microsoftRegion: value } } }).catch(() => undefined) }} />
          <ApiKeyRow provider="microsoft" stored={credentials.microsoft} />
        </> : null}
        {translation.fallback?.provider === 'mymemory' ? <>
          <TextRow label={t('settings.endpoint')} value={translation.fallback.mymemoryEndpoint} onCommit={(value) => { void updateSettings({ translation: { fallback: { mymemoryEndpoint: value } } }).catch(() => undefined) }} />
          <TextRow label={t('settings.mymemoryEmail')} value={translation.fallback.mymemoryEmail} onCommit={(value) => { void updateSettings({ translation: { fallback: { mymemoryEmail: value } } }).catch(() => undefined) }} />
        </> : null}
        {translation.fallback?.provider === 'google' ? <>
          <SettingsRow label={t('settings.endpoint')}><span className="nola-caption text-muted">{GOOGLE_TRANSLATE_ENDPOINT}</span></SettingsRow>
          <ApiKeyRow provider="fallback-google" stored={credentials['fallback-google']} />
        </> : null}
        {translation.fallback?.provider === 'index-translate' ? <SettingsRow label={t('settings.providerIndexTranslate')}><span className="nola-caption text-muted">{INDEX_TRANSLATE_PUBLIC_MODEL}</span></SettingsRow> : null}
      </SettingGroup>

      {translation.provider === 'index-translate' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <SettingsRow onboardingTarget="translation-model" label={t('settings.model')}><span className="nola-caption text-muted">{INDEX_TRANSLATE_PUBLIC_MODEL}</span></SettingsRow>
          <SettingsRow label={t('settings.endpoint')}><span className="nola-caption text-muted">{INDEX_TRANSLATE_ENDPOINT}</span></SettingsRow>
        </SettingGroup>
      ) : translation.provider === 'mymemory' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <SettingsRow label={t('settings.providerMyMemory')} desc={t('settings.mymemoryHint')} descriptionTooltip children={null} />
          <TextRow label={t('settings.endpoint')} value={translation.mymemoryEndpoint ?? 'https://api.mymemory.translated.net/get'} onCommit={value => { void updateSettings({ translation: { mymemoryEndpoint: value } }).catch(() => undefined) }} />
          <TextRow label={t('settings.mymemoryEmail')} value={translation.mymemoryEmail ?? ''} onCommit={value => { void updateSettings({ translation: { mymemoryEmail: value } }).catch(() => undefined) }} />
        </SettingGroup>
      ) : translation.provider === 'google' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <SettingsRow label={t('settings.providerGoogle')} children={null} />
          <SettingsRow label={t('settings.endpoint')}><span className="nola-caption text-muted">{GOOGLE_TRANSLATE_ENDPOINT}</span></SettingsRow>
          <ApiKeyRow provider="google" stored={credentials.google} />
        </SettingGroup>
      ) : translation.provider === 'recognition' ? (
        <SettingGroup legend={t('settings.groupConnection')}><SettingsRow label={t('settings.providerRecognitionTranslation')} desc={t('settings.nativeTranslationHint')} children={null} /></SettingGroup>
      ) : null}

      {translation.provider === 'cloud' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <TextRow
            label={t('settings.apiName')}
            placeholder={t('settings.apiNamePlaceholder')}
            value={translation.cloudName}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudName: value } }).catch(() => undefined)
            }}
          />
          <TextRow
            label={t('settings.endpoint')}
            desc={endpointHint}
            descriptionTooltip
            placeholder={t('settings.endpointPlaceholder')}
            value={translation.cloudEndpoint}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudEndpoint: value } }).catch(() => undefined)
            }}
          />
          <ApiKeyRow provider="cloud" stored={credentials.cloud} />
          <SettingsRow label={t('settings.apiFormat')}>
            <SettingSelect
              value={translation.cloudApiFormat}
              options={apiFormatOptions}
              ariaLabel={t('settings.apiFormat')}
              onChange={setApiFormat}
            />
          </SettingsRow>
          <TextRow
            label={t('settings.modelId')}
            value={translation.cloudModel}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudModel: value } }).catch(() => undefined)
            }}
          />
          <NumberRow
            label={t('settings.contextWindow')}
            value={translation.cloudContextWindow}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudContextWindow: value } }).catch(() => undefined)
            }}
          />
          <NumberRow
            label={t('settings.maxOutputTokens')}
            value={translation.cloudMaxOutputTokens}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudMaxOutputTokens: value } }).catch(() => undefined)
            }}
          />
        </SettingGroup>
      ) : null}

      {translation.provider === 'microsoft' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <TextRow
            label={t('settings.endpoint')}
            value={translation.microsoftEndpoint}
            onCommit={(value) => {
              void updateSettings({ translation: { microsoftEndpoint: value } }).catch(() => undefined)
            }}
          />
          <TextRow
            label={t('settings.region')}
            value={translation.microsoftRegion}
            onCommit={(value) => {
              void updateSettings({ translation: { microsoftRegion: value } }).catch(() => undefined)
            }}
          />
          <ApiKeyRow provider="microsoft" stored={credentials.microsoft} />
        </SettingGroup>
      ) : null}
    </div>
  )
}

/** Label above, input below; the placeholder only shows the expected format. */
export interface TextRowProps {
  label: string
  desc?: ReactNode
  placeholder?: string
  descriptionTooltip?: boolean
  value: string
  onCommit: (value: string) => void
}

export function TextRow({
  label,
  desc,
  placeholder,
  descriptionTooltip,
  value,
  onCommit,
}: TextRowProps) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  // Follow an external change (another window edited the settings) unless this row is being
  // edited, so a keystroke in progress is not overwritten.
  const shown = focused ? draft : value
  const commit = useCallback(() => {
    setFocused(false)
    if (draft !== value) onCommit(draft)
  }, [draft, value, onCommit])

  return (
    <SettingsRow label={label} desc={desc} descriptionTooltip>
      <TextField
        aria-label={label}
        value={shown}
        onChange={setDraft}
        onFocus={() => { setDraft(value); setFocused(true) }}
        onBlur={commit}
        className="settings-control-field"
      >
        <Input className="rounded-[8px]" aria-label={label} placeholder={placeholder} />
      </TextField>
    </SettingsRow>
  )
}

/**
 * Number row (context window, max output tokens). The value is a **string draft** parsed on
 * blur, because that is the only way to replace `128` with `128000` by clearing first: writing
 * on every keystroke would persist the intermediate `1`.
 *
 * An unparsable draft is discarded and the previous value kept, never writing NaN — the engine
 * would only report "invalid configuration" without naming the field. The lower bound only
 * rejects an obviously impossible 0 or negative; the right size is the user's call.
 */
function NumberRow({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)

  const shown = focused ? draft : String(value)
  const commit = useCallback(() => {
    setFocused(false)
    const next = Number(draft.trim())
    if (!Number.isFinite(next) || next <= 0) return
    const rounded = Math.round(next)
    if (rounded !== value) onCommit(rounded)
  }, [draft, value, onCommit])

  return (
    <SettingsRow label={label}>
      <TextField
        value={shown}
        onChange={setDraft}
        onFocus={() => { setDraft(String(value)); setFocused(true) }}
        onBlur={commit}
        className="settings-control-field"
      >
        <Input type="number" min={1} step={1} className="rounded-[8px]" aria-label={label} />
      </TextField>
    </SettingsRow>
  )
}

export interface ApiKeyRowProps { provider: CredentialProvider; stored: boolean }

export function ApiKeyRow({ provider, stored }: ApiKeyRowProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState<'idle' | 'pending' | 'testing' | 'deleting'>('idle')
  const saveTask = useRef<Promise<boolean> | null>(null)
  const masked = stored && !editing && draft === ''

  const save = useCallback((nextDraft: string): Promise<boolean> => {
    if (saveTask.current) return saveTask.current
    const key = nextDraft.trim()
    if (key === '') return Promise.resolve(true)
    setState('pending')
    const task = actions.models.setTranslationCredential(provider, key)
      .then(() => {
        setDraft('')
        toast.success(t('common.saved'))
        return true
      })
      .catch(() => {
        toast.danger(t('errors.translateFailed'))
        return false
      })
      .finally(() => {
        saveTask.current = null
        setState('idle')
      })
    saveTask.current = task
    return task
  }, [provider, t])

  const verify = useCallback(async () => {
    if (draft.trim() !== '' && !(await save(draft))) return
    setState('testing')
    try {
      const ok = await actions.models.checkCredential(provider)
      if (ok) toast.success(t('status.ok'))
      else toast.danger(t('errors.translateFailed'))
    } catch {
      toast.danger(t('errors.translateFailed'))
    } finally {
      setState('idle')
    }
  }, [draft, provider, save, t])

  const deleteKey = useCallback(async () => {
    await saveTask.current
    setState('deleting')
    try {
      await actions.models.setTranslationCredential(provider, '')
      setDraft('')
      toast.success(t('common.done'))
    } catch {
      toast.danger(t('errors.translateFailed'))
    } finally {
      setState('idle')
    }
  }, [provider, t])

  return (
    <SettingsRow label={t('settings.apiKey')} desc={t('settings.apiKeyHint')} descriptionTooltip>
      <TextField aria-label={t('settings.apiKey')} value={masked ? `sk-${'*'.repeat(80)}` : draft} onChange={setDraft}
        onFocus={() => setEditing(true)} onBlur={() => { setEditing(false); void save(draft) }} className="settings-control-field">
        {/*
          `type` and the placeholder belong on `Input`: the `TextField` root takes only value
          and onChange, so the native change event is `Input`'s to handle. The saved credential
          is represented by a mask; actual replacement input stays a password field.
        */}
        <Input
          type={masked ? 'text' : 'password'}
          readOnly={masked}
          className="rounded-[8px]"
          aria-label={t('settings.apiKey')}
          placeholder={stored ? '' : t('settings.apiKeyPlaceholder')}
          disabled={state === 'pending' || state === 'deleting'}
        />
      </TextField>
      <Button
        variant="tertiary"
        size="sm"
        className="rounded-[6px]"
        isPending={state === 'testing'}
        isDisabled={!stored || state === 'deleting'}
        onPress={() => {
          void verify()
        }}
      >
        {state === 'testing' ? t('settings.testing') : t('modelsSettingsUi.credentialCheck')}
      </Button>
      <Button
        variant="danger"
        size="sm"
        className="rounded-[6px]"
        isPending={state === 'deleting'}
        isDisabled={!stored || state === 'testing' || state === 'deleting'}
        onPress={() => {
          void deleteKey()
        }}
      >
        {t('settings.deleteKey')}
      </Button>
    </SettingsRow>
  )
}
