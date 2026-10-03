/**
 * 自创组件封闭清单，一共 8 个，**不得超出**（DESIGN 第 11.2 节台账里属于本 Agent 的那 8 个）。
 * 其余任何 UI 一律用 HeroUI 原子组合，不要在这里加第 9 个。
 *
 * 另外 5 个台账组件由 feature 层实现：`ModelCard` `DualColumnView` `CaptionLine`
 * `NotesPanel` `AudioPlayerBar`。它们不是"缺了"，是有明确的业务归属。
 *
 * 为什么这 8 个能存在：每一条都过了 DESIGN 第 11.1 节的四步决策（HeroUI 有没有语义匹配的
 * / className+variant 能不能达到 / extend xxxVariants 能不能加 / 都不行才自创）。
 *
 * ============================ 给另外三个 Agent 的三条硬约定 ============================
 *
 * 1. **字阶在 HeroUI 原子组件上要用 utilities 层的任意值工具类，不能靠 `.nola-*`。**
 *    `.nola-micro` / `.nola-caption` 这些字阶类在 `@layer base`，而 `.chip` / `.button` /
 *    `.label` / `.description` 在 `@layer components`，Tailwind 的层序是
 *    `theme < base < components < utilities`，所以后写的 components 会赢。
 *    给 Chip 压字阶要写 `text-[11px] leading-[1.45] font-normal`。
 *
 * 2. **圆角写数字，不写档位名。** `--radius: 6px` 时 Tailwind 的
 *    `rounded-sm/md/lg/xl/2xl/3xl` 分别是 3 / 4.5 / 6 / 9 / 12 / 18px，
 *    **没有** `rounded-pill`（theme 里没有 `--radius-pill` 这个 key，写了不生成任何样式）。
 *    规格与写法的对照：`r-sm 6px -> rounded-[6px]`、`r-md 8px -> rounded-[8px]`、
 *    `r-lg 10px -> rounded-[10px]`、`r-pill -> rounded-full`。
 *
 * 3. **z-index 只用 `.z-base` `.z-sticky` `.z-dropdown` `.z-overlay` `.z-toast`
 *    `.z-titlebar-drag`**，不要写 `z-50` 这类字面量。
 * ========================================================================== */

export { AppShell } from './AppShell'
export type { AppShellProps } from './AppShell'

export { TitleBar, useNolaTheme } from './TitleBar'
export type {
  TitleBarProps,
  TitleBarVariant,
  TitleBarHelpItem,
  NolaThemeController,
  NolaThemePreference,
} from './TitleBar'

export { PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'

export { StatusPill } from './StatusPill'
export type { StatusPillProps, StatusPillTone, StatusPillSize } from './StatusPill'

export { SectionCard } from './SectionCard'
export type { SectionCardProps, SectionCardPadding, SectionCardTone } from './SectionCard'

export { SettingRow } from './SettingRow'
export type { SettingRowProps } from './SettingRow'

export { ErrorBoundary } from './ErrorBoundary'
export type { ErrorBoundaryProps } from './ErrorBoundary'

export { NolaLogo } from './NolaLogo'
export type { NolaLogoProps } from './NolaLogo'

export { NavigationItem } from './NavigationItem'
export type { NavigationItemProps } from './NavigationItem'
