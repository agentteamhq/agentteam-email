export function copyHeaders(rawHeaders: Headers): Headers {
  const headers = new Headers()
  if (!rawHeaders) {
    return headers
  }

  const raw = rawHeaders as unknown
  if (raw instanceof Headers && typeof raw.entries === 'function') {
    for (const [key, value] of raw.entries()) {
      headers.set(key, value)
    }
  }

  return headers
}
