import type { PublicEnv } from './types'

const publicEnvGlobalName = '__WEBAPP_PUBLIC_ENV__'

export function getBrowserPublicEnv(): PublicEnv {
  const publicEnv = globalThis.window?.[publicEnvGlobalName]

  if (!publicEnv) {
    throw new Error(`${publicEnvGlobalName} was not initialized before hydration`)
  }

  return publicEnv
}

export function serializePublicEnv(publicEnv: PublicEnv): string {
  return JSON.stringify(publicEnv).replaceAll('<', '\\u003c')
}
