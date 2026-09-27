import { useLayoutEffect, useRef } from 'react'

/** Keep the newest words in view when a physical line or window-height limit is reached. */
export function CaptionText({ className, children }: { className: string; children: string }): React.JSX.Element {
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const revealTail = (): void => { element.scrollTop = element.scrollHeight }
    revealTail()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealTail)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [children])
  return <p ref={ref} className={className}>{children}</p>
}
