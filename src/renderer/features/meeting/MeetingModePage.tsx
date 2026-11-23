import { useCallback, useEffect, useRef, useState } from 'react'
import { Captions, CircleHelp, MessagesSquare, RefreshCw, Keyboard } from 'lucide-react'
import { ALIYUN_LANGUAGES, ALIYUN_S2S_SPEECH_LANGUAGES } from '../../../shared/cloud-config'
import { appendSupportCode, SUPPORT_ERROR_CATALOG, supportErrorCodeForCause } from '../../../shared/error-catalog'
import { normalizeLanguage } from '../../../shared/languages'
import { intersectLanguages, useModelOptions } from '@/model-options'
import { resolveModelBinding, useAvailableModels } from '@/available-models'
import { sceneModelBinding } from '../../../shared/model-policy'
import { LanguageDirectionSelect } from '@/components/primitives/LanguageDirectionSelect'
import { DEFAULT_MEETING_MODE, type MeetingModeSettings, type MeetingModeSnapshot } from '../../../shared/meeting-mode'
import { vbCablePair } from '../../../shared/virtual-audio'
import { DEFAULT_SETTINGS, defaultRealtimeS2s } from '../../../shared/settings'
import { PageHeader } from '@/components/primitives'
import { notifyError } from '@/components/primitives/notify'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { RealtimeProcessingField } from '../workspace/RealtimePipelineSelect'
import { SliderControl, SliderIndicator, SliderRoot, SliderThumb, SliderTrack } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n, type TranslationKey } from '@/i18n'
import { meetingZh } from '@/i18n/meeting-ui'
import { actions, getBridge, stores, useStore } from '@/store'
import { SettingSelect, type PickerOption } from '../settings/SettingsPage'
import { TextProcessingSceneField } from '../settings/text-processing/TextProcessingSceneField'
import { MeetingStage } from './MeetingStage'
import { ModelAvailabilityLabel } from '../workspace/ModelAvailabilityLabel'

const IDLE: MeetingModeSnapshot = { state: 'idle', passthroughActive: false }
const deviceFields = ['microphoneId', 'uplinkOutputId', 'downlinkInputId', 'headphonesId'] as const
type DeviceField = typeof deviceFields[number]
const deviceLabels = {
  microphoneId: 'shellUi.audioSource', uplinkOutputId: 'session.speechOutputDevice',
  downlinkInputId: 'shellUi.audioSource', headphonesId: 'session.speechOutputDevice',
} as const

function errorCopy(error: MeetingModeSnapshot['error']): TranslationKey | undefined {
  const key = error?.key
  if (key?.startsWith('meeting.') && Object.hasOwn(meetingZh, key.slice(8))) return key as TranslationKey
  if (key === 'session.slotBusy') return 'meeting.busy'
  const code = supportErrorCodeForCause(error?.code)
  return code !== 'ERR-999' ? SUPPORT_ERROR_CATALOG[code].messageKey : key ? 'meeting.pipelineFailed' : undefined
}

