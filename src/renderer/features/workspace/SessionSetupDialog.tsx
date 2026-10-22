import { useModelOptions } from '@/model-options'
import { configurationOf, isModelReady, recognitionLanguages, supportsTranslation } from '../../../shared/model-capabilities'
import { TranslationCompatibilityDialog } from '../models/TranslationCompatibilityDialog'
import { supportsSelectedEngine } from '../../../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'
import { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SettingSelect, SettingSwitch } from '../settings/SettingsPage'
import { CircleHelp } from 'lucide-react'

import {
  DEFAULT_SETTINGS,
  languageName,
  NO_TRANSLATION_LANGUAGE,
} from '@/bridge'
import type { AudioDevice, AudioSourceOption, RecognitionModelId, SessionConfig } from '@/bridge'
import { SettingRow } from '@/components/primitives'
import { notifyError } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import type { UiLanguage } from '@/i18n'
import { autoMeetingTitle, nextDaySequence } from '@/meeting-format'
import { stores, useStore } from '@/store'
import { translationFieldsOf } from '@/session-config'

/** Form state, not in the store: a one-shot draft, and storing it would make Cancel a write. */
export interface SetupDraft {
  title: string
  audioSource: string
  sourceLanguage: string
  recognitionModelId: RecognitionModelId
  translate: boolean
  targetLanguage: string
  /** Local model for this session. Empty string falls back to the setting's `translation.localModelId`. */
  translationModelId: string
  keepAudio: boolean
}

