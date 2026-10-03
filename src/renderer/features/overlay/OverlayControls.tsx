/**
 * 悬浮字幕窗底部控制条。
 *
 * **几何抄主仓 `.caption-console-controls`**：绝对定位在卡片底部 10px、居中、26px 高，
 * 平时 `opacity: 0`，hover 才浮现（`caption-card.css` 的 `.nola-caption-controls` 管浮现，
 * 这里只管内容）。绝对定位而不是 flex 兄弟节点，是因为主仓把这两行都浮在字幕**上面**——
 * 字幕块的行位在指针扫过时不能跳。
 *
 * 四个胶囊从左到右：麦克风 · 模型 · 源语言 · 目标语言。
 * 它们写的是**与工作台同一份设置**（`recognition.modelId` / `recognition.sourceLanguage` /
 * `translation.targetLanguage`），所以在浮窗里换模型，主窗口的下一场
 * 同传就用新模型，不会出现两个窗口各说各话。
 *
 * 会话进行中时模型与语言胶囊禁用：引擎在 `startSession` 那一刻就握定了它们，
 * 会话中途换只改设置不改这一次会话，画一个可点的控件在那里是骗人。
 *
 * **打开浮窗不自动开始识别。** 麦克风是唯一的开始入口，且它有三种按下结果：
 * 开始 / 停止 / 继续。识别引擎加载要几秒（要载入几个 GB 的权重），所以
 * `starting` 期间按钮显示转圈而不是切成麦克风 —— 否则用户按一下看到图标没变，
 * 会以为没点上又按一次。
 *
 * **这一场用哪份设置，按下去之前就定死。** `startSession` 的 `SessionConfig` 完全
 * 取自 `stores.settings` + `stores.models.devices`，翻译字段一律走
 * `translationFieldsOf`、声源一律走 `audioSourceFrom`（见下面 `startConfigOf` 的注释）。
 * 早先这里发出去的是一份手拼的配置：声源写死 `{ kind: 'defaultOutput' }`、
 * 只带一个 `targetLanguages`、翻译字段整个缺席 —— 于是用户在设置里挑的麦克风、
 * 挑的服务商、填的云端 key 全部被无视。
 *
 * **失败必须看得见。** 预检拦下（缺模型）与引擎报错都写进 `sessionStore`
 * （`missing` / `errorCode`），而 `startSession` 之外的 `.catch(() => undefined)`
 * 不再把它们吞掉；浮窗就地显示一行说明（`StartFailureNotice`），不跳主窗口 ——
 * 见 `OverlayRoot` 里「同一个动作有两个入口用户会点错」那条判断。
 */

import { useLayoutEffect, useState } from 'react'

import { Button, Dropdown, Spinner } from '@heroui/react'
import { Mic, Square } from 'lucide-react'

import {
  DEFAULT_SETTINGS,
  LANGUAGE_LABELS,
  RECOGNITION_MODEL_IDS,
  RECOGNITION_MODEL_LABELS,
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
} from '@/bridge'
import type { AppSettings, AudioDevice, AudioSourceOption, RecognitionModelId, SessionConfig } from '@/bridge'
import { audioSourceFrom } from '@/features/workspace/SessionSetupDialog'
import { errorCopyOf } from '@/features/workspace/WorkspacePage'
import { actions, sessionStore, stores, useStore } from '@/store'
import { translationFieldsOf } from '@/session-config'
import { useI18n } from '@/i18n'

import { OverlayDisplayMenu, OverlayLayoutMenu } from './OverlayDisplayMenu'

/**
 * 浮窗胶囊。几何与配色走 `.nola-caption-pill`（`caption-card.css`），逐字抄自主仓
 * 的 `.caption-control-pill`：26px 高、13px 圆角、12.5px 字重 600、半透明白底。
 *
 * 做成类而不是在这写一串工具类：同一排控制条上有模型 / 语言对 / 显示模式三个胶囊，
 * 右上角还有第四个。写四遍的机会成本比一个类高，而且一定会有人漏改一处。
 *
 * 胶囊里的文字**不设 max-width、也不 truncate**：主仓 `.caption-control-pill` 只写了
 * `white-space: nowrap`，长名字靠 nowrap 自然撑开。搬样式时我多加的 `max-w-40 truncate`
 * 会把「Auto detect」「Chinese (Simplified)」砍成「Auto det…」「Chinese (…」，
 * 那是擅自改了源样式，撤掉了。
 */
