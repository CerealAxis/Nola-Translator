import { useEffect } from 'react'
import type { AudioDevice } from '@/bridge'
import { useI18n, type TranslationKey } from '@/i18n'
import { probeAudioDevices } from '@/store/modelStore'
import { vbCablePair } from '../shared/virtual-audio'

export function useAudioSourceOptions(devices: readonly AudioDevice[], selected: string, enabled = true) {
  const { t } = useI18n()
  useEffect(() => {
    if (!enabled) return
    const refresh = () => { void probeAudioDevices().catch(() => undefined) }
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [enabled])

  const applicationGroup = t('session.applicationAudio')
  const options = devices.map(device => {
    const microphone = device.kind === 'microphone'
    const group = device.kind === 'processAudio' ? applicationGroup
      : vbCablePair(device.name, microphone ? 'Output' : 'Input') ? t('session.virtualCable')
      : t(microphone ? 'session.microphones' : 'session.playbackDevices')
    return { value: device.deviceId, label: device.name, group }
  })
  if (selected.startsWith('process:') && !options.some(option => option.value === selected)) {
    return [...options, { value: selected, label: t('session.applicationAudioUnavailable'), group: applicationGroup, isDisabled: true }]
  }
  return options
}

export function speechOutputOptions(
  devices: readonly MediaDeviceInfo[],
  selected: string,
  t: (key: TranslationKey) => string,
  defaultDisabled = false,
) {
  const deviceLabel = t('session.speechOutputDevice')
  return [
    { value: 'default', label: t('session.speechDefaultDevice'), isDisabled: defaultDisabled },
    ...devices.map(device => ({
      value: device.deviceId,
      label: device.label || deviceLabel,
      group: t(vbCablePair(device.label, 'Input') ? 'session.virtualCable' : 'session.playbackDevices'),
    })),
    ...(selected !== 'default' && !devices.some(device => device.deviceId === selected)
      ? [{ value: selected, label: deviceLabel, isDisabled: true }]
      : []),
  ]
}
