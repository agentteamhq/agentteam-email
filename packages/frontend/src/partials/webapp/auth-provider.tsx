import { createContext, useContext } from 'react'
import { AuthContext } from './auth-context'
import type { FC, PropsWithChildren } from 'react'

import type { AuthContextValue } from './auth-context'

// Provide the context value to the subtree
export const AuthProvider: FC<PropsWithChildren<AuthContextValue>> = ({ session, children }) => {
  const value: AuthContextValue = { session }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
