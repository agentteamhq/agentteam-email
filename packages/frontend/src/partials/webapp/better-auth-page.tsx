import { BetterAuthViewTemplate } from './better-auth-view-template'
import { WebappProviders } from './webapp-providers'
import type { BetterAuthViewTemplateProps } from './better-auth-view-template'
import type { PropsWithChildren } from 'react'
import type { AuthProviderProps } from '@better-auth-ui/react'

import type { EnvContextValue } from './env-context'

export type BetterAuthPageProps = {
  authClient?: AuthProviderProps['authClient']
  sessionCleanupEnabled?: boolean
} & EnvContextValue &
  BetterAuthViewTemplateProps

export function BetterAuthPage(props: PropsWithChildren<BetterAuthPageProps>) {
  return (
    <WebappProviders
      publicEnv={props.publicEnv}
      flash={props.flash}
      redirectTo={props.redirectTo}
      authClient={props.authClient}
      sessionCleanupEnabled={props.sessionCleanupEnabled}
    >
      <BetterAuthViewTemplate
        view={props.view}
        redirectTo={props.redirectTo}
        flash={props.flash}
        lastUsedLoginMethod={props.lastUsedLoginMethod}
        resetPasswordToken={props.resetPasswordToken}
      />
    </WebappProviders>
  )
}
