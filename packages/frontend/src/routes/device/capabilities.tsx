/* eslint-disable react-refresh/only-export-components */
import { parseUUIDv7 } from '@main/common'
import { agentMailCapabilityCatalog } from '@main/db/agent-mail-permission-schema'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import {
  AgentAccessRPCError,
  decideAgentAccessApproval,
  fetchAgentAccessApprovalPreview,
  fetchAgentAccessView
} from '../../lib/agent-access-rpc'
import { normalizeDeviceUserCode } from '../../lib/device-auth-api'
import { authReactClient } from '../../lib/auth-react-client'
import { createSignInRedirectHref, throwRouteRedirect } from '../../lib/route-redirect'
import { createWebAuthnAssertionResponse } from '../../lib/webauthn-assertion'
import { resolveFrontendServerRouteContext } from '../../server-route-context'
import { DeviceCodeApprovalScreen } from '../../screens/device-authorization-screen'
import { SITE_STRINGS, formatSiteTitle } from '../../strings'
import type { AgentAccessApproval, AgentAccessView } from '@main/backend'
import type { AgentMailCapability, AgentMailCapabilityCatalog } from '@main/db/agent-mail-permission-schema'
import type { DeviceRouteState } from '@main/backend/routes/webapp'

export interface AgentCapabilityApprovalSearch {
  agent_id?: string
  approval_id?: string
  code?: string
  user_code?: string
}

function validateAgentCapabilityApprovalSearch(
  search: Record<string, unknown>
): AgentCapabilityApprovalSearch {
  const userCode =
    typeof search.code === 'string' && search.code.trim() !== ''
      ? normalizeDeviceUserCode(search.code)
      : typeof search.user_code === 'string' && search.user_code.trim() !== ''
        ? normalizeDeviceUserCode(search.user_code)
        : undefined

  return {
    agent_id:
      typeof search.agent_id === 'string' && search.agent_id.trim() !== ''
        ? search.agent_id.trim()
        : undefined,
    approval_id:
      typeof search.approval_id === 'string' && search.approval_id.trim() !== ''
        ? search.approval_id.trim()
        : undefined,
    code: userCode,
    user_code: userCode
  }
}

export const Route = createFileRoute('/device/capabilities')({
  validateSearch: validateAgentCapabilityApprovalSearch,
  loader: async (loaderInput) => {
    const serverRouteContext = resolveFrontendServerRouteContext(loaderInput)

    if (serverRouteContext?.serverRouteHandlers.loadDeviceRoute) {
      const routeState = await serverRouteContext.serverRouteHandlers.loadDeviceRoute(
        serverRouteContext.request
      )

      if (routeState.shouldRedirectToSetup) {
        throwRouteRedirect(routeState.redirectTo)
      }

      if (routeState.shouldRedirectToSignIn) {
        throwRouteRedirect(createSignInRedirectHref(routeState.redirectTo))
      }

      return routeState
    }

    const auth = await authReactClient.getSession()
    const redirectTo = loaderInput.location.href

    if (!auth.data?.user) {
      throwRouteRedirect(createSignInRedirectHref(redirectTo))
    }

    return {
      flash: null,
      redirectTo,
      setCookieHeaders: [],
      shouldRedirectToSignIn: false,
      shouldRedirectToSetup: false,
      user: {
        ...auth.data.user,
        id: parseUUIDv7(auth.data.user.id) as NonNullable<DeviceRouteState['user']>['id']
      },
      userCode: validateAgentCapabilityApprovalSearch(loaderInput.location.search).code ?? null
    } satisfies DeviceRouteState
  },
  head: () => ({
    meta: [
      {
        title: formatSiteTitle('Approve Agent')
      },
      {
        name: 'description',
        content: `Approve an agent capability request for your ${SITE_STRINGS.BRAND_NAME} account.`
      }
    ]
  }),
  component: AgentCapabilityApprovalRouteScreen
})

