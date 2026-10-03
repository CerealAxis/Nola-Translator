/**
 * 悬浮字幕窗的根。`main.tsx` 在 `?overlay=1` 时渲染它，**不在 `AppShell` 里**：
 * 这个窗口是一块压在别人画面上的玻璃，不是应用的一个页面。
 *
 * 卡片与字幕的样式**来自主仓的 `.caption-console` 段**，落在
 * `src/theme/caption-card.css`（文件头写了来源与搬的是哪几样）；字幕怎么排、
 * 怎么滚，则整块搬自主仓的 `src/renderer/overlay/CaptionTrack.tsx`（见本文件）。
 * 这里只提供语义与状态：`data-scheme` / `data-locked` / `data-hover` /
 * `data-transparent`，几何全在 CSS 里。高度分配用 `lineBudget.ts`，也是主仓那份。
 *
 * 四条不可让的原则：
 * 1. **配色不跟随应用主题。** 它压在视频、会议软件、浏览器上，必须自证对比：
 *    `dark` 方案 `#0d0e10` 底 / 原文 `#f7f7f7` / 译文 `#d7dee8`；
 *    `light` 方案 `#f7f7f7` 底 / 原文 `#1a1c22` / 译文 `#4a5160`。
 *    用户在工作台切深色主题，这个窗**不变**。由 `settings.overlay.colorScheme` 选。
 * 2. **滚动容器一律原生 `overflow-y: auto`。** 带 `mask-image` 的滚动容器会让根元素成为
 *    `position: fixed` 后代的包含块，浮层与菜单整体跑偏（DESIGN 第 11.4 节第 4 条）。
 *    渐隐罩是独立的绝对定位兄弟节点，不是滚动容器自己的 mask。
 * 3. **hover 状态用原始指针坐标判定**，不用 enter/leave：卡片未锁定时是拖拽区，
 *    它的圆角会让指针落到 wrapper 上，两个原因都会吞掉合成事件（主仓踩过，
 *    `CaptionOverlay.tsx` 里那段注释）。
 * 4. **字幕是一条连续文本流，不是"一句一个节点"。** 引擎会对同一句连着修订多次，
 *    每句一个节点的话字幕会在自己后面一遍遍重复自己；而且句子一多，固定高度的
 *    轨道会被直接撑破。折叠与上滚都由 `CaptionTrack` 负责。
 *
 * 已知缺口：bridge 上只有 `overlay.show / hide / close / minimize / resize` 通道，
 * **没有「重新显示」的对称入口之外的东西**。所以右上角是「字幕外观」（跳设置页）·
 * 「最小化」（真最小化到任务栏）· 「关闭」（带确认，连带停掉这场同传）。
 * 「最小化」要求字幕窗 `skipTaskbar: false`，否则它最小化之后没有任何入口能点回来，
 * 见 `electron/main.cjs` 的 `createOverlay`。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { Button } from '@heroui/react'
import { Lock, Minus, Monitor, Pin, PinOff, SlidersHorizontal, Unlock, X } from 'lucide-react'

import { DEFAULT_SETTINGS } from '@/bridge'
import { actions, getBridge, sessionStore, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import { translationErrorSummary } from '@/translation-status'

import { CaptionTrack } from './CaptionTrack'
import type { TrackLine } from './CaptionTrack'
import { OverlayControls } from './OverlayControls'
import { allocateCaptionLines } from './lineBudget'

/** 两套固定配色。数值来自 DESIGN 第 2.6 节，不跟随应用主题，也不参与浅深色切换。 */
export const CAPTION_SCHEMES = {
  dark: { bg: '#0d0e10', source: '#f7f7f7', target: '#d7dee8', border: 'rgba(255,255,255,0.10)', chrome: '#d7dee8' },
  light: { bg: '#f7f7f7', source: '#1a1c22', target: '#4a5160', border: 'rgba(0,0,0,0.08)', chrome: '#4a5160' },
} as const

export type CaptionScheme = keyof typeof CAPTION_SCHEMES

