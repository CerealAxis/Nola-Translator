import type { ReactNode } from 'react'
import type { AppSettingsPatch } from '@/bridge'
/**
 * Audio and translation defaults: devices, virtual audio, translation behavior and segmentation.
 *
 * The recognition model itself is no longer chosen here. The model gateway decides which local
 * model or cloud interface is loaded, and a caption session picks among those per session, so a
 * settings-level picker would silently load another model under a running feature.
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

import { useCallback, useEffect, useState } from 'react'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider'
import { LoaderCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { SettingsRow } from '../SettingsRow'
import { notifyError, notifySuccess, notifyWarning } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { errorCopyOf } from '@/features/workspace/error-copy'
import { actions, getBridge, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'
import { DEFAULT_SETTINGS, ALIYUN_ASR_MODELS, MINIMAX_RECOGNITION_MODELS, type MinimaxRecognitionModel, type RecognitionSettings } from '../../../../shared/settings'
import { ApiKeyRow, TextRow, TranslationTab } from './TranslationTab'
import { speechOutputOptions, useAudioSourceOptions } from '@/audio-source-options'
import { useSpeechOutputDevices } from '@/features/workspace/SessionSetupDialog'
import { probeAudioDevices } from '@/store/modelStore'
import { vbCablePair } from '../../../../shared/virtual-audio'

const DEFAULT_OUTPUT = 'defaultOutput'

export function AudioTab({ settings }: SettingsPanelProps) {
  const { t, language } = useI18n()
  const [installingCable, setInstallingCable] = useState(false)
  const installCable = getBridge()?.app.installVirtualCable
  const readCableDriverVersion = getBridge()?.app.getVirtualCableDriverVersion
  const [cableDriverVersion, setCableDriverVersion] = useState<string | null>(null)
  const [checkingCableDriver, setCheckingCableDriver] = useState(Boolean(readCableDriverVersion))
  const refreshCableStatus = useCallback(async () => {
    const tasks: Promise<unknown>[] = [probeAudioDevices().catch(() => undefined)]
    if (readCableDriverVersion) {
      setCheckingCableDriver(true)
      tasks.push(readCableDriverVersion().then(setCableDriverVersion).catch(() => setCableDriverVersion(null)).finally(() => setCheckingCableDriver(false)))
    }
    await Promise.all(tasks)
  }, [readCableDriverVersion])
  useEffect(() => { void refreshCableStatus() }, [refreshCableStatus])
  async function runCableInstaller() {
    if (!installCable) return
    setInstallingCable(true)
    try {
      await installCable()
      await refreshCableStatus()
      notifySuccess(t('session.virtualCableSetupClosed'))
    } catch (cause) {
      notifyError(t('session.virtualCableSetupFailed'), { cause })
    } finally {
      setInstallingCable(false)
    }
  }
  const devices = useStore(stores.models, (state) => state.devices)
  const provider = settings.recognition.provider ?? 'local'
  // The sentinel is a protocol value rather than a device id, so the option carrying it is
  // built here; the enumerated devices follow as the pinned choices.
  const selectedSource = settings.realtime?.virtualInputDeviceId || settings.recognition.audioSource
  const deviceOptions = [{ value: DEFAULT_OUTPUT, label: t('settings.audioSourceSystem') }, ...useAudioSourceOptions(devices, selectedSource)]
  const speechOutputs = useSpeechOutputDevices()
  const cableCaptureEnds = new Set(devices.filter(device => device.kind === 'microphone').map(device => vbCablePair(device.name, 'Output')))
  const cableRenderEnds = new Set(speechOutputs.map(device => vbCablePair(device.label, 'Input')))
  const standardCablePresent = cableCaptureEnds.has('standard') || cableRenderEnds.has('standard')
    || devices.some(device => device.kind === 'systemOutput' && vbCablePair(device.name, 'Input') === 'standard')
  const selectedOutput = settings.realtime?.speechOutputDeviceId
  const realtimeActive = useStore(stores.session, state => !['idle', 'error'].includes(state.status))
  const [testingOutput, setTestingOutput] = useState(false)
  const testSpeechOutput = async () => {
    if (!selectedOutput || testingOutput || realtimeActive) return
    setTestingOutput(true)
    let context: (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | undefined
    try {
      context = new AudioContext()
      if (!context.setSinkId) throw new Error('Output selection is unavailable')
      await context.setSinkId(selectedOutput)
      await context.resume()
      const signal = context.createOscillator()
      const volume = context.createGain()
      volume.gain.value = 0.05
      signal.connect(volume).connect(context.destination)
      const ended = new Promise<void>(resolve => { signal.onended = () => resolve() })
      signal.start()
      signal.stop(context.currentTime + 0.15)
      await ended
    } catch (cause) {
      notifyError(t('errors.audioDeviceDisconnected'), { cause })
    } finally {
      await context?.close().catch(() => undefined)
      setTestingOutput(false)
    }
  }

  return (
    <div className="settings-panel" data-onboarding="recognition-settings">
      <SettingGroup legend={t('settings.audioDevicesGroup')}>
        <SettingsRow onboardingTarget="audio-source" label={t('settings.inputDevice')}
          desc={selectedSource.startsWith('process:') ? t('session.applicationAudioHint') : t('settings.audioTestHint')} descriptionTooltip>
          <div className="flex w-full min-w-0 items-center gap-2">
            <SettingSelect className="min-w-0 flex-1" value={selectedSource} options={deviceOptions}
              ariaLabel={t('settings.inputDevice')}
              onChange={(value) => {
                void updateSettings({ recognition: { audioSource: value }, realtime: { virtualInputDeviceId: '' } }).catch(() => undefined)
              }} />
            {!selectedSource.startsWith('process:') ? <DeviceTest expect={selectedSource} /> : null}
          </div>
        </SettingsRow>
        <SettingsRow label={t('session.speechOutputDevice')}>
          <div className="flex w-full min-w-0 items-center gap-2">
            <SettingSelect className="min-w-0 flex-1" value={selectedOutput || 'default'} ariaLabel={t('session.speechOutputDevice')}
              options={speechOutputOptions(speechOutputs, selectedOutput || 'default', t)}
              onChange={value => { void updateSettings({ realtime: { speechOutputDeviceId: value === 'default' ? '' : value } }).catch(() => undefined) }} />
            <Button variant="tertiary" size="sm" disabled={realtimeActive || testingOutput || !speechOutputs.some(device => device.deviceId === selectedOutput)} onClick={() => void testSpeechOutput()}>{t('settings.testAudio')}</Button>
          </div>
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('session.virtualCable')} actions={
        <Button variant="secondary" size="sm" onClick={() => { void refreshCableStatus() }}>{t('gateway.refresh')}</Button>
      }>
        {installCable && !standardCablePresent ? <SettingsRow label={t('session.virtualCableInstall')} desc={t('session.virtualCableInstallHint')} descriptionTooltip>
          <Button size="sm" disabled={installingCable || realtimeActive} onClick={() => void runCableInstaller()}>
            {installingCable ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {t('session.virtualCableInstall')}
          </Button>
        </SettingsRow> : null}
        <SettingsRow label={t('session.virtualCableRouting')} desc={t('session.virtualCableHint')} descriptionTooltip>
          <Button nativeButton={false} role="link" variant="secondary" size="sm"
            render={<a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer" />}>
            {t('session.virtualCableGuide')}
          </Button>
        </SettingsRow>
        <SettingsRow label={t('session.virtualCableDriverVersion')}>
          <span className="text-sm text-muted">{checkingCableDriver ? t('gateway.loading') : cableDriverVersion || t('session.virtualCableMissing')}</span>
        </SettingsRow>
      </SettingGroup>

      <TranslationTab settings={settings} />

      {provider !== 'aliyun' ? <SettingGroup legend={t('settings.vadGroup')} actions={
        <Button variant="secondary" size="sm" className="bg-surface-tertiary" onClick={() => {
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


    </div>
  )
}

export interface CloudConnectionProps { recognition: RecognitionSettings; stored: boolean; onUpdate?: (patch: AppSettingsPatch) => Promise<void>; credentialField?: ReactNode; showNotice?: boolean }
export interface AliyunConnectionProps extends CloudConnectionProps { nativeTranslationSelected: boolean; showModel?: boolean }

/**
 * Aliyun streams over a persistent WebSocket, so it carries the region and workspace its socket
 * is opened against in addition to the model.
 */
