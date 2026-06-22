import * as React from 'react'

import { cn } from '../lib/utils'
import { useEnvContext } from '../partials/webapp/env-context'
import { buttonVariants } from './ui/button'
import type { VariantProps } from 'class-variance-authority'

export interface LinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof buttonVariants> {
  align?: 'start' | 'center'
  disabled?: boolean
  prefetch?: boolean
  unstyled?: boolean
}

function isInternalLink(baseHost: string, href: string) {
  try {
    const resolved = new URL(href, baseHost)
    const host = new URL(baseHost).host

    return href.startsWith('/') || resolved.host === host
  } catch {
    return href.startsWith('#')
  }
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    align = 'start',
    children,
    className = '',
    disabled = false,
    href,
    prefetch = false,
    rel,
    size,
    target,
    unstyled = false,
    variant = 'link',
    ...rest
  },
  ref
) {
  const { publicEnv } = useEnvContext()
  const isInternal = href ? isInternalLink(publicEnv.PUBLIC_HOSTNAME, href) : false
  const relTokens = rel ? rel.split(/\s+/) : []

  if (!isInternal) {
    for (const token of ['external', 'noopener', 'noreferrer', 'nofollow']) {
      if (!relTokens.includes(token)) {
        relTokens.push(token)
      }
    }
  }

  return (
    // rel is assembled above and always includes noreferrer when this helper opens an external tab.
    // eslint-disable-next-line react/jsx-no-target-blank
    <a
      ref={ref}
      aria-disabled={disabled ? 'true' : undefined}
      className={cn(
        unstyled ? '' : buttonVariants({ variant, size }),
        unstyled ? '' : align === 'center' ? 'justify-center' : 'justify-start',
        disabled ? 'cursor-not-allowed opacity-60' : '',
        className
      )}
      data-prefetch={isInternal && prefetch ? 'true' : undefined}
      href={disabled ? undefined : href}
      rel={relTokens.length > 0 ? relTokens.join(' ') : undefined}
      tabIndex={disabled ? -1 : undefined}
      target={!isInternal && !target ? '_blank' : target}
      {...rest}
    >
      {children}
    </a>
  )
})
