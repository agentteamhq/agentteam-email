'use client'

import { UserButton } from '../../components/auth/user/user-button'

interface BetterAuthUserButtonProps {
  size?: 'icon' | 'default'
  className?: string
  align?: 'center' | 'start' | 'end'
}

export function BetterAuthUserButton({ className, size = 'icon', align = 'end' }: BetterAuthUserButtonProps) {
  return (
    <UserButton
      className={className}
      size={size}
      align={align}
    />
  )
}
