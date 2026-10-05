/**
 * Home entry card, one cell of the bento grid.
 *
 * Two shapes with different roots: the main card is a `Surface` whose action is the
 * pill button, a sub card is itself a `Button`. Neither carries a subtitle; `meta` is
 * for data the user cannot otherwise see.
 */

import type { ReactNode } from 'react'
import { Button, Surface, Tooltip } from '@heroui/react'

/**
 * Grid geometry: at 1000px and up, `2fr 1fr` by three rows with the main card
 * spanning all three; below that, two equal columns with the main card full width.
 */
const GRID = [
  'grid w-full grid-cols-2 gap-4',
  'min-h-[420px] flex-1',
  'min-[1000px]:grid-cols-[2fr_1fr] min-[1000px]:grid-rows-3',
].join(' ')

// Wide: the main card takes column 1 across three rows, the sub cards stack in
// column 2. Narrow: the main card goes full width and the sub cards take no explicit
// placement, so they fall into the two columns in DOM order — pinning a narrow-screen
// row-start lets the main card be pushed to the last row.
const MAIN_PLACEMENT = 'col-span-2 min-[1000px]:col-span-1 min-[1000px]:col-start-1 min-[1000px]:row-span-3'

const SUB_PLACEMENT: Record<1 | 2 | 3, string> = {
  1: 'min-[1000px]:col-start-2 min-[1000px]:row-start-1',
  2: 'min-[1000px]:col-start-2 min-[1000px]:row-start-2',
  3: 'min-[1000px]:col-start-2 min-[1000px]:row-start-3',
}

const ICON_PLATE =
  'grid place-items-center rounded-[10px] bg-surface-secondary text-accent transition-colors duration-[var(--dur-micro)] group-hover:bg-surface-tertiary'

export interface EntryCardProps {
  /** Icon plate content at 24px; callers pass a lucide element. */
  icon: ReactNode
  /** Card title. The main card uses `nola-title`, a sub card `nola-subtitle`. */
  title: string
  /** Press handler. A sub card presses as a whole; on the main card the button calls it. */
  onPress: () => void
  /** `main` is the single primary CTA (accent outline plus a pill button); `sub` is a hairline card that presses as a whole. */
  layout?: 'main' | 'sub'
  /** Button copy, rendered only when `layout='main'`. */
  actionLabel?: string
  /**
   * Optional real data, such as an installed model count or the time of the latest record.
   * Not a subtitle: it reports a fact the interface does not otherwise show.
   */
  meta?: ReactNode
  /**
   * Fact list for the main card, each entry a `[label, value]`. The card spans three
   * rows, so the middle band has to carry something worth reading, and these are settings
   * the user would otherwise reselect.
   */
  facts?: readonly (readonly [string, string])[]
  /** Disables the whole card and explains why in a tooltip. */
  isDisabled?: boolean
  /** Reason for the disabled state; callers pass the result of `t(...)`. */
  disabledReason?: string
  /** Accessible name, defaulting to the title. */
  ariaLabel?: string
  /** Row in column 2 for a sub card. Ignored by the main card. */
  subRow?: 1 | 2 | 3
  className?: string
  /** Automation anchor. */
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
          // The one primary CTA: a 1px accent outline, no shadow, 24px padding.
          // The main card spans three rows and its content fills about two thirds of that.
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
         * The main card is tall, so the middle band carries the three things that decide
         * whether a session can start now: engine readiness, the recognition model and the
         * language pair. They are already chosen, so the user does not repeat the
         * selection, and they match what the workspace will show.
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
        // Hover and focus-visible turn the outline accent. No transform and no shadow: a card sitting on a page has neither.
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

  // A disabled reason needs a trigger that can take focus: a disabled button dispatches
  // no pointer events in Chromium, so the tooltip would never appear.
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
   * The visible text is the accessible name here; an overriding `aria-label` would break
   * WCAG 2.5.3, where the spoken name has to match the visible one.
   */
  return (
    <Button
      variant="primary"
      size="md"
      isDisabled={isDisabled}
      onPress={onPress}
      // Button ships `rounded-3xl` (24px); the primary CTA is a pill.
      className="mt-4 rounded-full px-5"
    >
      {label}
    </Button>
  )
}

export { GRID as BENTO_GRID_CLASS }
