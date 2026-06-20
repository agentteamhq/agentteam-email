import type { PropsWithChildren } from 'react'
import type { AuthProviderProps } from '@better-auth-ui/react'

import { BetterAuthViewTemplate, type BetterAuthViewTemplateProps } from './better-auth-view-template'
import type { EnvContextValue } from './env-context'
import { WebappProviders } from './webapp-providers'

export type BetterAuthPageProps = {
  authClient?: AuthProviderProps['authClient']
} & EnvContextValue &
  BetterAuthViewTemplateProps

export function BetterAuthPage(props: PropsWithChildren<BetterAuthPageProps>) {
  return (
    <WebappProviders
      publicEnv={props.publicEnv}
      flash={props.flash}
      redirectTo={props.redirectTo}
      authClient={props.authClient}
    >
      <BetterAuthViewTemplate
        view={props.view}
        redirectTo={props.redirectTo}
        flash={props.flash}
        lastUsedLoginMethod={props.lastUsedLoginMethod}
      />
    </WebappProviders>
  )
}
