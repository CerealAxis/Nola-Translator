/**
 * 会话设置弹窗（`session.title`）。字段严格照交互导图，**六个，不多不少**：
 * 会议名 / 输入音源 / 识别语言 / 识别模型 / 翻译开关 + 目标语言 / 音频留存。
 *
 * 三条纪律落在具体写法上：
 * 1. **绝不用 placeholder 当 label。** `Label` 是每个 `Select` / `TextField` 的**第一个子元素**
 *    （这样它与控件建立隐式关联，而不是一个悬空的 `<label>`），placeholder 只在能减少
 *    输入错误时出现（会议名给了一个日期格式的例子）。
 * 2. **开关那一行必须有"不这样会怎样"。** 音频留存用的正是这句话
 *    （关闭后不保存音频，无法回放与导出），翻译开关用状态文案说明当前处于哪一侧。
 * 3. **每个 await 的动作三态齐全**：声源测试按钮 `isPending`，结果用 `FieldError` 或电平条落地。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  Select,
  Switch,
  TextField,
} from '@heroui/react'
import { Mic } from 'lucide-react'

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
import { stores, useStore } from '@/store'
import { translationFieldsOf } from '@/session-config'

/** 电平动画的时长。够长到能看出"在动"，短到不像卡住。 */
const LEVEL_TEST_MS = 1200
const LEVEL_TICK_MS = 80

/** 表单态。**不落在 store 里**：设置弹窗是一次性草稿，落到 store 会让"取消"也变成一次写。 */
export interface SetupDraft {
  title: string
  audioSource: string
  sourceLanguage: string
  recognitionModelId: RecognitionModelId
  translate: boolean
  targetLanguage: string
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
   * 翻译设置。**这一场会话用哪个服务商、用哪一档、要不要带云端凭据，全部由它决定** ——
   * 这个弹窗只让用户挑「翻不翻」与「翻成什么语言」，不重复设置页已经定好的那些。
   * 拿不到设置时回落到 `DEFAULT_SETTINGS`（本地模型 + q3-k-m），宁可退回默认也不让会话开不起来。
   */
  const settings = useStore(stores.settings, (state) => state.settings) ?? DEFAULT_SETTINGS
  const translation = settings.translation
  const [testing, setTesting] = useState(false)
  const [deviceMissing, setDeviceMissing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const stopTest = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => stopTest, [stopTest])

