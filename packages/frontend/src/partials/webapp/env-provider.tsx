import { createContext, type FC, type PropsWithChildren, useContext, useMemo } from 'react'
import type { PUBLIC_VARS } from '@main/backend/vars.public'

import { EnvContext, type EnvContextValue } from './env-context'

// Provide the context value to the subtree
export const EnvProvider: FC<PropsWithChildren<EnvContextValue>> = ({ publicEnv, flash, children }) => {
  const value = useMemo<EnvContextValue>(() => ({ publicEnv, flash }), [publicEnv, flash])
  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>
}
