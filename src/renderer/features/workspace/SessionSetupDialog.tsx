/**
 * The session setup dialog. Six fields: meeting name, input source,
 * recognition language, recognition model, translation (with its language
 * and model), and audio retention.
 *
 * Notes that shape the markup:
 * 1. `Label` stays inside the `Select` / `TextField`. HeroUI's `Label` is a
 *    react-aria label and picks the field id up through context, so the DOM
 *    nesting depth does not matter and a wrapper div is safe.
 * 2. Explanations go in a Tooltip, not inline. The question mark must be a
 *    focusable button: a `<label>` trigger opens on hover but is invisible
 *    to the keyboard. See `features/settings/SettingsRow.tsx`.
 * 3. "Translation model" appears only for a local provider. Cloud and
 *    Microsoft have no local model id: a cloud model name travels in
 *    `translationOptions.model` and Microsoft has endpoint + region only.
 *    See `@/session-config`.
 * 4. The name field shows the name the system will generate, not a
 *    placeholder. See `previewName` below.
 */

import { supportsSelectedEngine } from '../../../shared/model-engines'
import { useCallback, useMemo } from 'react'

import {
  Button,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  Select,
  Switch,
  TextField,
  Tooltip,
} from '@heroui/react'
import { CircleHelp } from 'lucide-react'

