import { useModelOptions } from '@/model-options'
import { modelBindingPatch, resolveModelBinding, savedBindingOf, useAvailableModels, useGatewaySnapshot } from '@/available-models'
import { supportsTranslation } from '../../../shared/model-capabilities'
import { TranslationCompatibilityDialog } from '../models/TranslationCompatibilityDialog'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SettingSwitch } from '../settings/SettingsPage'
import { CircleHelp } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import {
  DEFAULT_SETTINGS,
  languageName,
} from '@/bridge'
import type { AudioDevice, AudioSourceOption, RecognitionModelId, SessionConfig } from '@/bridge'
import { SettingRow } from '@/components/primitives'
import { notifyGatewayModelUnavailable, notifyInfo } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { aliyunConnectionReady } from '../../../shared/cloud-models'
import type { UiLanguage } from '@/i18n'
import { autoMeetingTitle, nextDaySequence } from '@/meeting-format'
import { stores, useStore } from '@/store'
import { translationFieldsOf } from '@/session-config'
import { ALIYUN_LANGUAGES, ALIYUN_S2S_SPEECH_LANGUAGES, recognitionFieldsOf, remoteSourceLanguages } from '../../../shared/cloud-config'
import { defaultRealtimeS2s, type RealtimeSettings } from '../../../shared/settings'
import { RealtimePipelineFields } from './RealtimePipelineSelect'
import { normalizeModelBinding } from '../../../shared/model-gateway'
import { speechOutputOptions, useAudioSourceOptions } from '@/audio-source-options'
import { SettingSelect } from '../settings/SettingsPage'
import { SettingsRow } from '../settings/SettingsRow'
import { vbCablePair } from '../../../shared/virtual-audio'

/** Form state, not in the store: a one-shot draft, and storing it would make Cancel a write. */
export interface SetupDraft {
  title: string
  audioSource: string
  sourceLanguage: string
  recognitionModelId: RecognitionModelId
  /**
   * Which model the gateway should serve this session with, in binding form. It is the draft's own
   * choice, so picking a cloud interface here does not rewrite the global recognition provider.
   */
  recognitionBinding?: string
  outputMode: 'source' | 'translation' | 'speech'
  speakerDetection: boolean
  speechModelId: string
  speechVoice: string
  speechOutputDeviceId: string
  s2sModel?: RealtimeSettings['s2sModel']
  virtualInputDeviceId?: string
  targetLanguage: string
  /** Local model for this session. Empty string falls back to the setting's `translation.localModelId`. */
  translationModelId: string
  translationBinding?: string
  keepAudio: boolean
}

export interface SessionSetupDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  draft: SetupDraft
  onDraftChange: (draft: SetupDraft) => void
  devices: readonly AudioDevice[]
  /** Used to format the default meeting title. */
  language: UiLanguage
  /** Called with the draft turned into the engine's SessionConfig. */
  onSubmit: (config: SessionConfig) => void
}

export function useSpeechOutputDevices(): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.enumerateDevices) return
    let mounted = true
    const read = (): void => {
      void mediaDevices.enumerateDevices().then(all => {
        if (mounted) setDevices(all.filter(device => device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default'))
      }).catch(() => { if (mounted) setDevices([]) })
    }
    read()
    mediaDevices.addEventListener?.('devicechange', read)
    return () => { mounted = false; mediaDevices.removeEventListener?.('devicechange', read) }
  }, [])
  return devices
}

