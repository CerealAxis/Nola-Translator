/**
 * 音频与识别。声源、源语言、识别模型、音频留存。
 *
 * **声源那一行做了一处映射。** `recognition.audioSource` 的初值是协议里的哨兵
 * `'defaultOutput'`，它不是一个设备；而 `AudioDevice.isDefault` 已经标出了系统默认设备。
 * 两者指的是同一个东西，所以读的时候把 `'defaultOutput'` 映射到那个默认设备，
 * 写的时候写真实 deviceId。少一个永远选不回去的空选项。
 *
 * **没有电平表。** bridge 契约里没有任何"起一路监听读音量"的通道，画一个会跳动的
 * `Meter` 只能是编数据，所以这里只显示设备事实。见交付报告 Known Gaps。
 * "测试音频"是真实的检查：重新 `listDevices()` 并确认当前选中的设备还在。
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
  // 音频留存默认开着：关掉之后没法回放也没法导出，误操作代价很高（见 keepAudioHint）。
  // `settings.recording.keepAudio` **已经是设置结构里的一等字段**（`src/shared/settings.ts`
  // 的 `RecordingSettings`），主进程据此决定要不要给引擎注入 `recordingPath`。
  // 别再按「tier: ipc-new 槽位」处理它。
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
    () => RECOGNITION_MODEL_IDS.map((id) => ({ value: id, label: RECOGNITION_MODEL_LABELS[id] })),
    [],
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

/** 真实检查：重新列一次设备，确认当前选中的那个还在。 */
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

