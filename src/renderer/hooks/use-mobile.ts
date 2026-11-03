import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== "undefined" && window.innerWidth < breakpoint)

  React.useEffect(() => {
    const mql = window.matchMedia(`(width < ${breakpoint}px)`)
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return isMobile
}
