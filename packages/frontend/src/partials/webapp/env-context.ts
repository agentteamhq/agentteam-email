import { createContext, useContext, useMemo } from 'react'
import type { FC, PropsWithChildren } from 'react'
import type { PUBLIC_VARS } from '@main/backend/vars.public'

// Define the shape of the environment variables your context will contain
export type EnvContextValue = {
  publicEnv: typeof PUBLIC_VARS
  flash?: string | null
}

// Create the context with a default undefined value to force checks
export const EnvContext = createContext<EnvContextValue | null>(null)

// A custom hook for consuming the EnvContext
export function useEnvContext(): EnvContextValue {
  const context = useContext(EnvContext)
  if (context === null) {
    throw new Error('useEnvContext must be used within an EnvProvider')
  }
  return context
}
