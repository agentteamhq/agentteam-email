export const LOCAL_STORAGE_STORE_KEY = 'cs-main-store'

export function clearPersistedStore(): void {
  globalThis.localStorage?.removeItem(LOCAL_STORAGE_STORE_KEY)
}
