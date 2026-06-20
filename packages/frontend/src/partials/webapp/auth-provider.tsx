import { createContext, type FC, type PropsWithChildren, useContext } from 'react'

import { AuthContext, type AuthContextValue } from './auth-context'

// Provide the context value to the subtree
export const AuthProvider: FC<PropsWithChildren<AuthContextValue>> = ({ session, children }) => {
  const value: AuthContextValue = { session }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
