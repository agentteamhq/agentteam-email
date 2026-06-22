/**
 * Strict date construction and parsing utilities.
 *
 * date-fns silently overflows out-of-range date components — "Feb 30" becomes
 * Mar 1/2 with no error and isValid() still returning true. There is no strict
 * mode in date-fns (GitHub issue open since 2019, never implemented).
 *
 * Every function here throws a RangeError on overflow, matching the behaviour
 * of Temporal's `overflow: 'reject'` option. These are the ONLY permitted
 * entry points where silent date overflow can occur in this codebase. Direct
 * use of parse and set from date-fns, and component-form new UTCDate(...) /
 * new TZDate(...), should go through these strict helper entry points.
 *
 * parseISO, constructFrom, and epoch-form new UTCDate(ms) are NOT banned —
 * they cannot silently overflow calendar components.
 *
 * Active functions:
 *   strictParse(str, fmt, ref)          — wraps parse; detects overflow via round-trip format check
 *   strictSet(date, values)             — wraps set; detects overflow via post-construction comparison
 */

import { UTCDate, utc } from '@date-fns/utc'
import { format } from 'date-fns/format'
import { isValid } from 'date-fns/isValid'
import { parse } from 'date-fns/parse'
import { set } from 'date-fns/set'
import type { ContextFn, ContextOptions } from 'date-fns'

// ---------------------------------------------------------------------------
// strictISO
// ---------------------------------------------------------------------------

/**
 * Parse an ISO 8601 string into a UTCDate (default) or TZDate, throwing if the string is invalid.
 *
 * Unlike parseISO, this throws a RangeError rather than silently returning
 * an invalid Date object. For ISO 8601 strings, date-fns already returns an
 * invalid date for out-of-range values (e.g. '2024-02-30'), so isValid is
 * the correct and sufficient check — no format-back comparison needed.
 *
 * Pass `{ in: tz('America/New_York') }` to get back a TZDate in that timezone.
 * Defaults to `{ in: utc }` (returns UTCDate) when no options are provided.
 *
 * @throws RangeError if the string is not a valid ISO 8601 date
 */
// export function strictISO<ResultDate extends Date = UTCDate>(
//   str: string,
//   options?: ContextOptions<ResultDate>
// ): ResultDate {
//   const context = (options?.in ?? utc) as ContextFn<ResultDate>
//   const d = parseISO(str, { in: context })
//   if (!isValid(d)) {
//     throw new RangeError(`strictISO: invalid ISO date string: "${str}"`)
//   }
//   return d
// }

// ---------------------------------------------------------------------------
// strictParse
// ---------------------------------------------------------------------------

/**
 * Parse a date string using a format pattern, throwing on any date overflow.
 *
 * date-fns parse silently overflows invalid components just like parseISO.
 * This function detects overflow by formatting the parsed result back with
 * the same format and comparing against the original input string. If
 * 'Feb 30' rolled to Mar 1, formatting back with the same pattern produces
 * a different string.
 *
 * The referenceDate fills in any components not present in the format string
 * (e.g. year when only month/day are parsed). Pass new UTCDate() for current time.
 *
 * Pass `{ in: tz('America/New_York') }` to get back a TZDate in that timezone.
 * Defaults to `{ in: utc }` (returns UTCDate) when no options are provided.
 *
 * @throws RangeError if the string cannot be parsed or if components overflow
 */
export function strictParse<TResultDate extends Date = UTCDate>(
  str: string,
  formatStr: string,
  referenceDate: Date,
  options?: ContextOptions<TResultDate>
): TResultDate {
  const context = (options?.in ?? utc) as ContextFn<TResultDate>
  const d = parse(str, formatStr, referenceDate, { in: context })
  if (!isValid(d)) {
    throw new RangeError(`strictParse: could not parse "${str}" with format "${formatStr}"`)
  }
  // Format back with the same pattern and compare. Overflow produces a
  // different string: parse('30/02/2024', 'dd/MM/yyyy') → Mar 1 →
  // format back → '01/03/2024' ≠ '30/02/2024' → throw.
  const roundTrip = format(d, formatStr, { in: context })
  if (roundTrip !== str) {
    throw new RangeError(
      `strictParse: date overflow in "${str}" with format "${formatStr}": ` +
        `parsed value formats back as "${roundTrip}" — check day/month values are valid for the given month`
    )
  }
  return d
}

// ---------------------------------------------------------------------------
// strictSet
// ---------------------------------------------------------------------------

/**
 * Set date components on a date, throwing if any calendar component overflows.
 *
 * date-fns set silently overflows: set(febDate, { date: 30 }) produces March 1/2.
 * This function checks the date, month, and year components after construction.
 * Time components (hours, minutes, seconds, milliseconds) are bounded by their
 * ranges and cannot overflow in the same silent way.
 *
 * Overflow is detected using local-time getters (getDate/getMonth/getFullYear),
 * which work correctly for both UTCDate (where local === UTC) and TZDate (where
 * local is the timezone-specific value).
 *
 * Pass `{ in: tz('America/New_York') }` to get back a TZDate in that timezone.
 * Defaults to `{ in: utc }` (returns UTCDate) when no options are provided.
 *
 * @throws RangeError if date, month, or year overflows after being set
 */
