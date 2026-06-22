import { TZDate, tz } from '@date-fns/tz'
import { addDays } from 'date-fns/addDays'
import { differenceInHours } from 'date-fns/differenceInHours'
import { formatISO } from 'date-fns/formatISO'
import { parseISO } from 'date-fns/parseISO'
import { startOfDay } from 'date-fns/startOfDay'

import { convertDateToDateWithTZ, sqlLocalDateToUtcDayInterval } from './format-date-tz'
import { utcDateFromMs } from './strict-date'
import type { SQLLocalDate } from './dates'
import type { IANATimeZone } from './timezones'
import type { UTCDate } from '@date-fns/utc'

const HOUR_MS = 60 * 60 * 1000

export function dayLengthFromUtcInterval(localDate: SQLLocalDate, timeZone: IANATimeZone): number {
  const { startUtcDate, endUtcDate } = sqlLocalDateToUtcDayInterval(localDate, timeZone)
  return (endUtcDate.getTime() - startUtcDate.getTime() + 1) / HOUR_MS
}

export function dayLengthFromDateFnsBoundaries(localDate: SQLLocalDate, timeZone: IANATimeZone): number {
  const timeZoneContext = tz(timeZone)
  const localMidnight = startOfDay(parseISO(localDate, { in: timeZoneContext }), { in: timeZoneContext })
  const nextLocalMidnight = startOfDay(addDays(localMidnight, 1, { in: timeZoneContext }), {
    in: timeZoneContext
  })
  return differenceInHours(nextLocalMidnight, localMidnight)
}

export function dayLengthFromTZDateBoundaries(date: TZDate): number {
  const { timeZone } = date
  if (!timeZone) {
    throw new TypeError('TZDate.timeZone is required')
  }
  const localDate = formatISO(date, { representation: 'date', in: tz(timeZone) }) as SQLLocalDate
  return dayLengthFromDateFnsBoundaries(localDate, timeZone as IANATimeZone)
}

export function dayLengthFromUTCDateBoundaries(date: UTCDate, timeZone: IANATimeZone): number {
  const localDate = formatISO(date, { representation: 'date', in: tz(timeZone) }) as SQLLocalDate
  return dayLengthFromDateFnsBoundaries(localDate, timeZone)
}

export function dayLengthFromTZDate(localDate: SQLLocalDate, timeZone: IANATimeZone): number {
  const timeZoneContext = tz(timeZone)
  const start = parseISO(localDate, { in: timeZoneContext })
  const next = addDays(start, 1, { in: timeZoneContext })
  const startTz = new TZDate(start, timeZone)
  const nextTz = new TZDate(next, timeZone)
  return (nextTz.getTime() - startTz.getTime()) / HOUR_MS
}

export function dayLengthFromUTCDate(localDate: SQLLocalDate, timeZone: IANATimeZone): number {
  const { startUtcDate, endUtcDate } = sqlLocalDateToUtcDayInterval(localDate, timeZone)
  const startUtc = utcDateFromMs(startUtcDate.getTime())
  const endUtc = utcDateFromMs(endUtcDate.getTime())
  return (endUtc.getTime() - startUtc.getTime() + 1) / HOUR_MS
}
