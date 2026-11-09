import { useCallback, useState } from 'react'

export function usePortalContainer() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const containerRef = useCallback((anchor: HTMLDivElement | null) => {
    // Keep the portal in the shadow tree, above scrolling and blurred panels.
    setContainer(anchor?.closest<HTMLDivElement>('.nola-extension') ?? anchor)
  }, [])
  return [container, containerRef] as const
}
