import { modelBindingPatch, resolveModelBinding, savedBindingOf, useAvailableModels } from '@/available-models'
import { modelSupportsTranslation, useModelOptions } from '@/model-options'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SettingSwitch } from '../settings/SettingsPage'
import { CircleHelp } from 'lucide-react'

import { DEFAULT_SETTINGS, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AudioDevice, AudioSourceOption, SessionConfig } from '@/bridge'
import { SettingRow } from '@/components/primitives'
import { notifyGatewayStartIssue, notifyInfo } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { aliyunConnectionReady } from '../../../shared/cloud-models'
import type { UiLanguage } from '@/i18n'
import { autoMeetingTitle, nextDaySequence } from '@/meeting-format'
import { stores, useStore } from '@/store'
import { translationFieldsOf } from '@/session-config'
import { ALIYUN_LANGUAGES, ALIYUN_S2S_SPEECH_LANGUAGES, recognitionFieldsOf, remoteSourceLanguages } from '../../../shared/cloud-config'
import { defaultRealtimeS2s } from '../../../shared/settings'
import { vbCablePair } from '../../../shared/virtual-audio'

export interface SetupDraft {
  title: string
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
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const aliyunCredential = useStore(stores.models, state => state.credentials['aliyun-asr'])
  const resources = useStore(stores.models, state => state.resources)
  const meetings = useStore(stores.meetings, state => state.meetings)
  const modelOptions = useModelOptions()
  const catalog = useAvailableModels()
  const { realtime, recognition, translation, synthesis } = settings
  const targetLanguage = translation.targetLanguage
  const translationEnabled = targetLanguage !== NO_TRANSLATION_LANGUAGE
  const outputMode = !translationEnabled ? 'source' : realtime?.outputMode === 'speech' ? 'speech' : 'translation'
  const s2sModel = translationEnabled
    ? realtime?.quickS2sModel === undefined ? defaultRealtimeS2s(settings) : realtime.quickS2sModel
    : null
  const needsMt = translationEnabled && !s2sModel
  const asr = resolveModelBinding('asr', savedBindingOf('asr', settings), catalog.asr)
  const mt = resolveModelBinding('mt', savedBindingOf('mt', settings), catalog.mt)
  const tts = resolveModelBinding('tts', savedBindingOf('tts', settings), catalog.tts)
  const effectiveRecognition = s2sModel
    ? { ...recognition, provider: 'aliyun' as const, aliyunModel: s2sModel }
    : { ...recognition, ...modelBindingPatch('asr', asr.binding, settings).recognition }
  const sourceLanguages = s2sModel ? remoteSourceLanguages(effectiveRecognition) : modelOptions.sourceLanguages
  const sourceLanguage = s2sModel && !sourceLanguages.includes(recognition.sourceLanguage) ? 'auto' : recognition.sourceLanguage
  const unsupportedSource = (!!s2sModel || !asr.unavailable) && !sourceLanguages.includes(sourceLanguage)
  const s2sReady = aliyunConnectionReady(settings, aliyunCredential)
  const s2sTargets: readonly string[] = outputMode === 'speech' ? ALIYUN_S2S_SPEECH_LANGUAGES : ALIYUN_LANGUAGES
  const s2sTargetValid = !s2sModel || s2sTargets.includes(targetLanguage)
  const selectedTranslation = mt.binding.startsWith('resource:') ? resources.find(model => model.resourceId === mt.binding.slice(9)) : undefined
  const incompatible = needsMt && !mt.unavailable
    && !modelSupportsTranslation(catalog.mt.find(model => model.binding === mt.binding), selectedTranslation, sourceLanguage, targetLanguage)
  const audioSource = realtime?.virtualInputDeviceId
    ? { kind: 'virtualInput' as const, deviceId: realtime.virtualInputDeviceId }
    : audioSourceFrom(devices.find(device => device.deviceId === recognition.audioSource), recognition.audioSource)
  const speechOutputDeviceId = realtime?.speechOutputDeviceId ?? ''
  const missingExplicitOutput = outputMode === 'speech' && audioSource.kind === 'virtualInput'
    && (!speechOutputDeviceId || speechOutputDeviceId === 'default')
  const canStart = !unsupportedSource && (!s2sModel || s2sReady) && s2sTargetValid && !missingExplicitOutput && !incompatible

  // Keep the title empty until edited so the session can assign its own sequence.
  const previewName = useMemo(() => {
    const now = Date.now()
    return autoMeetingTitle(now, nextDaySequence(meetings, now), language)
  }, [meetings, language])

