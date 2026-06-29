import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DashboardScreen } from '../../screens/dashboard-screen'
import { DashboardMailController } from '../../screens/dashboard-mail-client-controller'
import type { AgentAccessSettingsState } from '../../partials/authenticated/settings-dialog'

type DashboardMailControllerStoryFrameProps = React.ComponentProps<typeof DashboardMailController> & {
  agentAccessView: NonNullable<AgentAccessSettingsState['view']>
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
  const loadStoryAgentAccessView = React.useCallback(async () => agentAccessView, [agentAccessView])

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
        agentAccessViewLoader={loadStoryAgentAccessView}
      />
    </QueryClientProvider>
  )
}

export function MailboxAdminPaginatedStoryFrame(args: React.ComponentProps<typeof DashboardScreen>) {
  const [page, setPage] = React.useState(args.mailboxAdminView?.pagination?.page ?? 1)
  const onPageChange = args.mailboxAdminView?.onPageChange
  const mailboxAdminView = React.useMemo(
    () =>
      args.mailboxAdminView
        ? {
            ...args.mailboxAdminView,
            onPageChange: (nextPage: number) => {
              setPage(nextPage)
              onPageChange?.(nextPage)
            },
            pagination: {
              page,
              pageSize: args.mailboxAdminView.pagination?.pageSize ?? 10
            }
          }
        : undefined,
    [args.mailboxAdminView, onPageChange, page]
  )

  return (
    <DashboardScreen
      {...args}
      mailboxAdminView={mailboxAdminView}
    />
  )
}
