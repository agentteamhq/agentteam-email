import { utc, UTCDate } from '@date-fns/utc'
import { addDays } from 'date-fns/addDays'
import { addSeconds } from 'date-fns/addSeconds'
import { differenceInSeconds } from 'date-fns/differenceInSeconds'
import { formatISO } from 'date-fns/formatISO'
import { isValid } from 'date-fns/isValid'
import { isWithinInterval } from 'date-fns/isWithinInterval'
import { parseISO } from 'date-fns/parseISO'
import { startOfDay } from 'date-fns/startOfDay'

import type { SQLUTCTime, SQLUTCTimeSeconds } from './dates'

const SQLEpochDate = '1970-01-01'

export function dateToSqlTime(date: UTCDate) {
  return formatISO(date, { representation: 'time', in: utc }) as SQLUTCTime
}

export function sqlTimeToSeconds(sqlTime: SQLUTCTime): SQLUTCTimeSeconds {
  const dt = parseISO(`${SQLEpochDate}T${sqlTime}Z`, { in: utc })
  if (!isValid(dt)) {
    throw new Error(`Invalid SQLUTCTime found: ${sqlTime} (${typeof sqlTime})`)
  }
  return differenceInSeconds(dt, startOfDay(dt, { in: utc })) as SQLUTCTimeSeconds
}

/**
 * Resolves a UTC time-of-day (`SQLUTCTime`) into a full UTC instant (`UTCDate`) that falls inside a given UTC window.
 *
 * Why this exists:
 * - A `SQLUTCTime` like `01:07:00` is only a time-of-day; it has no date.
 * - When you're working with "a local calendar day in some timezone", that day corresponds to a UTC *window*
 *   (e.g. LA local day typically spans `08:00Z` → next day `07:59:59Z`).
 * - In that case, the window start is *not* `00:00Z`, so `addSeconds(utcWindowStart, sqlTimeToSeconds(time))`
 *   is not correct: it interprets the UTC time-of-day relative to local-midnight-in-UTC.
 *
 * This helper anchors the `SQLUTCTime` against the UTC midnights that overlap the window and picks the one that
 * lands within the window. If none match, it returns `null`.
 */
export function sqlTimeToUtcInstantInUtcWindow(
  utcWindowStart: UTCDate,
  utcWindowEnd: UTCDate,
  sqlTime: SQLUTCTime
): UTCDate | null {
  const seconds = sqlTimeToSeconds(sqlTime)
  const utcMidnight0 = startOfDay(utcWindowStart, { in: utc })
  const utcMidnight1 = addDays(utcMidnight0, 1, { in: utc })
  const utcInterval = { start: utcWindowStart, end: utcWindowEnd }

  const candidate0 = addSeconds(utcMidnight0, seconds, { in: utc })
  if (isWithinInterval(candidate0, utcInterval)) {
    return candidate0
  }

  const candidate1 = addSeconds(utcMidnight1, seconds, { in: utc })
  if (isWithinInterval(candidate1, utcInterval)) {
    return candidate1
  }

  return null
}
