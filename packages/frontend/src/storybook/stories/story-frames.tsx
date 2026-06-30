import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import type { DashboardSearch } from '../../lib/dashboard-search'
import type { fetchAgentAccessView } from '../../lib/agent-access-rpc'
import type { fetchMailboxAdminNavigation, fetchMailboxAdminView } from '../../lib/mail-admin-rpc'
import type { fetchMailWorkspace } from '../../lib/mail-rpc'
import type { DashboardScreenProps } from '../../screens/dashboard-screen'
import type { AgentAccessSettingsState } from '../../partials/authenticated/settings-dialog'

export type DashboardMailControllerStoryFrameProps = Pick<
  DashboardScreenProps,
  | 'authClient'
  | 'defaultSettingsOpen'
  | 'defaultSettingsSection'
  | 'domainSettingsState'
  | 'publicEnv'
  | 'routeState'
  | 'sessionCleanupEnabled'
  | 'settingsContentState'
  | 'onSettingsOpenChange'
  | 'onSettingsSectionChange'
  | 'settingsOpen'
  | 'settingsSection'
> & {
  agentAccessView?: NonNullable<AgentAccessSettingsState['view']>
  agentAccessViewLoader?: typeof fetchAgentAccessView
  mailWorkspaceLoader?: typeof fetchMailWorkspace
  mailboxAdminNavigationLoader?: typeof fetchMailboxAdminNavigation
  mailboxAdminViewLoader?: typeof fetchMailboxAdminView
  routeSearch?: DashboardSearch
}

export function DashboardMailControllerStoryFrame({
  agentAccessView,
  ...props
}: DashboardMailControllerStoryFrameProps) {
  const queryClient = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false
          }
        }
      }),
    []
  )
  const agentAccessViewLoader = React.useMemo(() => {
    if (agentAccessView === undefined) {
      return props.agentAccessViewLoader
    }

    return async () => agentAccessView
  }, [agentAccessView, props.agentAccessViewLoader])

  React.useEffect(
    () => () => {
      queryClient.clear()
    },
    [queryClient]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <DashboardMailController
        {...props}
        agentAccessViewLoader={agentAccessViewLoader}
      />
    </QueryClientProvider>
  )
}
