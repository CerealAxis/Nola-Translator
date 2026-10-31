import { useModelOptions } from '@/model-options'
import { modelBindingPatch, resolveModelBinding, savedBindingOf, useAvailableModels } from '@/available-models'
import { supportsTranslation } from '../../../shared/model-capabilities'
import { TranslationCompatibilityDialog } from '../models/TranslationCompatibilityDialog'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'
import { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SettingSwitch } from '../settings/SettingsPage'
import { CircleHelp } from 'lucide-react'

import {
  DEFAULT_SETTINGS,
} from '@/bridge'
import type { AudioDevice, AudioSourceOption, RecognitionModelId, SessionConfig } from '@/bridge'
import { SettingRow } from '@/components/primitives'
import { notifyGatewayModelUnavailable, notifyInfo } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import type { UiLanguage } from '@/i18n'
import { autoMeetingTitle, nextDaySequence } from '@/meeting-format'
import { stores, useStore } from '@/store'
import { translationFieldsOf } from '@/session-config'
import { recognitionFieldsOf } from '../../../shared/cloud-config'

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
  translate: boolean
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
  const translation = settings.translation
  const resources = useStore(stores.models, (state) => state.resources)
  const modelOptions = useModelOptions(draft.recognitionModelId, draft.translationModelId || translation.localModelId, draft.sourceLanguage)
  const catalog = useAvailableModels()
  const asr = resolveModelBinding('asr', draft.recognitionBinding ?? savedBindingOf('asr', settings), catalog.asr)
  const mt = resolveModelBinding('mt', draft.translationBinding ?? (translation.provider === 'local' && draft.translationModelId ? `resource:${draft.translationModelId}` : savedBindingOf('mt', settings)), catalog.mt)
  const selectedAsr = catalog.asr.find(model => model.binding === asr.binding)
  const translationPatch = modelBindingPatch('mt', mt.binding, settings).translation
  const effectiveTranslation = { ...translation, ...translationPatch, fallback: { ...translation.fallback, ...translationPatch?.fallback } }
  const effectiveRecognition = { ...settings.recognition, ...modelBindingPatch('asr', asr.binding, settings).recognition }
  const sourceLanguages = selectedAsr?.sourceLanguages ?? modelOptions.sourceLanguages
  const [dismissedPair, setDismissedPair] = useState<string | null>(null)
  const signature = `${mt.binding}|${draft.sourceLanguage}|${draft.targetLanguage}`
  const selectedTranslation = mt.binding.startsWith('resource:') ? resources.find(model => model.resourceId === mt.binding.slice(9)) : undefined
  const incompatible = draft.translate && !!selectedTranslation && !supportsTranslation(selectedTranslation, draft.sourceLanguage, draft.targetLanguage)
  const recognitionValid = sourceLanguages.includes(draft.sourceLanguage)
  const modelsConfigured = !asr.unavailable && (!draft.translate || !mt.unavailable)
  const meetings = useStore(stores.meetings, (state) => state.meetings)

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
      const kind = asr.unavailable ? 'asr' : 'mt'
      notifyGatewayModelUnavailable(t('gateway.modelNone', { name: t(`gateway.${kind}`) }), t('gateway.modelGatewayStartHint'), t('gateway.title'))
      return
    }
    if (!recognitionValid) return
    for (const replacement of [asr.replaced, draft.translate ? mt.replaced : null]) {
      if (replacement) notifyInfo(t('gateway.modelSwitched', { name: replacement.name }), { description: t('gateway.modelSwitchedLoaded') })
    }
    // The name is optional: the engine generates one from the start time and
    // the day sequence, so there is no "cannot be empty" error here.
    const option = audioOptions.find((item) => item.value === draft.audioSource)
    onSubmit({
      audioSource: audioSourceFrom(option, draft.audioSource),
      recognitionMode: 'realtime',
      recognitionModelId: asr.binding.startsWith('resource:') ? asr.binding.slice(9) as RecognitionModelId : draft.recognitionModelId,
      recognitionBinding: asr.binding,
      ...(draft.translate ? { translationBinding: mt.binding } : {}),
      ...recognitionFieldsOf(effectiveRecognition),
      sourceLanguage: draft.sourceLanguage,
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
      ...translationFieldsOf(effectiveTranslation, {
        enabled: draft.translate,
        targetLanguage: draft.targetLanguage,
        modelId: mt.binding.startsWith('resource:') ? mt.binding.slice(9) : undefined,
      }),
    })
  }, [audioOptions, draft, onSubmit, effectiveTranslation, effectiveRecognition, incompatible, modelsConfigured, recognitionValid, asr, mt, t])

  return (
    <>
    <TranslationCompatibilityDialog key={signature} isOpen={isOpen && incompatible && dismissedPair !== signature} onClose={() => setDismissedPair(signature)} source={draft.sourceLanguage} target={draft.targetLanguage} translation={selectedTranslation} resources={resources.filter(resource => catalog.mt.some(model => model.binding === `resource:${resource.resourceId}`))} compute={settings.compute ?? DEFAULT_COMPUTE_SETTINGS}
      onChangeModel={translationModelId => patch({ translationModelId, translationBinding: `resource:${translationModelId}` })} />
    <Dialog open={isOpen && !(incompatible && dismissedPair !== signature)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border border-border">
        <DialogHeader><DialogTitle>{t('session.title')}</DialogTitle></DialogHeader>
        <div className="nola-dialog-body flex flex-col gap-4">
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
          {!modelsConfigured ? <p className="nola-caption text-warning">{t('modelConfig.needsConfiguration')}</p> : !recognitionValid ? <p className="nola-caption text-warning">{t('modelConfig.sourceUnsupported')}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="tertiary" size="sm" onClick={() => onOpenChange(false)}>{t('session.cancel')}</Button>
          <Button size="sm" disabled={!recognitionValid} onClick={submit}>{t('session.start')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

/** Selector option to the protocol's `AudioSource`. An unrecognised option falls back to the system default output rather than throwing. */
export function audioSourceFrom(option: AudioSourceOption | undefined, fallbackValue: string): SessionConfig['audioSource'] {
  if (!option || option.kind === 'defaultOutput' || option.deviceId === null) return { kind: 'defaultOutput' }
  return option.kind === 'microphone'
    ? { kind: 'microphone', deviceId: option.deviceId }
    : { kind: 'systemOutput', deviceId: option.deviceId || fallbackValue }
}
