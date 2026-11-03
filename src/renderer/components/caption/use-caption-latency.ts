import { useEffect, type RefObject } from 'react'

/** Observe the rendered caption, including scroll clipping, without sending any text to main. */
export function useCaptionLatency(root: RefObject<HTMLElement | null>, sessionId?: string): void {
  useEffect(() => {
    const container = root.current
    const report = window.nolaTranslator?.reportLatencyPaint
    if (!sessionId || !container || !report || typeof IntersectionObserver === 'undefined') return
    const reported = new Set<string>()
    const pending = new Set<string>()
    const observed = new Set<Element>()
    const visible = new Set<HTMLElement>()
    let disposed = false
    let frame = 0
    const flush = () => {
      if (frame || document.hidden || disposed) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (document.hidden) return
        for (const element of visible) {
          const segmentId = element.dataset.latencySegment
          const kind = element.dataset.latencyKind
          if (!container.contains(element) || !segmentId || (kind !== 'source' && kind !== 'translation')) continue
          const key = `${kind}:${segmentId}`
          if (reported.has(key) || pending.has(key)) continue
          pending.add(key)
          void report(sessionId, segmentId, kind, Date.now()).then(accepted => {
            if (!accepted || disposed) return
            reported.add(key)
            if (reported.size > 240) reported.delete(reported.keys().next().value!)
            intersection.unobserve(element)
            visible.delete(element)
          }).catch(() => {}).finally(() => pending.delete(key))
        }
      })
    }
    const intersection = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement
        if (entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0) visible.add(element)
        else visible.delete(element)
      }
      flush()
    })
    const scan = () => {
      for (const element of observed) {
        if (container.contains(element) && element.hasAttribute('data-latency-segment')) continue
        intersection.unobserve(element)
        observed.delete(element)
        visible.delete(element as HTMLElement)
      }
      container.querySelectorAll('[data-latency-segment]').forEach(element => {
        if (observed.has(element)) return
        observed.add(element)
        intersection.observe(element)
      })
    }
    const mutation = new MutationObserver(scan)
    mutation.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-latency-segment'] })
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('focus', flush)
    scan()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      mutation.disconnect()
      intersection.disconnect()
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('focus', flush)
    }
  }, [root, sessionId])
}