  async function submit() {
    if (!canStart) return
    const missing = !s2sModel && asr.unavailable ? 'asr'
      : needsMt && mt.unavailable ? 'mt'
        : !s2sModel && outputMode === 'speech' && tts.unavailable ? 'tts' : undefined
    if (missing) {
      await notifyGatewayStartIssue(t, missing, { asr, mt, tts }[missing].binding)
      return
    }
    for (const replacement of [s2sModel ? null : asr.replaced, needsMt ? mt.replaced : null]) {
      if (replacement) notifyInfo(t('gateway.modelSwitched', { name: replacement.name }), { description: t('gateway.modelSwitchedLoaded') })
    }
    const translationPatch = modelBindingPatch('mt', mt.binding, settings).translation
    const effectiveTranslation = { ...translation, ...translationPatch, fallback: { ...translation.fallback, ...translationPatch?.fallback } }
    onSubmit({
      audioSource,
      s2sModel,
      recognitionMode: 'realtime',
      recognitionModelId: effectiveRecognition.modelId,
      ...(!s2sModel ? { recognitionBinding: asr.binding } : {}),
      ...(needsMt ? { translationBinding: mt.binding } : {}),
      ...recognitionFieldsOf(effectiveRecognition),
      sourceLanguage,
      ...(s2sModel ? { targetLanguages: [targetLanguage], translationProvider: 'recognition' as const }
        : translationFieldsOf(effectiveTranslation, { enabled: translationEnabled, targetLanguage })),
      outputMode,
      ...(outputMode === 'speech' ? { speechOutputDeviceId } : {}),
      ...(outputMode === 'speech' && !s2sModel ? {
        speechModelId: tts.binding.replace(/^resource:/, ''),
        ...(synthesis.voice.trim() ? { speechVoice: synthesis.voice.trim() } : {}),
      } : {}),
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border border-border">
        <DialogHeader><DialogTitle>{t('session.title')}</DialogTitle></DialogHeader>
        <div className="nola-dialog-body flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="session-name">{t('session.name')}</Label>
              <Tooltip><TooltipTrigger render={<Button variant="secondary" size="icon-xs" aria-label={t('session.nameHelpAria')} className="min-h-6 shrink-0 border-transparent bg-transparent text-muted hover:bg-surface-secondary" />}><CircleHelp aria-hidden="true" /></TooltipTrigger><TooltipContent className="max-w-96 whitespace-normal">{t('session.nameHint')}</TooltipContent></Tooltip>
            </div>
            <Input id="session-name" value={draft.title || previewName} onChange={event => onDraftChange({ ...draft, title: event.target.value })} />
          </div>
          <div className="rounded-2xl border border-border">
            <SettingRow label={t('session.keepAudio')} desc={t('session.keepAudioHint')} descriptionTooltip className="hover:bg-transparent">
              <SettingSwitch isSelected={draft.keepAudio} ariaLabel={t('session.keepAudio')} onChange={keepAudio => onDraftChange({ ...draft, keepAudio })} />
            </SettingRow>
          </div>
          {unsupportedSource ? <p className="nola-caption text-warning">{t('modelConfig.sourceUnsupported')}</p> : null}
          {incompatible ? <p className="nola-caption text-warning">{t('modelConfig.incompatibleTitle')}</p> : null}
          {s2sModel && !s2sReady ? <p className="nola-caption text-warning">{t('session.s2sModelRequired')}</p> : null}
          {!s2sTargetValid ? <p className="nola-caption text-warning">{t(outputMode === 'speech' ? 'session.speechLanguageUnavailable' : 'errors.translationUnsupportedLanguagePair')}</p> : null}
          {missingExplicitOutput ? <p className="nola-caption text-warning">{t('session.explicitSpeechOutput')}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="tertiary" size="sm" onClick={() => onOpenChange(false)}>{t('session.cancel')}</Button>
          <Button size="sm" disabled={!canStart} onClick={submit}>{t('session.start')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function audioSourceFrom(option: Pick<AudioSourceOption, 'kind' | 'deviceId' | 'name'> | undefined, fallbackValue: string): SessionConfig['audioSource'] {
  if (fallbackValue.startsWith('process:')) return { kind: 'processAudio', deviceId: fallbackValue }
  if (!option && fallbackValue.startsWith('wasapi:microphone:')) return { kind: 'microphone', deviceId: fallbackValue }
  if (!option && fallbackValue.startsWith('wasapi:systemOutput:')) return { kind: 'systemOutput', deviceId: fallbackValue }
  if (!option || option.kind === 'defaultOutput' || option.deviceId === null) return { kind: 'defaultOutput' }
  if (option.kind === 'microphone' && vbCablePair(option.name, 'Output')) return { kind: 'virtualInput', deviceId: option.deviceId }
  return { kind: option.kind, deviceId: option.deviceId }
}
