import { useModelOptions } from '@/model-options'
import { recognitionLanguages } from '../../../../shared/model-capabilities'
/**
 * Audio and recognition: source device, recognition model, source language, audio retention.
 *
 * `recognition.audioSource` is either a device id or the protocol sentinel `'defaultOutput'`,
 * which the dropdown offers as its own first option: the sentinel resolves to whatever Windows
 * plays through when the session starts, so it follows the user after they switch output, while
 * a device id pins the choice. The enumerated devices also list the live default under its own
 * entry.
 *
 * There is no level meter: the bridge exposes no channel that starts a capture and reports
 * volume, so a moving `Meter` could only invent its numbers.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, toast } from '@heroui/react'

import { languageName } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { useI18n } from '@/i18n'
import { errorCopyOf } from '@/features/workspace/error-copy'
import { actions, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'
import { ALIYUN_RECOGNITION_MODELS, MINIMAX_RECOGNITION_MODELS, RECOGNITION_PROVIDERS, type AliyunRecognitionModel, type MinimaxRecognitionModel, type RecognitionProvider, type RecognitionSettings } from '../../../../shared/settings'
import { ApiKeyRow, TextRow } from './TranslationTab'
import { supportsRecognitionNativeTranslation } from '../../../../shared/cloud-config'

const DEFAULT_OUTPUT = 'defaultOutput'

export function AudioTab({ settings }: SettingsPanelProps) {
  const { t, language } = useI18n()
  const modelChoices = useModelOptions()
  const devices = useStore(stores.models, (state) => state.devices)
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const provider = settings.recognition.provider ?? 'local'
  // Retention is on by default: with it off nothing can be replayed or exported, and
  // `ipc.ts` reads the flag to decide both `recordAudio` and the `recordingPath` it injects,
  // so a toggle that only looked saved would leave audio nobody can play back.
  const keepAudio = settings.recording?.keepAudio ?? true

  const onKeepAudio = useCallback((next: boolean) => {
    void updateSettings({ recording: { keepAudio: next } }).catch(() => undefined)
  }, [])

  // The sentinel is a protocol value rather than a device id, so the option carrying it is
  // built here; the enumerated devices follow as the pinned choices.
  const deviceOptions = useMemo<PickerOption[]>(
    () => [
      { value: DEFAULT_OUTPUT, label: t('settings.audioSourceSystem') },
      ...devices.map((device) => ({ value: device.deviceId, label: device.name })),
    ],
    [devices, t],
  )

  const languageOptions = useMemo<PickerOption[]>(
    () =>
      modelChoices.sourceLanguages.map((code) => ({
        value: code,
        label: languageName(code, language),
      })),
    [language, modelChoices.sourceLanguages],
  )

  const modelOptions = useMemo<PickerOption[]>(
    () => modelChoices.recognitionModels,
    [modelChoices.recognitionModels],
  )

  // The option list comes from `RECOGNITION_PROVIDERS`, so the dropdown cannot offer a provider
  // the main process would sanitize back to `local`.
  const providerOptions = useMemo<PickerOption[]>(() => RECOGNITION_PROVIDERS.map((id) => ({
    value: id,
    label: {
      local: t('settings.providerLocal'),
      aliyun: t('settings.providerAliyun'),
      minimax: t('settings.providerMiniMax'),
    }[id],
  })), [t])

  return (
    <div className="settings-panel" data-onboarding="recognition-settings">
      <SettingGroup legend={t('settings.groupInput')}>
        <SettingsRow onboardingTarget="audio-source" label={t('settings.audioSource')}>
          <SettingSelect
            value={settings.recognition.audioSource}
            options={deviceOptions}
            ariaLabel={t('settings.audioSource')}
            onChange={(value) => {
              void updateSettings({ recognition: { audioSource: value } }).catch(() => undefined)
            }}
          />
        </SettingsRow>
        <SettingsRow label={t('settings.testAudio')} descriptionTooltip desc={t('settings.audioTestHint')}>
          <DeviceTest expect={settings.recognition.audioSource} />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup onboardingTarget="recognition-service" legend={t('settings.groupRecognition')}>
        <SettingsRow onboardingTarget="recognition-provider" label={t('settings.provider')}>
          <SettingSelect value={provider} ariaLabel={t('settings.provider')} options={providerOptions} onChange={value => {
            const next = value as RecognitionProvider
            // Only Aliyun's socket returns a translation of its own, so leaving it retires the
            // native-translation provider rather than leaving a target language untranslated.
            void updateSettings({ recognition: { provider: next, sourceLanguage: 'auto' },
              ...(!supportsRecognitionNativeTranslation(next) && settings.translation.provider === 'recognition' ? { translation: { provider: 'mymemory' as const } } : {}),
            }).catch(() => undefined)
          }} />
        </SettingsRow>
        {provider === 'local' ? (modelOptions.length === 0 ? (
          <SettingsRow onboardingTarget="recognition-model" label={t('settings.recognitionModel')}>
            <span className="nola-caption text-muted">{t('settings.recognitionModelEmpty')}</span>
          </SettingsRow>
        ) : (
        <SettingsRow onboardingTarget="recognition-model" label={t('settings.recognitionModel')}>
          <SettingSelect
            value={settings.recognition.modelId}
            options={modelOptions}
            ariaLabel={t('settings.recognitionModel')}
            onChange={(value) => {
              const supported = recognitionLanguages(resources.find(model => model.resourceId === value))
              const sourceLanguage = supported.includes(settings.recognition.sourceLanguage)
                ? settings.recognition.sourceLanguage
                : supported.includes('auto') ? 'auto' : settings.recognition.sourceLanguage
              if (sourceLanguage === settings.recognition.sourceLanguage && !supported.includes(sourceLanguage)) {
                toast.danger(t('errors.unsupportedRecognitionLanguage', { language: languageName(sourceLanguage, language) }))
              }
              void updateSettings({
                recognition: { modelId: value, sourceLanguage },
              }).catch(() => undefined)
            }}
          />
        </SettingsRow>
        )) : provider === 'minimax' ? <MiniMaxConnection recognition={settings.recognition} stored={credentials['minimax-asr']} /> : <AliyunConnection recognition={settings.recognition} stored={credentials['aliyun-asr']} />}
        <SettingsRow label={t('settings.sourceLanguage')}>
          <SettingSelect
            value={settings.recognition.sourceLanguage}
            options={languageOptions}
            ariaLabel={t('settings.sourceLanguage')}
            onChange={(value) => {
              void updateSettings({ recognition: { sourceLanguage: value } }).catch(() => undefined)
            }}
          />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('settings.groupRecording')}>
        <SettingsRow label={t('settings.keepAudio')} descriptionTooltip desc={t('settings.keepAudioHint')}>
          <SettingSwitch
            isSelected={keepAudio}
            ariaLabel={t('settings.keepAudio')}
            onChange={onKeepAudio}
          />
        </SettingsRow>
      </SettingGroup>
    </div>
  )
}

interface CloudConnectionProps { recognition: RecognitionSettings; stored: boolean }

/**
 * Aliyun streams over a persistent WebSocket, so it carries the region and workspace its socket
 * is opened against in addition to the model.
 */
