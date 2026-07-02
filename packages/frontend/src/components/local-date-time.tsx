import * as React from 'react'

import { cn } from '../lib/utils'
import { Skeleton } from './ui/skeleton'

export type LocalDateTimeValue = Date | number | string

export interface LocalDateTimeProps
  extends Omit<React.ComponentProps<'time'>, 'children' | 'dateTime'> {
  emptyFallback?: React.ReactNode
  formatOptions?: Intl.DateTimeFormatOptions
  invalidFallback?: React.ReactNode
  skeletonClassName?: string
  skeletonVariant?: 'block' | 'inline'
  value: LocalDateTimeValue | null | undefined
}

const defaultDateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short'
} satisfies Intl.DateTimeFormatOptions

function subscribeHydration() {
  return () => {}
}

function getHydratedSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

function useHydrated() {
  return React.useSyncExternalStore(subscribeHydration, getHydratedSnapshot, getServerSnapshot)
}

function normalizeDateTimeValue(value: LocalDateTimeValue) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime())
    ? {
        date,
        iso: date.toISOString()
      }
    : null
}

export function LocalDateTime({
  className,
  emptyFallback = null,
  formatOptions = defaultDateTimeFormatOptions,
  invalidFallback = 'Unknown',
  skeletonClassName,
  skeletonVariant = 'inline',
  value,
  ...props
}: LocalDateTimeProps) {
  const hydrated = useHydrated()

  if (value === null || value === undefined || value === '') {
    return emptyFallback
  }

  const normalized = normalizeDateTimeValue(value)
  if (!normalized) {
    return invalidFallback
  }

  if (!hydrated) {
    if (skeletonVariant === 'inline') {
      return (
        <span
          aria-label='Loading local date and time'
          className={cn(
            'bg-accent inline-block h-4 w-28 animate-pulse rounded-md align-middle',
            skeletonClassName
          )}
        />
      )
    }

    return (
      <Skeleton
        aria-label='Loading local date and time'
        className={cn('inline-block h-4 w-28 align-middle', skeletonClassName)}
      />
    )
  }

  return (
    <time
      {...props}
      dateTime={normalized.iso}
      title={props.title ?? normalized.iso}
      className={className}
    >
      {new Intl.DateTimeFormat(undefined, formatOptions).format(normalized.date)}
    </time>
  )
}
