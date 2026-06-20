import type { TZDate } from '@date-fns/tz'
import { UTCDate } from '@date-fns/utc'
import { utc } from '@date-fns/utc'
import { addMilliseconds } from 'date-fns/addMilliseconds'
import { addSeconds } from 'date-fns/addSeconds'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { formatISO } from 'date-fns/formatISO'
import { formatRFC3339 } from 'date-fns/formatRFC3339'
import { isValid } from 'date-fns/isValid'
import { parseISO } from 'date-fns/parseISO'

import type { SQLUTCDate, SQLUTCTimestamp } from './dates'

export function utcTimestampToUTCDate(utcTimestamp: string): UTCDate {
  return parseISO(utcTimestamp, { in: utc })
}

export function sqlTimestampToDate(sqlTimestamp: SQLUTCTimestamp): UTCDate {
  return parseISO(sqlTimestamp, { in: utc })
}

export function dateToSqlTimestamp(date: Date | UTCDate | TZDate): SQLUTCTimestamp {
  // const dateString = new UTCDate(formatISO(date, { in: utc }))
  return formatRFC3339(date, {
    in: utc,
    fractionDigits: 3
  }) as SQLUTCTimestamp
}

export function sqlDateToDate(sqlDate: SQLUTCDate): UTCDate {
  return parseISO(sqlDate, { in: utc })
}

export function dateToSqlDate(date: UTCDate | Date | TZDate): SQLUTCDate {
  // const utcDate = parseISO(date.toISOString(), { in: utc })
  return formatISO(date, { representation: 'date', in: utc }) as SQLUTCDate
}
// Example for formatting to show human representation of date
export function sqlFormatTimestamp(sqlTimestamp: SQLUTCTimestamp): string {
  const utcDate = sqlTimestampToDate(sqlTimestamp)
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
  return formatter.format(utcDate)
}
// Example for formatting to show human representation of date
export function sqlFormatTimestampUTC(sqlTimestamp: SQLUTCTimestamp): string {
  const utcDate = sqlTimestampToDate(sqlTimestamp)
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC'
  })
  return formatter.format(utcDate)
}

// Example for formatting to show human representation of date
export function sqlFormatRelativeTimeFromUTC(sqlTimestamp: SQLUTCTimestamp): string {
  const utcDate = sqlTimestampToDate(sqlTimestamp)
  return formatDistanceToNow(utcDate, { addSuffix: true })
}

export function utcEpochSecondsWithMicrosecondsToDate(utcEpochSeconds: string, microSeconds: string) {
  const ts = Number.parseInt(utcEpochSeconds, 10)
  if (Number.isFinite(ts)) {
    // eslint-disable-next-line no-unsafe-date-fns/no-unsafe-date-fns
    const d = new UTCDate(0)
    const date = addSeconds(d, ts, { in: utc })
    if (isValid(date)) {
      const micro = Number.parseInt(microSeconds, 10)
      if (Number.isFinite(micro)) {
        const ms = Math.round(micro / 1000)
        return addMilliseconds(date, ms, { in: utc })
      }
      return date
    }
  }

  return null
}

/**
 * Interpret a YYYY-MM-DD string as a Pacific (America/Los_Angeles) calendar date,
 * then convert that moment (local midnight in Pacific) to the corresponding UTC
 * calendar date string (SQLUTCDate).
 *
 * Notes:
 * - Handles DST (PST/PDT) accurately via Intl API without extra deps.
 * - For a date-only value, the UTC calendar date will be the same string, but
 *   this function guarantees correctness at DST boundaries too.
 */
// export function pacificLocalDateToSqlUtcDate(localDate: string): SQLUTCDate {
//   const utcDate = parseISO(localDate, { in: tz('America/Los_Angeles') })
//   return formatISO(utcDate, { representation: 'date' }) as SQLUTCDate
// }

/**
 * Convert a UTC instant to a local calendar date string (YYYY-MM-DD) in a given IANA time zone.
 */
// export function utcInstantToSqlLocalDate(instant: Date, timeZone: string): SQLLocalDate {
//   const formatter = new Intl.DateTimeFormat('en-CA', {
//     timeZone,
//     year: 'numeric',
//     month: '2-digit',
//     day: '2-digit'
//   })
//   return formatter.format(instant) as SQLLocalDate
// }

/**
 * Interpret a local calendar date (YYYY-MM-DD) in the provided IANA time zone
 * as local midnight, and return the corresponding UTC timestamp string.
 * Handles DST transitions accurately.
 */

// export function localDateToSqlLocalDate(localDate: string, timeZone: string): SQLLocalDate {
//   // const iso = localDate.toISOString()
//   // console.log('iso', iso)
//   const x = parseISO(localDate, { in: tz(timeZone) })
//   console.log('x2', x)
//   const formatter = new Intl.DateTimeFormat('en-CA', {
//     timeZone,
//     year: 'numeric',
//     month: '2-digit',
//     day: '2-digit'
//   })
//   return formatter.format(x) as SQLLocalDate
// }

/**
 * Given a UTCDate and an IANA time zone, format the instant as a local calendar
 * date (YYYY-MM-DD), returned as SQLLocalDate.
 */
// export function utcDateToSqlLocalDate(utcDate: UTCDate, timeZone: string): SQLLocalDate {
//   return utcInstantToSqlLocalDate(utcDate, timeZone)
// }

// convert timezone local date TZDate in timezone to utc
// interpret local date TZDate in timezone -> SQLLocalDate
// convert utcDate to SQLLocalDate in timezone
