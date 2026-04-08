import { useState, useEffect } from 'react'

type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const BREAKPOINTS = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)'
} as const

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop'
  if (window.matchMedia(BREAKPOINTS.mobile).matches) return 'mobile'
  if (window.matchMedia(BREAKPOINTS.tablet).matches) return 'tablet'
  return 'desktop'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(getBreakpoint)

  useEffect(() => {
    const queries = Object.values(BREAKPOINTS).map((q) => window.matchMedia(q))
    const update = (): void => setBp(getBreakpoint())
    for (const mq of queries) mq.addEventListener('change', update)
    return () => {
      for (const mq of queries) mq.removeEventListener('change', update)
    }
  }, [])

  return bp
}

export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile'
}

export function useIsDesktop(): boolean {
  return useBreakpoint() === 'desktop'
}
