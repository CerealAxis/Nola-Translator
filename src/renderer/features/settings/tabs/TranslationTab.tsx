import { supportsSelectedEngine } from '../../../../shared/model-engines'
/**
 * Translation: provider, intermediate translation, per-provider connection fields, API key.
 * Hy-MT2 and M2M100 are both `local` — `localModelId` picks one, routed by id in the engine.
 * Ollama is a `CloudApiFormat`, not a provider. Keys live in `credentials.json` rather than
 * `AppSettings`, so the check button can only ask whether a key is stored: no endpoint probe.
 */

import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Input, TextField, toast } from '@heroui/react'

import { CLOUD_API_FORMATS, CLOUD_FORMAT_DEFAULTS, TRANSLATION_PROVIDERS } from '@/bridge'
import type { CloudApiFormat, CredentialProvider, TranslationProvider, TranslationSettings } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { useI18n } from '@/i18n'
import { actions, getBridge, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'

export function TranslationTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const translation = settings.translation
  const credentials = useStore(stores.models, (state) => state.credentials)
  const resources = useStore(stores.models, (state) => state.resources)

  // "Local model" and "cloud model" are interface concepts rather than product names, so they
  // go through i18n; Microsoft Translator is the only real product name left. The option list
  // comes from `TRANSLATION_PROVIDERS` so the main process, whose sanitizer accepts nothing
  // outside that table, stays the one place the set of providers is written down.
  const providerLabels = useMemo<Record<TranslationProvider, string>>(() => ({
    local: t('settings.providerLocal'),
    cloud: t('settings.providerCloud'),
    microsoft: t('settings.providerMicrosoft'),
  }), [t])

  const providerOptions = useMemo<PickerOption[]>(
    () => TRANSLATION_PROVIDERS.map((id) => ({ value: id, label: providerLabels[id] })),
    [providerLabels],
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
      .map((item) => ({ value: item.resourceId, label: item.name, isDisabled: !supportsSelectedEngine(item, settings.compute, item.resourceId) }))
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
  }, [resources, translation.localModelId, settings.compute])

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
    void updateSettings({ translation: { provider: value as TranslationProvider } }).catch(() => undefined)
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

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupProvider')}>
        <SettingsRow label={t('settings.provider')}>
          <SettingSelect
            value={translation.provider}
            options={providerOptions}
            ariaLabel={t('settings.provider')}
            onChange={setProvider}
          />
        </SettingsRow>
        <SettingsRow label={t('settings.translateIntermediate')}>
          <SettingSwitch
            isSelected={translation.translateIntermediate}
            ariaLabel={t('settings.translateIntermediate')}
            onChange={(next) => {
              void updateSettings({ translation: { translateIntermediate: next } }).catch(() => undefined)
            }}
          />
        </SettingsRow>
      </SettingGroup>

      {translation.provider === 'local' ? (
        <SettingGroup legend={t('settings.groupLocalModel')}>
          {localModelOptions.length === 0 ? (
            <SettingsRow label={t('settings.model')}>
              <span className="nola-caption text-muted">{t('settings.localModelEmpty')}</span>
            </SettingsRow>
          ) : (
            <SettingsRow label={t('settings.model')}>
              <SettingSelect
                value={translation.localModelId}
                options={localModelOptions}
                ariaLabel={t('settings.model')}
                onChange={(value) => {
                  void updateSettings({ translation: { localModelId: value } }).catch(() => undefined)
                }}
              />
            </SettingsRow>
          )}
        </SettingGroup>
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
function TextRow({
  label,
  desc,
  placeholder,
  value,
  onCommit,
}: {
  label: string
  desc?: ReactNode
  placeholder?: string
  value: string
  onCommit: (value: string) => void
}) {
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
    <SettingsRow label={label} desc={desc}>
      <TextField
        value={shown}
        onChange={setDraft}
        onFocus={() => { setDraft(value); setFocused(true) }}
        onBlur={commit}
        className="w-[200px]"
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
        className="w-[200px]"
      >
        <Input type="number" min={1} step={1} className="rounded-[8px]" aria-label={label} />
      </TextField>
    </SettingsRow>
  )
}

function ApiKeyRow({ provider, stored }: { provider: CredentialProvider; stored: boolean }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<'idle' | 'pending' | 'testing'>('idle')

  const save = useCallback(async () => {
    if (draft.trim() === '') return
    setState('pending')
    try {
      await actions.models.setTranslationCredential(provider, draft.trim())
      setDraft('')
      toast.success(t('common.saved'))
    } catch {
      toast.danger(t('errors.translateFailed'))
    } finally {
      setState('idle')
    }
  }, [draft, provider, t])

  const verify = useCallback(async () => {
    setState('testing')
    try {
      const bridge = getBridge()
      const ok = bridge ? await bridge.translation.hasCredential(provider) : false
      if (ok) toast.success(t('status.ok'))
      else toast.danger(t('errors.translateFailed'))
    } catch {
      toast.danger(t('errors.translateFailed'))
    } finally {
      setState('idle')
    }
  }, [provider, t])

  return (
    <SettingsRow label={t('settings.apiKey')} desc={t('modelsSettingsUi.credentialCheckHint')}>
      <TextField value={draft} onChange={setDraft} className="w-[200px]">
        {/*
          `type` and the placeholder belong on `Input`: the `TextField` root takes only value
          and onChange, so the native change event is `Input`'s to handle. The key input is a
          password: a screen share must not expose it.
        */}
        <Input
          type="password"
          className="rounded-[8px]"
          aria-label={t('settings.apiKey')}
          placeholder={t('settings.apiKeyPlaceholder')}
        />
      </TextField>
      <Button
        variant="tertiary"
        size="sm"
        className="rounded-[6px]"
        isDisabled={draft.trim() === ''}
        isPending={state === 'pending'}
        onPress={() => {
          void save()
        }}
      >
        {t('settings.saveKey')}
      </Button>
      <Button
        variant="tertiary"
        size="sm"
        className="rounded-[6px]"
        isPending={state === 'testing'}
        isDisabled={!stored}
        onPress={() => {
          void verify()
        }}
      >
        {state === 'testing' ? t('settings.testing') : t('modelsSettingsUi.credentialCheck')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-[6px] text-muted hover:bg-danger-soft hover:text-danger-soft-foreground"
        isDisabled={!stored}
        onPress={() => {
          void actions.models
            .setTranslationCredential(provider, '')
            .then(() => toast.success(t('common.done')))
            .catch(() => toast.danger(t('errors.translateFailed')))
        }}
      >
        {t('settings.deleteKey')}
      </Button>
    </SettingsRow>
  )
}
