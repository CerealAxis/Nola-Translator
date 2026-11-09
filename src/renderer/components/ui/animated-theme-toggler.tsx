// Adapted from the Magic UI Animated Theme Toggler (MIT, Copyright (c) Magic UI).
import { Moon, Sun } from 'lucide-react'
import { flushSync } from 'react-dom'
import type { MouseEvent } from 'react'
import { Button, type ButtonProps } from './button'
import './animated-theme-toggler.css'

type Theme = 'light' | 'dark'

interface AnimatedThemeTogglerProps extends Omit<ButtonProps, 'children' | 'onClick'> {
  theme: Theme
  onThemeChange: (theme: Theme) => void
  reduceMotion?: boolean
}

export function AnimatedThemeToggler({ theme, onThemeChange, reduceMotion, ...props }: AnimatedThemeTogglerProps) {
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement
    if (root.hasAttribute('data-magicui-theme-vt')) return

    const next = theme === 'dark' ? 'light' : 'dark'
    if (!document.startViewTransition || reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onThemeChange(next)
      return
    }

    const { left, top, width, height } = event.currentTarget.getBoundingClientRect()
    const x = left + width / 2
    const y = top + height / 2
    const { innerWidth, innerHeight } = window
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    // Percentages keep the reveal aligned with the button at fractional display scaling.
    const origin = `${x / innerWidth * 100}% ${y / innerHeight * 100}%`
    const from = `circle(0% at ${origin})`
    const to = `circle(${radius / Math.hypot(innerWidth, innerHeight) * Math.SQRT2 * 100}% at ${origin})`

    root.setAttribute('data-magicui-theme-vt', '')
    root.style.setProperty('--magicui-theme-vt-clip-from', from)
    const transition = document.startViewTransition(() => flushSync(() => onThemeChange(next)))
    void transition.ready.then(() => {
      root.animate({ clipPath: [from, to] }, {
        duration: 400,
        easing: 'ease-in-out',
        fill: 'forwards',
        pseudoElement: '::view-transition-new(root)',
      })
    }).catch(() => undefined)
    void transition.finished.finally(() => {
      root.removeAttribute('data-magicui-theme-vt')
      root.style.removeProperty('--magicui-theme-vt-clip-from')
    }).catch(() => undefined)
  }

  return (
    <Button type="button" variant="bare" size="icon" {...props} onClick={toggle}>
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  )
}
