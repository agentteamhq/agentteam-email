export function ensureClientOnly(context: string) {
  if (!globalThis.window) {
    throw new Error(
      `[client-only] "${context}" is intended for client-only execution only and was called in a server context.`
    )
  }
}
