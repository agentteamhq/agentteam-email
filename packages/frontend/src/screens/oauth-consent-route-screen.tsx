import * as React from 'react'
import type { OAuthClient } from '@better-auth/oauth-provider'
import { queryOptions, useQuery } from '@tanstack/react-query'

import { authReactClient } from '../lib/auth-react-client'
import { OAuthConsentScreen } from '../partials/oauth-server/oauth-consent-screen'
import { AuthScreenFrame } from './auth-view-screen'
import type {
  OAuthConsentClientView,
  OAuthConsentDecisionPhase,
  OAuthConsentScopeView
} from '../partials/oauth-server/oauth-consent-screen'
import type { SettingsRouteState } from '@main/backend/routes/webapp'

export interface OAuthConsentSearch {
  client_id?: string
  code?: string
  scope?: string
}

export interface OAuthConsentAuthClient {
  oauth2: Pick<typeof authReactClient.oauth2, 'consent' | 'publicClient'>
}

export interface OAuthConsentRouteScreenProps {
  authClient?: OAuthConsentAuthClient
  onRedirect?: (href: string) => void
  routeState: Pick<SettingsRouteState, 'user'>
  search: OAuthConsentSearch
}

export function OAuthConsentRouteScreen({
  authClient = authReactClient,
  onRedirect = defaultExternalOAuthRedirect,
  routeState,
  search
}: OAuthConsentRouteScreenProps) {
  const clientId = search.client_id?.trim() ?? ''
  const scope = normalizeScope(search.scope)
  const invalidMessage = validateOAuthConsentSearch(search)
  const [decisionPhase, setDecisionPhase] = React.useState<OAuthConsentDecisionPhase>('idle')
  const [decisionError, setDecisionError] = React.useState<string | null>(null)
  const clientLoadEnabled = Boolean(clientId && !invalidMessage)
  const {
    data: clientData,
    error: clientQueryError,
    isLoading: isClientLoading
  } = useQuery(oauthConsentClientQueryOptions(authClient, clientId, clientLoadEnabled))
  const client = clientLoadEnabled ? clientData ?? null : null
  const clientLoading = clientLoadEnabled && isClientLoading
  const clientError =
    clientLoadEnabled && clientQueryError
      ? readErrorMessage(clientQueryError) ?? 'Application details could not be loaded.'
      : null

  function decide(accept: boolean) {
    if (invalidMessage || !client) {
      return
    }

    setDecisionError(null)
    setDecisionPhase(accept ? 'approving' : 'denying')
    authClient.oauth2
      .consent({
        accept,
        ...(accept && scope ? { scope } : {}),
        fetchOptions: {
          throw: true
        }
      })
      .then((response) => {
        const redirectUri = readOAuthConsentRedirectUri(response)
        setDecisionPhase(accept ? 'approved' : 'denied')
        onRedirect(redirectUri)
      })
      .catch((caught: unknown) => {
        setDecisionPhase('idle')
        setDecisionError(readErrorMessage(caught) ?? 'OAuth consent could not be completed.')
      })
  }

  return (
    <AuthScreenFrame>
      <OAuthConsentScreen
        client={client}
        clientError={clientError}
        clientLoading={clientLoading}
        decisionError={decisionError}
        decisionPhase={decisionPhase}
        invalidMessage={invalidMessage}
        scopes={scopeToViews(scope)}
        signedInEmail={routeState.user?.email}
        signedInName={routeState.user?.name}
        onApprove={() => {
          decide(true)
        }}
        onDeny={() => {
          decide(false)
        }}
      />
    </AuthScreenFrame>
  )
}

function oauthConsentClientQueryOptions(
  authClient: OAuthConsentAuthClient,
  clientId: string,
  enabled: boolean
) {
  return queryOptions({
    enabled,
    queryFn: async ({ queryKey }) => {
      const [, , nextClientId, publicClient] = queryKey
      const response = await publicClient({
        query: {
          client_id: nextClientId
        },
        fetchOptions: {
          throw: true
        }
      })
      const publicClientData = readResponseData(response) as OAuthClient | null
      return toOAuthConsentClientView(publicClientData, nextClientId)
    },
    queryKey: ['oauth-consent', 'client', clientId, authClient.oauth2.publicClient] as const,
    retry: false,
    staleTime: 30_000
  })
}

function validateOAuthConsentSearch(search: OAuthConsentSearch): string | null {
  if (!search.client_id?.trim()) {
    return 'OAuth consent link is missing the client identifier.'
  }
  if (!search.code?.trim()) {
    return 'OAuth consent link is missing its authorization code.'
  }
  return null
}

function scopeToViews(scope: string): OAuthConsentScopeView[] {
  const scopes = scope
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)

  return scopes.map((item) => OAUTH_SCOPE_COPY[item] ?? unknownScopeCopy(item))
}

function normalizeScope(value: string | undefined) {
  return value
    ?.split(/\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ') ?? ''
}

const OAUTH_SCOPE_COPY: Record<string, OAuthConsentScopeView> = {
  openid: {
    description: 'Read basic account details.',
    label: 'Basic account details',
    scope: 'openid'
  },
  profile: {
    description: 'Read basic account details.',
    label: 'Basic account details',
    scope: 'profile'
  },
  email: {
    description: 'Read basic account details.',
    label: 'Basic account details',
    scope: 'email'
  },
  offline_access: {
    description: 'Stay connected until revoked.',
    label: 'Stay connected',
    scope: 'offline_access',
    tone: 'sensitive'
  },
  'email.full_access': {
    description: 'Use AgentTeam Email mail APIs.',
    label: 'Use mail APIs',
    scope: 'email.full_access',
    tone: 'sensitive'
  }
} satisfies Record<string, OAuthConsentScopeView>

function unknownScopeCopy(scope: string): OAuthConsentScopeView {
  return {
    description: 'Request additional access.',
    label: 'Additional access',
    scope,
    tone: 'sensitive'
  }
}

function toOAuthConsentClientView(client: OAuthClient | null, fallbackClientId: string): OAuthConsentClientView {
  return {
    clientId: readString(client?.client_id) ?? fallbackClientId,
    contacts: Array.isArray(client?.contacts)
      ? client.contacts.filter((contact): contact is string => typeof contact === 'string' && contact.trim() !== '')
      : [],
    iconUrl: readString(client?.logo_uri),
    name: readString(client?.client_name) ?? 'application',
    policyUrl: readString(client?.policy_uri),
    tosUrl: readString(client?.tos_uri),
    uri: readString(client?.client_uri)
  }
}

function readResponseData(response: unknown): unknown {
  if (response && typeof response === 'object' && 'data' in response) {
    return response.data
  }
  return response
}

function readOAuthConsentRedirectUri(response: unknown): string {
  const data = readResponseData(response)
  if (!data || typeof data !== 'object') {
    throw new Error('OAuth consent response did not include a redirect URI.')
  }
  const redirectUri = readString((data as { redirect_uri?: unknown }).redirect_uri)
  if (!redirectUri) {
    throw new Error('OAuth consent response did not include a redirect URI.')
  }
  return redirectUri
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function readErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return readString((error as { message?: unknown }).message)
  }
  return null
}

function defaultExternalOAuthRedirect(href: string) {
  // eslint-disable-next-line frontend-router/no-browser-router-state -- OAuth consent returns to an external OAuth client callback URL.
  globalThis.window.location.assign(href)
}