export function AliyunConnection({ recognition, stored, nativeTranslationSelected, showModel = true, onUpdate = updateSettings, credentialField }: AliyunConnectionProps) {
  const { t } = useI18n()
  const model = recognition.aliyunModel ?? ALIYUN_ASR_MODELS[0]
  const models = ALIYUN_ASR_MODELS.map(value => ({ value, label: value }))
  const options = models.some(option => option.value === model) ? models : [...models, { value: model, label: model, isDisabled: true }]
  return <>
    {showModel ? <SettingsRow onboardingTarget="recognition-model" label={t('settings.recognitionModel')} desc={t('settings.aliyunHint')} descriptionTooltip>
      <SettingSelect value={model} ariaLabel={t('settings.recognitionModel')} options={options} onChange={value => {
        const aliyunModel = ALIYUN_ASR_MODELS.find(model => model === value)
        if (!aliyunModel) return
        void onUpdate({ recognition: { aliyunModel, sourceLanguage: 'auto' },
          ...(nativeTranslationSelected ? { translation: { provider: 'mymemory' as const } } : {}),
        }).catch(() => undefined)
      }} />
    </SettingsRow> : null}
    <SettingsRow label={t('settings.region')}>
      <SettingSelect value={recognition.aliyunRegion ?? 'cn-beijing'} ariaLabel={t('settings.region')} options={[
        { value: 'cn-beijing', label: t('settings.aliyunBeijing') },
        { value: 'ap-southeast-1', label: t('settings.aliyunSingapore') },
      ]} onChange={value => { void onUpdate({ recognition: { aliyunRegion: value as 'cn-beijing' | 'ap-southeast-1' } }).catch(() => undefined) }} />
    </SettingsRow>
    <TextRow label={t('settings.aliyunWorkspace')} value={recognition.aliyunWorkspaceId ?? ''} onCommit={value => { void onUpdate({ recognition: { aliyunWorkspaceId: value.trim() } }).catch(() => undefined) }} />
    {credentialField ?? <ApiKeyRow provider="aliyun-asr" stored={stored} />}
  </>
}

