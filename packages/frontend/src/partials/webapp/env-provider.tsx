import { createContext, useContext, useMemo } from 'react'
import { EnvContext } from './env-context'
import type { FC, PropsWithChildren } from 'react'
import type { EnvContextValue } from './env-context'
import type { PUBLIC_VARS } from '@main/backend/vars.public'

// Provide the context value to the subtree
export const EnvProvider: FC<PropsWithChildren<EnvContextValue>> = ({ publicEnv, flash, children }) => {
  const value = useMemo<EnvContextValue>(() => ({ publicEnv, flash }), [publicEnv, flash])
  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>
}