function AliyunConnection({ recognition, stored }: CloudConnectionProps) {
  const { t } = useI18n()
  return <>
    <SettingsRow onboardingTarget="recognition-model" label={t('settings.recognitionModel')} desc={t('settings.aliyunHint')} descriptionTooltip>
      <SettingSelect value={recognition.aliyunModel ?? ALIYUN_RECOGNITION_MODELS[0]} ariaLabel={t('settings.recognitionModel')} options={ALIYUN_RECOGNITION_MODELS.map(value => ({ value, label: value }))} onChange={value => {
        void updateSettings({ recognition: { aliyunModel: value as AliyunRecognitionModel, sourceLanguage: 'auto' } }).catch(() => undefined)
      }} />
    </SettingsRow>
    <SettingsRow label={t('settings.region')}>
      <SettingSelect value={recognition.aliyunRegion ?? 'cn-beijing'} ariaLabel={t('settings.region')} options={[
        { value: 'cn-beijing', label: t('settings.aliyunBeijing') },
        { value: 'ap-southeast-1', label: t('settings.aliyunSingapore') },
      ]} onChange={value => { void updateSettings({ recognition: { aliyunRegion: value as 'cn-beijing' | 'ap-southeast-1' } }).catch(() => undefined) }} />
    </SettingsRow>
    <TextRow label={t('settings.aliyunWorkspace')} value={recognition.aliyunWorkspaceId ?? ''} onCommit={value => { void updateSettings({ recognition: { aliyunWorkspaceId: value.trim() } }).catch(() => undefined) }} />
    <ApiKeyRow provider="aliyun-asr" stored={stored} />
  </>
}