function AgentCapabilityApprovalRouteScreen() {
  const routeState = Route.useLoaderData()
  const search = Route.useSearch()
  const agentId = search.agent_id
  const approvalId = search.approval_id
  const userCode = routeState.userCode ?? search.code ?? search.user_code ?? null
  const user = routeState.user
  const hasApprovalLocator = Boolean(agentId || approvalId || userCode)
  const initialError =
    hasApprovalLocator ? null : 'Agent approval link is missing its approval code or identifier.'
  const approvalQuery = useQuery(agentCapabilityApprovalQueryOptions({ agentId, approvalId, userCode }))
  const approval = approvalQuery.data?.approval ?? null
  const approvalLookupEnabled = hasApprovalLocator
  const approvalLookupMessage =
    approvalLookupEnabled && approvalQuery.isError
      ? 'Agent authorization request could not be loaded.'
      : approvalLookupEnabled && approvalQuery.isSuccess && !approval
        ? 'Agent authorization request was not found.'
        : approvalLookupEnabled && approvalQuery.isLoading
          ? 'Loading agent authorization request.'
          : null
  const decisionState = getApprovalDecisionState(approval)
  const requiresUserCode = Boolean(userCode) || (!agentId && !approvalId)

  return (
    <DeviceCodeApprovalScreen
      approvedMessage='Agent authorization was approved. Return to the agent client.'
      codeLabel='Approval code'
      decisionDisabled={Boolean(initialError || approvalLookupMessage) || decisionState.disabled}
      decisionDisabledMessage={approvalLookupMessage ?? decisionState.message}
      deniedMessage='The agent authorization request was denied.'
      description={
        approval ? (
          <AgentCapabilityApprovalDescription
            approval={approval}
            capabilityCatalog={approvalQuery.data?.capabilityCatalog ?? agentMailCapabilityCatalog}
          />
        ) : undefined
      }
      initialError={initialError}
      requiresUserCode={requiresUserCode}
      title='Approve agent capabilities'
      userCode={userCode}
      userEmail={user?.email}
      userName={user?.name}
      onApprove={async (code) => {
        await decideAgentAccessApprovalWithWebAuthn({
          action: 'approve',
          agentId,
          approvalId,
          ...(requiresUserCode ? { userCode: code } : {})
        })
      }}
      onDeny={async (code) => {
        await decideAgentAccessApproval({
          action: 'deny',
          agentId,
          approvalId,
          reason: 'User denied the agent authorization request.',
          ...(requiresUserCode ? { userCode: code } : {})
        })
      }}
    />
  )
}

export async function decideAgentAccessApprovalWithWebAuthn(
  input: Parameters<typeof decideAgentAccessApproval>[0]
) {
  try {
    return await decideAgentAccessApproval(input)
  } catch (caught) {
    if (
      caught instanceof AgentAccessRPCError &&
      caught.code === 'webauthn_required' &&
      caught.webauthnOptions
    ) {
      const webauthnResponse = await createWebAuthnAssertionResponse(caught.webauthnOptions)
      return decideAgentAccessApproval({
        ...input,
        webauthnResponse
      })
    }
    throw caught
  }
}

function agentCapabilityApprovalQueryOptions({
  agentId,
  approvalId,
  userCode
}: {
  agentId: string | undefined
  approvalId: string | undefined
  userCode: string | null
}) {
  return queryOptions({
    enabled: Boolean(agentId || approvalId || userCode),
    queryFn: () => loadAgentCapabilityApproval({ agentId, approvalId, userCode }),
    queryKey: ['agent-access', 'device-approval', { agentId, approvalId, userCode }] as const
  })
}

export async function loadAgentCapabilityApproval({
  agentId,
  approvalId,
  userCode
}: {
  agentId: string | undefined
  approvalId: string | undefined
  userCode: string | null
}) {
  if (userCode) {
    const preview = await fetchAgentAccessApprovalPreview({
      ...(agentId ? { agentId } : {}),
      ...(approvalId ? { approvalId } : {}),
      userCode
    })
    return {
      approval: preview.approval,
      capabilityCatalog: preview.capabilityCatalog
    }
  }

  const view = await fetchAgentAccessView()
  return {
    approval: findApprovalForRoute(view, { agentId, approvalId }),
    capabilityCatalog: view.capabilityCatalog
  }
}

function findApprovalForRoute(
  view: AgentAccessView | undefined,
  {
    agentId,
    approvalId
  }: {
    agentId: string | undefined
    approvalId: string | undefined
  }
) {
  if (!view) {
    return null
  }

  if (approvalId) {
    const approval = view.approvals.find((candidate: AgentAccessApproval) => candidate.id === approvalId)
    if (approval) {
      return approval
    }
  }

  if (agentId) {
    const approval = view.approvals.find((candidate: AgentAccessApproval) => candidate.agentId === agentId)
    if (approval) {
      return approval
    }
  }

  return view.approvals.length === 1 ? view.approvals[0] : null
}

