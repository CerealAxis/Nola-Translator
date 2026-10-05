/**
 * Audio and recognition: source device, source language, recognition model, audio retention.
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

import { LANGUAGE_LABELS, RECOGNITION_MODEL_IDS, RECOGNITION_MODEL_LABELS, SOURCE_LANGUAGE_OPTIONS } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { useI18n } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'

const DEFAULT_OUTPUT = 'defaultOutput'

export function AudioTab({ settings }: SettingsPanelProps) {
  const { t, language } = useI18n()
  const devices = useStore(stores.models, (state) => state.devices)
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
      SOURCE_LANGUAGE_OPTIONS.map((code) => ({
        value: code,
        label: LANGUAGE_LABELS[code]?.[language === 'zh-CN' ? 'zh' : 'en'] ?? code,
      })),
    [language],
  )

  const modelOptions = useMemo<PickerOption[]>(
    () => RECOGNITION_MODEL_IDS.map((id) => ({ value: id, label: RECOGNITION_MODEL_LABELS[id], isDisabled: settings.compute.recognitionEngine !== 'pytorch' })),
    [settings.compute.recognitionEngine],
  )

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupInput')}>
        <SettingsRow label={t('settings.audioSource')}>
          {deviceOptions.length === 0 ? (
            <InputGroup className="w-[200px]">
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
        <SettingsRow label={t('settings.testAudio')} desc={activeDevice ? activeDevice.name : undefined}>
          <DeviceTest expect={selectedDeviceId} />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('settings.groupRecognition')}>
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
        <SettingsRow label={t('settings.recognitionModel')}>
          <SettingSelect
            value={settings.recognition.modelId}
            options={modelOptions}
            ariaLabel={t('settings.recognitionModel')}
            onChange={(value) => {
              void updateSettings({
                recognition: { modelId: value as (typeof RECOGNITION_MODEL_IDS)[number] },
              }).catch(() => undefined)
            }}
          />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('settings.groupRecording')}>
        <SettingsRow label={t('settings.keepAudio')} desc={t('settings.keepAudioHint')}>
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