export function MeetingModePage() {
  const { t, language } = useI18n()
  const api = getBridge()?.meetingMode
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const saved = settings.meetingMode
  const devices = useStore(stores.models, state => state.devices)
  const catalog = useAvailableModels()
  const modelOptions = useModelOptions()
  const ttsBinding = resolveModelBinding('tts', sceneModelBinding(settings, 'tts') || settings.synthesis.modelId, catalog.tts).binding
  const speechLanguages = catalog.tts.find(model => model.binding === ttsBinding)?.targetLanguages ?? []
  const [draft, setDraft] = useState<MeetingModeSettings>()
  const preferenceRevision = useRef({ captionScope: 0, showSpeaker: 0 })
  const [snapshot, setSnapshot] = useState(IDLE)
  const [statusLoading, setStatusLoading] = useState(true)
  const [deviceState, setDeviceState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const mode = draft ?? saved ?? DEFAULT_MEETING_MODE
  const pending = statusLoading || snapshot.state === 'starting' || snapshot.state === 'stopping'
  const running = snapshot.state === 'running'
  const canStop = running || snapshot.state === 'unknown'
  const locked = pending || canStop || !api
  const refresh = useCallback(async () => {
    setDeviceState('loading')
    try { await actions.models.probeAudioDevices(); setDeviceState('loaded') }
    catch (error) { console.error('meeting device list failed', error); setDeviceState('failed') }
  }, [])
  useEffect(() => {
    if (!api) {
      setStatusLoading(false)
      setSnapshot({ state: 'unknown', passthroughActive: false, error: { key: 'meeting.statusFailed' } })
      return
    }
    let alive = true
    let changed = false
    const off = api.onChanged(value => { changed = true; setStatusLoading(false); setSnapshot(value) })
    void api.snapshot().then(value => { if (alive && !changed) { setSnapshot(value) } })
      .catch(error => {
        console.error('meeting status failed', error)
        if (alive && !changed) setSnapshot({ state: 'unknown', passthroughActive: false, error: { key: 'meeting.statusFailed' } })
      }).finally(() => { if (alive) setStatusLoading(false) })
    void refresh()
    return () => { alive = false; off() }
  }, [api, refresh])
  const virtualInputs = devices.filter(device => device.kind === 'microphone')
  const virtualOutputs = devices.filter(device => device.kind === 'systemOutput')
  const routes = {
    microphoneId: virtualInputs,
    uplinkOutputId: virtualOutputs,
    downlinkInputId: virtualInputs,
    headphonesId: virtualOutputs,
  }
  const uplink = vbCablePair(virtualOutputs.find(device => device.deviceId === mode.uplinkOutputId)?.name ?? '', 'Input')
  const downlink = vbCablePair(virtualInputs.find(device => device.deviceId === mode.downlinkInputId)?.name ?? '', 'Output')
  const applications = devices.filter(device => device.kind === 'processAudio')
  const hasDevice = (field: DeviceField) => routes[field].some(device => device.deviceId === mode[field])
  const directSpeech = mode.pipeline === 's2s' || mode.pipeline === 'auto' && !!defaultRealtimeS2s(settings)
  const recognitionSources = modelOptions.recognitionSourceLanguages.length === 1 && modelOptions.recognitionSourceLanguages[0] === 'auto' && modelOptions.recognitionProvider === 'aliyun'
    ? ALIYUN_LANGUAGES : modelOptions.recognitionSourceLanguages
  const sources = intersectLanguages(recognitionSources, modelOptions.translationSourceLanguages.length ? modelOptions.translationSourceLanguages : undefined)
  const targets = intersectLanguages(modelOptions.translationTargetLanguages, speechLanguages)
  const codes = directSpeech ? ALIYUN_S2S_SPEECH_LANGUAGES : [...new Set([...sources, ...targets].map(normalizeLanguage))].filter(code => code !== 'auto' && code !== 'none')
  const localCodes = codes.filter(code => directSpeech || (!mode.uplinkEnabled || sources.includes(code) && modelOptions.supportsTranslation(code, mode.remoteLanguage)) && (!mode.downlinkEnabled || targets.includes(code) && modelOptions.supportsTranslation(mode.remoteLanguage, code)))
  const remoteCodes = codes.filter(code => directSpeech || (!mode.downlinkEnabled || sources.includes(code) && modelOptions.supportsTranslation(code, mode.localLanguage)) && (!mode.uplinkEnabled || targets.includes(code) && modelOptions.supportsTranslation(mode.localLanguage, code)))
  const valid = (mode.uplinkEnabled || mode.downlinkEnabled)
    && (!mode.uplinkEnabled || hasDevice('microphoneId') && hasDevice('uplinkOutputId'))
    && (!mode.downlinkEnabled || hasDevice('headphonesId') && (mode.downlinkSource === 'application'
      ? applications.some(device => device.deviceId === mode.applicationId) : hasDevice('downlinkInputId')))
    && !(mode.uplinkEnabled && mode.downlinkEnabled && (mode.uplinkOutputId === mode.headphonesId
      || mode.downlinkSource === 'cable' && (mode.microphoneId === mode.downlinkInputId || !!uplink && uplink === downlink)))
    && mode.localLanguage !== mode.remoteLanguage
    && (directSpeech || !modelOptions.translationAvailable || (!mode.uplinkEnabled || modelOptions.supportsTranslation(mode.localLanguage, mode.remoteLanguage))
      && (!mode.downlinkEnabled || modelOptions.supportsTranslation(mode.remoteLanguage, mode.localLanguage)))

  const change = <Key extends keyof MeetingModeSettings>(key: Key, value: MeetingModeSettings[Key]) => {
    setDraft(previous => ({ ...(previous ?? mode), [key]: value }))
    if (key === 'captionScope' || key === 'showSpeaker') {
      const preference = key === 'captionScope' ? 'captionScope' : 'showSpeaker'
      const revision = ++preferenceRevision.current[preference]
      void actions.settings.updateSettings({ meetingMode: { ...mode, [key]: value } }).catch(error => {
        if (preferenceRevision.current[preference] === revision) {
          const restored = stores.settings.getState().settings?.meetingMode?.[preference] ?? mode[preference]
          setDraft(previous => previous ? { ...previous, [preference]: restored } : previous)
        }
        notifyError(t('errors.settingsSaveFailed'), { cause: error })
      })
    }
  }
  const select = (key: keyof MeetingModeSettings, label: TranslationKey, value: string, options: readonly PickerOption[], onChange: (value: string) => void) =>
    <Field key={key} className="nola-settings-field">
      <FieldLabel htmlFor={`meeting-${key}`}>{t(label)}</FieldLabel>
      <SettingSelect id={`meeting-${key}`} value={value} ariaLabel={t(label)} options={options} onChange={onChange} isDisabled={locked} />
    </Field>
  const deviceSelect = (key: DeviceField) => select(key, deviceLabels[key], routes[key].some(device => device.deviceId === mode[key]) ? mode[key] : '',
    [{ value: '', label: t('meeting.select'), isDisabled: true }, ...routes[key].map(device => ({
      value: device.deviceId, label: device.name, group: t(vbCablePair(device.name, key === 'microphoneId' ? 'Output' : 'Input') ? 'session.virtualCable' : key === 'microphoneId' ? 'session.microphones' : 'session.playbackDevices'),
      isDisabled: key === 'uplinkOutputId' && mode.downlinkEnabled && mode.downlinkSource === 'cable' && !!downlink && vbCablePair(device.name, 'Input') === downlink
        || key === 'downlinkInputId' && mode.uplinkEnabled && !!uplink && vbCablePair(device.name, 'Output') === uplink,
    }))], value => change(key, value))

  const inputSourceOptions: PickerOption[] = [
    { value: '', label: t('meeting.select'), isDisabled: true },
    ...applications.map(device => ({ value: `application:${device.deviceId}`, label: device.name, group: t('session.applicationAudio') })),
    ...virtualInputs.map(device => ({ value: `device:${device.deviceId}`, label: device.name,
      group: t(vbCablePair(device.name, 'Output') ? 'session.virtualCable' : 'session.microphones'),
      isDisabled: mode.uplinkEnabled && (device.deviceId === mode.microphoneId || !!uplink && vbCablePair(device.name, 'Output') === uplink),
    })),
  ]
  const inputSource = mode.downlinkSource === 'application' ? `application:${mode.applicationId}` : `device:${mode.downlinkInputId}`
  const selectInputSource = (value: string) => {
    const application = applications.find(device => `application:${device.deviceId}` === value)
    const input = virtualInputs.find(device => `device:${device.deviceId}` === value)
    if (application || input) setDraft(previous => ({ ...(previous ?? mode),
      ...(application ? { downlinkSource: 'application', applicationId: application.deviceId } as const
        : { downlinkSource: 'cable', downlinkInputId: input!.deviceId } as const),
    }))
  }

  const run = async () => {
    if (!api) return
    if (!canStop && !valid) {
      setSnapshot({ state: 'failed', passthroughActive: false, error: { key: 'meeting.invalidRoute' } })
      return
    }
    if (!canStop && valid) {
      setSnapshot({ state: 'starting', passthroughActive: false })
      try {
        await actions.settings.updateSettings({ meetingMode: mode })
        setSnapshot(await api.start(mode))
      } catch (error) {
        console.error('meeting start failed', error)
        setSnapshot({ state: 'failed', passthroughActive: false, error: { key: 'meeting.startFailed' } })
      }
    } else if (canStop) {
      try { setSnapshot(await api.stop()) }
      catch (error) {
        console.error('meeting stop failed', error)
        setSnapshot(current => ({ ...current, error: { key: 'meeting.stopFailed' } }))
      }
    }
  }
  const localizedError = errorCopy(snapshot.error)
  const originalVolume = new Intl.NumberFormat(language, { style: 'percent' }).format(mode.duckVolume / 100)
  const preferences = <FieldGroup className="nola-settings-fields">
      <div className="col-span-full flex flex-wrap items-center justify-between gap-2">
        <h2 className="nola-settings-heading">{t('meeting.translation')}</h2>
        <Button nativeButton={false} variant="outline" size="sm" render={<a href="#/settings/audio" />}>{t('settings.audioDevicesGroup')}</Button>
      </div>
      {mode.downlinkSource === 'cable' && mode.downlinkEnabled ? <Field className="nola-settings-field">
        <div className="nola-meeting-preference-label"><FieldLabel id="meeting-duck-volume">{t('meeting.duckVolume')}</FieldLabel><Tooltip>
          <TooltipTrigger render={<button type="button" className="inline-flex text-muted" aria-label={t('meeting.duckVolume')} />}><CircleHelp className="size-3.5" aria-hidden="true" /></TooltipTrigger>
          <TooltipContent className="max-w-80 whitespace-normal">{t('meeting.duckVolumeHint')}</TooltipContent>
        </Tooltip></div>
        <div className="nola-meeting-volume-control"><SliderRoot value={mode.duckVolume} min={0} max={100} step={1} onValueChange={value => change('duckVolume', value)} disabled={locked}><SliderControl><SliderTrack><SliderIndicator /><SliderThumb aria-labelledby="meeting-duck-volume" aria-valuetext={originalVolume} /></SliderTrack></SliderControl></SliderRoot><span className="nola-meeting-volume-value">{originalVolume}</span></div>
      </Field> : null}
      <Field className="nola-meeting-route-heading"><FieldLabel htmlFor="meeting-speakers">{t('meeting.showSpeaker')}</FieldLabel><Switch id="meeting-speakers" checked={mode.showSpeaker} onCheckedChange={value => change('showSpeaker',value)}><SwitchThumb /></Switch></Field>
      <Field className="nola-settings-field"><FieldLabel htmlFor="meeting-captionScope">{t('meeting.captionScope')}</FieldLabel><SettingSelect id="meeting-captionScope" value={mode.captionScope} ariaLabel={t('meeting.captionScope')} options={[{value:'uplink',label:t('meeting.me')},{value:'downlink',label:t('meeting.remote')},{value:'both',label:t('meeting.both')}]} onChange={value => { if(value === 'uplink' || value === 'downlink' || value === 'both') change('captionScope',value) }} /></Field>
    </FieldGroup>

  return <section data-slot="meeting-page" className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('meeting.title')} warning={t('suite.experimentalInDevelopment')} subtitle={t('meeting.singlePageHint')} actions={<>
      <Button variant="outline" onClick={() => void actions.settings.showWorkspace().catch(error => notifyError(t('workspaceUi.windowFailed'), { cause: error }))}><MessagesSquare data-icon="inline-start" />{t('meeting.conversation')}</Button>
      <Button variant="outline" onClick={() => void actions.settings.showOverlay('workspace').then(opened => { if (opened === false) notifyError(t('workspaceUi.overlayFailed')) }).catch(error => notifyError(t('workspaceUi.overlayFailed'), { cause: error }))}><Captions data-icon="inline-start" />{t('workspaceUi.openOverlay')}</Button>
      <Button disabled={!api || pending} onClick={() => void run()}>
        {pending ? <Spinner data-icon="inline-start" /> : null}{t(snapshot.state === 'starting' ? 'gateway.starting' : snapshot.state === 'stopping' ? 'gateway.stopping' : canStop ? 'meeting.stop' : 'meeting.start')}
      </Button>
    </>} />
    {localizedError ? <Alert variant="danger"><AlertDescription>{snapshot.error?.direction ? <strong>{t(`meeting.${snapshot.error.direction}`)} · </strong> : null}{appendSupportCode(t(localizedError), snapshot.error?.code ? supportErrorCodeForCause(snapshot.error.code) : undefined)}</AlertDescription></Alert> : null}
    <MeetingStage mode={mode} snapshot={snapshot} />
    <Card data-slot="meeting-settings" className="nola-section-card nola-settings-card nola-meeting-settings">
      <CardContent className="nola-settings-content">
        <FieldGroup className="nola-settings-fields">
          <div className="col-span-full flex flex-wrap items-center justify-between gap-2">
            <h2 className="nola-settings-heading">{t('session.processingGroup')}</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={locked || deviceState === 'loading'} onClick={() => void refresh()}>{deviceState === 'loading' && api ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{t('meeting.refresh')}</Button>
              <Button nativeButton={false} variant="outline" size="sm" render={<a href="#/settings/shortcuts" />}><Keyboard data-icon="inline-start" />{t('shortcuts.title')}</Button>
            </div>
          </div>
          <RealtimeProcessingField id="meeting-pipeline" className="nola-settings-field" disabled={locked} value={mode.pipeline === 'auto' ? 'default' : mode.pipeline} onChange={value => change('pipeline', value === 'default' ? 'auto' : value)} />
          <Field className="nola-settings-field nola-language-pair-field">
            <ModelAvailabilityLabel label={t('shellUi.languageDirection')} hint={t('meeting.languageDirectionHint')} />
            <LanguageDirectionSelect source={mode.localLanguage} target={mode.remoteLanguage} sourceCodes={localCodes} targetCodes={remoteCodes}
              unavailable={directSpeech ? undefined : modelOptions.languageUnavailable ?? (!speechLanguages.length ? 'models' : !localCodes.length && !remoteCodes.length ? 'pair' : undefined)} requiredModels={[...modelOptions.requiredModels, ...(!speechLanguages.length ? ['TTS'] : [])]} disabled={locked}
              sourceLabel={t('meeting.localLanguage')} targetLabel={t('meeting.remoteLanguage')}
              onSourceChange={value => change('localLanguage', value)} onTargetChange={value => change('remoteLanguage', value)}
              onSwap={localCodes.includes(mode.remoteLanguage) && remoteCodes.includes(mode.localLanguage) ? () => setDraft(previous => ({ ...(previous ?? mode), localLanguage: mode.remoteLanguage, remoteLanguage: mode.localLanguage })) : undefined} />
          </Field>
          <TextProcessingSceneField scene="meeting" disabled={locked} />
        </FieldGroup>
        <FieldGroup className="nola-settings-fields">
          <h2 className="nola-settings-heading">{t('meeting.routing')}</h2>
          {deviceState === 'failed' ? <Alert variant="danger"><AlertDescription>{t('meeting.deviceListFailed')}</AlertDescription></Alert> : null}
          <div className="nola-meeting-routes">
            <FieldGroup>
              <Field className="nola-meeting-route-heading"><FieldLabel htmlFor="meeting-send">{t('meeting.sendDirection')}</FieldLabel><Switch id="meeting-send" checked={mode.uplinkEnabled} onCheckedChange={value => change('uplinkEnabled', value)} disabled={locked}><SwitchThumb /></Switch></Field>
              {mode.uplinkEnabled ? <>{deviceSelect('microphoneId')}{deviceSelect('uplinkOutputId')}</> : null}
            </FieldGroup>
            <FieldGroup>
              <Field className="nola-meeting-route-heading"><FieldLabel htmlFor="meeting-receive">{t('meeting.receiveDirection')}</FieldLabel><Switch id="meeting-receive" checked={mode.downlinkEnabled} onCheckedChange={value => change('downlinkEnabled', value)} disabled={locked}><SwitchThumb /></Switch></Field>
              {mode.downlinkEnabled ? <>
                {select('downlinkInputId', 'shellUi.audioSource', inputSourceOptions.some(option => option.value === inputSource) ? inputSource : '', inputSourceOptions, selectInputSource)}
                {deviceSelect('headphonesId')}
              </> : null}
            </FieldGroup>
          </div>
        </FieldGroup>
        {preferences}
      </CardContent>
    </Card>
  </section>
}