export interface SessionSetupDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  draft: SetupDraft
  onDraftChange: (draft: SetupDraft) => void
  devices: readonly AudioDevice[]
  /** Language names come from the dictionary data (`LANGUAGE_LABELS`), not UI copy, so they are not i18n keys. */
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
   * Translation settings own the provider, quantization and cloud credential.
   * This dialog only chooses whether to translate, into which language, and
   * which local model — a meaningful per-session override rather than a
   * repeat of the setting. `DEFAULT_SETTINGS` before settings load, so the
   * session can still start.
   */
  const settings = useStore(stores.settings, (state) => state.settings) ?? DEFAULT_SETTINGS
  const translation = settings.translation
  const resources = useStore(stores.models, (state) => state.resources)
  const modelOptions = useModelOptions(draft.recognitionModelId, draft.translationModelId || translation.localModelId, draft.sourceLanguage)
  const [dismissedPair, setDismissedPair] = useState<string | null>(null)
  const signature = `${draft.translationModelId}|${draft.sourceLanguage}|${draft.targetLanguage}`
  const incompatible = draft.translate && translation.provider === 'local' && !!configurationOf(modelOptions.translation) && !supportsTranslation(modelOptions.translation, draft.sourceLanguage, draft.targetLanguage)
  const recognitionValid = modelOptions.sourceLanguages.includes(draft.sourceLanguage)
  const modelsConfigured = modelOptions.configured && (!draft.translate || translation.provider !== 'local' || !!configurationOf(modelOptions.translation))
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

  const languageLabel = useCallback(
    (code: string): string => languageName(code, language),
    [language],
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

  /**
   * Options for "translation model": local translation models installed on
   * this machine, the same route as the settings dropdown
   * (`settings/tabs/TranslationTab`). Compatibility uses the same
   * `supportsSelectedEngine`, or this could offer a model that dropdown has
   * already greyed out — Hy-MT2 with the engine locked to pytorch.
   */
  const localModelOptions = useMemo(() => {
    const options = resources
      .filter((item) => item.kind === 'translationModel' && item.installed)
      .map((item) => ({
        value: item.resourceId,
        label: item.name,
        isDisabled: !isModelReady(item) || !supportsSelectedEngine(item, settings.compute ?? DEFAULT_COMPUTE_SETTINGS, item.resourceId) || !supportsTranslation(item, draft.sourceLanguage, draft.targetLanguage),
      }))
    // The selected model stays listed even when not installed (just removed,
    // or settings synced from another machine): it is the current value, not
    // a candidate, and dropping it leaves the dropdown looking broken.
    if (options.length > 0 && !options.some((option) => option.value === draft.translationModelId)) {
      options.push({ value: draft.translationModelId, label: draft.translationModelId, isDisabled: true })
    }
    return options
  }, [draft.translationModelId, draft.sourceLanguage, draft.targetLanguage, resources, settings.compute])

  const submit = useCallback(() => {
    if (incompatible) { setDismissedPair(null); return }
    if (!modelsConfigured || !recognitionValid) return
    // The name is optional: the engine generates one from the start time and
    // the day sequence, so there is no "cannot be empty" error here.
    const option = audioOptions.find((item) => item.value === draft.audioSource)
    onSubmit({
      audioSource: audioSourceFrom(option, draft.audioSource),
      recognitionMode: 'realtime',
      recognitionModelId: draft.recognitionModelId,
      ...recognitionFieldsOf(settings.recognition),
      sourceLanguage: draft.sourceLanguage,
      /*
       * Provider, quantization and cloud credential all come from settings.
       * Hardcoding them here would also fool preflight, which checks the
       * same `translationModelId` that gets sent, so a session missing its
       * weights would pass preflight and only fail in the engine.
       *
       * `modelId` is the one field this dialog owns: it is a choice the user
       * makes here, and omitting it falls back to the setting's
       * `localModelId`. For the empty-array rule, the three options shapes
       * and the absent field a local provider requires, see
       * `@/session-config`.
       */
      ...translationFieldsOf(translation, {
        enabled: draft.translate,
        targetLanguage: draft.targetLanguage,
        modelId: draft.translationModelId,
      }),
    })
  }, [audioOptions, draft, onSubmit, translation, settings.recognition, incompatible, modelsConfigured, recognitionValid])

  return (
    <>
    <TranslationCompatibilityDialog key={signature} isOpen={isOpen && incompatible && dismissedPair !== signature} onClose={() => setDismissedPair(signature)} source={draft.sourceLanguage} target={draft.targetLanguage} recognition={modelOptions.recognition} translation={modelOptions.translation} resources={resources} compute={settings.compute ?? DEFAULT_COMPUTE_SETTINGS}
      onChangeSource={sourceLanguage => patch({ sourceLanguage })} onChangeModel={translationModelId => patch({ translationModelId })}
      onDisableTranslation={() => patch({ translate: false, targetLanguage: NO_TRANSLATION_LANGUAGE })} />
    <Dialog open={isOpen && !(incompatible && dismissedPair !== signature)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border border-border">
        <DialogHeader><DialogTitle>{t('session.title')}</DialogTitle></DialogHeader>
        <div className="nola-dialog-body flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="session-name">{t('session.name')}</Label>
              <Tooltip><TooltipTrigger render={<Button variant="secondary" size="icon" aria-label={t('session.nameHelpAria')} className="size-6 shrink-0 text-muted" />}><CircleHelp aria-hidden="true" /></TooltipTrigger><TooltipContent className="max-w-96 whitespace-normal">{t('session.nameHint')}</TooltipContent></Tooltip>
            </div>
            <Input id="session-name" value={draft.title || previewName} onChange={event => patch({ title: event.target.value })} />
          </div>
          <SetupSelect label={t('session.audioSource')} value={draft.audioSource} options={audioOptions.map(option => ({ value: option.value, label: option.name }))} onChange={audioSource => patch({ audioSource })} />
          <SetupSelect label={t('session.sourceLanguage')} value={draft.sourceLanguage} options={modelOptions.sourceLanguages.map(code => ({ value: code, label: languageLabel(code) }))} onChange={sourceLanguage => patch({ sourceLanguage })} />
          <SetupSelect label={t('session.recognitionModel')} value={draft.recognitionModelId} options={modelOptions.recognitionModels} onChange={key => {
            const codes = (settings.recognition.provider ?? 'local') === 'local' ? recognitionLanguages(resources.find(model => model.resourceId === key)) : modelOptions.sourceLanguages
            const sourceLanguage = codes.includes(draft.sourceLanguage) ? draft.sourceLanguage : codes.includes('auto') ? 'auto' : draft.sourceLanguage
            if (sourceLanguage === draft.sourceLanguage && !codes.includes(sourceLanguage)) notifyError(t('errors.unsupportedRecognitionLanguage', { language: languageName(sourceLanguage, language) }))
            patch({ recognitionModelId: key as RecognitionModelId, sourceLanguage })
          }} />
          <div className="flex flex-col gap-2 rounded-2xl border border-border">
            <SettingRow label={t('session.translation')} className="hover:bg-transparent">
              <SettingSwitch isSelected={draft.translate} ariaLabel={t('session.translation')} onChange={next => patch({ translate: next, ...(next && draft.targetLanguage === NO_TRANSLATION_LANGUAGE ? { targetLanguage: DEFAULT_SETTINGS.translation.targetLanguage } : {}) })} />
            </SettingRow>
            {draft.translate ? <div className="flex flex-col gap-4 px-4 pb-4">
              <SetupSelect label={t('session.translationLanguage')} value={draft.targetLanguage} options={modelOptions.targetLanguages.map(code => ({ value: code, label: languageLabel(code) }))} onChange={targetLanguage => patch({ targetLanguage, translate: targetLanguage !== NO_TRANSLATION_LANGUAGE })} />
              {translation.provider === 'local' ? <SetupSelect label={t('session.translationModel')} value={draft.translationModelId} options={localModelOptions} onChange={translationModelId => patch({ translationModelId })} /> : null}
            </div> : null}
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
          <Button size="sm" disabled={!modelsConfigured || !recognitionValid} onClick={submit}>{t('session.start')}</Button>
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
import { recognitionFieldsOf } from '../../../shared/cloud-config'

interface SetupSelectProps {
  label: string
  value: string
  options: readonly { value: string; label: string; isDisabled?: boolean }[]
  onChange: (value: string) => void
}

function SetupSelect({ label, value, options, onChange }: SetupSelectProps) {
  return <div className="flex flex-col gap-2"><span className="label">{label}</span><SettingSelect value={value} ariaLabel={label} options={[...options]} onChange={onChange} /></div>
}
