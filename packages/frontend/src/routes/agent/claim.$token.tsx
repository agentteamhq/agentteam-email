/* eslint-disable react-refresh/only-export-components */
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import {
  decideAgentMailTrialClaim,
  fetchAgentMailTrialClaim
} from '../../lib/agent-access-rpc'
import { loadAuthenticatedRouteState } from '../../lib/authenticated-app-route'
import { AgentTrialClaimScreen } from '../../screens/agent-trial-claim-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { FrontendLoaderInput } from '../../server-route-context'

export interface AgentClaimRouteState {
  redirectTo: string
  user: {
    email?: string | null
    name?: string | null
  } | null
}

export type AgentClaimLoaderInput = FrontendLoaderInput & {
  location: {
    href: string
  }
}

export const Route = createFileRoute('/agent/claim/$token')({
  loader: loadAgentClaimRouteState,
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Claim Agent')
      },
      {
        name: 'description',
        content: `Claim an autonomous trial agent for your ${SITE_STRINGS.BRAND_NAME} workspace.`
      }
    ]
  }),
  component: AgentClaimRouteScreen
})

function AgentClaimRouteScreen() {
  const { token } = Route.useParams()
  const routeState = Route.useLoaderData()
  const queryClient = useQueryClient()
  const claimQuery = useQuery(agentTrialClaimQueryOptions(token))
  const claimQueryKey = agentTrialClaimQueryKey(token)
  const claim = claimQuery.data ?? null
  const loadError = claimQuery.error instanceof Error ? claimQuery.error.message : null

  return (
    <AgentTrialClaimScreen
      key={claim?.trial_id ?? token}
      claim={claim}
      loadError={loadError}
      loading={claimQuery.isLoading}
      userEmail={routeState.user?.email}
      userName={routeState.user?.name}
      onApprove={async ({ targetOrganizationId }) => {
        const result = await decideAgentMailTrialClaim({
          action: 'approve',
          targetOrganizationId,
          token
        })
        queryClient.setQueryData(claimQueryKey, result.view)
      }}
      onDeny={async () => {
        const result = await decideAgentMailTrialClaim({
          action: 'deny',
          token
        })
        queryClient.setQueryData(claimQueryKey, result.view)
      }}
    />
  )
}

export async function loadAgentClaimRouteState(
  loaderInput: AgentClaimLoaderInput
): Promise<AgentClaimRouteState> {
  const redirectTo = loaderInput.location.href
  const routeState = await loadAuthenticatedRouteState(loaderInput, redirectTo)

  return {
    redirectTo,
    user: {
      email: routeState.user?.email,
      name: routeState.user?.name
    }
  }
}

export function agentTrialClaimQueryKey(token: string) {
  return ['agent-mail-trial-claim', token] as const
}

export function agentTrialClaimQueryOptions(token: string) {
  return queryOptions({
    queryFn: () => loadAgentTrialClaim(token),
    queryKey: agentTrialClaimQueryKey(token)
  })
}

export function loadAgentTrialClaim(token: string) {
  return fetchAgentMailTrialClaim(token)
}
