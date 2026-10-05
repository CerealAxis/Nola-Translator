/**
 * 会话设置弹窗（`session.title`）。字段严格照交互导图，**六个，不多不少**：
 * 会议名 / 输入音源 / 识别语言 / 识别模型 / 翻译开关（+ 翻译语言 + 翻译模型）/ 音频留存。
 *
 * 五条纪律落在具体写法上：
 * 1. **绝不用 placeholder 当 label。** `Label` 必须待在 `Select` / `TextField` 内部，
 *    这样它与控件建立关联（HeroUI 的 `Label` 是 react-aria 的，靠 **context** 取字段 id，
 *    与 DOM 嵌套深度无关）；标签外面再包一层 div 放别的也不影响关联。
 * 2. **说明文字进 Tooltip，不进开关那一行。** 翻译与保存录音都曾经把说明直接挂在行内
 *    （保存录音挂了两句，翻译用状态文案"翻译已开启"），一行挤三样东西，读的人得先分辨
 *    哪句才是字段名。现在只留标签与控件，标签旁挂一个问号按钮，说明在它的 Tooltip 里，
 *    见 `features/settings/SettingsRow.tsx`。
 *    **问号必须是可聚焦的按钮，不能拿 `<label>` 当触发器** —— 标签不可聚焦，悬停能弹、
 *    键盘用户看不到。
 * 3. **这个弹窗里没有 await。** 它是一次性草稿，选择器列出什么就是什么。原来的"测试音频"
 *    按钮带三态（`isPending` / `FieldError` / 设备是否还在列表里），它被移除后，设备可用性
 *    由 `PreflightDialog` 独立负责 —— 它自己调 `listDevices()`，并在设备不可用时禁用开始按钮。
 *    两处职责不重叠，删掉不会丢校验。
 * 4. **「翻译模型」只在服务商是本地模型时出现。** 云端与 Microsoft 没有"本地模型 id"这个
 *    概念：云端的模型名走 `translationOptions.model`，Microsoft 只有 endpoint + region。
 *    详见 `@/session-config`。
 * 5. **「名称」框显示的是系统将要生成的名字，不是 placeholder。** 规则见下面
 *    `previewName` 的注释 —— 关键是它**没有**进 `draft.title`，所以不改它就不会产生
 *    一条 `titleIsCustom` 的记录。
 *
 * `title` 与 `keepAudio` 故意**不进** `SessionConfig`（`submit` 里看不到它们）：会议名是
 * 会话开始之后用 `renameMeeting` 改的，录音开关是写进 `settings.recording.keepAudio`、
 * 再由主进程决定要不要给引擎注入 `recordingPath`。两者都不是"这场会话的配置"，
 * 所以不跟着 `startSession` 一起发 —— 详见 `WorkspacePage.start`。
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

/** 表单态。**不落在 store 里**：设置弹窗是一次性草稿，落到 store 会让"取消"也变成一次写。 */
export interface SetupDraft {
  title: string
  audioSource: string
  sourceLanguage: string
  recognitionModelId: RecognitionModelId
  translate: boolean
  targetLanguage: string
  /** 本次会话临时换用的本地模型。空串 = 沿用设置里的 `translation.localModelId`。 */
  translationModelId: string
  keepAudio: boolean
}

