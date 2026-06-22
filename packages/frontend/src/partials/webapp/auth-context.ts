import { createContext, useContext } from 'react'
import type { FC, PropsWithChildren } from 'react'
import type { GlobalAuth } from '@main/backend'

import type { authReactClient } from '../../lib/auth-react-client'

// Define the shape of the environment variables your context will contain
export interface AuthContextValue {
  session: typeof authReactClient.$Infer.Session | null
}

// Create the context with a default undefined value to force checks
export const AuthContext = createContext<AuthContextValue | null>(null)

// A custom hook for consuming the EnvContext
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuthContext must be used within an EnvProvider')
  }
  return context
}
