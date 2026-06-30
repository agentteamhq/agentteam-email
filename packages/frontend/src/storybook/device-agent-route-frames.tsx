import * as React from 'react'
import { agentMailCapabilityCatalog } from '@main/db/agent-mail-permission-schema'

import { formatApprovalConstraints } from '../routes/device/capabilities'
import { AgentTrialClaimScreen } from '../screens/agent-trial-claim-screen'
import {
  DeviceCodeApprovalScreen,
  DeviceCodeVerificationScreen
} from '../screens/device-authorization-screen'
import { authenticatedSettingsRouteState } from './screen-fixtures'
import type { AgentAccessApproval, AgentAccessApprovalPreview, AgentAccessView } from '@main/backend'
import type { AgentMailCapability, AgentMailCapabilityCatalog } from '@main/db/agent-mail-permission-schema'
import type { DeviceRouteState } from '@main/backend/routes/webapp'
import type {
  AgentMailTrialClaim,
  decideAgentAccessApproval,
  decideAgentMailTrialClaim
} from '../lib/agent-access-rpc'
import type { approveDeviceUserCode, denyDeviceUserCode, verifyDeviceUserCode } from '../lib/device-auth-api'
import type { AgentClaimRouteState } from '../routes/agent/claim.$token'

export interface DeviceVerificationRouteStoryFrameProps {
  loadDeviceRouteResult?: DeviceRouteState
  routeSearch?: {
    user_code?: string
  }
  verifyDeviceUserCode?: typeof verifyDeviceUserCode
}

export interface DeviceApprovalRouteStoryFrameProps {
  approveDeviceUserCode?: typeof approveDeviceUserCode
  denyDeviceUserCode?: typeof denyDeviceUserCode
  loadDeviceRouteResult?: DeviceRouteState
  routeSearch?: {
    user_code?: string
  }
}

export interface AgentCapabilityApprovalRouteStoryFrameProps {
  agentAccessView?: AgentAccessView | null
  agentAccessViewError?: string | null
  agentAccessViewLoading?: boolean
  approvalPreview?: AgentAccessApprovalPreview | null
  approvalPreviewError?: string | null
  approvalPreviewLoading?: boolean
  decideAgentAccessApproval?: typeof decideAgentAccessApproval
  loadDeviceRouteResult?: DeviceRouteState
  routeSearch?: {
    agent_id?: string
    approval_id?: string
    code?: string
    user_code?: string
  }
}

export interface AgentTrialClaimRouteStoryFrameProps {
  decideAgentMailTrialClaim?: typeof decideAgentMailTrialClaim
  fetchAgentMailTrialClaimError?: string | null
  fetchAgentMailTrialClaimLoading?: boolean
  fetchAgentMailTrialClaimResult?: AgentMailTrialClaim | null
  routeState?: AgentClaimRouteState
  token: string
}

export type DeviceAuthorizationApprovalRouteStoryFrameProps =
  | ({
      route: 'device-approval'
    } & DeviceApprovalRouteStoryFrameProps)
  | ({
      route: 'agent-capabilities'
    } & AgentCapabilityApprovalRouteStoryFrameProps)

export function DeviceVerificationRouteStoryFrame({
  loadDeviceRouteResult,
  routeSearch,
  verifyDeviceUserCode
}: DeviceVerificationRouteStoryFrameProps) {
  const routeState = resolveDeviceRouteState({
    loadDeviceRouteResult,
    path: '/device/',
    userCode: normalizeOptionalDeviceUserCode(routeSearch?.user_code)
  })
  const initialUserCode = routeState.userCode ?? normalizeOptionalDeviceUserCode(routeSearch?.user_code)

  return (
    <DeviceCodeVerificationScreen
      initialUserCode={initialUserCode}
      onVerify={async (userCode) => {
        const result = verifyDeviceUserCode
          ? await verifyDeviceUserCode(userCode)
          : {
              status: 'pending',
              user_code: userCode
            }

        if (result.status !== 'pending') {
          throw new Error('This device code has already been processed.')
        }
      }}
    />
  )
}

