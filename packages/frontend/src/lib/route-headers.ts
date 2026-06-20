export function routeSetCookieHeaders(
  setCookieHeaders: ReadonlyArray<string> | undefined
): Record<string, string> | undefined {
  if (!setCookieHeaders || setCookieHeaders.length === 0) {
    return undefined
  }

  return {
    'set-cookie': setCookieHeaders.join(', ')
  }
}