/**
 * MiniMax takes an uploaded file rather than a stream, so it carries no region and no workspace:
 * the endpoint picks the account's region instead. The notice is a row of its own rather than a
 * tooltip because captions arriving a sentence at a time reads as a stall unless it says why
 * before the session starts.
 */
function MiniMaxConnection({ recognition, stored }: CloudConnectionProps) {
  const { t } = useI18n()
  return <>
    <SettingsRow onboardingTarget="recognition-model" label={t('settings.recognitionModel')}>
      <SettingSelect value={recognition.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0]} ariaLabel={t('settings.recognitionModel')} options={MINIMAX_RECOGNITION_MODELS.map(value => ({ value, label: value }))} onChange={value => {
        void updateSettings({ recognition: { minimaxModel: value as MinimaxRecognitionModel } }).catch(() => undefined)
      }} />
    </SettingsRow>
    <TextRow label={t('settings.endpoint')} value={recognition.minimaxEndpoint ?? ''} onCommit={value => { void updateSettings({ recognition: { minimaxEndpoint: value.trim() } }).catch(() => undefined) }} />
    <ApiKeyRow provider="minimax-asr" stored={stored} />
    <p className="nola-caption text-muted">{t('settings.minimaxNotice')}</p>
  </>
}

/** Preview the selected ASR input through the same capture path as a caption session. */
function DeviceTest({ expect }: { expect: string }) {
  const { t } = useI18n()
  const [result, setResult] = useState<'pending' | 'signal' | 'silent' | 'failed' | null>(null)
  const state = useStore(stores.settings, value => value.audioTestState)
  const busy = state === 'capturing' || state === 'playing'
  useEffect(() => { setResult(null) }, [expect])
  useEffect(() => () => actions.settings.cancelAudioTest(), [expect])
  const runTest = async () => {
    setResult('pending')
    try {
      const hasSignal = await actions.settings.testAudio(expect)
      setResult(hasSignal ? 'signal' : 'silent')
      if (hasSignal) toast.success(t('settings.audioTestSuccess'), { description: t('settings.audioTestReady') })
      else toast.warning(t('settings.audioTestSilent'))
    } catch (error) {
      setResult('failed')
      const code = typeof error === 'object' && error !== null && 'engineCode' in error && typeof error.engineCode === 'string'
        ? error.engineCode
        : error instanceof Error ? /([a-zA-Z_]+)[:：]/.exec(error.message)?.[1] ?? error.message : null
      toast.danger(t('settings.audioTestFailed'), {
        description: t(errorCopyOf(code, 'stop').message),
      })
    }
  }
  return (
    <Button variant="tertiary" size="sm" className="rounded-[var(--radius-xl)]"
      isPending={state === 'capturing'} isDisabled={busy}
      onPress={() => { void runTest() }}>
      {t('settings.testAudio')}
    </Button>
  )
}

