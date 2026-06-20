import { tz, TZDate } from '@date-fns/tz'
import { utc, UTCDate } from '@date-fns/utc'
import { constructFrom } from 'date-fns/constructFrom'
import { endOfDay } from 'date-fns/endOfDay'
import { formatISO } from 'date-fns/formatISO'
import { formatRFC3339 } from 'date-fns/formatRFC3339'
import { interval } from 'date-fns/interval'
import { isWithinInterval } from 'date-fns/isWithinInterval'
import { parseISO } from 'date-fns/parseISO'
import { startOfDay } from 'date-fns/startOfDay'

import type { SQLLocalDate, SQLUTCDate, SQLUTCTimestamp } from './dates'
import type { IANATimeZone } from './timezones'

export function sqlTimestampConvertToDateWithTZ(
  sqlTimestamp: SQLUTCTimestamp,
  timeZone: IANATimeZone
): TZDate {
  const utcDate = parseISO(sqlTimestamp, { in: utc })
  return constructFrom(tz(timeZone), utcDate)
  // return new TZDate(, timeZone)
}

export function sqlLocalDateConvertToDateWithTZ(sqlLocalDate: SQLLocalDate, timeZone: IANATimeZone) {
  // console.log('sql local date', sqlLocalDate, timeZone)
  return parseISO(sqlLocalDate, { in: tz(timeZone) })
}

export function sqlLocalDateConvertToSqlUtcDate(
  sqlLocalDate: SQLLocalDate,
  timeZone: IANATimeZone
): SQLUTCDate {
  const intermediate = parseISO(sqlLocalDate, { in: tz(timeZone) })
  return formatISO(intermediate, { representation: 'date', in: utc }) as SQLUTCDate
}

export function convertPacificLocalDateToSqlUtcDate(sqlLocalDate: SQLLocalDate): SQLUTCDate {
  const intermediate = parseISO(sqlLocalDate, { in: tz('America/Los_Angeles') })
  return formatISO(intermediate, { representation: 'date', in: utc }) as SQLUTCDate
}

export function convertPacificLocalDateToDate(sqlLocalDate: SQLLocalDate): TZDate {
  return parseISO(sqlLocalDate, { in: tz('America/Los_Angeles') })
}

export function convertDateToDateWithTZ(date: UTCDate | TZDate, timeZone: IANATimeZone): TZDate {
  return constructFrom(tz(timeZone), date.getTime())
  // return parseISO(date.toISOString(), { in: tz(timeZone) })
}

export function convertDateToSqlLocalDate(date: UTCDate | TZDate, timeZone: IANATimeZone): SQLLocalDate {
  return formatISO(date, { representation: 'date', in: tz(timeZone) }) as SQLLocalDate
}

export function sqlLocalDateToUtcMidnight(localDate: SQLLocalDate, timeZone: IANATimeZone): SQLUTCTimestamp {
  const utcDate = parseISO(localDate, { in: tz(timeZone) })
  return formatRFC3339(utcDate, {
    fractionDigits: 3,
    in: utc
  }) as SQLUTCTimestamp
}

export function sqlLocalDateToUtcDayInterval(localDate: SQLLocalDate, timeZone: IANATimeZone) {
  const timeZoneContext = tz(timeZone)
  const localDateTz = parseISO(localDate, { in: timeZoneContext })
  const localDayStart = startOfDay(localDateTz, { in: timeZoneContext })
  const localDayEnd = endOfDay(localDateTz, { in: timeZoneContext })

  const startUtcDate = constructFrom(utc, localDayStart)
  const endUtcDate = constructFrom(utc, localDayEnd)
  const utcInterval = interval(startUtcDate, endUtcDate)
  return {
    startUtcDate,
    endUtcDate,
    utcInterval
  }
}

export function isGivenLocalDateTheCurrentDayInLocalTimezone(
  localDate: TZDate,
  timeZone: IANATimeZone
): boolean {
  const localNow = TZDate.tz(timeZone)
  const timeZoneContext = tz(timeZone)
  const dayStart = startOfDay(localNow, { in: timeZoneContext })
  const dayEnd = endOfDay(localNow, { in: timeZoneContext })

  const isWithinMarketDay = isWithinInterval(localDate, {
    start: dayStart,
    end: dayEnd
  })
  return isWithinMarketDay
}

export function isGivenSqlLocalDateTheCurrentDayInLocalTimezone(
  sqlLocalDate: SQLLocalDate,
  timeZone: IANATimeZone
): boolean {
  const localDate = sqlLocalDateConvertToDateWithTZ(sqlLocalDate, timeZone)
  return isGivenLocalDateTheCurrentDayInLocalTimezone(localDate, timeZone)
}

export function timeZoneNameFromIanaTimeZone(timeZone: IANATimeZone): string | undefined {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
    timeZone: timeZone
  })
  const parts = formatter.formatToParts(new Date())
  const localeTimeZone = parts.find((value) => value.type === 'timeZoneName')
  return localeTimeZone?.value
}

export function formatDateTimeToClientLocalTimeZone(date: UTCDate): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZoneName: 'short',
    timeZone: undefined
  })
  const parts = formatter.formatToParts(date)
  const localeTimeZone = parts.find((value) => value.type === 'timeZoneName')
  const localDateString = date.toLocaleDateString(undefined, {
    dateStyle: 'short',
    timeZone: undefined
  })
  const localTimeString = date.toLocaleTimeString(undefined, {
    timeStyle: 'short',
    timeZone: undefined
  })
  return `${localDateString} ${localTimeString}${localeTimeZone?.value ? ` ${localeTimeZone.value}` : ''}`
}
