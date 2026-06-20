import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribeToMobileChanges(onStoreChange: () => void) {
  const mql = globalThis.window.matchMedia(MOBILE_MEDIA_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => {
    mql.removeEventListener('change', onStoreChange)
  }
}

function getIsMobileSnapshot() {
  return globalThis.window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

function getServerIsMobileSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribeToMobileChanges, getIsMobileSnapshot, getServerIsMobileSnapshot)
}