export function SessionSetupDialog({
  isOpen,
  onOpenChange,
  draft,
  onDraftChange,
  devices,
  language,
  onSubmit,
}: SessionSetupDialogProps) {
  const { t } = useI18n()
  /**
   * Model and language choices are inherited from quick sync settings.
   * `DEFAULT_SETTINGS` keeps the session usable before settings finish loading.
   */
  const settings = useStore(stores.settings, (state) => state.settings) ?? DEFAULT_SETTINGS
  const s2sReady = aliyunConnectionReady(settings, useStore(stores.models, state => state.credentials['aliyun-asr']))
  const translation = settings.translation
  const resources = useStore(stores.models, (state) => state.resources)
  const modelOptions = useModelOptions(draft.recognitionModelId, draft.translationModelId || translation.localModelId, draft.sourceLanguage)
  const catalog = useAvailableModels()
  const gateway = useGatewaySnapshot()
  const asr = resolveModelBinding('asr', draft.recognitionBinding ?? savedBindingOf('asr', settings), catalog.asr)
  const mt = resolveModelBinding('mt', draft.translationBinding ?? (translation.provider === 'local' && draft.translationModelId ? `resource:${draft.translationModelId}` : savedBindingOf('mt', settings)), catalog.mt)
  const selectedAsr = catalog.asr.find(model => model.binding === asr.binding)
  const translationPatch = modelBindingPatch('mt', mt.binding, settings).translation
  const effectiveTranslation = { ...translation, ...translationPatch, fallback: { ...translation.fallback, ...translationPatch?.fallback } }
  const gatewayS2sModel = defaultRealtimeS2s(settings)
  const s2sModel = draft.outputMode === 'source' ? null : draft.s2sModel === undefined ? gatewayS2sModel : draft.s2sModel
  const effectiveRecognition = s2sModel
    ? { ...settings.recognition, provider: 'aliyun' as const, aliyunModel: s2sModel }
    : { ...settings.recognition, ...modelBindingPatch('asr', asr.binding, settings).recognition }
  const speechBinding = draft.speechModelId
    ? normalizeModelBinding('tts', draft.speechModelId)
    : savedBindingOf('tts', settings)
  const tts = resolveModelBinding('tts', speechBinding, catalog.tts)
  const resolvedSpeechModelId = tts.binding.startsWith('resource:') ? tts.binding.slice(9) : tts.binding
  const voices = gateway?.services.tts.model.replace(/^resource:/, '') === resolvedSpeechModelId ? gateway.services.tts.voices ?? [] : []
  const translationEnabled = draft.outputMode !== 'source'
  const needsMt = translationEnabled && !s2sModel
  const sourceLanguages = s2sModel ? remoteSourceLanguages(effectiveRecognition) : selectedAsr?.sourceLanguages ?? modelOptions.sourceLanguages
  const s2sTargets: readonly string[] = draft.outputMode === 'speech' ? ALIYUN_S2S_SPEECH_LANGUAGES : ALIYUN_LANGUAGES
  const s2sTargetValid = !s2sModel || (s2sReady && s2sTargets.includes(draft.targetLanguage))
  const canSpeakTarget = !s2sModel || ALIYUN_S2S_SPEECH_LANGUAGES.includes(draft.targetLanguage)
  const sourceLanguage = s2sModel && !sourceLanguages.includes(draft.sourceLanguage) ? 'auto' : draft.sourceLanguage
  const [dismissedPair, setDismissedPair] = useState<string | null>(null)
  const signature = `${mt.binding}|${draft.sourceLanguage}|${draft.targetLanguage}`
  const selectedTranslation = mt.binding.startsWith('resource:') ? resources.find(model => model.resourceId === mt.binding.slice(9)) : undefined
  const incompatible = needsMt && !!selectedTranslation && !supportsTranslation(selectedTranslation, draft.sourceLanguage, draft.targetLanguage)
  const recognitionValid = sourceLanguages.includes(sourceLanguage)
  const selectedSource = draft.virtualInputDeviceId || draft.audioSource
  const virtualInput = !!draft.virtualInputDeviceId || devices.some(device => device.deviceId === selectedSource && device.kind === 'microphone' && vbCablePair(device.name, 'Output'))
  const needsExplicitOutput = draft.outputMode === 'speech' && virtualInput
  const missingExplicitOutput = needsExplicitOutput && (!draft.speechOutputDeviceId || draft.speechOutputDeviceId === 'default')
  const modelsConfigured = !!s2sModel || !asr.unavailable && (!needsMt || !mt.unavailable) && (draft.outputMode !== 'speech' || !tts.unavailable)
  const meetings = useStore(stores.meetings, (state) => state.meetings)
  const outputDevices = useSpeechOutputDevices()
  const sourceOptions = useAudioSourceOptions(devices, selectedSource, isOpen)

  /**
   * The default name shown in the name field: the name the system will give
   * this meeting.
   *
   * It is a preview only, and `draft.title` stays an empty string, so
   * `WorkspacePage.start` skips `renameMeeting` and the record keeps
   * `title: ''` with `titleIsCustom: false`. That is why getting this preview
   * slightly wrong is harmless: nothing is persisted until the user edits
   * it, and only then is the title custom.
   *
   * The sequence matches the main process's `nextDaySequence` (see
   * `meeting-format.ts`). Crossing midnight while this dialog is open shifts
   * the preview by a day, which is display-only for the same reason.
   */
  const previewName = useMemo(() => {
    const now = Date.now()
    return autoMeetingTitle(now, nextDaySequence(meetings, now), language)
  }, [meetings, language])

  const patch = useCallback(
    (next: Partial<SetupDraft>) => {
      onDraftChange({ ...draft, ...next })
    },
    [draft, onDraftChange],
  )

  // The system default output is not an entry in the device list: in the
  // protocol it is `{ kind: 'defaultOutput' }`, not a device. So the options
  // are the device list plus one synthetic entry, not just `devices`.
  const audioOptions: AudioSourceOption[] = useMemo(() => {
    const fromDevices: AudioSourceOption[] = devices.map((device) => ({
      value: device.deviceId,
      kind: device.kind,
      deviceId: device.deviceId,
      name: device.name,
      isDefault: device.isDefault,
    }))
    // A protocol pseudo-source that `listDevices()` never returns, so the first
    // option is supplied here. Its name goes through i18n
    // (`shellUi.defaultOutput`).
    const systemDefault: AudioSourceOption = {
      value: 'defaultOutput',
      kind: 'defaultOutput',
      deviceId: null,
      name: t('shellUi.defaultOutput'),
      isDefault: true,
    }
    const known = new Set(fromDevices.map((option) => option.value))
    return known.has(systemDefault.value) ? fromDevices : [systemDefault, ...fromDevices]
  }, [devices, t])

  const submit = useCallback(() => {
    if (incompatible) { setDismissedPair(null); return }
    if (!modelsConfigured) {
      const kind = asr.unavailable ? 'asr' : translationEnabled && mt.unavailable ? 'mt' : 'tts'
      notifyGatewayModelUnavailable(t('gateway.modelNone', { name: t(`gateway.${kind}`) }), t('gateway.modelGatewayStartHint'), t('gateway.title'))
      return
    }
    if (!recognitionValid || !s2sTargetValid) return
    if (missingExplicitOutput) return
    for (const replacement of [s2sModel ? null : asr.replaced, needsMt ? mt.replaced : null]) {
      if (replacement) notifyInfo(t('gateway.modelSwitched', { name: replacement.name }), { description: t('gateway.modelSwitchedLoaded') })
    }
    // The name is optional: the engine generates one from the start time and
    // the day sequence, so there is no "cannot be empty" error here.
    const option = audioOptions.find((item) => item.value === draft.audioSource)
    onSubmit({
      audioSource: draft.virtualInputDeviceId ? { kind: 'virtualInput', deviceId: draft.virtualInputDeviceId } : audioSourceFrom(option, draft.audioSource),
      s2sModel: s2sModel ?? null,
      recognitionMode: 'realtime',
      recognitionModelId: asr.binding.startsWith('resource:') ? asr.binding.slice(9) as RecognitionModelId : draft.recognitionModelId,
      ...(!s2sModel ? { recognitionBinding: asr.binding } : {}),
      ...(needsMt ? { translationBinding: mt.binding } : {}),
      ...recognitionFieldsOf(effectiveRecognition),
      sourceLanguage,
      /*
       * Provider, quantization and cloud credential all come from settings.
       * Hardcoding them here would also fool start-time model validation, which checks the
       * same `translationModelId` that gets sent, so a session missing its
       * weights would pass validation and only fail in the engine.
       *
       * `modelId` is the one field this dialog owns: it is a choice the user
       * makes here, and omitting it falls back to the setting's
       * `localModelId`. For the empty-array rule, the three options shapes
       * and the absent field a local provider requires, see
       * `@/session-config`.
       */
      ...(s2sModel ? { targetLanguages: [draft.targetLanguage], translationProvider: 'recognition' as const } : translationFieldsOf(effectiveTranslation, {
        enabled: translationEnabled,
        targetLanguage: draft.targetLanguage,
        modelId: mt.binding.startsWith('resource:') ? mt.binding.slice(9) : undefined,
      })),
      outputMode: draft.outputMode,
      speakerDetection: draft.speakerDetection,
      ...(draft.outputMode === 'speech' ? { speechOutputDeviceId: draft.speechOutputDeviceId } : {}),
      ...(draft.outputMode === 'speech' && !s2sModel ? {
        speechModelId: resolvedSpeechModelId,
        ...(draft.speechVoice.trim() ? { speechVoice: draft.speechVoice.trim() } : {}),
      } : {}),
    })
  }, [audioOptions, draft, onSubmit, effectiveTranslation, effectiveRecognition, incompatible, modelsConfigured, recognitionValid, s2sTargetValid, missingExplicitOutput, asr, mt, translationEnabled, needsMt, s2sModel, sourceLanguage, resolvedSpeechModelId, t])

  return (
    <>
    <TranslationCompatibilityDialog key={signature} isOpen={isOpen && incompatible && dismissedPair !== signature} onClose={() => setDismissedPair(signature)} source={draft.sourceLanguage} target={draft.targetLanguage} translation={selectedTranslation} resources={resources.filter(resource => catalog.mt.some(model => model.binding === `resource:${resource.resourceId}`))} compute={settings.compute ?? DEFAULT_COMPUTE_SETTINGS}
      onChangeModel={translationModelId => patch({ translationModelId, translationBinding: `resource:${translationModelId}` })} />
    <Dialog open={isOpen && !(incompatible && dismissedPair !== signature)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border border-border">
        <DialogHeader><DialogTitle>{t('session.title')}</DialogTitle></DialogHeader>
        <div className="nola-dialog-body flex flex-col gap-4">
          {translationEnabled ? <RealtimePipelineFields className="flex flex-col gap-2" model={draft.s2sModel} gatewayModel={gatewayS2sModel}
            s2sReady={s2sReady} onChange={s2sModel => patch({ s2sModel })} /> : null}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="session-name">{t('session.name')}</Label>
              <Tooltip><TooltipTrigger render={<Button variant="secondary" size="icon-xs" aria-label={t('session.nameHelpAria')} className="min-h-6 shrink-0 border-transparent bg-transparent text-muted hover:bg-surface-secondary" />}><CircleHelp aria-hidden="true" /></TooltipTrigger><TooltipContent className="max-w-96 whitespace-normal">{t('session.nameHint')}</TooltipContent></Tooltip>
            </div>
            <Input id="session-name" value={draft.title || previewName} onChange={event => patch({ title: event.target.value })} />
          </div>
          <div className="rounded-2xl border border-border">
            <SettingRow label={t('session.keepAudio')} desc={t('session.keepAudioHint')} descriptionTooltip className="hover:bg-transparent">
              <SettingSwitch isSelected={draft.keepAudio} ariaLabel={t('session.keepAudio')} onChange={keepAudio => patch({ keepAudio })} />
            </SettingRow>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('session.outputMode')}</Label>
            <ToggleGroup value={[draft.outputMode === 'source' ? 'source' : 'translation']} aria-label={t('session.outputMode')} onValueChange={values => { const value = values[0]; if (value === 'source') patch({ outputMode: 'source' }); else if (value === 'translation' && draft.outputMode === 'source') patch({ outputMode: 'translation' }) }}>
              <ToggleGroupItem value="source">{t('session.outputSource')}</ToggleGroupItem>
              <ToggleGroupItem value="translation">{t('session.outputTranslation')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="rounded-2xl border border-border">
            <SettingRow label={t('session.speakerDetection')} desc={t('session.speakerDetectionHint')} descriptionTooltip className="hover:bg-transparent">
              <SettingSwitch isSelected={draft.speakerDetection} ariaLabel={t('session.speakerDetection')} onChange={speakerDetection => patch({ speakerDetection })} />
            </SettingRow>
          </div>
          {s2sModel ? <>
            <SettingsRow label={t('session.sourceLanguage')}>
              <SettingSelect ariaLabel={t('session.sourceLanguage')} value={sourceLanguage} options={sourceLanguages.map(value => ({ value, label: languageName(value, language) }))} onChange={value => patch({ sourceLanguage: value })} />
            </SettingsRow>
            <SettingsRow label={t('session.targetLanguage')}>
              <SettingSelect ariaLabel={t('session.targetLanguage')} value={draft.targetLanguage} options={s2sTargets.map(value => ({ value, label: languageName(value, language) }))} onChange={value => patch({ targetLanguage: value })} />
            </SettingsRow>
          </> : null}
          <SettingsRow label={t('settings.audioSource')}>
            <SettingSelect ariaLabel={t('settings.audioSource')} value={selectedSource} options={[
              { value: 'defaultOutput', label: t('settings.audioSourceSystem') }, ...sourceOptions,
            ]} onChange={audioSource => patch({ audioSource, virtualInputDeviceId: '' })} />
          </SettingsRow>
          {draft.audioSource.startsWith('process:') ? <p className="nola-caption text-muted">{t('session.applicationAudioHint')}</p> : null}
          {virtualInput ? <p className="nola-caption text-muted">{t('session.virtualInputHint')}</p> : null}
          {translationEnabled ? <SettingsRow label={t('session.speakTranslation')} desc={canSpeakTarget ? undefined : t('session.speechLanguageUnavailable')}>
            <SettingSwitch ariaLabel={t('session.speakTranslation')} isSelected={draft.outputMode === 'speech'}
              isDisabled={draft.outputMode !== 'speech' && !canSpeakTarget}
              onChange={enabled => patch({ outputMode: enabled ? 'speech' : 'translation' })} />
          </SettingsRow> : null}
          {draft.outputMode === 'speech' ? <div className="flex flex-col gap-3">
            {!s2sModel ? <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-speech-model">{t('session.speechModel')}</Label>
              <Select value={tts.binding} onValueChange={binding => { if (binding) patch({ speechModelId: binding.startsWith('resource:') ? binding.slice(9) : binding }) }}>
                <SelectTrigger id="session-speech-model"><SelectValue>{tts.unavailable ? t('gateway.modelNoneShort') : catalog.tts.find(model => model.binding === tts.binding)?.name}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>{catalog.tts.map(model => <SelectItem key={model.binding} value={model.binding}>{model.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-speech-voice">{t('session.speechVoice')}</Label>
              {voices.length ? <Select value={voices.includes(draft.speechVoice) ? draft.speechVoice : 'default'} onValueChange={speechVoice => patch({ speechVoice: speechVoice === 'default' ? '' : speechVoice ?? '' })}>
                <SelectTrigger id="session-speech-voice"><SelectValue>{voices.includes(draft.speechVoice) ? draft.speechVoice : t('session.speechDefaultVoice')}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="default">{t('session.speechDefaultVoice')}</SelectItem>
                  {voices.map(voice => <SelectItem key={voice} value={voice}>{voice}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select> : <Input id="session-speech-voice" value={draft.speechVoice} onChange={event => patch({ speechVoice: event.target.value })} />}
            </div>
            </> : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="session-speech-device">{t('session.speechOutputDevice')}</Label>
              <SettingSelect id="session-speech-device" ariaLabel={t('session.speechOutputDevice')} value={draft.speechOutputDeviceId || 'default'}
                options={speechOutputOptions(outputDevices, draft.speechOutputDeviceId || 'default', t, needsExplicitOutput)}
                onChange={speechOutputDeviceId => patch({ speechOutputDeviceId: speechOutputDeviceId === 'default' ? '' : speechOutputDeviceId })} />
              {missingExplicitOutput ? <p className="nola-caption text-warning">{t('session.explicitSpeechOutput')}</p> : null}
            </div>
          </div> : null}
          {!modelsConfigured ? <p className="nola-caption text-warning">{t('modelConfig.needsConfiguration')}</p> : !recognitionValid ? <p className="nola-caption text-warning">{t('modelConfig.sourceUnsupported')}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="tertiary" size="sm" onClick={() => onOpenChange(false)}>{t('session.cancel')}</Button>
          <Button size="sm" disabled={!recognitionValid || !s2sTargetValid || missingExplicitOutput} onClick={submit}>{t('session.start')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

export function audioSourceFrom(option: AudioSourceOption | undefined, fallbackValue: string): SessionConfig['audioSource'] {
  if (fallbackValue.startsWith('process:')) return { kind: 'processAudio', deviceId: fallbackValue }
  if (!option && fallbackValue.startsWith('wasapi:microphone:')) return { kind: 'microphone', deviceId: fallbackValue }
  if (!option && fallbackValue.startsWith('wasapi:systemOutput:')) return { kind: 'systemOutput', deviceId: fallbackValue }
  if (!option || option.kind === 'defaultOutput' || option.deviceId === null) return { kind: 'defaultOutput' }
  if (option.kind === 'microphone' && vbCablePair(option.name, 'Output')) return { kind: 'virtualInput', deviceId: option.deviceId }
  return { kind: option.kind, deviceId: option.deviceId }
}