  /**
   * 声源测试：结论**完全**来自设备列表 —— `audioOptions` 里还有没有这个设备。
   *
   * 这里没有音频电平表。`NolaBridge` 上没有读音量的通道，一条随机跳动的 Meter
   * 会被读成"麦克风正在收到声音"，那是编数据。设置中心那一侧也是同样的处理
   * （见 AudioTab 的注释），两处必须一致。
   */
  const runAudioTest = useCallback(() => {
    stopTest()
    setTesting(true)
    const started = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - started
      if (elapsed < LEVEL_TEST_MS) return
      stopTest()
      setTesting(false)
      setDeviceMissing(!audioOptions.some((option) => option.value === draft.audioSource))
    }, LEVEL_TICK_MS)
  }, [audioOptions, draft.audioSource, stopTest])

  const submit = useCallback(() => {
    // 会议名不是必填：引擎会用开始时间与当天序号生成一个默认名，所以这里没有"不能为空"的错误。
    const option = audioOptions.find((item) => item.value === draft.audioSource)
    onSubmit({
      audioSource: audioSourceFrom(option, draft.audioSource),
      recognitionMode: 'realtime',
      recognitionModelId: draft.recognitionModelId,
      sourceLanguage: draft.sourceLanguage,
      /*
       * 翻译这一段**全部取自设置**（服务商、量化档、中间翻译开关、云端凭据）。
       *
       * 原来这里是写死的：`translationProvider: 'hymt2'` + `translationModelId: 'hy-mt2-1.8b-q3-k-m'`，
       * 而且从不设 `translationOptions`。后果是：配了 Microsoft / OpenAI / Ollama / m2m100
       * 的用户每开一场会话都被强按到本地 Hy-MT2 上 —— 云端 key 根本不传，
       * 本地权重用户又可能压根没装。更糟的是预检也被骗过去：预检算缺失用的
       * `translationModelId` 和真正发出去的是同一个写死值，看起来"已安装"，
       * 于是缺模型的会话一路放行到引擎才报错。
       *
       * 规则说明（空数组、三种 options 形状、本地 provider 必须缺席）见 `@/session-config`。
       * 会话语言用弹窗里选的 `draft.targetLanguage`，其余用设置里的值。
       */
      ...translationFieldsOf(translation, { enabled: draft.translate, targetLanguage: draft.targetLanguage }),
    })
  }, [audioOptions, draft, onSubmit, translation])

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-overlay">
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog className="rounded-2xl border border-border">
            <Modal.Header>
              <Modal.Heading className="nola-title text-foreground">{t('session.title')}</Modal.Heading>
              <span className="nola-micro text-[11px] leading-[1.45] font-normal text-muted">
                {t('session.stepSetup')}
              </span>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              {/* 1 会议名 */}
              <TextField value={draft.title} onChange={(value: string) => patch({ title: value })}>
                <Label className="text-[14px] leading-[1.45] font-semibold text-foreground">{t('session.name')}</Label>
                {/* placeholder 只给格式例子，不承担 label 的职责。 */}
                <Input placeholder={t('session.namePlaceholder')} className="rounded-xl" />
              </TextField>

              {/* 2 输入音源 + 声源测试 + 电平 */}
              <div className="flex flex-col gap-2">
                <Select
                  value={draft.audioSource}
                  onChange={(key) => {
                    if (typeof key !== 'string') return
                    setDeviceMissing(false)
                    patch({ audioSource: key })
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

                {/*
                 * 这里**故意没有音频电平表**。
                 * `NolaBridge` 上没有读音量的通道，画一条会跳动的 Meter 只能是编数据；
                 * 而一条随机跳动的条会被读成"麦克风正在收到声音"，那是骗人。
                 * 能给的真实反馈只有两样：测试期间用 Spinner 表示"在跑"，
                 * 跑完用 deviceMissing 给出"这个设备还在不在"的真结论。
                 */}
                <Button
                  variant="tertiary"
                  size="sm"
                  className="rounded-xl"
                  onPress={runAudioTest}
                  isPending={testing}
                >
                  <Mic aria-hidden="true" />
                  {testing ? t('session.testingAudio') : t('session.audioSourceTest')}
                </Button>
                {deviceMissing ? <FieldError className="text-[12.5px] leading-[1.5]">{t('preflight.deviceUnavailable')}</FieldError> : null}
              </div>

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

              {/* 5 翻译开关 + 目标语言 */}
              <div className="flex flex-col gap-2 rounded-2xl border border-border">
                <SettingRow
                  label={draft.translate ? t('session.translateEnabled') : t('session.translateDisabled')}
                  desc={t('session.targetLanguage')}
                  className="hover:bg-transparent"
                >
                  <Switch
                    isSelected={draft.translate}
                    onChange={(next: boolean) => patch({ translate: next })}
                  ><Switch.Content aria-label={t('session.targetLanguage')}><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
                </SettingRow>

                {draft.translate ? (
                  <div className="px-4 pb-4">
                    <Select
                      value={draft.targetLanguage}
                      onChange={(key) => {
                        if (typeof key === 'string') patch({ targetLanguage: key })
                      }}
                    >
                      <Label className="text-[14px] leading-[1.45] font-semibold text-foreground">
                        {t('session.targetLanguage')}
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
                  </div>
                ) : null}
              </div>

              {/* 6 音频留存 */}
              <div className="rounded-2xl border border-border">
                <SettingRow label={t('session.keepAudio')} desc={t('session.keepAudioHint')} className="hover:bg-transparent">
                  <Switch
                    isSelected={draft.keepAudio}
                    onChange={(next: boolean) => patch({ keepAudio: next })}
                  ><Switch.Content aria-label={t('session.keepAudio')}><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
                </SettingRow>
                <p className="px-4 pb-4 text-[12px] text-muted">{t('workspaceUi.recordingDemoHint')}</p>
              </div>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => onOpenChange(false)}>
                {t('session.cancel')}
              </Button>
              <Button variant="primary" size="sm" className="rounded-full px-5" onPress={submit}>
                {t('session.next')}
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


