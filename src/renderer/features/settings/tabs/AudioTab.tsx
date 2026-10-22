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
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider'
import { LoaderCircle } from 'lucide-react'

import { languageName } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { notifyError, notifySuccess, notifyWarning } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { errorCopyOf } from '@/features/workspace/error-copy'
import { actions, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'
import { DEFAULT_SETTINGS, ALIYUN_RECOGNITION_MODELS, MINIMAX_RECOGNITION_MODELS, RECOGNITION_PROVIDERS, type AliyunRecognitionModel, type MinimaxRecognitionModel, type RecognitionProvider, type RecognitionSettings } from '../../../../shared/settings'
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
            // Only Aliyun LiveTranslate models return a translation of their own, so leaving them
            // retires the native-translation provider rather than leaving a target untranslated.
            void updateSettings({ recognition: { provider: next, sourceLanguage: 'auto' },
              ...(!supportsRecognitionNativeTranslation({ ...settings.recognition, provider: next }) && settings.translation.provider === 'recognition' ? { translation: { provider: 'mymemory' as const } } : {}),
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
                notifyError(t('errors.unsupportedRecognitionLanguage', { language: languageName(sourceLanguage, language) }))
              }
              void updateSettings({
                recognition: { modelId: value, sourceLanguage },
              }).catch(() => undefined)
            }}
          />
        </SettingsRow>
        )) : provider === 'minimax' ? <MiniMaxConnection recognition={settings.recognition} stored={credentials['minimax-asr']} /> : <AliyunConnection recognition={settings.recognition} stored={credentials['aliyun-asr']} nativeTranslationSelected={settings.translation.provider === 'recognition'} />}
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

      {provider !== 'aliyun' ? <SettingGroup legend={t('settings.vadGroup')} actions={
        <Button variant="secondary" size="sm" onClick={() => {
          void updateSettings({ recognition: {
            max_segment_ms: DEFAULT_SETTINGS.recognition.max_segment_ms,
            silence_end_ms: DEFAULT_SETTINGS.recognition.silence_end_ms,
          } }).catch(() => undefined)
        }}>{t('settings.restoreVadDefaults')}</Button>
      }>
        {([
          ['max_segment_ms', 'settings.maxSegmentMs', 'settings.maxSegmentMsHint', 10000, 3000, 30000, 500],
          ['silence_end_ms', 'settings.silenceEndMs', 'settings.silenceEndMsHint', 800, 300, 2000, 100],
        ] as const).map(([field, label, hint, fallback, min, max, step]) => (
          <SettingsRow key={field} label={t(label)} desc={t(hint)} descriptionTooltip>
            <div className="settings-slider">
              <SliderRoot className="slider" min={min} max={max} step={step}
                value={settings.recognition[field] ?? fallback}
                onValueChange={(value: number | readonly number[]) => {
                  const next = typeof value === 'number' ? value : (value[0] ?? fallback)
                  if (Number.isInteger(next) && next >= min && next <= max) {
                    void updateSettings({ recognition: { [field]: next } }).catch(() => undefined)
                  }
                }}>
                <SliderControl>
                  <SliderTrack className="relative h-1 w-full rounded-full bg-surface-tertiary">
                    <SliderIndicator className="rounded-full bg-accent" />
                    <SliderThumb className="size-3 rounded-full bg-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus" aria-label={t(label)} />
                  </SliderTrack>
                </SliderControl>
              </SliderRoot>
              <output className="nola-caption tabular text-right">{(settings.recognition[field] ?? fallback).toLocaleString(language)}</output>
              <span className="settings-slider__unit" aria-hidden="true" />
            </div>
          </SettingsRow>
        ))}
      </SettingGroup> : null}

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
function AliyunConnection({ recognition, stored, nativeTranslationSelected }: CloudConnectionProps & { nativeTranslationSelected: boolean }) {
  const { t } = useI18n()
  return <>
    <SettingsRow onboardingTarget="recognition-model" label={t('settings.recognitionModel')} desc={t('settings.aliyunHint')} descriptionTooltip>
      <SettingSelect value={recognition.aliyunModel ?? ALIYUN_RECOGNITION_MODELS[0]} ariaLabel={t('settings.recognitionModel')} options={ALIYUN_RECOGNITION_MODELS.map(value => ({ value, label: value }))} onChange={value => {
        const aliyunModel = value as AliyunRecognitionModel
        void updateSettings({ recognition: { aliyunModel, sourceLanguage: 'auto' },
          ...(!supportsRecognitionNativeTranslation({ ...recognition, provider: 'aliyun', aliyunModel }) && nativeTranslationSelected ? { translation: { provider: 'mymemory' as const } } : {}),
        }).catch(() => undefined)
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
      if (hasSignal) notifySuccess(t('settings.audioTestSuccess'), { description: t('settings.audioTestReady') })
      else notifyWarning(t('settings.audioTestSilent'))
    } catch (error) {
      setResult('failed')
      const code = typeof error === 'object' && error !== null && 'engineCode' in error && typeof error.engineCode === 'string'
        ? error.engineCode
        : error instanceof Error ? /([a-zA-Z_]+)[:：]/.exec(error.message)?.[1] ?? error.message : null
      notifyError(t('settings.audioTestFailed'), {
        description: t(errorCopyOf(code, 'stop').message),
      })
    }
  }
  return (
    <Button variant="tertiary" size="sm" disabled={busy}
      onClick={() => { void runTest() }}>
      {state === 'capturing' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {t('settings.testAudio')}
    </Button>
  )
}

