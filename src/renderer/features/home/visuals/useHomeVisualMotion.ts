import { useEffect, useRef, useState } from 'react'
import { stores } from '@/store'
import { useStore } from '@/store/createStore'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

export function useHomeReducedMotion() {
  const appPreference = useStore(stores.settings, state => state.settings?.appearance?.reduceMotion ?? false)
  const [systemPreference, setSystemPreference] = useState(() => window.matchMedia?.(reducedMotionQuery).matches ?? false)

  useEffect(() => {
    const query = window.matchMedia?.(reducedMotionQuery)
    if (!query) return
    function update(event: MediaQueryListEvent) {
      setSystemPreference(event.matches)
    }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return appPreference || systemPreference
}

// 超出视口时暂停装饰动效，避免首页下方的卡片持续刷新。
export function useHomeVisualViewport(threshold = 0.25, once = false) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting && entry.intersectionRatio >= threshold
      setInView(visible)
      if (visible && once) observer.disconnect()
    }, { threshold })

    observer.observe(node)
    return () => observer.disconnect()
  }, [once, threshold])

  return { ref, inView }
}
