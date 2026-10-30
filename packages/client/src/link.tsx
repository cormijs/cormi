import React, { useEffect, useRef } from 'react'
import { Link as RouterLink, type LinkProps as RouterLinkProps, useResolvedPath } from 'react-router'
import { useCordis } from './app.tsx'

/**
 * When to import the modules of the target route:
 * on hover or focus (`intent`), when rendered, or when scrolled into view.
 */
export type PrefetchMode = 'intent' | 'render' | 'viewport' | 'none'

export interface LinkProps extends RouterLinkProps {
  prefetch?: PrefetchMode
}

/** react-router's `<Link>` that can prefetch the route modules of its target. */
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(({ prefetch = 'none', ...props }, forwardedRef) => {
  const ctx = useCordis()
  const { pathname } = useResolvedPath(props.to)
  const innerRef = useRef<HTMLAnchorElement>(null)
  React.useImperativeHandle(forwardedRef, () => innerRef.current!)
  const preload = () => {
    ctx.$router.preload(pathname).catch(() => {})
  }

  useEffect(() => {
    if (prefetch === 'render') preload()
    if (prefetch !== 'viewport' || !innerRef.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      preload()
      observer.disconnect()
    }, { rootMargin: '100px' })
    observer.observe(innerRef.current)
    return () => observer.disconnect()
  }, [prefetch, pathname])

  const intent = prefetch === 'intent'
  return (
    <RouterLink
      {...props}
      ref={innerRef}
      onMouseEnter={(event) => {
        props.onMouseEnter?.(event)
        if (intent) preload()
      }}
      onFocus={(event) => {
        props.onFocus?.(event)
        if (intent) preload()
      }}
    />
  )
})

Link.displayName = 'Link'