export interface SessionSetupDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  draft: SetupDraft
  onDraftChange: (draft: SetupDraft) => void
  devices: readonly AudioDevice[]
  /** 语言名取自词典 data（`LANGUAGE_LABELS`），不是界面文案，所以不受 i18n key 约束。 */
  language: 'zh-CN' | 'en'
  /** 草稿翻译成引擎要的 SessionConfig 后回调。 */
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
   * 翻译设置。**服务商、量化档、云端凭据全部由它决定** —— 这个弹窗只让用户挑「翻不翻」、
   * 「翻成什么语言」，以及本地模型换成哪一档（那是有意义的临时覆盖，不是重复设置）。
   * 拿不到设置时回落到 `DEFAULT_SETTINGS`（本地模型 + q3-k-m），宁可退回默认也不让会话开不起来。
   */
  const settings = useStore(stores.settings, (state) => state.settings) ?? DEFAULT_SETTINGS
  const translation = settings.translation
  const resources = useStore(stores.models, (state) => state.resources)
  const meetings = useStore(stores.meetings, (state) => state.meetings)

  /**
   * 「名称」框里显示的那个默认名 —— 系统将会给这场会起的名字。
   *
   * **它只是预览，`draft.title` 仍然是空串**，所以 `WorkspacePage.start` 那个
   * `if (draft?.title.trim())` 不成立、不发 `renameMeeting`，记录保持 `title: ''` +
   * `titleIsCustom: false`，列表继续用 `meetingTitleFor` 实时算。
   * 这就是为什么这个预览算错了也不要紧：用户没动过它，就没有任何东西被落盘。
   * 用户一旦改写它，`draft.title` 才变成非空，那才是自定义名称。
   *
   * 序号口径与主进程 `nextDaySequence` 一致（见 `meeting-format.ts`）。跨零点开着这个
   * 弹窗的话预览会偏一天，但同样只影响显示。
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

  // 系统默认输出这条不是设备列表里的一项（协议里它就是 `{ kind:'defaultOutput' }`，不是设备），
  // 所以选项是"设备列表 + 一条伪选项"拼出来的，而不是只渲染 devices。
  const audioOptions: AudioSourceOption[] = useMemo(() => {
    const fromDevices: AudioSourceOption[] = devices.map((device) => ({
      value: device.deviceId,
      kind: device.kind,
      deviceId: device.deviceId,
      name: device.name,
      isDefault: device.isDefault,
    }))
    // 「系统默认输出」是协议里的伪声源（`{ kind: 'defaultOutput' }`），`listDevices()`
    // 永远不会回它，所以选择器的第一项由这里补出来。
    // 原来这一项来自 mock 的 `FIXTURE_AUDIO_SOURCES`；那个名字在生产里是错的 ——
    // 它不是固定夹具，是一个协议常量。名称走 i18n（`shellUi.defaultOutput`）。
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
   * 「翻译模型」的可选项：**本机已装**的本地翻译模型，与设置页那个下拉框同一条路
   * （见 `TranslationTab`）。兼容性用同一个 `supportsSelectedEngine` 判，否则这里能选出一个
   * 设置页已经灰掉的模型 —— 比如翻译引擎锁在 pytorch 时的 Hy-MT2。
   */
  const localModelOptions = useMemo(() => {
    const options = resources
      .filter((item) => item.kind === 'translationModel' && item.installed)
      .map((item) => ({
        value: item.resourceId,
        label: item.name,
        isDisabled: !supportsSelectedEngine(item, settings.compute, item.resourceId),
      }))
    // 设置里选中的那个即便没装（刚被卸载、设置从另一台机器同步过来）也要补一条：
    // 它是**当前值**而不是候选值，丢掉它下拉框会显示空白，看起来像坏了。
    if (options.length > 0 && !options.some((option) => option.value === draft.translationModelId)) {
      options.push({ value: draft.translationModelId, label: draft.translationModelId, isDisabled: true })
    }
    return options
  }, [draft.translationModelId, resources, settings.compute])

  const submit = useCallback(() => {
    // 会议名不是必填：引擎会用开始时间与当天序号生成一个默认名，所以这里没有"不能为空"的错误。
    const option = audioOptions.find((item) => item.value === draft.audioSource)
    onSubmit({
      audioSource: audioSourceFrom(option, draft.audioSource),
      recognitionMode: 'realtime',
      recognitionModelId: draft.recognitionModelId,
      sourceLanguage: draft.sourceLanguage,
      /*
       * 翻译这一段的**服务商、量化档、云端凭据**全部取自设置。
       *
       * 原来这里是写死的：`translationProvider: 'hymt2'` + `translationModelId: 'hy-mt2-1.8b-q3-k-m'`，
       * 而且从不设 `translationOptions`。后果是：配了 Microsoft / OpenAI / Ollama / m2m100
       * 的用户每开一场会话都被强按到本地 Hy-MT2 上 —— 云端 key 根本不传，
       * 本地权重用户又可能压根没装。更糟的是预检也被骗过去：预检算缺失用的
       * `translationModelId` 和真正发出去的是同一个写死值，看起来"已安装"，
       * 于是缺模型的会话一路放行到引擎才报错。
       *
       * 现在只有 `modelId` 是这个弹窗说了算的：那是用户**当场**做的选择（换一档本地模型），
       * 和"写死一个默认值"不是一回事。省略它就沿用设置里的 `localModelId`。
       * 空数组、三种 options 形状、本地 provider 必须整个字段缺席，规则见 `@/session-config`。
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
              {/* 与下面每个字段的 Label 同一套字阶：这是"填哪几项"的标题，不是页面大标题。 */}
              <Modal.Heading className="text-[14px] leading-[1.45] font-semibold text-foreground">
                {t('session.title')}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              {/* 1 会议名。框里直接显示系统将要生成的名字，不靠 placeholder 解释。 */}
              <TextField value={draft.title || previewName} onChange={(value: string) => patch({ title: value })}>
                {/*
                 * 标签与问号包在 div 里，而不是让 `Label` 当 `TextField` 的第一个子元素。
                 * 这不破坏关联：HeroUI 的 `Label` 是 react-aria 的，靠 **context** 取字段 id，
                 * 与 DOM 嵌套深度无关（`label.js` 只有一层 `labelVariants` + `Label`）。
                 * 问号做成**按钮**而不是直接把标签当触发器，是因为 `<label>` 不可聚焦 ——
                 * 悬停能弹，键盘用户永远看不到。写法照 `features/settings/SettingsRow.tsx`。
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

              {/* 2 输入音源。设备可用性由预检那一步负责，这里不重复探测。 */}
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

              {/* 3 识别语言 */}
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

              {/* 4 识别模型 */}
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

              {/* 5 翻译开关 + 翻译语言 + 翻译模型（后两项仅本地服务商才有意义） */}
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

              {/* 6 音频留存 */}
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

/** 把弹层里的选项翻译成协议里的 `AudioSource`。认不出就落到系统默认输出，不是崩溃。 */
export function audioSourceFrom(option: AudioSourceOption | undefined, fallbackValue: string): SessionConfig['audioSource'] {
  if (!option || option.kind === 'defaultOutput' || option.deviceId === null) return { kind: 'defaultOutput' }
  return option.kind === 'microphone'
    ? { kind: 'microphone', deviceId: option.deviceId }
    : { kind: 'systemOutput', deviceId: option.deviceId || fallbackValue }
}