export function DeviceAuthorizationApprovalRouteStoryFrame(
  props: DeviceAuthorizationApprovalRouteStoryFrameProps
) {
  if (props.route === 'agent-capabilities') {
    const { route: _route, ...frameProps } = props
    return <AgentCapabilityApprovalRouteStoryFrame {...frameProps} />
  }

  const { route: _route, ...frameProps } = props
  return <DeviceApprovalRouteStoryFrame {...frameProps} />
}

export function DeviceApprovalRouteStoryFrame({
  approveDeviceUserCode,
  denyDeviceUserCode,
  loadDeviceRouteResult,
  routeSearch
}: DeviceApprovalRouteStoryFrameProps) {
  const routeSearchUserCode = normalizeOptionalDeviceUserCode(routeSearch?.user_code)
  const routeState = resolveDeviceRouteState({
    loadDeviceRouteResult,
    path: '/device/approve/',
    userCode: routeSearchUserCode
  })
  const userCode = routeState.userCode ?? routeSearchUserCode

  return (
    <DeviceCodeApprovalScreen
      userCode={userCode}
      userEmail={routeState.user?.email}
      userName={routeState.user?.name}
      onApprove={async (code) => {
        await approveDeviceUserCode?.(code)
      }}
      onDeny={async (code) => {
        await denyDeviceUserCode?.(code)
      }}
    />
  )
}

export function AgentCapabilityApprovalRouteStoryFrame({
  agentAccessView,
  agentAccessViewError,
  agentAccessViewLoading = false,
  approvalPreview,
  approvalPreviewError,
  approvalPreviewLoading = false,
  decideAgentAccessApproval: decideApproval,
  loadDeviceRouteResult,
  routeSearch
}: AgentCapabilityApprovalRouteStoryFrameProps) {
  const validatedSearch = validateAgentCapabilityApprovalSearch(routeSearch)
  const routeState = resolveDeviceRouteState({
    loadDeviceRouteResult,
    path: '/device/capabilities/',
    userCode: validatedSearch.code ?? null
  })
  const agentId = validatedSearch.agent_id
  const approvalId = validatedSearch.approval_id
  const userCode = routeState.userCode ?? validatedSearch.code ?? validatedSearch.user_code ?? null
  const hasApprovalLocator = Boolean(agentId || approvalId || userCode)
  const initialError = hasApprovalLocator
    ? null
    : 'Agent approval link is missing its approval code or identifier.'
  const approvalLookup = resolveAgentCapabilityApprovalLookup({
    agentAccessView,
    agentAccessViewError,
    agentAccessViewLoading,
    approvalId,
    approvalPreview,
    approvalPreviewError,
    approvalPreviewLoading,
    agentId,
    enabled: hasApprovalLocator,
    userCode
  })
  const decisionState = getApprovalDecisionState(approvalLookup.approval)
  const requiresUserCode = Boolean(userCode) || (!agentId && !approvalId)
  const decisionDisabled = Boolean(initialError || approvalLookup.message) || decisionState.disabled

  return (
    <DeviceCodeApprovalScreen
      approvedMessage='Agent authorization was approved. Return to the agent client.'
      codeLabel='Approval code'
      decisionDisabled={decisionDisabled}
      decisionDisabledMessage={approvalLookup.message ?? decisionState.message}
      deniedMessage='The agent authorization request was denied.'
      description={
        approvalLookup.approval ? (
          <AgentCapabilityApprovalDescription
            approval={approvalLookup.approval}
            capabilityCatalog={approvalLookup.capabilityCatalog}
          />
        ) : undefined
      }
      initialError={initialError}
      requiresUserCode={requiresUserCode}
      title='Approve agent capabilities'
      userCode={userCode}
      userEmail={routeState.user?.email}
      userName={routeState.user?.name}
      onApprove={async (code) => {
        await decideApproval?.({
          action: 'approve',
          ...(agentId ? { agentId } : {}),
          ...(approvalId ? { approvalId } : {}),
          ...(requiresUserCode ? { userCode: code } : {})
        })
      }}
      onDeny={async (code) => {
        await decideApproval?.({
          action: 'deny',
          ...(agentId ? { agentId } : {}),
          ...(approvalId ? { approvalId } : {}),
          reason: 'User denied the agent authorization request.',
          ...(requiresUserCode ? { userCode: code } : {})
        })
      }}
    />
  )
}

