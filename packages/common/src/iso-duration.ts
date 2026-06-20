/**
 * Utilities for parsing a restricted subset of ISO 8601 duration strings.
 *
 * Supported forms: PTnH  PT nHnM  PTnM
 * Examples: "PT18H" → 18h, "PT120H" → 120h, "PT3H25M" → 205min, "PT45M" → 45min
 *
 * date-fns v4 has no parseDuration / parseISODuration, so we handle this
 * ourselves. The supported subset is deliberately narrow: hours and minutes.
 */

const ISO_DURATION_RE = /^PT(?:(\d+)H)?(?:(\d+)M)?$/

/**
 * Parse an ISO 8601 PTnH / PTnHnM / PTnM duration string and return total minutes.
 *
 * @throws RangeError if the string doesn't match the supported subset
 */
export function parseIsoDurationMinutes(duration: string): number {
  const m = ISO_DURATION_RE.exec(duration)
  if (!m || (m[1] === undefined && m[2] === undefined)) {
    throw new RangeError(
      `parseIsoDurationMinutes: cannot parse "${duration}" — expected PTnH, PTnHnM, or PTnM`
    )
  }
  const hours = m[1] !== undefined ? parseInt(m[1], 10) : 0
  const minutes = m[2] !== undefined ? parseInt(m[2], 10) : 0
  return hours * 60 + minutes
}

/**
 * Parse an ISO 8601 PTnH duration string and return total whole hours.
 *
 * @throws RangeError if the string is not a whole number of hours
 */
export function parseIsoDurationHours(duration: string): number {
  const totalMinutes = parseIsoDurationMinutes(duration)
  if (totalMinutes % 60 !== 0) {
    throw new RangeError(
      `parseIsoDurationHours: "${duration}" is not a whole number of hours (got ${totalMinutes} min)`
    )
  }
  return totalMinutes / 60
}