function getApprovalDecisionState(approval: AgentAccessApproval | null): {
  disabled: boolean
  message?: string
} {
  if (!approval || approval.status === 'pending') {
    return { disabled: false }
  }

  if (approval.status === 'approved') {
    return {
      disabled: true,
      message: 'This agent authorization request was already approved.'
    }
  }

  if (approval.status === 'denied') {
    return {
      disabled: true,
      message: 'This agent authorization request was denied.'
    }
  }

  if (approval.status === 'expired') {
    return {
      disabled: true,
      message: 'This agent authorization request expired.'
    }
  }

  return {
    disabled: true,
    message: 'This agent authorization request is not pending.'
  }
}

function AgentCapabilityApprovalDescription({
  approval,
  capabilityCatalog
}: {
  approval: AgentAccessApproval
  capabilityCatalog: AgentMailCapabilityCatalog
}) {
  return (
    <span className='block space-y-2'>
      <span className='block'>
        {approval.bindingMessage ?? 'Approve this pending agent capability request.'}
      </span>
      <span className='block'>
        {approval.capabilityRequests
          .map((request) => formatApprovalCapabilityRequest(request, capabilityCatalog))
          .join(', ')}
      </span>
      {approval.capabilityRequests.some(
        (request: AgentAccessApproval['capabilityRequests'][number]) => request.reason
      ) ? (
        <span className='block'>
          {approval.capabilityRequests
            .map((request: AgentAccessApproval['capabilityRequests'][number]) => request.reason)
            .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0)
            .join(' · ')}
        </span>
      ) : null}
      {approval.capabilityRequests.some(
        (request: AgentAccessApproval['capabilityRequests'][number]) =>
          request.approvalStrength === 'webauthn'
      ) ? (
        <span className='block'>Passkey verification is required for this approval.</span>
      ) : null}
      <span className='block'>Expires {formatApprovalDateTime(approval.expiresAt)}</span>
    </span>
  )
}

function formatApprovalCapabilityRequest(
  request: AgentAccessApproval['capabilityRequests'][number],
  catalog: AgentMailCapabilityCatalog
): string {
  const constraints = formatApprovalConstraints(request.constraints)
  const capability = formatApprovalCapability(request.capability, catalog)
  return constraints ? `${capability} (${constraints})` : capability
}

function formatApprovalCapability(value: string, catalog: AgentMailCapabilityCatalog): string {
  const capability = catalog.capabilityOptions.find(
    (option) => option.value === (value as AgentMailCapability)
  )
  return capability?.label ?? value
}

export function formatApprovalConstraints(constraints: Record<string, unknown> | null): string {
  if (!constraints) {
    return ''
  }

  const mailboxAddress = typeof constraints.mailboxAddress === 'string' ? constraints.mailboxAddress : null
  const organizationId = typeof constraints.organizationId === 'string' ? constraints.organizationId : null
  const details = approvalConstraintDetailItems(constraints)
  if (mailboxAddress) {
    const scopedMailbox = organizationId ? `${mailboxAddress} · ${organizationId}` : mailboxAddress
    return details.length ? `${scopedMailbox} · ${formatApprovalConstraintDetails(details)}` : scopedMailbox
  }
  if (organizationId) {
    const organization = `Organization ${organizationId}`
    return details.length ? `${organization} · ${formatApprovalConstraintDetails(details)}` : organization
  }
  return details.length ? formatApprovalConstraintDetails(details) : ''
}

function formatApprovalConstraintDetails(details: ReadonlyArray<string>): string {
  return details.length > 2 ? `${details.slice(0, 2).join(' · ')} · ${details.length - 2} more` : details.join(' · ')
}

function approvalConstraintDetailItems(constraints: Record<string, unknown>): string[] {
  return Object.entries(constraints)
    .filter(([key]) => key !== 'mailboxAddress' && key !== 'organizationId')
    .map(([key, value]) => `${key}: ${formatApprovalConstraintValue(value)}`)
    .sort()
}

function formatApprovalConstraintValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(formatApprovalConstraintValue).join(', ')
  }
  if (!value || typeof value !== 'object') {
    return 'null'
  }

  return JSON.stringify(value)
}

function formatApprovalDateTime(value: string | null) {
  if (!value) {
    return 'never'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