export function AgentTrialClaimRouteStoryFrame({
  decideAgentMailTrialClaim: decideTrialClaim,
  fetchAgentMailTrialClaimError = null,
  fetchAgentMailTrialClaimLoading = false,
  fetchAgentMailTrialClaimResult,
  routeState = defaultAgentClaimRouteState,
  token
}: AgentTrialClaimRouteStoryFrameProps) {
  const claim = fetchAgentMailTrialClaimResult
  const frameKey = `${token}:${claim?.trial_id ?? 'no-claim'}:${claim?.claim.status ?? 'none'}`

  return (
    <AgentTrialClaimRouteStoryFrameState
      key={frameKey}
      claim={claim ?? null}
      decideAgentMailTrialClaim={decideTrialClaim}
      loadError={fetchAgentMailTrialClaimError}
      loading={fetchAgentMailTrialClaimLoading}
      routeState={routeState}
      token={token}
    />
  )
}

function AgentTrialClaimRouteStoryFrameState({
  claim,
  decideAgentMailTrialClaim: decideTrialClaim,
  loadError,
  loading,
  routeState,
  token
}: AgentTrialClaimRouteStoryFrameStateProps) {
  const [currentClaim, setCurrentClaim] = React.useState(claim ?? null)

  return (
    <AgentTrialClaimScreen
      key={currentClaim?.trial_id ?? token}
      claim={currentClaim}
      loadError={loadError}
      loading={loading}
      userEmail={routeState.user?.email}
      userName={routeState.user?.name}
      onApprove={async ({ targetOrganizationId }) => {
        const result = await decideTrialClaim?.({
          action: 'approve',
          targetOrganizationId,
          token
        })

        if (result?.view) {
          setCurrentClaim(result.view)
        }
      }}
      onDeny={async () => {
        const result = await decideTrialClaim?.({
          action: 'deny',
          token
        })

        if (result?.view) {
          setCurrentClaim(result.view)
        }
      }}
    />
  )
}

type AgentTrialClaimRouteStoryFrameStateProps = Omit<
  AgentTrialClaimRouteStoryFrameProps,
  | 'fetchAgentMailTrialClaimError'
  | 'fetchAgentMailTrialClaimLoading'
  | 'fetchAgentMailTrialClaimResult'
  | 'routeState'
> & {
  claim: AgentMailTrialClaim | null
  loadError: string | null
  loading: boolean
  routeState: AgentClaimRouteState
}

function resolveDeviceRouteState({
  loadDeviceRouteResult,
  path,
  userCode
}: {
  loadDeviceRouteResult: DeviceRouteState | undefined
  path: string
  userCode: string | null
}): DeviceRouteState {
  return (
    loadDeviceRouteResult ?? {
      ...authenticatedSettingsRouteState,
      redirectTo: path,
      userCode
    }
  )
}

function normalizeOptionalDeviceUserCode(value: string | undefined): string | null {
  const normalized = value?.replaceAll('-', '').trim().toUpperCase() ?? ''
  return normalized === '' ? null : normalized
}

