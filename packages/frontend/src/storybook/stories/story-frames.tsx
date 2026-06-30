import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import type { AgentAccessSettingsState } from '../../partials/authenticated/settings-dialog'

type DashboardMailControllerArgs = React.ComponentProps<typeof DashboardMailController>

export type DashboardMailControllerStoryFrameProps = DashboardMailControllerArgs & {
  agentAccessView?: NonNullable<AgentAccessSettingsState['view']>
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
