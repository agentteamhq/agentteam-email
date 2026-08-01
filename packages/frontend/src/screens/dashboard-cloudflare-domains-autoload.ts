/**
 * Owns the decision for the settings controller's automatic Cloudflare
 * accounts/zones load.
 *
 * The load is best-effort background work triggered by a render effect. Without a
 * failure latch the effect re-fires as soon as its busy flag clears, which turns a
 * persistent backend failure into an unbounded request loop against
 * `/rpc/cloudflare/accounts`. `loadFailed` is that latch: once a load attempt
 * fails, no further automatic attempt runs until the controller clears it for an
 * explicit user retry.
 */
export interface CloudflareDomainsAutoLoadState {
  /** Cloudflare accounts already loaded into the controller. */
  accountCount: number
  /** A Cloudflare request owned by the controller is already in flight. */
  busy: boolean
  /** Settings state was injected by a story or test, so the controller owns no runtime data. */
  injected: boolean
  /** A previous load attempt failed and has not been cleared by an explicit retry. */
  loadFailed: boolean
  /** The viewer cannot run Cloudflare actions. */
  readOnly: boolean
  /** Usable Cloudflare OAuth grants reported by `/rpc/cloudflare/status`. */
  usableGrantCount: number
  /** Cloudflare zones already loaded into the controller. */
  zoneCount: number
}

export function shouldAutoLoadCloudflareDomains(state: CloudflareDomainsAutoLoadState): boolean {
  if (state.injected || state.readOnly || state.busy || state.loadFailed) {
    return false
  }

  if (state.accountCount > 0 || state.zoneCount > 0) {
    return false
  }

  return state.usableGrantCount > 0
}
