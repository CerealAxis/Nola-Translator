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
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { SettingsRow } from '../SettingsRow'
import { notifyError, notifyInfo, notifySuccess } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'
import { DEFAULT_SETTINGS, ALIYUN_ASR_MODELS, MINIMAX_RECOGNITION_MODELS, type MinimaxRecognitionModel, type RecognitionSettings } from '../../../../shared/settings'
import { ApiKeyRow, TextRow, TranslationTab } from './TranslationTab'
import { speechOutputOptions, useAudioSourceOptions } from '@/audio-source-options'
import { audioSourceFrom, useSpeechOutputDevices } from '@/features/workspace/SessionSetupDialog'
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
  const selectedOutput = settings.realtime?.speechOutputDeviceId || 'default'
  const realtimeActive = useStore(stores.session, state => !['idle', 'error'].includes(state.status))
  const source = audioSourceFrom(devices.find(device => device.deviceId === selectedSource), selectedSource)
  const preview = useAudioDevicePreview(selectedSource, selectedOutput, realtimeActive)

  return (
    <div className="settings-panel" data-onboarding="recognition-settings">
      <SettingGroup legend={t('settings.audioDevicesGroup')}>
        <SettingsRow label={t('session.speechOutputDevice')}>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-[var(--label-gap)]">
            <SettingSelect className="max-w-full grow basis-48" value={selectedOutput} ariaLabel={t('session.speechOutputDevice')} isDisabled={!!preview.active}
              options={speechOutputOptions(speechOutputs, selectedOutput, t)}
              onChange={value => { preview.cancel(); void updateSettings({ realtime: { speechOutputDeviceId: value === 'default' ? '' : value } }).catch(() => undefined) }} />
            <Button variant={preview.active === 'output' ? 'danger' : 'secondary'} size="sm" disabled={realtimeActive || preview.active === 'input' ||
              (selectedOutput !== 'default' && !speechOutputs.some(device => device.deviceId === selectedOutput))}
              aria-label={t(preview.active === 'output' ? 'settings.stopAudioTest' : 'settings.testSpeaker')}
              onClick={preview.testOutput}>{t(preview.active === 'output' ? 'settings.stopAudioTest' : 'settings.test')}</Button>
          </div>
        </SettingsRow>
        <AudioLevelRow label={t('settings.outputLevel')} level={preview.outputLevel} />
        <SettingsRow onboardingTarget="audio-source" label={t('settings.inputDevice')}
          desc={source.kind === 'processAudio' ? t('session.applicationAudioHint') : undefined} descriptionTooltip>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-[var(--label-gap)]">
            <SettingSelect className="max-w-full grow basis-48" value={selectedSource} options={deviceOptions} isDisabled={!!preview.active}
              ariaLabel={t('settings.inputDevice')}
              onChange={value => { preview.cancel(); void updateSettings({ recognition: { audioSource: value }, realtime: { virtualInputDeviceId: '' } }).catch(() => undefined) }} />
            {source.kind !== 'browserTab' && (source.kind !== 'defaultOutput' || selectedSource === DEFAULT_OUTPUT)
              ? <Button variant={preview.active === 'input' ? 'danger' : 'secondary'} size="sm" disabled={realtimeActive || preview.active === 'output'}
                  aria-label={t(preview.active === 'input' ? 'settings.stopAudioTest' : 'settings.testInput')}
                  onClick={() => preview.testInput(source)}>{t(preview.active === 'input' ? 'settings.stopAudioTest' : 'settings.test')}</Button> : null}
          </div>
        </SettingsRow>
        <AudioLevelRow label={t('settings.inputLevel')} level={preview.inputLevel} />
      </SettingGroup>

      <SettingGroup legend={t('session.virtualCable')}>
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
          <div className="flex flex-wrap items-center justify-end gap-[var(--label-gap)]">
            <span className="type-body text-muted">{checkingCableDriver ? t('gateway.loading') : cableDriverVersion || t('session.virtualCableMissing')}</span>
            <Tooltip>
              <TooltipTrigger render={<Button variant="bare" size="icon-sm" aria-label={t('runtime.recheck')}
                disabled={checkingCableDriver} onClick={() => void refreshCableStatus()}><RefreshCw aria-hidden="true" /></Button>} />
              <TooltipContent>{t('runtime.recheck')}</TooltipContent>
            </Tooltip>
          </div>
        </SettingsRow>
      </SettingGroup>

      <TranslationTab settings={settings} />

      {provider !== 'aliyun' ? <SettingGroup legend={t('settings.vadGroup')} headingAction={
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
                    <SliderIndicator className="rounded-full bg-primary" />
                    <SliderThumb className="size-3 rounded-full bg-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus" aria-label={t(label)} />
                  </SliderTrack>
                </SliderControl>
              </SliderRoot>
              <output className="col-span-2 type-muted tabular text-end">{(settings.recognition[field] ?? fallback).toLocaleString(language)}</output>
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
    {showNotice ? <p className="type-muted text-muted">{t('settings.minimaxNotice')}</p> : null}
  </>
}

function AudioLevelRow({ label, level }: { label: string; level: number }) {
  return <SettingsRow label={label}>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}
      className="grid w-full min-w-0 grid-cols-10 gap-1">
      {Array.from({ length: 10 }, (_, index) => (
        <span key={index} className={`h-2 rounded-xs ${index * 10 < level ? 'bg-primary' : 'bg-surface-tertiary'}`} />
      ))}
    </div>
  </SettingsRow>
}

function useAudioDevicePreview(sourceId: string, outputId: string, realtimeActive: boolean) {
  const { t } = useI18n()
  const [active, setActive] = useState<'input' | 'output' | null>(null)
  const [inputLevel, setInputLevel] = useState(0)
  const [outputLevel, setOutputLevel] = useState(0)
  const current = useRef<AbortController | null>(null)
  const cancel = useCallback(() => current.current?.abort(), [])

  useEffect(() => cancel, [sourceId, outputId, realtimeActive, cancel])

  const run = (device: 'input' | 'output', message: string, preview: (signal: AbortSignal) => Promise<void>) => {
    if (current.current) { cancel(); return }
    if (realtimeActive) return
    const controller = new AbortController()
    current.current = controller
    setActive(device)
    notifyInfo(message)
    void preview(controller.signal).catch(cause => {
      if (!controller.signal.aborted) notifyError(t('settings.audioTestFailed'), { cause })
    }).finally(() => {
      current.current = null
      setInputLevel(0)
      setOutputLevel(0)
      setActive(null)
    })
  }

  return {
    active, inputLevel, outputLevel, cancel,
    testInput: (source: import('@/bridge').AudioPreviewSource) => run('input',
      t(source.kind === 'microphone' ? 'settings.microphoneTestRunning' : 'settings.playAudioTestPrompt'), async signal => {
        const bridge = getBridge()
        if (!bridge) throw new Error('engineNotReady')
        await bridge.engine.previewAudioInput(source, setInputLevel, signal)
      }),
    testOutput: () => run('output', t('settings.playAudioTestPrompt'), signal => playSpeakerPreview(outputId, setOutputLevel, signal)),
  }
}

async function playSpeakerPreview(outputId: string, onLevel: (value: number) => void, signal: AbortSignal) {
  const context: AudioContext & { setSinkId?: (device: string) => Promise<void> } = new AudioContext()
  const close = () => { if (context.state !== 'closed') void context.close().catch(() => undefined) }
  signal.addEventListener('abort', close, { once: true })
  let animation = 0
  try {
    if (outputId !== 'default') {
      if (!context.setSinkId) throw new Error('audioDeviceUnavailable')
      await context.setSinkId(outputId)
    }
    await context.resume()
    signal.throwIfAborted()
    const tone = context.createBufferSource()
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const waveform = buffer.getChannelData(0)
    for (let index = 0; index < context.sampleRate; index++) {
      const time = index / context.sampleRate
      const envelope = Math.min(1, time / 0.05, (1 - time) / 0.05)
      waveform[index] = 0.12 * envelope * Math.sin(2 * Math.PI * 440 * time)
    }
    tone.buffer = buffer
    tone.loop = true
    const analyser = context.createAnalyser()
    tone.connect(analyser).connect(context.destination)
    const samples = new Float32Array(analyser.fftSize)
    const measure = () => {
      analyser.getFloatTimeDomainData(samples)
      onLevel(Math.round(samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) * 100))
      animation = requestAnimationFrame(measure)
    }
    const ended = new Promise<void>(resolve => {
      signal.addEventListener('abort', () => resolve(), { once: true })
      tone.onended = () => resolve()
    })
    tone.start()
    measure()
    await ended
  } finally {
    signal.removeEventListener('abort', close)
    cancelAnimationFrame(animation)
    close()
  }
}
