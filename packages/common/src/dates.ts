/** UTC timestamp string formatted as RFC3339 for serialized API and utility boundaries. */
declare const SQLUTCTimestampBrand: unique symbol
export type SQLUTCTimestamp = string & { readonly [SQLUTCTimestampBrand]: true } // RFC3339
export { SQLUTCTimestampBrand }

declare const SQLUTCDateBrand: unique symbol
export type SQLUTCDate = string & { readonly [SQLUTCDateBrand]: true } // YYYY-MM-DD
export { SQLUTCDateBrand }

declare const SQLUTCTimeBrand: unique symbol
export type SQLUTCTime = string & { readonly [SQLUTCTimeBrand]: true } // 24:00:00
export { SQLUTCTimeBrand }

declare const SQLUTCTimeSecondsBrand: unique symbol
export type SQLUTCTimeSeconds = number & { readonly [SQLUTCTimeSecondsBrand]: true }
export { SQLUTCTimeSecondsBrand }

// Represents a local calendar date (DST aware) interpreted in a specific IANA time zone.
// No time zone information is embedded.
declare const SQLLocalDateBrand: unique symbol
export type SQLLocalDate = string & { readonly [SQLLocalDateBrand]: true } // YYYY-MM-DD
export { SQLLocalDateBrand }

// Represents a local calendar date in standard time interpreted in a specific IANA time zone.
// Local Standard Time ignores DST. No time zone information is embedded.
declare const SQLLocalLSTDateBrand: unique symbol
export type SQLLocalLSTDate = string & { readonly [SQLLocalLSTDateBrand]: true } // YYYY-MM-DD
export { SQLLocalLSTDateBrand }
