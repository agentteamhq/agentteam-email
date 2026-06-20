import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export type TailwindClass = ClassValue

export function cn(...inputs: TailwindClass[]) {
  return twMerge(clsx(inputs))
}

export function tw(...inputs: TailwindClass[]) {
  return inputs
}

// export function formatDate(date: Date) {
//   // Generic date formatter (uses host environment time zone)
//   return Intl.DateTimeFormat('en-US', {
//     year: 'numeric',
//     month: 'long',
//     day: 'numeric'
//   }).format(date)
// }