function validateAgentCapabilityApprovalSearch(
  search: AgentCapabilityApprovalRouteStoryFrameProps['routeSearch']
) {
  const userCode =
    typeof search?.code === 'string' && search.code.trim() !== ''
      ? normalizeOptionalDeviceUserCode(search.code)
      : typeof search?.user_code === 'string' && search.user_code.trim() !== ''
        ? normalizeOptionalDeviceUserCode(search.user_code)
        : undefined

  return {
    agent_id:
      typeof search?.agent_id === 'string' && search.agent_id.trim() !== ''
        ? search.agent_id.trim()
        : undefined,
    approval_id:
      typeof search?.approval_id === 'string' && search.approval_id.trim() !== ''
        ? search.approval_id.trim()
        : undefined,
    code: userCode,
    user_code: userCode
  }
}

function resolveAgentCapabilityApprovalLookup({
  agentAccessView,
  agentAccessViewError,
  agentAccessViewLoading,
  agentId,
  approvalId,
  approvalPreview,
  approvalPreviewError,
  approvalPreviewLoading,
  enabled,
  userCode
}: {
  agentAccessView: AgentAccessView | null | undefined
  agentAccessViewError: string | null | undefined
  agentAccessViewLoading: boolean
  agentId: string | undefined
  approvalId: string | undefined
  approvalPreview: AgentAccessApprovalPreview | null | undefined
  approvalPreviewError: string | null | undefined
  approvalPreviewLoading: boolean
  enabled: boolean
  userCode: string | null
}) {
  if (!enabled) {
    return {
      approval: null,
      capabilityCatalog: agentMailCapabilityCatalog,
      message: null
    }
  }

  if (userCode) {
    if (approvalPreviewError) {
      return {
        approval: null,
        capabilityCatalog: agentMailCapabilityCatalog,
        message: 'Agent authorization request could not be loaded.'
      }
    }
    if (approvalPreviewLoading) {
      return {
        approval: null,
        capabilityCatalog: agentMailCapabilityCatalog,
        message: 'Loading agent authorization request.'
      }
    }
    if (!approvalPreview?.approval) {
      return {
        approval: null,
        capabilityCatalog: agentMailCapabilityCatalog,
        message: 'Agent authorization request was not found.'
      }
    }
    return {
      approval: approvalPreview.approval,
      capabilityCatalog: approvalPreview.capabilityCatalog,
      message: null
    }
  }

  if (agentAccessViewError) {
    return {
      approval: null,
      capabilityCatalog: agentMailCapabilityCatalog,
      message: 'Agent authorization request could not be loaded.'
    }
  }
  if (agentAccessViewLoading) {
    return {
      approval: null,
      capabilityCatalog: agentMailCapabilityCatalog,
      message: 'Loading agent authorization request.'
    }
  }

  const approval = findApprovalForRoute(agentAccessView ?? undefined, { agentId, approvalId })
  return {
    approval,
    capabilityCatalog: agentAccessView?.capabilityCatalog ?? agentMailCapabilityCatalog,
    message: approval ? null : 'Agent authorization request was not found.'
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
    const approval = view.approvals.find((candidate) => candidate.id === approvalId)
    if (approval) {
      return approval
    }
  }

  if (agentId) {
    const approval = view.approvals.find((candidate) => candidate.agentId === agentId)
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
      {approval.capabilityRequests.some((request) => request.reason) ? (
        <span className='block'>
          {approval.capabilityRequests
            .map((request) => request.reason)
            .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0)
            .join(' \u00b7 ')}
        </span>
      ) : null}
      {approval.capabilityRequests.some((request) => request.approvalStrength === 'webauthn') ? (
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

function formatApprovalDateTime(value: string | null) {
  if (!value) {
    return 'never'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const defaultAgentClaimRouteState = {
  redirectTo: '/agent/claim/story-trial-token',
  user: {
    email: authenticatedSettingsRouteState.user?.email,
    name: authenticatedSettingsRouteState.user?.name
  }
} satisfies AgentClaimRouteState
