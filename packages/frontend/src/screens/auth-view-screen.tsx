import { STRINGS } from '../strings'
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
    <main className='bg-background flex min-h-screen w-full items-center justify-center p-6 md:p-10'>
      <section className='flex w-full max-w-lg flex-col items-center gap-6'>
        <AuthBrandLink />
        {children}
      </section>
    </main>
  )
}

function AuthBrandLink() {
  return (
    <div className='flex justify-center'>
      <a
        href='/'
        className='text-foreground flex items-center gap-2 font-medium'
      >
        <span className='relative flex size-6 shrink-0 overflow-hidden rounded-md'>
          <img
            alt=''
            aria-hidden='true'
            className='hidden size-6 dark:block'
            draggable={false}
            src='/agentteam-email-light-logo.svg'
          />
          <img
            alt=''
            aria-hidden='true'
            className='block size-6 dark:hidden'
            draggable={false}
            src='/agentteam-email-dark-logo.svg'
          />
        </span>
        <span>{STRINGS.BRAND_NAME}</span>
      </a>
    </div>
  )
}
