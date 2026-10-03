/**
 * 浮窗底部的两颗设置胶囊：**显示内容** 与 **对照方式**。两者互不干涉，各自一颗。
 *
 * # 为什么是两个胶囊而不是一个菜单里的两组
 *
 * 这两件事是正交维度，合并成一张菜单会让用户点错：
 *
 * · **显示内容**（`showSource` / `showTranslation`）决定屏幕上**摆几列**：
 *   双语 = 左右两列都在 · 仅原文 = 只有左列 · 仅译文 = 只有右列。
 * · **对照方式**（`layout`）决定这些字**自己怎么排**：
 *   分区对照 = 所有句子连成一整条文本流，填满后整体上滚
 *   逐句对照 = 每句各自成块往下堆，新句把上一句推下去，轨道不整体滚
 *
 * 拿三句字幕举例，`你好 / 我们先从项目进度开始 / 预算还需要再确认一下`：
 *   显示内容选哪个，只改"左列右列在不在"；
 *   对照方式选哪个，只改"这三行字是连成一条还是分三块"。
 * 2 × 2 共四种组合，**没有任何一个是另一个的前提或替代品**。
 * 之前它们挤在同一张菜单的四组里（8 个选项），胶囊上只显示"显示内容"那一组的当前值，
 * 于是"改了排版但胶囊文字没变"看起来就像按钮坏了。
 *
 * 拆成两颗之后，每颗胶囊只管一件事、只显示自己那件事的当前值。
 *
 * # 从原菜单里移走的两组
 *
 * · **样式** → 动作行的滑杆按钮直接跳设置页（见 OverlayRoot）。
 * · **位置** → 动作行已有 top/bottom 快捷键；完整三态（自由/顶部/底部）在设置页。
 *   留在浮窗里等于同一个设置两个入口，还会和快捷键的二元切换语义打架。
 *
 * # 与主仓的差异
 *
 * 主仓的显示模式是一个**三态循环胶囊**（点一下切下一个），且排版有
 * `仅在「双语」模式下生效` 的限定提示（`CaptionOverlay.tsx:276`）。
 * 这里用两颗下拉胶囊而不是循环切换：循环胶囊读起来是"当前值"，用户想看"有哪几个选项"
 * 时没有入口；而且这颗胶囊已经和模型、语言、显示方式排成一排，下拉比循环更一致。
 * 代价是丢失了主仓那句限定提示的视觉表达 —— 切到单语时排版选项仍在菜单里，
 * 但对单列而言 rolling 与 sentence 的差别已经很小。
 *
 * 主仓对 layout 两个值的原始定义（`src/renderer/overlay/CaptionOverlay.tsx:26-29`）：
 *   rolling  = 分区对照
 *   sentence = 逐句对照
 * 两者都保留历史句子，区别在连续性、滚动方式和淡入淡出，不是"保留几句"。
 */

import { Dropdown } from '@heroui/react'
import { ChevronDown } from 'lucide-react'

import type { OverlaySettings } from '@/bridge'

