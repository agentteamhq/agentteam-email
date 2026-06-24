export function parseAtEmailUserAgent(userAgent: string | null | undefined) {
  const value = userAgent ?? ''
  const match = /^at-email\/([^\s]+)(?: \(([^;]+); ([^)]+)\))?/.exec(value)
  if (!match) {
    return null
  }

  const version = match[1] ?? 'unknown'
  const os = match[2] ?? null
  const arch = match[3] ?? null

  return {
    label: `at-email ${version}`,
    platform: os && arch ? `${os}/${arch}` : 'CLI session'
  }
}
