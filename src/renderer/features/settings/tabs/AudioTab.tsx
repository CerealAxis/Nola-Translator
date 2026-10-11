import { useModelOptions } from '@/model-options'
/**
 * Audio and recognition: source device, recognition model, source language, audio retention.
 *
 * `recognition.audioSource` ships as the protocol sentinel `'defaultOutput'`, which is not a
 * device. `AudioDevice.isDefault` already names the system default, so the sentinel is mapped
 * onto that device when reading and the real device id is written back.
 *
 * There is no level meter: the bridge exposes no channel that starts a capture and reports
 * volume, so a moving `Meter` could only invent its numbers.
 */

import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, InputGroup, toast } from '@heroui/react'

import { LANGUAGE_LABELS } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { useI18n } from '@/i18n'
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
  const credentials = useStore(stores.models, state => state.credentials)
  const provider = settings.recognition.provider ?? 'local'
  // Retention is on by default: with it off nothing can be replayed or exported, and
  // `ipc.ts` reads the flag to decide both `recordAudio` and the `recordingPath` it injects,
  // so a toggle that only looked saved would leave audio nobody can play back.
  const keepAudio = settings.recording?.keepAudio ?? true

  const onKeepAudio = useCallback((next: boolean) => {
    void updateSettings({ recording: { keepAudio: next } }).catch(() => undefined)
  }, [])

  const deviceOptions = useMemo<PickerOption[]>(
    () => devices.map((device) => ({ value: device.deviceId, label: device.name })),
    [devices],
  )

  const selectedDeviceId = useMemo(() => {
    const current = settings.recognition.audioSource
    if (current !== DEFAULT_OUTPUT) return current
    return devices.find((device) => device.isDefault)?.deviceId ?? current
  }, [settings.recognition.audioSource, devices])

  const activeDevice = devices.find((device) => device.deviceId === selectedDeviceId)

  const languageOptions = useMemo<PickerOption[]>(
    () =>
      modelChoices.sourceLanguages.map((code) => ({
        value: code,
        label: LANGUAGE_LABELS[code]?.[language === 'zh-CN' ? 'zh' : 'en'] ?? code,
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
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupInput')}>
        <SettingsRow label={t('settings.audioSource')}>
          {deviceOptions.length === 0 ? (
            <InputGroup className="settings-control-field">
              <InputGroup.Input readOnly value={t('errors.deviceNotFound')} aria-label={t('settings.audioSource')} />
            </InputGroup>
          ) : (
            <SettingSelect
              value={selectedDeviceId}
              options={deviceOptions}
              ariaLabel={t('settings.audioSource')}
              onChange={(value) => {
                void updateSettings({ recognition: { audioSource: value } }).catch(() => undefined)
              }}
            />
          )}
        </SettingsRow>
        <SettingsRow label={t('settings.testAudio')} descriptionTooltip desc={activeDevice ? activeDevice.name : undefined}>
          <DeviceTest expect={selectedDeviceId} />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('settings.groupRecognition')}>
        <SettingsRow label={t('settings.provider')}>
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
          <SettingsRow label={t('settings.recognitionModel')}>
            <span className="nola-caption text-muted">{t('settings.recognitionModelEmpty')}</span>
          </SettingsRow>
        ) : (
        <SettingsRow label={t('settings.recognitionModel')}>
          <SettingSelect
            value={settings.recognition.modelId}
            options={modelOptions}
            ariaLabel={t('settings.recognitionModel')}
            onChange={(value) => {
              void updateSettings({
                recognition: { modelId: value },
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
    <SettingsRow label={t('settings.recognitionModel')} desc={t('settings.aliyunHint')} descriptionTooltip>
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
    <SettingsRow label={t('settings.recognitionModel')}>
      <SettingSelect value={recognition.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0]} ariaLabel={t('settings.recognitionModel')} options={MINIMAX_RECOGNITION_MODELS.map(value => ({ value, label: value }))} onChange={value => {
        void updateSettings({ recognition: { minimaxModel: value as MinimaxRecognitionModel } }).catch(() => undefined)
      }} />
    </SettingsRow>
    <TextRow label={t('settings.endpoint')} value={recognition.minimaxEndpoint ?? ''} onCommit={value => { void updateSettings({ recognition: { minimaxEndpoint: value.trim() } }).catch(() => undefined) }} />
    <ApiKeyRow provider="minimax-asr" stored={stored} />
    <p className="nola-caption text-muted">{t('settings.minimaxNotice')}</p>
  </>
}

/** A real check: re-list the devices and confirm the selected one is still there. */
function DeviceTest({ expect }: { expect: string }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'pending' | 'failed'>('idle')

  const run = useCallback(async () => {
    setState('pending')
    try {
      await actions.models.loadModels()
      const stillThere = stores.models.getState().devices.some((device) => device.deviceId === expect)
      if (stillThere) {
        setState('idle')
        toast.success(t('status.ok'))
        return
      }
      setState('failed')
      toast.danger(t('errors.deviceNotFound'))
    } catch {
      setState('failed')
    }
  }, [expect, t])

  if (state === 'failed') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title className="nola-caption">{t('errors.deviceNotFound')}</Alert.Title>
          <Alert.Description className="nola-micro">
            {t('errors.deviceNotFoundAction')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
    )
  }

  return (
    <Button
      variant="tertiary"
      size="sm"
      className="rounded-[6px]"
      isPending={state === 'pending'}
      onPress={() => {
        void run()
      }}
    >
      {state === 'pending' ? t('settings.testing') : t('settings.testAudio')}
    </Button>
  )
}

