import { ArrowDown } from 'lucide-react'
import type { CSSProperties } from 'react'

// Adapted from the Magic UI Shine Border (MIT, Copyright (c) Magic UI).
function ShineBorder() {
  return (
    <span
      aria-hidden="true"
      className="site-feature-download-shine"
      style={
        {
          '--shine-border-width': '4px',
          '--shine-duration': '6s',
          backgroundImage:
            'radial-gradient(transparent, transparent, #81D8FF, #A07CFE, #FE8FB5, #FFBE7B, transparent, transparent)'
        } as CSSProperties
      }
    />
  )
}

export function LandingFeatureDownload({ label, tabIndex }: { label: string; tabIndex?: number }) {
  return (
    <a
      className="site-final-link site-feature-download"
      href="#download"
      tabIndex={tabIndex}
    >
      {label}
      <ArrowDown aria-hidden="true" />
      <ShineBorder />
    </a>
  )
}