/**
 * MiniMax takes an uploaded file rather than a stream, so it carries no region and no workspace:
 * the endpoint picks the account's region instead. The notice is a row of its own rather than a
 * tooltip because captions arriving a sentence at a time reads as a stall unless it says why
 * before the session starts.
 */
export function MiniMaxConnection({ recognition, stored, onUpdate = updateSettings, credentialField, showNotice = true }: CloudConnectionProps) {
  const { t } = useI18n()
  return <>
    <SettingsRow onboardingTarget="recognition-model" label={t('settings.recognitionModel')}>
      <SettingSelect value={recognition.minimaxModel ?? MINIMAX_RECOGNITION_MODELS[0]} ariaLabel={t('settings.recognitionModel')} options={MINIMAX_RECOGNITION_MODELS.map(value => ({ value, label: value }))} onChange={value => {
        void onUpdate({ recognition: { minimaxModel: value as MinimaxRecognitionModel } }).catch(() => undefined)
      }} />
    </SettingsRow>
    <TextRow label={t('settings.endpoint')} value={recognition.minimaxEndpoint ?? ''} onCommit={value => { void onUpdate({ recognition: { minimaxEndpoint: value.trim() } }).catch(() => undefined) }} />
    {credentialField ?? <ApiKeyRow provider="minimax-asr" stored={stored} />}
    {showNotice ? <p className="nola-caption text-muted">{t('settings.minimaxNotice')}</p> : null}
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