export function OverlayRoot() {
  const { t } = useI18n()
  const overlay = useStore(stores.settings, (state) => state.settings?.overlay)
  const session = useStore(sessionStore, (state) => state)
  const [hovered, setHovered] = useState(false)
  const [closing, setClosing] = useState(false)

  /*
   * 「−」是真最小化到任务栏，「✕」是关闭并停掉这场同传。
   *
   * **原先这里是「收起」** —— 调 `overlay.resize` 把窗口压到 56px 细条、再点一次展开。
   * 换掉的理由：收起把「窗口还在、字幕还在跑、但你看不见内容」表达成了「收起」，
   * 用户按「−」时想说的却是「先让它到旁边去，别挡我视频」。后者没有这个歧义。
   *
   * 真最小化有一个硬前提：主进程那边字幕窗是 `skipTaskbar: false`。为 true 时
   * 窗口最小化后任务栏上没有任何入口，用户再也点不回来（见 electron/main.cjs）。
   *
   * **关闭要连带停识别。** 主仓的 `hideOverlay` 是纯隐藏（`src/main/ipc.ts:145`
   * 只有一行 `.hide()`，不碰 session），但那是「隐藏」按钮的语义；这里是「关闭」，
   * 用户说关闭时指的就是这场同传结束。留着服务在跑，用户会以为它还在收音。
   */
  /*
   * 关闭 = 停掉这一场同传 + 关掉这个窗。
   *
   * **顺序是「先停、后关」，不能反。** 反过来（先关窗）在浏览器预览里必然失效：
   * 浮窗自己的渲染进程调 `window.close()` 之后，这个文档当场被销毁，
   * 后面那句 `stopSession()` 连发出去的机会都没有 —— 主窗那边一直以为会话还在跑。
   * 表现就是"点了没反应，窗还开着，麦克风也还在收音"。
   *
   * 至于"引擎卸载权重要几秒，这期间玻璃一直亮在别人画面上"：那是反过来的代价。
   * 两害相权，**先停后关**更值：少一次点击立刻生效，比多亮几秒更符合直觉，
   * 而且关窗那一刻识别已经真的停了，不会有"以为关了其实还在收音"的隐私问题。
   */
  const closeOverlay = (): void => {
    setClosing(false)
    if (session.sessionId) void actions.session.stopSession().catch(() => undefined)
    void getBridge()?.overlay.close()
  }

  const config = overlay ?? DEFAULT_SETTINGS.overlay
  const scheme: CaptionScheme = config.colorScheme === 'light' ? 'light' : 'dark'
  const palette = { ...CAPTION_SCHEMES[scheme], bg: config.backgroundColor, source: config.sourceColor, target: config.translationColor }
  const opacity = clamp(config.backgroundOpacity, 0, 1)

  /*
   * 「字幕外观」是**发给主窗**的一条请求，不是本地跳转。
   *
   * 原型那版写的是 `window.nolaDesktop?.openPage('appearance')`，而**主仓没有
   * `nolaDesktop` 这个全局**（preload 只注入 `nolaTranslator`）。`?.` 可选链让这行
   * 永远求值成 `undefined`，不抛错、不打日志 —— 按钮「点了静默无反应」。
   *
   * 主仓既有 `openAppearance(page)`（渲染层 → 主进程，主进程再 `openAppearance` 回自己
   * 的 `onOpenAppearance` 推送）这条现成的路：浮窗调它，主窗的路由监听收到就改 hash。
   * 见 `main.tsx` 里 `bridge.events.onOverlayRequest` 的订阅。
   */
  const openAppearanceSettings = (): void => {
    void window.nolaTranslator?.openAppearance('appearance').catch(() => undefined)
  }

  const active = session.status === 'running' || session.status === 'paused' || session.status === 'starting'
  const hasCaption = session.segments.length > 0 || session.interim !== null

  /*
   * 轨道只吃**当前这一句**，之前的句子由 `CaptionTrack` 自己折叠累积 —— 这是主仓的
   * 做法，也正是它和"每句渲染一个节点"的分水岭：折叠之后轨道是一条不断的文本流，
   * 装得下就往下长、装不下就往上滚。
   *
   * 未确认句段优先，它是引擎正在改写的最新版本。它没有译文时译文轨道保持不动，
   * 不清空 —— 译文是慢一步的，清空会让刚翻好的一句整条消失。
   */
  const current = session.interim ?? session.segments[session.segments.length - 1] ?? null
  const sourceLine: TrackLine | null = current?.sourceText
    ? { key: current.segmentId, text: current.sourceText }
    : null
  const translated = current?.translations.find((entry) => entry.state === 'complete' && entry.text)
  const translationLine: TrackLine | null = current && translated?.text
    ? { key: current.segmentId, text: translated.text }
    : null

  /*
   * 翻译失败**必须显示原因**。
   *
   * 旧浮窗只画 `state === 'complete'` 的译文，于是「断网 / key 过期 / 模型没就绪」
   * 与「还在翻译」长得一模一样 —— 两种情况译文轨道都是空的，用户什么也做不了。
   * 这里把失败原因作为译文轨道的文字画出来（`translationErrorSummary` 汇总所有失败项）。
   *
   * **只在确实没有可用译文时占位**：这一句正在翻译（`pending`）时**不**显示失败文案 ——
   * 翻译慢一步是常态，一直闪「翻译失败」比空白更吵。
   */
  const failureLine: TrackLine | null = current && !translated?.text
    ? (() => {
        const reason = translationErrorSummary(t, current)
        return reason ? { key: `${current.segmentId}-error`, text: reason } : null
      })()
    : null
  const effectiveTranslationLine = translationLine ?? failureLine

  /*
   * hover 用原始坐标判定，而不是 onMouseEnter/onMouseLeave：卡片未锁定时是
   * `-webkit-app-region: drag`，圆角处指针会落到 wrapper 上，两个原因都会让合成的
   * enter/leave 事件丢失（主仓 CaptionOverlay 里踩过这个坑）。
   */
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const inside = (event: MouseEvent): boolean => {
      const rect = card.getBoundingClientRect()
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    }
    const onMove = (event: MouseEvent): void => setHovered(inside(event))
    const onLeave = (): void => setHovered(false)
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  /*
   * 每条轨道能露几行，取决于 stage 实测高度。
   *
   * 哪条轨道"占位"由用户的显示模式决定，不由"有没有字"决定：按有没有字来分会让
   * 原文独占整个 stage，译文一落地就把舞台对半分，两行在每个句段上都跳一下。
   */
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageBox, setStageBox] = useState({ height: 0, gap: 0 })
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      const style = window.getComputedStyle(stage)
      const padding = Number.parseFloat(style.paddingTop || '0') + Number.parseFloat(style.paddingBottom || '0')
      const height = Math.max(0, stage.clientHeight - padding)
      /*
       * 两条轨道之间的实际间距。**从 computed style 读，不在这里写死 `6`**：
       * `gap` 的值住在 `caption-card.css` 的 `.nola-caption-stage` 上，写死一份就会
       * 和 CSS 各改各的，而对半分是 `share = (height - gap * (轨数 - 1)) / 轨数` ——
       * gap 对不上，总高就偏，行数会多算一行，把下一条轨道整个挤出可视区。这种错不报错。
       * `rowGap` 解析不出数字时（`normal` / 空值）兜成 0，宁可少扣一点也不算出 NaN。
       */
      const gap = Number.parseFloat(style.rowGap || '0') || 0
      setStageBox(previous => previous.height === height && previous.gap === gap ? previous : { height, gap })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [hasCaption, config.showSource, config.showTranslation, config.fontSize, config.translationFontSize, config.lineHeight, config.translationLineHeight])

  /*
   * 双语时两条轨道**上下对半分**，单语时那一条占满整个 stage。
   *
   * **必须一次把两条轨道都传进去。** `allocateCaptionLines` 的"两条可见就对半分"这一步
   * 靠的是同一次调用里数出 `visibleCount === 2`；分开各调一次的话每次只数到 1，永远走
   * "单轨占满"分支，每条都按整个 stage 算行数。叠在上下布局上，原文就会一路长到把
   * 译文那条整个顶出可视区 —— 而这正是分栏版 CSS 掩盖掉的那个 bug。
   *
   * **`visible` 是设置值，不是"这一刻有没有字"**（`config.showSource` /
   * `config.showTranslation` 来自 settings store，见上面 `config` 的定义）。这是"译文
   * 那半边先占住"的地基：用户开着译文，哪怕这一刻译文一个字都还没翻出来，译文轨道照样
   * 分到一半并把高度占住，原文只能在另一半里活动。反过来按有没有字来分，译文一落地
   * 舞台就对半分，两行在每个句段上都跳一下；译文超时/失败时原文又会突然长高。
   *
   * 单语时只有一条 visible，`visibleCount === 1`，算法自己会让那条占满，不需要额外分支。
   */
  const [sourceLines, translationLines] = allocateCaptionLines(
    stageBox.height,
    [
      { visible: config.showSource, fontSize: config.fontSize, lineHeight: config.lineHeight },
      { visible: config.showTranslation, fontSize: config.translationFontSize, lineHeight: config.translationLineHeight },
    ],
    stageBox.gap,
  )

  const patchOverlay = useCallback((patch: Partial<typeof DEFAULT_SETTINGS.overlay>) => {
    void actions.settings.updateSettings({ overlay: patch }).catch(() => undefined)
  }, [])

  /**
   * CSS 自定义属性。整块玻璃的配色与字号都从这里进 `caption-card.css`。
   *
   * 这里**没有** `backdrop-filter`：主仓的 `.caption-console` 也没有。默认底色不透明度
   * 就是 96%，玻璃本来就近乎不透明，那点模糊几乎看不出来，却要在一个常置顶的透明
   * 窗口上每帧重新合成一遍背景。想要玻璃感就去设置里把不透明度调低。
   */
  /*
   * 卡片高度与锚点，两个都必须显式给。
   *
   * **`--nola-card-anchor` 之前从来没有被赋值过** —— CSS 里写着
   * `var(--nola-card-anchor, flex-start)`，但全项目没有任何地方设置它，所以一直是
   * 贴顶。之所以没暴露问题，是因为卡片同时又是 `height: 100%`：卡片等于整个窗口，
   * 贴哪一头都一样。现在卡片高度要跟窗口解耦（菜单展开时窗口会临时加高），锚点就必须
   * 真的给出来：
   *   窗口贴屏幕下沿（bottom）→ 卡片贴**下**沿，把上方空出来给向上的弹层
   *   窗口贴屏幕上沿（top）    → 卡片贴**上**沿，把下方空出来给向下的弹层
   *   自由拖动                  → 贴下沿（弹层向上开更常用，且字幕习惯压在底部）
   *
   * `--nola-card-height` 必须是**基准高度**，不能直接写 `window.innerHeight`：
   * 菜单展开时窗口被加高到 360，`innerHeight` 跟着变成 360，卡片就会跟着长高、
   * 字幕区重排 —— 正好是这里要避免的。所以只在**菜单关闭时**（那时窗口没被加高）
   * 采样一次，作为基准。
   */
  const cardStyle = {
    '--overlay-background-color': palette.bg,
    '--overlay-background-alpha': `${Math.round(opacity * 100)}%`,
    '--overlay-source-color': palette.source,
    '--overlay-translation-color': palette.target,
    '--overlay-font-size': `${config.fontSize}px`,
    '--overlay-font-weight': config.fontWeight,
    '--overlay-line-height': config.lineHeight,
    '--overlay-translation-font-size': `${config.translationFontSize}px`,
    '--overlay-translation-font-weight': config.translationFontWeight,
    '--overlay-translation-line-height': config.translationLineHeight,
  } as CSSProperties

  return (
    <main data-slot="overlay-root" className="nola-overlay-window">
      <section
        ref={cardRef}
        data-slot="caption-surface"
        data-scheme={scheme}
        data-locked={config.locked ? 'true' : 'false'}
        data-hover={hovered ? 'true' : 'false'}
        data-layout={config.layout}
        data-bilingual={config.showSource && config.showTranslation ? 'true' : 'false'}
        data-transparent={opacity <= 0 ? 'true' : 'false'}
        className="nola-caption-card"
        style={cardStyle}
      >
        <div ref={stageRef} className="nola-caption-stage">
          {/*
           * 轨道按 sessionId 上 key：换一场同传就换一条空轨道，上一场折好的文本流
           * 不会渗进这一场（主仓 `CaptionOverlay` 用的是同一个 key 策略）。
           */}
          {config.showSource ? (
            <CaptionTrack
              key={`source-${session.sessionId ?? 'idle'}`}
              kind="source"
              line={sourceLine}
              maxLines={sourceLines}
              layout={config.layout}
            />
          ) : null}

          {config.showTranslation ? (
            <div className="nola-caption-translations">
              <CaptionTrack
                key={`translation-${session.sessionId ?? 'idle'}`}
                kind="translation"
                line={effectiveTranslationLine}
                maxLines={translationLines}
                layout={config.layout}
              />
            </div>
          ) : null}
        </div>

        {/* 渐隐罩是 stage 的兄弟节点，不是滚动容器的 mask（见文件头第 2 条）。 */}
        <div className="nola-caption-scrim" data-edge="top" aria-hidden="true" />
        <div className="nola-caption-scrim" data-edge="bottom" aria-hidden="true" />

        {/*
         * 动作行：位置 · 锁定 · 置顶 │ 字幕外观 · 最小化 · 关闭。
         *
         * 分隔线把"改窗口"（前三项）和"关窗口"（后三项）分成两组 —— 位置/锁定/置顶
         * 改的是窗口本身怎么摆，最小化/关闭改的是它还在不在。
         *
         * **「字幕外观」不再是下拉菜单，是一个直接跳转的按钮。** 原来这里挂着
         * `Dropdown` 壳，菜单里只有「字幕样式」一项，弹出一个改不了东西的
         * `OverlaySettingsDialog`（字号滑杆那些在真实交互里点不动）。用户要的是
         * 「跳到软件里改」—— 主仓的 `CaptionOverlay.tsx:251-252` 现在也是这么干的
         * （调 `openAppearance('appearance')`）。demo 没有主进程，直接改 hash。
         *
         * 顺带修掉了那个"三点没在圆心"的观感问题：它原来是 `Dropdown.Trigger`
         * 而不是 `Button`，两者的内部 padding / line-height 不同，三点被顶到了
         * 偏上。现在和其它四个一样是 `GhostButton`，几何完全一致。
         */}
        <div className="nola-caption-actions" aria-label={t('overlay.title')}>
          <GhostButton
            label={t('overlay.position')}
            active={config.mode === 'top'}
            onPress={() => patchOverlay({ mode: config.mode === 'top' ? 'bottom' : 'top' })}
            color={palette.chrome}
          >
            <Monitor aria-hidden="true" />
          </GhostButton>
          <GhostButton
            label={config.locked ? t('overlay.unlock') : t('overlay.lock')}
            active={config.locked}
            onPress={() => patchOverlay({ locked: !config.locked })}
            color={palette.chrome}
          >
            {config.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
          </GhostButton>
          <GhostButton
            label={config.alwaysOnTop ? t('overlay.unpin') : t('overlay.pin')}
            active={config.alwaysOnTop}
            onPress={() => patchOverlay({ alwaysOnTop: !config.alwaysOnTop })}
            color={palette.chrome}
          >
            {config.alwaysOnTop ? <Pin aria-hidden="true" /> : <PinOff aria-hidden="true" />}
          </GhostButton>

          <span className="nola-caption-divider" aria-hidden="true" />

          <GhostButton
            label={t('overlay.style')}
            onPress={openAppearanceSettings}
            color={palette.chrome}
          >
            <SlidersHorizontal aria-hidden="true" />
          </GhostButton>
          <GhostButton
            label={t('overlay.minimize')}
            onPress={() => void getBridge()?.overlay.minimize()}
            color={palette.chrome}
          >
            <Minus aria-hidden="true" />
          </GhostButton>
          {/*
           * 关闭走 AlertDialog 二次确认：这颗「✕」会连带停掉识别服务，是不可撤销的
           *（重新开一场要重新加载几个 GB 的权重）。在玻璃弹窗上直接一按就关，用户
           * 手快按错了得等引擎把模型卸载完才知道。
           */}
          <GhostButton label={t('overlay.close')} onPress={() => setClosing(true)} color={palette.chrome}>
            <X aria-hidden="true" />
          </GhostButton>
        </div>

        {/*
          未开始态只给两行说明，**不给按钮**。
          「立即开始」已经由底部控制条的麦克风按钮承担，「字幕外观」在右上角那颗
          滑杆按钮里，在这里再摆一对同名按钮就是同一个动作有两个入口——用户会点错，
          然后以为是应用有毛病。

          第二行是**译文轨道的位置**，所以放英文 `Start a session to begin`：
          中文提示语出现在译文那一侧会让人以为翻译失败。两行的字号/颜色都跟轨道
          对齐（原文用 source 色、译文用 target 色），所以空态一出现，字幕区看着
          就已经是双语分栏的样子，不用等真有字幕才知道版面长什么样。
        */}
        {hasCaption ? null : (
          <div className="pointer-events-none absolute inset-x-0 top-[22px] flex flex-col items-start gap-1 px-[22px]">
            <p className="text-[12.5px] leading-[1.5] font-normal" style={{ color: palette.source }}>
              {t('overlay.notStarted')}
            </p>
            <p className="text-[11px] leading-[1.45] font-normal" style={{ color: palette.target }}>
              {t('overlay.notStartedHint')}
            </p>
          </div>
        )}

        <OverlayControls active={active} locked={config.locked} />

        {/*
         * 关闭确认。**不用 `AlertDialog`** —— 它的 `Backdrop` 是
         * `position: fixed; inset: 0`（见 `@heroui/styles` 的 `.alert-dialog__backdrop`），
         * 在这块只有 104px 高的透明玻璃上会盖满整个视口，于是「关闭」按钮自己被盖在下面，
         * 按下去没反应、屏幕上只剩一层暗色。所以这里自己画一个窗内的确认层。
         *
         * 放在 `<section>` **内部**是有意的：这样 `position: absolute; inset: 0` 相对的是
         * 卡片（`.nola-caption-card` 有 `position: relative`），确认层刚好盖住这张玻璃，
         * 不会溢出到玻璃之外 —— 而外层 `main` 是撑满窗口的，盖它就等于盖满视口，
         * 正是原来那个 BUG。
         *
         * 「取消」按钮一定在层内、一定点得到。
         * 不用 `window.confirm`：原生弹窗在 frameless + transparent 的窗里样式全丢，
         * 而且守卫脚本也禁了它。
         */}
        {closing ? (
          <div className="nola-confirm-layer" role="dialog" aria-modal="true" aria-label={t('overlay.closeTitle')}>
            <div className="nola-confirm-dialog">
              <p className="nola-confirm-title">{t('overlay.closeTitle')}</p>
              <p className="nola-confirm-text">{t('overlay.closeBody')}</p>
              <div className="nola-confirm-actions">
                <Button variant="secondary" size="sm" onPress={() => setClosing(false)}>
                  {t('common.cancel')}
                </Button>
                {/* HeroUI v3 的危险按钮是 `variant="danger"`（`buttonVariants` 的 variant
                    槽位），没有 `color` prop —— 传 color 会被 TS 拦下。 */}
                <Button variant="danger" size="sm" onPress={closeOverlay}>
                  {t('overlay.closeConfirm')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return max
  return Math.min(max, Math.max(min, value))
}

/**
 * 固定配色 + 不透明度 → `rgba()`。
 *
 * 用 `rgba()` 而不是 `color-mix(in srgb, #hex 96%, transparent)`：两者视觉等价，
 * 但 `color-mix` 的序列化在 jsdom 里会被改写成丢百分比的 `rgb()`，测试就断言不到不透明度了。
 * 而且这里根本不需要混色 —— 底色本来就是固定的，缺的只是一个 alpha 通道。
 * **纯函数，独立可测。**
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

/**
 * 浮窗动作行里的图标按钮。
 *
 * 26px 见方 + 圆形 + 半透明白底，几何抄主仓 `.caption-console-actions button`。
 * 颜色走浮窗自己的调色板而不是 `--foreground`：这个窗不参与应用主题，
 * 用主题色会让按钮在深色玻璃上变成黑底黑字。
 */
function GhostButton({
  label,
  onPress,
  color,
  children,
  className,
  active,
}: {
  label: string
  onPress: () => void
  color: string
  /** 不传 children 时按钮就是一个纯文字动作（未开始态那两个）。 */
  children?: ReactNode
  className?: string
  /** 生效中的动作点亮成强调色，见 `caption-card.css` 的 `[data-active]` 规则。 */
  active?: boolean
}) {
  /*
   * `active` 时**不写** inline color：行内样式的优先级高于任何样式表规则，一写就
   * 把 `[data-active]` 的强调色盖掉了。所以生效态交回 CSS 决定颜色。
   */
  return (
    <Button
      variant="ghost"
      size="sm"
      isIconOnly={children === undefined}
      onPress={onPress}
      aria-label={label}
      aria-pressed={active}
      data-active={active ? 'true' : 'false'}
      className={['nola-caption-action', className ?? ''].filter(Boolean).join(' ')}
      style={active ? undefined : { color }}
    >
      {children ?? label}
    </Button>
  )
}
