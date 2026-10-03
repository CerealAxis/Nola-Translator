/**
 * 首页入口卡。bento 网格里的一格。
 *
 * ============================ 为什么不是 SectionCard ============================
 * `SectionCard` 的注释写明"卡片不是交互元素，整卡可点请在 feature 层用 Button /
 * ToggleButton 承载"。所以两种形态分别用不同的积木：
 *
 * - **主卡**：视觉是 `Surface`（无投影 + 1px 发丝线 + r-lg + accent 描边），
 *   动作是那颗 `rounded-full` 主按钮。主卡本身不是按钮。
 * - **次级卡**：整卡是 `Button`（React Aria 的 onPress，键盘可达），无独立按钮。
 *
 * 两种形态刻意不共用一个根元素：主卡里再套一个按钮会得到嵌套 button，
 * 既破坏 HTML 合法性，也让键盘导航顺序变得莫名其妙。
 *
 * **入口卡不带副标题。** 图标、标题、位置已经说清楚了，再加一句"看字幕、听同传、
 * 做记录"是装饰性对仗，不含用户不知道的信息（DESIGN 第 12.1 节）。
 * 要放信息就放真实数据：模型卡放"已安装 N"，记录卡放最近一条的时间。
 */

import type { ReactNode } from 'react'
import { Button, Surface, Tooltip } from '@heroui/react'

/**
 * 网格几何（DESIGN 第 6.3.1 / 6.3.3 节）：
 * - `>= 1000px`：`2fr 1fr` x `repeat(3, 1fr)`，主卡 `grid-row: 1 / span 3`
 * - `760 - 999px`：塌成 `1fr 1fr` 两列均分，主卡占第 1 格，三张次级卡在第 2 列堆叠
 * - `<= 759px`：不支持，窗口最小宽度就是 760
 *
 * 断点用 `min-[1000px]:` 任意变体而不是 `lg:`（Tailwind 的 lg 是 1024px），
 * 因为设计给的是 1000px 这个具体数字。
 */
const GRID = [
  'grid w-full grid-cols-2 gap-4',
  'min-h-[420px] flex-1',
  'min-[1000px]:grid-cols-[2fr_1fr] min-[1000px]:grid-rows-3',
].join(' ')

/**
 * 格子位置。**必须写成完整类名的静态查表**：Tailwind 只扫源码里的完整字符串，
 * `lg:row-start-${row}` 这种拼接出来的类不会被生成，样式会静默丢失。
 */
// 宽屏（>=1000px）：主卡占第 1 列跨 3 行，三张次级卡在第 2 列各占一行。
// 窄屏：主卡 col-span-2 通栏置顶，三张次级卡**不做显式定位**，跟着 DOM 顺序
// 落进 2 列网格。窄屏一旦给次级卡写死 row-start，主卡就会被先放置的显式项
// 挤到最后一行去 —— 那个坑踩过一次就够了。
const MAIN_PLACEMENT = 'col-span-2 min-[1000px]:col-span-1 min-[1000px]:col-start-1 min-[1000px]:row-span-3'

const SUB_PLACEMENT: Record<1 | 2 | 3, string> = {
  1: 'min-[1000px]:col-start-2 min-[1000px]:row-start-1',
  2: 'min-[1000px]:col-start-2 min-[1000px]:row-start-2',
  3: 'min-[1000px]:col-start-2 min-[1000px]:row-start-3',
}

const ICON_PLATE =
  'grid place-items-center rounded-[10px] bg-surface-secondary text-accent transition-colors duration-[var(--dur-micro)] group-hover:bg-surface-tertiary'

export interface EntryCardProps {
  /** 图标容器内容，24px。调用方传 lucide 图标元素。 */
  icon: ReactNode
  /** 卡片标题。主卡 `t-title`，次级卡 `t-subtitle`。 */
  title: string
  /** 点击。次级卡整卡可点；主卡传它会被主按钮调用。 */
  onPress: () => void
  /** `main` 是唯一主 CTA（accent 描边 + 药丸按钮），`sub` 是次级卡（发丝线 + 整卡可点）。 */
  layout?: 'main' | 'sub'
  /** 主按钮文案。只在 `layout='main'` 时渲染。 */
  actionLabel?: string
  /**
   * 可选的**真实数据**元信息，例如"已安装 3"或最近一条记录的时间。
   * 不是副标题：它告诉用户的是界面上看不到的事实。
   */
  meta?: ReactNode
  /**
   * 主卡专用的**事实列表**，每项是 `[标签, 值]`。
   * 主卡很高（跨 3 行），中间那段放什么必须是有信息量的东西：
   * 引擎是否就绪、当前识别模型、当前语言对——都是点进去就不用重选一遍的配置。
   * 不接受没有信息量的装饰行，所以这是个封闭的二元组而不是 ReactNode。
   */
  facts?: readonly (readonly [string, string])[]
  /** 引擎未就绪等情况下禁用整卡，并用 Tooltip 说明原因。 */
  isDisabled?: boolean
  /** 禁用原因。文案由调用方传 `t(...)` 的结果。 */
  disabledReason?: string
  /** 无障碍标签。缺省用 title。 */
  ariaLabel?: string
  /** 次级卡在第 2 列的行位（1 到 3）。主卡忽略。 */
  subRow?: 1 | 2 | 3
  className?: string
  /** 自动化测试锚点。 */
  testId?: string
}