import { useMenuMaxHeight } from './OverlayControls'
import { actions, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'

type DisplayKey = 'both' | 'source' | 'translation'
type LayoutKey = 'rolling' | 'sentence'

const DISPLAY_LABELS: Record<DisplayKey, TranslationKey> = {
  both: 'workspace.modeBoth',
  source: 'workspace.modeSource',
  translation: 'workspace.modeTranslation',
}

const LAYOUT_LABELS: Record<LayoutKey, TranslationKey> = {
  rolling: 'workspace.layoutSplit',
  sentence: 'workspace.layoutSentence',
}

/**
 * 弹层高度上限。**按实测可用空间算，不写死。**
 *
 * 这两颗是 2-3 项的短列表，正常情况下一次能全展开；但浮窗可拖可缩放，
 * 窗口被用户拖小之后可用空间会变少，所以仍然要量，不能写一个常量了事。
 * 量的方式与控制条里那几颗完全一致（见 OverlayControls 的 `useMenuMaxHeight`），
 * 那边有完整推导。
 *
 * **不要在 CSS 里写 `max-height` 兜底**：react-aria 的 `Popover` 会把碰撞检测算出的
 * 高度写成**行内样式**，行内优先级高于样式表，CSS 那条只会让下一个人以为它在起作用，
 * 而实际上一直是被顶掉的状态。上一版就是这么把弹层压到只剩一行的。
 */

/** 每个显示模式对应的那次 patch —— 每一项都是"切到某一态"要写的字段。 */
const DISPLAY_PATCH: Record<DisplayKey, Pick<OverlaySettings, 'showSource' | 'showTranslation'>> = {
  both: { showSource: true, showTranslation: true },
  source: { showSource: true, showTranslation: false },
  translation: { showSource: false, showTranslation: true },
}

export function OverlayDisplayMenu({ isDisabled = false }: { isDisabled?: boolean }) {
  const { t } = useI18n()
  const overlay = useStore(stores.settings, (state) => state.settings?.overlay)

  const showSource = overlay?.showSource ?? true
  const showTranslation = overlay?.showTranslation ?? true
  const display: DisplayKey = showSource && showTranslation ? 'both' : showSource ? 'source' : 'translation'

  return (
    <OverlayPill label={t('overlay.displayMode')} value={t(DISPLAY_LABELS[display])} isDisabled={isDisabled} options={[
      { id: 'display:both', label: t('workspace.modeBoth'), active: display === 'both', patch: DISPLAY_PATCH.both },
      { id: 'display:source', label: t('workspace.modeSource'), active: display === 'source', patch: DISPLAY_PATCH.source },
      { id: 'display:translation', label: t('workspace.modeTranslation'), active: display === 'translation', patch: DISPLAY_PATCH.translation },
    ]} />
  )
}

export function OverlayLayoutMenu({ isDisabled = false }: { isDisabled?: boolean }) {
  const { t } = useI18n()
  const overlay = useStore(stores.settings, (state) => state.settings?.overlay)
  const layout: LayoutKey = overlay?.layout === 'sentence' ? 'sentence' : 'rolling'

  return (
    <OverlayPill label={t('overlay.layout')} value={t(LAYOUT_LABELS[layout])} isDisabled={isDisabled} options={[
      /*
        `layoutSplit`（分区对照）而不是 `workspace.layout`（对照方式）：
        后者是**分组标题**的文案，用在单项上会让菜单第一行显示「对照方式」。
        这个 label 写错的老 bug 就是从原来那张四组菜单里带出来的。
      */
      { id: 'layout:rolling', label: t('workspace.layoutSplit'), active: layout === 'rolling', patch: { layout: 'rolling' } },
      { id: 'layout:sentence', label: t('workspace.layoutSentence'), active: layout === 'sentence', patch: { layout: 'sentence' } },
    ]} />
  )
}

/**
 * 一颗胶囊 = 药丸触发器 + 单选菜单。
 *
 * 传 `options` 数组而不是 `children`，因为 `selectedKeys` 必须挂**整张 Menu**，
 * 而它只有在知道"哪一项当前生效"（也就是数组里 `active: true` 的那个）时才算得出来。
 * 传 children 就得把这个信息再单独传一遍，两处可能不同步。
 */
function OverlayPill({ label, value, options, isDisabled = false }: { label: string; value: string; options: readonly OptionSpec[]; isDisabled?: boolean }) {
  // 与控制条里那几颗共用同一个量法：一个值跟着窗口实际可用空间走，不写死。
  const maxHeight = useMenuMaxHeight()
  return (
    <Dropdown>
      <Dropdown.Trigger isDisabled={isDisabled} className="nola-caption-pill" aria-label={label}>
        {/* 胶囊文字显示的是**当前生效的那一项**，不是分组标题 —— 写标题会让用户
            以为这颗胶囊是导航而不是开关（"点了文字也不变"）。 */}
        <span className="max-w-24 truncate">{value}</span>
        <ChevronDown aria-hidden="true" />
      </Dropdown.Trigger>
      {/*
        `selectedKeys` 必须传 Set：传字符串 react-aria 不报错，但选中态静默失效
        （每一项都是 aria-checked="false"）。这一条是实测出来的，文档里没写。

        允许超出浮窗边界：弹层是叠加在字幕卡之上的独立层，不是这块玻璃的后代；
        方向交给 react-aria 的 shouldFlip，向下不够空间时它自己翻到上方。
      */}
      <Dropdown.Popover className="nola-caption-menu" maxHeight={maxHeight}>
        <Dropdown.Menu
          className="nola-caption-menu-list"
          selectionMode="single"
          selectedKeys={new Set(options.filter(option => option.active).map(option => option.id))}
        >
          {options.map(option => (
            <Dropdown.Item
              key={option.id}
              id={option.id}
              className="nola-menu-item"
              textValue={option.label}
              /*
                `onAction` 而不是 Menu 的 `onSelectionChange`：后者只给一个 key，
                这里每个项的 patch 已经写在 spec 上了，直接写设置省一层映射。
                选中态仍然由 selectedKeys 驱动，两者互不干扰。
              */
              onAction={() => {
                void actions.settings.updateSettings({ overlay: option.patch }).catch(() => undefined)
              }}
            >
              {/*
              ✓ 放在 label **之后**：HeroUI 的槽位是 `absolute start-2`，本来就在
              左侧，放前面会让选中项整行右移而同组另外几项不动。
            */}
            {option.label}
            <Dropdown.ItemIndicator type="checkmark" />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

interface OptionSpec {  /** Menu 内唯一。用 `display:` / `layout:` 前缀，两颗胶囊虽然是独立 Menu，
   *  前缀仍让 id 全局可读，也方便将来某天并回一张菜单时不撞车。 */
  id: string
  label: string
  /** 当前是否是生效的那一项 —— 决定胶囊文字和菜单里的 ✓。 */
  active: boolean
  patch: Partial<OverlaySettings>
}