export function strictSet<TResultDate extends Date = UTCDate>(
  date: Date,
  values: {
    year?: number
    month?: number
    date?: number
    hours?: number
    minutes?: number
    seconds?: number
    milliseconds?: number
  },
  options?: ContextOptions<TResultDate>
): TResultDate {
  const context = (options?.in ?? utc) as ContextFn<TResultDate>
  const result = set(date, values, { in: context })
  if (values.date !== undefined && result.getDate() !== values.date) {
    throw new RangeError(
      `strictSet: day ${values.date} overflowed to ${result.getDate()} ` +
        `(invalid day for month ${result.getMonth()})`
    )
  }
  if (values.month !== undefined && result.getMonth() !== values.month) {
    throw new RangeError(`strictSet: month ${values.month} overflowed to ${result.getMonth()}`)
  }
  if (values.year !== undefined && result.getFullYear() !== values.year) {
    throw new RangeError(`strictSet: year ${values.year} overflowed to ${result.getFullYear()}`)
  }
  return result
}

// ---------------------------------------------------------------------------
// utcDateFromMs
// ---------------------------------------------------------------------------

/**
 * Construct a UTCDate from a UTC epoch milliseconds value.
 *
 * This is the only permitted way to construct a UTCDate from a raw milliseconds
 * timestamp. The named factory makes the intent explicit: the caller is working
 * with an absolute epoch value, not calendar components.
 *
 * Use parseISO or strictParse for string input.
 */
export function utcDateFromMs(ms: number): UTCDate {
  return new UTCDate(ms)
}

// ---------------------------------------------------------------------------
// strictConstructFrom
// ---------------------------------------------------------------------------

/**
 * Construct a date of the same type as the reference, throwing if the result is invalid.
 *
 * constructFrom is date-fns's mechanism for preserving date types across operations:
 * passing a UTCDate reference yields a UTCDate, passing a TZDate reference yields a
 * TZDate in the same timezone. This replaces all direct typed-constructor calls
 * (new UTCDate(value), new TZDate(value, tz)) when constructing from a timestamp
 * or existing Date object.
 *
 * @param reference - A date instance whose type/timezone is used to construct the result,
 *                    or a ContextFn (e.g. utc, tz('America/New_York')) for explicit typing.
 * @param value     - The timestamp (ms), ISO string, or Date to convert.
 * @throws RangeError if the resulting date is invalid
 */
// export function strictConstructFrom<
//   DateType extends Date | ConstructableDate,
//   ResultDate extends Date = DateType,
// >(
//   reference: DateArg<DateType> | ContextFn<ResultDate> | undefined,
//   value: DateArg<Date>
// ): ResultDate {
//   const d = constructFrom(reference, value)
//   if (!isValid(d)) {
//     throw new RangeError(`strictConstructFrom: invalid date value: ${String(value)}`)
//   }
//   return d
// }

// ---------------------------------------------------------------------------
// strictUTC and strictTZ — intentionally commented out
//
// These encouraged manual year/month/day component assembly, which is the same
// pattern as regex-parsing a date string and feeding the parts directly into a
// constructor. That makes it hard to audit where manual parsing is happening.
// Use strictISO or strictParse to parse into a date, then strictSet to adjust
// individual components, and strictConstructFrom to retype the result.
// ---------------------------------------------------------------------------

// export function strictUTC(components: {
//   year: number
//   month: number
//   day: number
//   hour?: number
//   minute?: number
//   second?: number
//   ms?: number
// }): UTCDate {
//   const { year, month, day, hour = 0, minute = 0, second = 0, ms = 0 } = components
//   const d = new UTCDate(year, month, day, hour, minute, second, ms)
//   if (
//     d.getUTCFullYear() !== year ||
//     d.getUTCMonth() !== month ||
//     d.getUTCDate() !== day ||
//     d.getUTCHours() !== hour ||
//     d.getUTCMinutes() !== minute ||
//     d.getUTCSeconds() !== second
//   ) {
//     throw new RangeError(`strictUTC: date components overflowed — ...`)
//   }
//   return d
// }

// export function strictTZ(
//   components: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number; ms?: number },
//   timezone: string
// ): TZDate {
//   const { year, month, day, hour = 0, minute = 0, second = 0, ms = 0 } = components
//   const d = new TZDate(year, month, day, hour, minute, second, ms, timezone)
//   if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day || ...) {
//     throw new RangeError(`strictTZ: date components overflowed in timezone "${timezone}" — ...`)
//   }
//   return d
// }