export function EntryCard({
  icon,
  title,
  onPress,
  layout = 'sub',
  actionLabel,
  meta,
  facts = [],
  isDisabled = false,
  disabledReason,
  ariaLabel,
  subRow = 1,
  className,
  testId,
}: EntryCardProps): ReactNode {
  const isMain = layout === 'main'
  const placement = isMain ? MAIN_PLACEMENT : SUB_PLACEMENT[subRow]

  const plate = (
    <span
      className={[ICON_PLATE, isMain ? 'size-12' : 'size-10'].filter(Boolean).join(' ')}
    >
      <span className="grid size-6 place-items-center">{icon}</span>
    </span>
  )

  const heading = (
    <span className="flex w-full flex-col items-start gap-1">
      <span
        className={[
          isMain ? 'nola-title' : 'nola-subtitle',
          'block w-full truncate text-foreground',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {title}
      </span>
      {meta ? <span className="nola-caption block w-full text-muted">{meta}</span> : null}
    </span>
  )

  if (isMain) {
    return (
      <Surface
        data-testid={testId}
        className={[
          placement,
          // 唯一的主 CTA：1px accent 描边。0 阴影，内边距 24px。
          //
          // 主卡跨 3 行、内容只有卡片高度的三分之二，剩下那段差值必须有个明确的处置：
          //   · justify-between → 空洞被顶到 facts 与按钮之间，最难看
          //   · 自然流式       → 空洞落到卡片底部，像没排完
          //   · justify-center  → 上下各分一半，读起来就是"这张卡给得很宽裕"
          // 选第三个。
          'flex flex-col items-center justify-center gap-4 rounded-[10px] border border-accent bg-surface p-6',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex w-full flex-col items-start gap-4">
          {plate}
          {heading}
        </div>

        {/*
         * 主卡高度大，中间那一段不能留成空洞。这里放的是**真正决定"能不能立刻开始"的三件事**：
         * 引擎是否就绪、当前识别模型、当前语言对。都是已经选好的配置，用户点进去不用再选一遍，
         * 进工作台也能对得上。留白没有信息，装饰更糟，所以这里放事实。
         */}
        {facts.length > 0 ? (
          <dl className="flex w-full flex-col gap-2 border-t border-separator pt-4">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className="nola-caption shrink-0 text-muted">{label}</dt>
                <dd className="nola-body-strong min-w-0 truncate text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <MainAction
          label={actionLabel ?? ''}
          isDisabled={isDisabled}
          onPress={onPress}
        />
      </Surface>
    )
  }

  return (
    <SubCard
      placement={placement}
      plate={plate}
      heading={heading}
      title={title}
      ariaLabel={ariaLabel}
      isDisabled={isDisabled}
      onPress={onPress}
      className={className}
      testId={testId}
      disabledReason={disabledReason}
    />
  )
}

interface SubCardProps {
  placement: string
  plate: ReactNode
  heading: ReactNode
  title: string
  ariaLabel: string | undefined
  isDisabled: boolean
  onPress: () => void
  className: string | undefined
  testId: string | undefined
  disabledReason: string | undefined
}

function SubCard({
  placement,
  plate,
  heading,
  title,
  ariaLabel,
  isDisabled,
  onPress,
  className,
  testId,
  disabledReason,
}: SubCardProps): ReactNode {
  const button = (
    <Button
      variant="ghost"
      isDisabled={isDisabled}
      onPress={onPress}
      aria-label={ariaLabel ?? title}
      data-testid={testId}
      className={[
        placement,
        'group flex h-full w-full flex-col items-start justify-between gap-3 rounded-[10px] border border-border bg-surface p-5 text-left',
        // hover / focus-visible：描边转 accent。**不加 transform，不加 shadow**（DESIGN 第 6.3.2 节）。
        'transition-colors duration-[var(--dur-micro)] hover:border-accent focus-visible:border-accent',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {plate}
      {heading}
    </Button>
  )

  // 禁用时给原因。Chromium 里禁用按钮不派发鼠标事件，套一层 Tooltip 永远不会出现，
  // 所以 Tooltip.Trigger 自己可聚焦（键盘可达），提示挂在它上面。
  // delay 必须显式写 1500：prop 默认值是 700ms，CSS 变量的 1500ms 不生效（HeroUI 陷阱 12）。
  if (isDisabled && disabledReason) {
    return (
      <Tooltip delay={1500}>
        <Tooltip.Trigger className={`block h-full w-full ${placement}`}>{button}</Tooltip.Trigger>
        <Tooltip.Content>
          <p className="nola-caption max-w-64">{disabledReason}</p>
        </Tooltip.Content>
      </Tooltip>
    )
  }

  return button
}

function MainAction({
  label,
  isDisabled,
  onPress,
}: {
  label: string
  isDisabled: boolean
  onPress: () => void
}): ReactNode {
  /*
   * 刻意**不设 aria-label**：按钮的可见文案就是它的无障碍名。
   * 再补一个 aria-label 覆盖它会构成 WCAG 2.5.3「标签与名称不匹配」，
   * 读屏用户听到的名字与看到的不一致。
   */
  return (
    <Button
      variant="primary"
      size="md"
      isDisabled={isDisabled}
      onPress={onPress}
      // Button 内建 rounded-3xl（18px），主 CTA 压回药丸。
      className="mt-4 rounded-full px-5"
    >
      {label}
    </Button>
  )
}

export { GRID as BENTO_GRID_CLASS }
