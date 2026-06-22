import { ShieldCheckIcon } from '@phosphor-icons/react'
import { useRouter } from '@tanstack/react-router'

import { cn } from '../../lib/utils'
import { getWebAppManifestIconUrl } from '../../public-assets'
import { OnboardingScreen } from './onboarding-screen'
import type * as React from 'react'
import type { OnboardingScreenProps } from './onboarding-screen'

export interface OnboardingPageProps extends React.ComponentProps<'main'> {
  logoSrc: string
  screenProps?: OnboardingScreenProps
}

export function OnboardingPage({ className, logoSrc, screenProps, ...props }: OnboardingPageProps) {
  const { className: screenClassName, ...restScreenProps } = screenProps ?? {}

  return (
    <main
      className={cn(
        'bg-background grid min-h-[100dvh] grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,0.95fr)_minmax(28rem,0.75fr)]',
        className
      )}
      {...props}
    >
      <section
        className='border-border/60 bg-muted/30 flex flex-col justify-between border-b px-6 py-8 sm:px-10
          lg:min-h-[100dvh] lg:border-r lg:border-b-0 lg:px-14 lg:py-12'
      >
        <div className='flex items-center gap-3'>
          <div
            className='border-border bg-background text-foreground flex size-10 items-center justify-center rounded-lg
              border shadow-sm'
          >
            <img
              alt=''
              className='size-full rounded-lg'
              height={40}
              src={logoSrc}
              width={40}
            />
          </div>
          <div className='min-w-0'>
            <div className='text-sm font-semibold tracking-tight'>AgentTeam Email</div>
            <div className='text-muted-foreground text-xs'>Self-hosted control plane</div>
          </div>
        </div>

        <div className='mt-16 max-w-xl lg:mt-0'>
          <div className='text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase'>
            First-time setup
          </div>
          <h1 className='mt-4 max-w-[11ch] text-4xl leading-none font-semibold tracking-tight text-balance sm:text-5xl'>
            Setup this instance&apos;s admin account.
          </h1>
          <p className='text-muted-foreground mt-5 max-w-[54ch] text-base leading-7'>
            Create the first administrator account before connecting domains, workers, and inbound
            mail routes.
          </p>
        </div>

        <div className='mt-12 grid max-w-xl gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2'>
          <div className='border-border/70 bg-background/70 rounded-lg border p-4'>
            <div className='flex items-center gap-2 font-medium'>
              <ShieldCheckIcon
                size={16}
                weight='duotone'
              />
              Admin account
            </div>
            <p className='text-muted-foreground mt-2 leading-6'>
              The first user created here receives instance administration permissions.
            </p>
          </div>
          <div className='border-border/70 bg-background/70 rounded-lg border p-4'>
            <div className='font-medium'>Setup gate</div>
            <p className='text-muted-foreground mt-2 leading-6'>
              Keep setup locked to this step until the initial admin account exists.
            </p>
          </div>
        </div>

        <div className='text-muted-foreground mt-12 text-xs'>
          AgentTeam Email setup runs locally against this instance.
        </div>
      </section>

      <section className='flex min-h-[100dvh] items-center justify-center px-6 py-10 sm:px-10 lg:px-14'>
        <OnboardingScreen
          {...restScreenProps}
          className={cn(
            'border-border/70 bg-background/95 w-full max-w-[28rem] rounded-xl shadow-[0_24px_70px_-45px_rgba(39,39,42,0.45)]',
            screenClassName
          )}
        />
      </section>
    </main>
  )
}

export function OnboardingRouteScreen() {
  const router = useRouter()
  const logoSrc = getWebAppManifestIconUrl(router.options.context.publicEnv.PUBLIC_HOSTNAME, 192)

  return <OnboardingPage logoSrc={logoSrc} />
}