const CAPSULE = 'nola-caption-pill'

/**
 * 弹层高度上限 —— **按实测可用空间算，不写死。**
 *
 * 上一个版本给的是固定 `240`，用户反馈"弹窗被压得只剩一行、右边还冒出滚动条"。
 * 根因不是数值太小，而是**这条路径上有两层高度限制在互相打架**：
 *
 * ① react-aria 的 `Popover` 会自己做碰撞检测：按「触发器到视口边缘的可用距离」算一个
 *    `max-height`，**写成行内样式**。行内优先级高于任何样式表，所以给 prop 也会被它盖。
 *    浮窗只有 104px 高、控制条贴着卡片底部，向上到窗口顶只有约 68px，于是它把 7 项
 *    模型列表压成 60px、只露第 1 项。
 * ② CSS 里的 `max-height`。这条**必须删掉** —— 留着只会让下一个人以为它在起作用。
 *
 * 所以现在反过来做：**不给 maxHeight 写死值，而是把「触发器到视口边缘的真实距离」
 * 算出来喂给它**。这个数不是常量，它跟着窗口高度、用户拖出来的窗口大小、卡片贴上沿
 * 还是贴下沿一起变 —— 这就是「不写死」。
 *
 * 具体做法见 `useMenuMaxHeight()`：量出触发器到各方向视口边缘的距离，取向上下两个
 * 方向里较大的那个（弹层会自己翻到空间大的那边），再扣掉一层弹层自己的圆角留白。
 * 至少给一行（`MENU_ROW_MIN`），否则 0 高度会让 react-aria 直接不渲染弹层。
 */
const MENU_ROW_MIN = 30
/** 弹层上下圆角 + 与触发器的间隙，量出来的可用距离里要扣掉这些。 */
const MENU_CHROME = 12

/** 失败说明行的 id。给麦克风的 `aria-describedby` 用，文本变了 id 不变。 */
const FAILURE_NOTICE_ID = 'overlay-start-failure'

export interface OverlayControlsProps {
  /*
   * `active`（会话进行中）之外还收一个 `locked`。
   *
   * 锁定 = 「不能进行任何修改，也不能移动」。所以它必须同时封掉**位置**和**内容**：
   * 只撤掉 `-webkit-app-region: drag`（原先的做法）只解决了「别挪走」，控制条上的
   * 模型、语言、显示内容、对照方式全都还能点 —— 那不是锁定，是半锁定。
   *
   * 麦克风**不**跟着锁：锁定的是「别改我的设置」，不是「别让我开始同传」。
   * 否则用户锁了位之后就没法开始识别了。
   */
  active: boolean
  locked: boolean
}

/**
 * 弹层可用高度 —— **量出来的，不是常量。**
 *
 * 量什么：触发器的上下边缘到**视口**上下边缘的距离。视口就是这块玻璃（透明窗口）本身，
 * 超出它的像素浏览器不渲染，所以"视口外有多少空间"这个问题没有意义 —— 只能问
 * "视口内还剩多少"。
 *
 * 为什么取上下两个方向里**较大**的那个：react-aria 的 `shouldFlip` 默认开，空间不够时
 * 它会自动翻到另一侧。既然如此，我们就不替它选边，直接把"翻过去之后能用多少"喂给它，
 * 它自己会挑最合适的那一边。
 *
 * 为什么减 `MENU_CHROME`：量出来的是触发器边缘到视口边缘，弹层还要占自己的圆角留白
 * 和与触发器的间隙，不扣掉就会有一两条露在视口外被裁掉。
 *
 * 至少给 `MENU_ROW_MIN`（一行）：传 0 或负数会让 react-aria 认为"放不下"，
 * 结果是弹层根本不渲染 —— 比显示得矮更难用。
 */
