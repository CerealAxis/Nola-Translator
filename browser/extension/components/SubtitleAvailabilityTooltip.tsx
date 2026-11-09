import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../src/renderer/components/ui/tooltip'
import type { browserText } from '../i18n'
import type { SubtitleState } from '../subtitle-translation'

export function SubtitleAvailabilityTooltip({ availability, active, container, t, children }: {
  availability: SubtitleState['availability']
  active?: boolean
  container?: HTMLElement
  t: ReturnType<typeof browserText>
  children: ReactNode
}) {
  if (active || availability === 'ready') return children
  return <Tooltip>
    <TooltipTrigger render={<span className="inline-flex min-w-0" tabIndex={0} />}>{children}</TooltipTrigger>
    <TooltipContent container={container}>{t(availability === 'unavailable' ? 'noReadableSubtitleTrack' : 'checkingSubtitleTracks')}</TooltipContent>
  </Tooltip>
}
