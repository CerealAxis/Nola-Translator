// Generated from assets/brand/nola-logo.svg by make-icons.mjs. Do not edit by hand.
import type { SVGProps } from 'react'

export interface NolaLogoProps extends SVGProps<SVGSVGElement> {}

export function NolaLogo(props: NolaLogoProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" aria-hidden="true" {...props}>
      <defs>
      <linearGradient id="blue" x1="80" y1="56" x2="432" y2="416" gradientUnits="userSpaceOnUse">
      <stop stopColor="#168BD9"/>
      <stop offset="1" stopColor="#2255C7"/>
      </linearGradient>
      </defs>
      {/* The silhouette remains legible without shadows or a background tile. */}
      <path d="M144 48H368C421.019 48 464 90.981 464 144V304C464 357.019 421.019 400 368 400H226L143.2 462.1C136.607 467.045 127.2 462.341 127.2 454.1V398.53C82.221 390.6 48 351.344 48 304V144C48 90.981 90.981 48 144 48Z" fill="url(#blue)"/>
      {/* A continuous, rounded N suggests speech flowing between languages. */}
      <path d="M168 304V144L344 304V144" stroke="white" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M344 144V183" stroke="#97F0DA" strokeWidth="40" strokeLinecap="round"/>
    </svg>
  )
}