export function useMenuMaxHeight(): number {
  const [maxHeight, setMaxHeight] = useState<number>(fallbackMaxHeight)

  useLayoutEffect(() => {
    const measure = (): void => {
      const next = fallbackMaxHeight()
      setMaxHeight(previous => (previous === next ? previous : next))
    }
    measure()
    // 窗口尺寸变了（用户拖浮窗、换分辨率、任务栏自动隐藏）都要重量。
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return maxHeight
}

/**
 * 这一场同传的 `SessionConfig` —— **整个应用里构造它的地方只有两个**：
 * 工作台的 `SessionSetupDialog`（用户逐项挑过一遍）与这里的浮窗。
 *
 * 两条都必须落到**同一份用户设置**上，否则会出现"在浮窗里按开始、跑出来的却是
 * 另一种配置"，而用户没有任何机会察觉。所以这里不做任何手拼：
 *
 * · **声源**走 `audioSourceFrom` —— 它是 `SessionSetupDialog` 用的那一个，
 *   规则（认不出就落系统默认输出 / 麦克风与扬声器分开两种 kind）不在这里重写。
 *   设置里存的是**设备 id 字符串**，而 `SessionConfig.audioSource` 要的是
 *   `{ kind, deviceId }`，中间那步"拿 id 回头查设备表"是 `optionOf` 做的：
 *   `stores.models.devices` 由 `initStores` 拉一次，之后由引擎的 `devices` 事件增量更新，
 *   浮窗文档同样有这份数据（`initStores` 在 `?overlay=1` 分叉之前就跑）。
 *   查不到就交 `undefined`，`audioSourceFrom` 落到 `{ kind: 'defaultOutput' }` ——
 *   与工作台"设备列表里没有这一项"的行为一致。
 *
 * · **翻译**走 `translationFieldsOf`，四条规则（关掉译文必须给空数组、
 *   本地 provider 的 `translationOptions` 必须整个缺席、云端三种形状、
 *   provider / 模型 / 中间翻译开关全部取自设置）见 `@/session-config` 的文件头。
 *   早先这里是手搓的 `targetLanguages: [target]`，翻译字段一个都没有，
 *   于是配了 Microsoft / OpenAI / Ollama / m2m100 的用户每按一次浮窗麦克风就被强按到
 *   本地 Hy-MT2 上，云端 key 根本不传。
 *
 * **「这次要不要翻译」在这里恒为开。** 理由三条：
 * 1. 工作台自己的默认值就是开（`WorkspacePage` 的 `EMPTY_DRAFT` 与 `openSetup()`
 *    都写死 `translate: true`），浮窗不该比工作台更保守。
 * 2. 控制条上就摆着「目标语言」胶囊且它是可点的。这一场不翻译，那颗胶囊就是在改一个
 *    会被丢掉的值 —— 用户在浮窗里选日语、字幕全是原文，比"少翻了一种语言"更糟。
 * 3. `overlay.showTranslation` 是**显示**偏好，不是翻译开关。`session-config.ts`
 *    文件头第 1 条明确写过「不显示译文」不等于「不翻译」，用它当开关就是那条警告本身。
 *    真要在这里省掉翻译管线，只能再加一颗显式开关并把它落到设置里，那是另一个决定。
 */
function startConfigOf(settings: AppSettings, devices: readonly AudioDevice[]): SessionConfig {
  return {
    audioSource: audioSourceFrom(optionOf(settings.recognition.audioSource, devices), settings.recognition.audioSource),
    // 协议保留了它只为兼容老版本，实时模式是这个应用唯一支持的那种。
    recognitionMode: 'realtime',
    recognitionModelId: settings.recognition.modelId,
    sourceLanguage: settings.recognition.sourceLanguage,
    // 目标语言不传，用设置里的 `translation.targetLanguage` —— 胶囊改的就是它。
    ...translationFieldsOf(settings.translation, { enabled: true }),
  }
}

/**
 * 设备 id → 选择器里的那一项。**只做查表，规则不在这。**
 *
 * 返回 `undefined` 有两种情况，都由 `audioSourceFrom` 统一处理成系统默认输出：
 * 设置值是协议常量 `'defaultOutput'`（它不是设备，`listDevices()` 永远不返回它），
 * 或者这个设备已经不在列表里（拔了 / 换机器）。后者落回默认输出而不是崩掉，
 * 与工作台"设备列表里没有这一项"是同一个结论。
 */
function optionOf(value: string, devices: readonly AudioDevice[]): AudioSourceOption | undefined {
  const device = devices.find((item) => item.deviceId === value)
  if (!device) return undefined
  return {
    value: device.deviceId,
    kind: device.kind,
    deviceId: device.deviceId,
    name: device.name,
    isDefault: device.isDefault,
  }
}

/**
 * 触发器附近的实测可用高度。
 *
 * 找不到触发器（比如 SSR、jsdom 里没有布局）就退回到视口的一半 —— 那是个
 * "不写死的"兜底：窗口多高它就跟着变，不会像固定 240 那样在 104px 的窗里爆掉。
 */
function fallbackMaxHeight(): number {
  if (typeof document === 'undefined') return MENU_ROW_MIN
  const trigger = document.querySelector<HTMLElement>('.nola-caption-pill')
  const viewportHeight = window.innerHeight
  if (!trigger) {
    return Math.max(MENU_ROW_MIN, Math.floor(viewportHeight / 2) - MENU_CHROME)
  }
  const box = trigger.getBoundingClientRect()
  const roomUp = box.bottom
  const roomDown = viewportHeight - box.top
  // 取大的一边：react-aria 自己会翻到有空间的那侧，我们只负责把上限给准。
  const room = Math.max(roomUp, roomDown)
  return Math.max(MENU_ROW_MIN, Math.floor(room) - MENU_CHROME)
}

export function OverlayControls({ active, locked }: OverlayControlsProps) {
  const { t, language } = useI18n()
  const menuMaxHeight = useMenuMaxHeight()
  /**
   * 整份设置，而不是逐个字段各订阅一次。
   *
   * `stores.settings.settings` 是**一个稳定引用**（`settingsStore` 只在引擎确认或
   * 乐观 patch 时换掉它），所以拿整份不会踩 `createStore.ts` 开头那条
   * 「selector 每次新建对象会让 React 无限循环」的忌讳；而 `startConfigOf`
   * 需要的就是整份 —— 它是这个浮窗里唯一构造 `SessionConfig` 的地方。
   *
   * 拿不到设置时回落到 `DEFAULT_SETTINGS`，与 `SessionSetupDialog` 同一口径：
   * 宁可退回默认，也不让会话开不起来。
   */
  const settings = useStore(stores.settings, (state) => state.settings) ?? DEFAULT_SETTINGS
  const devices = useStore(stores.models, (state) => state.devices)
  const status = useStore(sessionStore, (state) => state.status)
  const errorCode = useStore(sessionStore, (state) => state.errorCode)
  const missing = useStore(sessionStore, (state) => state.missing)

  const modelId = settings.recognition.modelId
  const source = settings.recognition.sourceLanguage
  const target = settings.translation.targetLanguage

  const label = (code: string): string => {
    const entry = (LANGUAGE_LABELS as Record<string, { zh: string; en: string } | undefined>)[code]
    if (!entry) return code
    return language === 'zh-CN' ? entry.zh : entry.en
  }

  const patch = (next: Parameters<typeof actions.settings.updateSettings>[0]): void => {
    void actions.settings.updateSettings(next).catch(() => undefined)
  }

  /*
   * 失败说明用到的两个本地量。错误本身**不存这里** —— `sessionStore` 才是唯一事实来源，
   * 这里只记"上一次按的是开始还是停止"和"用户已经看过哪一次失败"。
   *
   * `lastIntent` 是 `errorCopyOf` 的 `context`：会话中途崩掉该说"停了"而不是"没法开始"。
   * 引擎异步推来的 error 没有对应的按键，取上一次的值 —— 对一行常驻说明来说够用。
   *
   * `dismissedFailure` 存的是**签名**（错误码 + 缺的资源 id）而不是错误码本身：
   * 同一种故障连着失败两次，中间成功过一次，签名相同就该重新提示。
   * 它解决的是"说明会一直挂在玻璃上不消失" —— store 的 `errorCode` 要到下一次
   * `startSession` 才会被清掉，而那时按钮正好被禁用，用户拿不到任何出口。
   * 每按一次麦克风就重新武装，所以"再试一次"这条路始终是通的。
   */
  const [lastIntent, setLastIntent] = useState<'start' | 'stop'>('start')
  const [dismissedFailure, setDismissedFailure] = useState<string | null>(null)

  const failureSignature = errorCode === null ? null : `${errorCode}|${missing?.resourceId ?? ''}`
  const failureMessage =
    failureSignature === null || failureSignature === dismissedFailure
      ? null
      : missing
        ? t('preflight.modelMissing', { name: missing.name })
        : t(errorCopyOf(errorCode, lastIntent).message)

  /**
   * 麦克风 = **这一场同传的唯一开关**。
   *
   * `idle` / `error` → 开始；`running` / `paused` → **停止**。
   *
   * **这里不做「暂停 / 继续」两态。** 用户要的是「关闭的话也是这里关」——
   * 浮窗里那颗按钮的语义是"这场同传的开关"，不是"录音的开关"。真做成暂停，
   * 用户按一下灯灭了、以为已经停了，结果引擎还占着麦克风在后台收音，
   * 这是隐私上更糟的一种误解。停止是可逆的（再按一次重新开始），暂停不是。
   *
   * `starting` / `stopping` 期间不响应：引擎正在载入 / 卸载权重，这时候再按一次
   * 既停不下来也换不了，只会让人以为按钮坏了。
   *
   * **错误不再被吞。** `.catch()` 只做一件事：把原因写进 console
   * （`sessionStore` 已经把 `error` / `errorCode` / `missing` 写进 state，
   * 界面由 `StartFailureNotice` 就地显示）。原来是 `.catch(() => undefined)`
   * 一句话把预检失败吃干净，而浮窗又不读 store 的 `missing` —— 结果就是
   * 缺模型时按麦克风**完全没有反应**，用户只会以为按钮坏了。
   */
  const toggleMic = (): void => {
    if (status === 'running' || status === 'paused') {
      setLastIntent('stop')
      // 再按一次就是重试，所以先让上一次那条说明重新武装。
      setDismissedFailure(null)
      void actions.session.stopSession().catch((error: unknown) => {
        console.warn('[overlay] stopSession failed', error)
      })
      return
    }
    if (status === 'idle' || status === 'error') {
      setLastIntent('start')
      setDismissedFailure(null)
      void actions.session.startSession(startConfigOf(settings, devices)).catch((error: unknown) => {
        console.warn('[overlay] startSession failed', error)
      })
    }
  }

  /*
   * 一颗按钮三种样子，颜色全部交给 CSS 的 `[data-*]`：
   *   starting → 转圈（引擎在加载）
   *   running  → 整颗反白 + 停止方块（正在收音，点一下结束这一场）
   *   其余     → 普通麦克风（点一下开始）
   * 之前 running 时画的是 `MicOff`，读起来像"现在是关着的"，与整颗反白自相矛盾。
   */
  const starting = status === 'starting' || status === 'stopping'
  const running = status === 'running'
  const micLabel = starting
    ? t('overlay.micLoading')
    : running || status === 'paused' ? t('overlay.micStop') : t('overlay.micStart')

  return (
    <>
      <div data-slot="overlay-controls" className="nola-caption-controls">
        <div className="nola-no-drag flex min-w-0 flex-1 items-center justify-center gap-2">
          {/*
           * `starting` 用 Spinner 占位而不是把按钮置灰 —— 置灰 + 不响应会让人以为按坏了，
           * 转起来才看得出"在等引擎"。`stopping` 同理，但引擎卸载权重要几秒，值得给反馈。
           */}
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={toggleMic}
            isDisabled={status === 'starting' || status === 'stopping'}
            aria-label={micLabel}
            aria-busy={starting || undefined}
            // 有失败说明时把它挂成这颗按钮的描述：说明文本本身在下面那块，
            // 读屏走这里拿得到"为什么没反应"，不用靠视觉去找那一行字。
            aria-describedby={failureMessage ? FAILURE_NOTICE_ID : undefined}
            // 录音时整颗反白（白底深字），一眼能看出"现在是开着麦的"。样式在
            // `caption-card.css` 的 `.nola-caption-mic`，这里只给状态。
            className="nola-caption-mic"
            data-active={running ? 'true' : 'false'}
            data-loading={starting ? 'true' : 'false'}
          >
            {starting ? <Spinner size="sm" color="current" /> : running ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Button>

          <Dropdown>
            <Dropdown.Trigger isDisabled={active || locked} className={`${CAPSULE} nola-caption-pill--mode`}>
              <span className="nola-caption-mode-dot" aria-hidden="true" />
              <span>{RECOGNITION_MODEL_LABELS[modelId]}</span>
            </Dropdown.Trigger>
            {/*
              选中态交给 Menu 自己算：`Dropdown.Item` 上没有 `isSelected`（那是 Select /
              ListBox 的 prop），正确链路是 `selectionMode` + `selectedKeys` 挂 Menu、
              每项只给 `id`。

              `selectedKeys` **必须传 Set**：传字符串 react-aria 不报错，但选中态静默失效
              （每一项都是 aria-checked="false"）。这一条是实测出来的，文档里没写。
              ✓ 放 label 之后（HeroUI 的槽位是 `absolute start-2`，本来就在左侧）。
            */}
            <Dropdown.Popover className="nola-caption-menu" maxHeight={menuMaxHeight}>
              <Dropdown.Menu
                className="nola-caption-menu-list"
                selectionMode="single"
                selectedKeys={new Set([modelId])}
                onSelectionChange={(key) => {
                  if (typeof key === 'string') patch({ recognition: { modelId: key as RecognitionModelId } })
                }}
              >
                {RECOGNITION_MODEL_IDS.map(id => (
                  <Dropdown.Item
                    key={id}
                    id={id}
                    className="nola-menu-item"
                    textValue={RECOGNITION_MODEL_LABELS[id]}
                    onAction={() => patch({ recognition: { modelId: id as RecognitionModelId } })}
                  >
                    {RECOGNITION_MODEL_LABELS[id]}
                    <Dropdown.ItemIndicator type="checkmark" />
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          {/*
            语言对拆成**两个独立胶囊**，各自一个 Dropdown。
            原来是一个 Popover 里塞两个 Select 加一个「交换语言」按钮，看起来省了一颗
            按钮，实际有三重问题：
            1. 弹层里两个 Select 叠在 26px 高的卡片上时溢出严重，选项区被压成一条缝；
            2. 「交换语言」在弹层内是第三个动作，和"选语言"混在一层，位置不固定；
            3. 卡片宽度会被 `w-72` 的弹层顶开，字幕区跟着跳。
            拆开之后每颗胶囊只管一件事，也就不用在弹层里再区分"哪一侧"了。
            交换能力已按要求删除 —— 目标语言可以直接选，交换是个可推导的冗余动作。
          */}
          <LanguagePill
            caption={t('session.sourceLanguage')}
            value={source}
            options={SOURCE_LANGUAGE_OPTIONS}
            labelOf={label}
            isDisabled={active || locked}
            maxHeight={menuMaxHeight}
            onChange={next => patch({ recognition: { sourceLanguage: next } })}
          />
          <LanguagePill
            caption={t('session.targetLanguage')}
            value={target}
            options={TARGET_LANGUAGE_OPTIONS}
            labelOf={label}
            isDisabled={active || locked}
            maxHeight={menuMaxHeight}
            onChange={next => patch({ translation: { targetLanguage: next } })}
          />

          {/*
            末尾两颗是**两个正交维度**，各管一件事：
              显示内容 = 摆几列（双语 / 仅原文 / 仅译文）
              对照方式 = 怎么排（分区 / 逐句）
            之前它们挤在同一张菜单里，而胶囊只显示其中一个的当前值，于是
            「换了排版但胶囊文字没动」看起来就像按钮坏了。拆成两颗就自洽了。
          */}
          <OverlayDisplayMenu isDisabled={locked} />
          <OverlayLayoutMenu isDisabled={locked} />
        </div>
      </div>

      <StartFailureNotice message={failureMessage} />
    </>
  )
}

/**
 * 启动/停止失败的一行说明。**就地显示，不跳主窗口。**
 *
 * 为什么不能塞进上面那个 `.nola-caption-controls` 里：它 `opacity: 0`、
 * `pointer-events: none`，只在卡片 hover / focus-within 时才浮现（`caption-card.css`）。
 * 而故障恰恰发生在**用户刚把手从麦克风上拿走**的那一刻 —— 说明跟着一起淡下去，
 * 屏幕上还是什么都没有，等于没修。所以它是控制条的**兄弟节点**，绝对定位在控制条
 * 正上方，常驻可见。
 *
 * 定位相对的是 `.nola-caption-card`（`position: relative`），宽度沿用控制条的
 * `left/right: 10px`，`bottom: 40px` 刚好让开控制条占的 10~36px。
 *
 * **配色不跟随浮窗调色板，用固定的高对比深底白字。** 这块玻璃压在别人的画面上，
 * 它自己的两套方案（深底浅字 / 浅底深字）都不保证一行小字在任意背景上读得清；
 * 一颗写死的深色 chip 反而对两种方案都成立。故障提示本来也不该假装自己是字幕。
 */
function StartFailureNotice({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <div
      id={FAILURE_NOTICE_ID}
      role="status"
      data-slot="overlay-failure"
      className="nola-caption-notice"
    >
      <p className="nola-caption-notice__text">{message}</p>
    </div>
  )
}

/**
 * 一侧语言胶囊：一颗药丸 + 一个 Dropdown。
 *
 * 用 `Dropdown` 而不是 `Select`：浮窗这块玻璃只有 940px 宽、26px 高，
 * `Select` 的触发器 + `ListBox` 弹层默认留白太大，压在字幕上很重。
 * `Dropdown.Menu` 的行高与胶囊同源，看起来是同一套东西。
 *
 * 17 项语言单列超过一屏，`max-h` + 隐藏滚动条见 `caption-card.css` 的
 * `.nola-caption-menu-list`。**允许溢出浮窗边界**：弹层是叠加在字幕卡之上的独立层，
 * 字幕窗是 `transparent` 的那一小块，超出去的部分照常显示在别人画面上，
 * 不需要为了"塞进窗内"而把 17 项压成两列。
 *
 * 方向交给 react-aria 自己判断：它在空间不够时会自动翻转到上方
 * （`shouldFlip` 默认开），这里不写死 `placement`。
 */
function LanguagePill({
  caption,
  value,
  options,
  labelOf,
  isDisabled,
  maxHeight,
  onChange,
}: {
  caption: string
  value: string
  options: readonly string[]
  labelOf: (code: string) => string
  isDisabled: boolean
  maxHeight: number
  onChange: (code: string) => void
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger isDisabled={isDisabled} className={CAPSULE} aria-label={caption}>
        <span>{labelOf(value)}</span>
      </Dropdown.Trigger>
      <Dropdown.Popover className="nola-caption-menu" maxHeight={maxHeight}>
        <Dropdown.Menu
          className="nola-caption-menu-list"
          selectionMode="single"
          selectedKeys={new Set([value])}
          onSelectionChange={key => { if (typeof key === 'string') onChange(key) }}
        >
          {options.map(code => (
            <Dropdown.Item key={code} id={code} className="nola-menu-item" textValue={labelOf(code)} onAction={() => onChange(code)}>
              {labelOf(code)}
              <Dropdown.ItemIndicator type="checkmark" />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
