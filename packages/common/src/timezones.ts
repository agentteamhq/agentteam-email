declare const IANATimeZoneBrand: unique symbol
export type IANATimeZone = (typeof IANATimeZones)[number] & { readonly [IANATimeZoneBrand]: true }
export { IANATimeZoneBrand }

export const IANAAnchorageTime = 'America/Anchorage' as IANATimeZone
export const IANACentralTime = 'America/Chicago' as IANATimeZone
export const IANAEasternTime = 'America/New_York' as IANATimeZone
export const IANAHawaiiTime = 'Pacific/Honolulu' as IANATimeZone
export const IANAMountainTime = 'America/Denver' as IANATimeZone
export const IANAPacificTime = 'America/Los_Angeles' as IANATimeZone
export const IANAPhoenixTime = 'America/Phoenix' as IANATimeZone
export const IANAMexicoCityTime = 'America/Mexico_City' as IANATimeZone
export const IANAPanamaTime = 'America/Panama' as IANATimeZone
export const IANALondonTime = 'Europe/London' as IANATimeZone
export const IANAAmsterdamTime = 'Europe/Amsterdam' as IANATimeZone
export const IANABerlinTime = 'Europe/Berlin' as IANATimeZone
export const IANAHelsinkiTime = 'Europe/Helsinki' as IANATimeZone
export const IANAMadridTime = 'Europe/Madrid' as IANATimeZone
export const IANAMoscowTime = 'Europe/Moscow' as IANATimeZone
export const IANARomeTime = 'Europe/Rome' as IANATimeZone
export const IANAWarsawTime = 'Europe/Warsaw' as IANATimeZone
export const IANAJohannesburgTime = 'Africa/Johannesburg' as IANATimeZone
export const IANALagosTime = 'Africa/Lagos' as IANATimeZone
export const IANADubaiTime = 'Asia/Dubai' as IANATimeZone
export const IANAHongKongTime = 'Asia/Hong_Kong' as IANATimeZone
export const IANAJakartaTime = 'Asia/Jakarta' as IANATimeZone
export const IANAJerusalemTime = 'Asia/Jerusalem' as IANATimeZone
export const IANAKolkataTime = 'Asia/Kolkata' as IANATimeZone
export const IANAKualaLumpurTime = 'Asia/Kuala_Lumpur' as IANATimeZone
export const IANARiyadhTime = 'Asia/Riyadh' as IANATimeZone
export const IANATorontoTime = 'America/Toronto' as IANATimeZone
export const IANASeoulTime = 'Asia/Seoul' as IANATimeZone
export const IANAShanghaiTime = 'Asia/Shanghai' as IANATimeZone
export const IANASingaporeTime = 'Asia/Singapore' as IANATimeZone
export const IANATaipeiTime = 'Asia/Taipei' as IANATimeZone
export const IANATokyoTime = 'Asia/Tokyo' as IANATimeZone
export const IANABuenosAiresTime = 'America/Argentina/Buenos_Aires' as IANATimeZone
export const IANASaoPauloTime = 'America/Sao_Paulo' as IANATimeZone
export const IANAParisTime = 'Europe/Paris' as IANATimeZone
export const IANAIstanbulTime = 'Europe/Istanbul' as IANATimeZone
export const IANAAucklandTime = 'Pacific/Auckland' as IANATimeZone
export const IANAUTCTime = 'Etc/UTC' as IANATimeZone

export const IANATimeZones = [
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Panama',
  'America/Phoenix',
  'America/Sao_Paulo',
  'America/Toronto',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Asia/Riyadh',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Etc/UTC',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Warsaw',
  'Pacific/Auckland',
  'Pacific/Honolulu'
] as const

// Type guard to check if a string is a valid PointSourceProvider
export function isIANATimeZone(value: string): value is IANATimeZone {
  return (IANATimeZones as readonly string[]).includes(value)
}

// Parse and return a PointSourceProvider or throw if invalid
export function parseIANATimeZone(value: string): IANATimeZone {
  if (isIANATimeZone(value)) {
    return value
  }
  throw new Error(`Invalid IANATimeZone: ${value}`)
}
