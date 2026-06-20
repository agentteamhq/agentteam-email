// these all format based on users locale and should only be called in the client

// format(1, 'day') => 'tomorrow'
// format(2, 'day') => 'in 2 days'
// format(-1, 'day) => 'yesterday'

import type { TZDate } from '@date-fns/tz'
import type { UTCDate } from '@date-fns/utc'

import { ensureClientOnly } from './ensure-client-only'

// format(1, 'hour') => 'in 1 hour'
const localRelativeDayStringFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'auto'
})

export function localRelativeDayStringFormat(value: number, unit: Intl.RelativeTimeFormatUnit) {
  ensureClientOnly('localRelativeDayStringFormat')
  return localRelativeDateLabelFormatter.format(value, unit)
}

// format(1, 'day') => 'tomorrow'
// format(2, 'day') => 'in 2 days'
// format(-1, 'day) => 'yesterday'
// format(1, 'hour') => 'in 1 hour'
const localRelativeDateLabelFormatter = new Intl.RelativeTimeFormat(undefined, {
  localeMatcher: 'best fit',
  numeric: 'auto',
  style: 'long'
})

export function localRelativeDateLabelFormat(value: number, unit: Intl.RelativeTimeFormatUnit) {
  ensureClientOnly('localRelativeDateLabelFormat')
  return localRelativeDateLabelFormatter.format(value, unit)
}

function capitalizeFirstGrapheme(text: string, locale?: string): string {
  const graphemeSegmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' })
  const iterator = graphemeSegmenter.segment(text)[Symbol.iterator]()
  const first = iterator.next()
  if (first.done || first.value.segment.length === 0) {
    return text
  }
  const firstGrapheme = first.value.segment
  const rest = text.slice(firstGrapheme.length)
  return firstGrapheme.toLocaleUpperCase(locale) + rest.toLocaleLowerCase(locale)
}

function localeAwareStartCase(text: string, locale?: string): string {
  const wordSegmenter = new Intl.Segmenter(locale, { granularity: 'word' })
  let result = ''
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike) {
      result += capitalizeFirstGrapheme(segment.segment, locale)
    } else {
      result += segment.segment
    }
  }
  return result
}

export function localStartCaseFormat(text: string, locale?: string) {
  ensureClientOnly('localStartCaseFormat')
  return localeAwareStartCase(text, locale)
}

// 'Tuesday, December 30'
const localDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric'
})

export function localDateFormat(date?: Date | number) {
  ensureClientOnly('localDateFormat')
  return localDateFormatter.format(date)
}

// 'Tuesday, Dec 30, 2025'
const localFullDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

export function localFullDateFormat(date?: Date | number) {
  ensureClientOnly('localFullDateFormat')
  return localFullDateFormatter.format(date)
}

// '12/30/2025, 9:36 AM PST'
const localDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
  timeZone: undefined
})

export function localDateTimeFormat(date?: Date | number) {
  ensureClientOnly('localDateTimeFormat')
  return localDateTimeFormatter.format(date)
}

// '9:36 AM PST'
const localTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
  timeZone: undefined
})

export function localTimeFormat(date?: Date | number) {
  ensureClientOnly('localTimeFormat')
  return localTimeFormatter.format(date)
}

/**
 * Format a date relative to "now" using Intl.RelativeTimeFormat.
 *
 * Example outputs:
 *   - "just now"
 *   - "5 seconds ago"
 *   - "3 minutes ago"
 *   - "2 hours ago"
 *   - "yesterday"
 *   - "a week ago"
 *   - "2 months ago"
 *   - "in 5 minutes"
 *   - "in 2 days"
 *
 * @param input - A Date object
 * @param options.locale - Optional BCP 47 language tag, defaults to currentLocale via undefined.
 * @param options.now - Optional "current" time (for testing), defaults to new Date().
 * @param options.justNowThresholdSeconds - Threshold under which we show "just now" (default: 10).
 *
 * @returns Human-readable relative time string.
 */
export function formatRelativeTime(
  input: Date,
  options: {
    locale?: string
    now?: Date
    justNowThresholdSeconds?: number
  } = {}
): string | null {
  ensureClientOnly('formatRelativeTime')

  const { locale, now = new Date(), justNowThresholdSeconds = 10 } = options

  // Handle invalid dates in a safe, typed way
  const inputTime = input.getTime()
  const nowTime = now.getTime()

  if (Number.isNaN(inputTime) || Number.isNaN(nowTime)) {
    // You can throw here instead if you prefer strict failure:
    // throw new Error("Invalid date passed to formatRelativeTime");
    return null
  }

  const diffMs = inputTime - nowTime
  const diffSeconds = Math.round(diffMs / 1000)

  // "just now" special case
  if (Math.abs(diffSeconds) < justNowThresholdSeconds) {
    return 'just now'
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: 'second' }, // < 60 seconds -> "x seconds ago"
    { amount: 60, unit: 'minute' }, // < 60 minutes -> "x minutes ago"
    { amount: 24, unit: 'hour' }, // < 24 hours -> "x hours ago"
    { amount: 7, unit: 'day' }, // < 7 days   -> "x days ago"
    { amount: 4.34524, unit: 'week' }, // ~ < 1 month -> "x weeks ago"
    { amount: 12, unit: 'month' }, // ~ < 1 year  -> "x months ago"
    { amount: Number.POSITIVE_INFINITY, unit: 'year' } // otherwise -> "x years ago"
  ]

  let duration = diffSeconds

  for (const { amount, unit } of divisions) {
    if (Math.abs(duration) < amount) {
      // `unit` is a narrowed string literal that is assignable to Intl.RelativeTimeFormatUnit
      return rtf.format(Math.round(duration), unit)
    }
    duration = duration / amount
  }

  // We should never realistically reach here because the last division has Infinity,
  // but this satisfies TypeScript's "all code paths return a value".
  return rtf.format(duration, 'year')
}

// Market-aware formatters - use the timezone embedded in the TZDate
// These ensure dates display correctly regardless of user's local timezone

// 'Tuesday, December 30'
export function marketDateFormat(date: TZDate) {
  ensureClientOnly('marketDateFormat')
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: date.timeZone
  }).format(date)
}

// 'Tuesday, Dec 30, 2025'
export function marketFullDateFormat(date: TZDate) {
  ensureClientOnly('marketFullDateFormat')
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: date.timeZone
  }).format(date)
}

// '9 AM' in market timezone
export function marketHourFormat(date: TZDate) {
  ensureClientOnly('marketHourFormat')
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    timeZone: date.timeZone
  }).format(date)
}

// '9:36 AM' in market timezone
export function marketTimeFormat(date: TZDate) {
  ensureClientOnly('marketTimeFormat')
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: date.timeZone
  }).format(date)
}

// 'Tue 9:36 AM' in market timezone
export function marketWeekdayTimeFormat(date: TZDate) {
  ensureClientOnly('marketWeekdayTimeFormat')
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: date.timeZone
  }).format(date)
}
