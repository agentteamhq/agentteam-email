import type { ReactNode } from 'react'
import type { AuthRouteState } from '@main/backend/routes/webapp'

import type { PublicEnv } from '../types'

export interface AuthViewScreenProps {
  children: ReactNode
  publicEnv: PublicEnv
  routeState: Pick<AuthRouteState, 'user'>
}

export function AuthViewScreen({ children }: AuthViewScreenProps) {
  return <AuthScreenFrame>{children}</AuthScreenFrame>
}

export function AuthScreenFrame({ children }: { children: ReactNode }) {
  return (
    <main className='bg-background flex min-h-screen w-full flex-col'>
      <header className='flex h-14 shrink-0 items-center border-b px-4'>
        <a
          href='/'
          className='text-foreground text-sm font-semibold'
        >
          AgentTeam Email
        </a>
      </header>
      <section className='flex flex-1 items-start justify-center px-4 py-10 md:py-16'>{children}</section>
    </main>
  )
}