import {
  DEFAULT_SETTINGS,
  LANGUAGE_LABELS,
  RECOGNITION_MODEL_IDS,
  RECOGNITION_MODEL_LABELS,
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
} from '@/bridge'
import type { AudioDevice, AudioSourceOption, RecognitionModelId, SessionConfig } from '@/bridge'
import { SettingRow } from '@/components/primitives'
import { useI18n } from '@/i18n'
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
  language: 'zh-CN' | 'en'
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
    (code: string): string => {
      const entry = (LANGUAGE_LABELS as Record<string, { zh: string; en: string } | undefined>)[code]
      if (!entry) return code
      return language === 'zh-CN' ? entry.zh : entry.en
    },
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
        isDisabled: !supportsSelectedEngine(item, settings.compute, item.resourceId),
      }))
    // The selected model stays listed even when not installed (just removed,
    // or settings synced from another machine): it is the current value, not
    // a candidate, and dropping it leaves the dropdown looking broken.
    if (options.length > 0 && !options.some((option) => option.value === draft.translationModelId)) {
      options.push({ value: draft.translationModelId, label: draft.translationModelId, isDisabled: true })
    }
    return options
  }, [draft.translationModelId, resources, settings.compute])

  const submit = useCallback(() => {
    // The name is optional: the engine generates one from the start time and
    // the day sequence, so there is no "cannot be empty" error here.
    const option = audioOptions.find((item) => item.value === draft.audioSource)
    onSubmit({
      audioSource: audioSourceFrom(option, draft.audioSource),
      recognitionMode: 'realtime',
      recognitionModelId: draft.recognitionModelId,
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
  }, [audioOptions, draft, onSubmit, translation])

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-overlay">
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog className="rounded-2xl border border-border">
            <Modal.Header>
              {/* Same type scale as the field labels below: it names the set of fields to fill, not a page title. */}
              <Modal.Heading className="text-[14px] leading-[1.45] font-semibold text-foreground">
                {t('session.title')}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              {/* 1 Meeting name: the field shows the name the system will generate, so no placeholder is needed to explain it. */}
              <TextField value={draft.title || previewName} onChange={(value: string) => patch({ title: value })}>
                {/*
                 * The label and the question mark sit in a div rather than as the
                 * `TextField`'s first child: HeroUI's `Label` takes the field id
                 * from react-aria context, so nesting depth is irrelevant.
                 *
                 * The question mark is a button, not the label itself, because a
                 * `<label>` is not focusable: it opens on hover and never for the
                 * keyboard. Same pattern as `features/settings/SettingsRow.tsx`.
                 */}
                <div className="flex items-center gap-1">
                  <Label className="text-[14px] leading-[1.45] font-semibold text-foreground">{t('session.name')}</Label>
                  <Tooltip delay={300}>
                    <Button
                      variant="ghost"
                      size="sm"
                      isIconOnly
                      aria-label={t('session.nameHelpAria')}
                      className="size-6 shrink-0 rounded-full text-muted"
                    >
                      <CircleHelp size={14} aria-hidden="true" />
                    </Button>
                    <Tooltip.Content className="max-w-96 whitespace-normal">{t('session.nameHint')}</Tooltip.Content>
                  </Tooltip>
                </div>
                <Input className="rounded-xl" />
              </TextField>

              {/* 2 Input source. Preflight owns device availability, so no probe here. */}
              <Select
                value={draft.audioSource}
                onChange={(key) => {
                  if (typeof key === 'string') patch({ audioSource: key })
                }}
              >
                <Label className="text-[14px] leading-[1.45] font-semibold text-foreground">
                  {t('session.audioSource')}
                </Label>
                <Select.Trigger className="rounded-xl">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover className="rounded-2xl">
                  <ListBox>
                    {audioOptions.map((option) => (
                      <ListBoxItem key={option.value} id={option.value} textValue={option.name}>
                        {option.name}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              {/* 3 Recognition language */}
              <Select
                value={draft.sourceLanguage}
                onChange={(key) => {
                  if (typeof key === 'string') patch({ sourceLanguage: key })
                }}
              >
                <Label className="text-[14px] leading-[1.45] font-semibold text-foreground">
                  {t('session.sourceLanguage')}
                </Label>
                <Select.Trigger className="rounded-xl">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover className="rounded-2xl">
                  <ListBox>
                    {SOURCE_LANGUAGE_OPTIONS.map((code) => (
                      <ListBoxItem key={code} id={code} textValue={languageLabel(code)}>
                        {languageLabel(code)}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              {/* 4 Recognition model */}
              <Select
                value={draft.recognitionModelId}
                onChange={(key) => {
                  if (typeof key === 'string') patch({ recognitionModelId: key as RecognitionModelId })
                }}
              >
                <Label className="text-[14px] leading-[1.45] font-semibold text-foreground">
                  {t('session.recognitionModel')}
                </Label>
                <Select.Trigger className="rounded-xl">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover className="rounded-2xl">
                  <ListBox>
                    {RECOGNITION_MODEL_IDS.map((id) => (
                      <ListBoxItem key={id} id={id} textValue={RECOGNITION_MODEL_LABELS[id]} isDisabled={settings.compute.recognitionEngine !== 'pytorch'}>
                        {RECOGNITION_MODEL_LABELS[id]}
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              {/* 5 Translation, its language and its model (the last two only for a local provider) */}
              <div className="flex flex-col gap-2 rounded-2xl border border-border">
                <SettingRow label={t('session.translation')} className="hover:bg-transparent">
                  <Switch
                    isSelected={draft.translate}
                    onChange={(next: boolean) => patch({ translate: next })}
                  ><Switch.Content aria-label={t('session.translation')}><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
                </SettingRow>

                {draft.translate ? (
                  <div className="flex flex-col gap-4 px-4 pb-4">
                    <Select
                      value={draft.targetLanguage}
                      onChange={(key) => {
                        if (typeof key === 'string') patch({ targetLanguage: key })
                      }}
                    >
                      <Label className="text-[14px] leading-[1.45] font-semibold text-foreground">
                        {t('session.translationLanguage')}
                      </Label>
                      <Select.Trigger className="rounded-xl">
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover className="rounded-2xl">
                        <ListBox>
                          {TARGET_LANGUAGE_OPTIONS.map((lang) => (
                            <ListBoxItem key={lang} id={lang} textValue={languageLabel(lang)}>
                              {languageLabel(lang)}
                            </ListBoxItem>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>

                    {translation.provider === 'local' ? (
                      <Select
                        value={draft.translationModelId}
                        onChange={(key) => {
                          if (typeof key === 'string') patch({ translationModelId: key })
                        }}
                      >
                        <Label className="text-[14px] leading-[1.45] font-semibold text-foreground">
                          {t('session.translationModel')}
                        </Label>
                        <Select.Trigger className="rounded-xl">
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover className="rounded-2xl">
                          <ListBox>
                            {localModelOptions.map((option) => (
                              <ListBoxItem
                                key={option.value}
                                id={option.value}
                                textValue={option.label}
                                isDisabled={option.isDisabled}
                              >
                                {option.label}
                              </ListBoxItem>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* 6 Audio retention */}
              <div className="rounded-2xl border border-border">
                <SettingRow
                  label={t('session.keepAudio')}
                  desc={t('session.keepAudioHint')}
                  descriptionTooltip
                  className="hover:bg-transparent"
                >
                  <Switch
                    isSelected={draft.keepAudio}
                    onChange={(next: boolean) => patch({ keepAudio: next })}
                  ><Switch.Content aria-label={t('session.keepAudio')}><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
                </SettingRow>
              </div>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => onOpenChange(false)}>
                {t('session.cancel')}
              </Button>
              <Button variant="primary" size="sm" className="rounded-full px-5" onPress={submit}>
                {t('session.start')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

/** Selector option to the protocol's `AudioSource`. An unrecognised option falls back to the system default output rather than throwing. */
export function audioSourceFrom(option: AudioSourceOption | undefined, fallbackValue: string): SessionConfig['audioSource'] {
  if (!option || option.kind === 'defaultOutput' || option.deviceId === null) return { kind: 'defaultOutput' }
  return option.kind === 'microphone'
    ? { kind: 'microphone', deviceId: option.deviceId }
    : { kind: 'systemOutput', deviceId: option.deviceId || fallbackValue }
}
