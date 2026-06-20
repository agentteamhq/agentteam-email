export function ensureServerOnly(context: string) {
  if (typeof globalThis.window !== 'undefined') {
    throw new Error(
      `[server-only] "${context}" is intended for server/content execution only and was imported in a browser context.`
    )
  }
}
