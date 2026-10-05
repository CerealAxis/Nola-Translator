/**
 * The overlay's two settings pills: what is shown, and how it is arranged.
 *
 * They are orthogonal dimensions, so one pill each rather than two groups in
 * one menu. Neither is a precondition for the other: display decides which
 * columns exist, layout decides whether the sentences run as one stream
 * that scrolls as a whole or stack as separate blocks. All four
 * combinations are meaningful.
 *
 * `rolling` and `sentence` both keep the earlier sentences. They differ in
 * continuity, scrolling and fade, not in how many are kept.
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

/** The fields each display mode writes when selected. */
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
        `layoutSplit` rather than `workspace.layout`: the latter is a group
        heading, and using it on a single item would label the row "layout"
        instead of naming the option.
      */
      { id: 'layout:rolling', label: t('workspace.layoutSplit'), active: layout === 'rolling', patch: { layout: 'rolling' } },
      { id: 'layout:sentence', label: t('workspace.layoutSentence'), active: layout === 'sentence', patch: { layout: 'sentence' } },
    ]} />
  )
}

/**
 * A pill plus a single-select menu.
 *
 * An `options` array rather than `children`, because `selectedKeys` hangs off
 * the whole Menu and can only be derived from which option is active.
 */
function OverlayPill({ label, value, options, isDisabled = false }: { label: string; value: string; options: readonly OptionSpec[]; isDisabled?: boolean }) {
  // The same measurement the control bar uses: a value that tracks the
  // window rather than a fixed constant.
  const maxHeight = useMenuMaxHeight()
  return (
    <Dropdown>
      <Dropdown.Trigger isDisabled={isDisabled} className="nola-caption-pill" aria-label={label}>
        {/* The pill shows the active option, not a group heading: a heading
            reads as navigation, and then pressing it appears to do nothing. */}
        <span className="max-w-24 truncate">{value}</span>
        <ChevronDown aria-hidden="true" />
      </Dropdown.Trigger>
      {/*
        `selectedKeys` must be a Set: a string type-checks but selection
        silently fails and every item reports aria-checked="false".

        The popover may extend past the window, since it is a separate layer
        over the caption card rather than a descendant of it, and react-aria
        flips it upward when there is no room below.
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
                `onAction` rather than the Menu's `onSelectionChange`: the
                latter only yields a key, while each option already carries its
                patch. Selection state still comes from `selectedKeys`.
              */
              onAction={() => {
                void actions.settings.updateSettings({ overlay: option.patch }).catch(() => undefined)
              }}
            >
              {/* The checkmark goes after the label: its slot is already
                absolutely positioned on the inline-start edge, so putting it
                first would shift the selected row and not its siblings. */}
            {option.label}
            <Dropdown.ItemIndicator type="checkmark" />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

interface OptionSpec {
  /** Unique within the Menu. Prefixed `display:` / `layout:` so an id is readable across
   *  both pills even while they are separate Menus. */
  id: string
  label: string
  /** Whether this is the active option, which drives the pill text and the checkmark. */
  active: boolean
  patch: Partial<OverlaySettings>
}
