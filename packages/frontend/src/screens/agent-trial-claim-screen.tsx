import * as React from 'react'
import {
  BuildingsIcon,
  CheckCircleIcon,
  EnvelopeSimpleIcon,
  RobotIcon,
  ShieldCheckIcon,
  XCircleIcon
} from '@phosphor-icons/react'
import { agentMailCapabilityCatalog } from '@main/db/agent-mail-permission-schema'

import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Spinner } from '../components/ui/spinner'
import { AuthScreenFrame } from './auth-view-screen'
import type { AgentMailTrialClaim, AgentMailTrialClaimTarget } from '../lib/agent-access-rpc'
import type { AgentMailCapability } from '@main/db/agent-mail-permission-schema'

type AgentTrialClaimPhase = 'idle' | 'approving' | 'denying' | 'approved' | 'denied'
type AgentTrialClaimStatus = 'approved' | 'denied' | 'expired' | 'pending'

export interface AgentTrialClaimScreenProps {
  claim: AgentMailTrialClaim | null
  loadError?: string | null
  loading?: boolean
  onApprove: (input: { targetOrganizationId: string }) => Promise<void>
  onDeny: () => Promise<void>
  userEmail?: string | null
  userName?: string | null
}

export function AgentTrialClaimScreen({
  claim,
  loadError = null,
  loading = false,
  onApprove,
  onDeny,
  userEmail,
  userName
}: AgentTrialClaimScreenProps) {
  const [phase, setPhase] = React.useState<AgentTrialClaimPhase>('idle')
  const [actionError, setActionError] = React.useState<string | null>(null)
  const targetOptions = React.useMemo(() => normalizeTargetOrganizations(claim), [claim])
  const defaultTargetOrganizationId = claim?.organization_id ?? targetOptions[0]?.id ?? null
  const [targetOrganizationId, setTargetOrganizationId] = React.useState('')
  const claimStatus = normalizeClaimStatus(claim?.claim.status)
  const pendingClaim = claimStatus === 'pending'
  const busy = phase === 'approving' || phase === 'denying'
  const finalPhase = phase === 'approved' || phase === 'denied' || Boolean(claim && !pendingClaim)
  const accountLabel = userEmail ?? userName ?? 'this account'
  const selectedTargetOrganizationId = targetOptions.some((option) => option.id === targetOrganizationId)
    ? targetOrganizationId
    : defaultTargetOrganizationId
  const selectedTargetOrganization =
    targetOptions.find((option) => option.id === selectedTargetOrganizationId) ?? null
  const postClaimCapabilities = claim?.post_claim_capabilities?.length
    ? claim.post_claim_capabilities
    : (claim?.capabilities ?? [])

  const approve = React.useCallback(() => {
    if (!claim) {
      setActionError('Trial claim is not loaded.')
      return
    }
    if (!pendingClaim) {
      setActionError(trialClaimClosedMessage(claimStatus))
      return
    }
    if (!selectedTargetOrganizationId) {
      setActionError('Choose a target organization.')
      return
    }

    setActionError(null)
    setPhase('approving')
    Promise.resolve(onApprove({ targetOrganizationId: selectedTargetOrganizationId }))
      .then(() => {
        setPhase('approved')
      })
      .catch((caught: unknown) => {
        setPhase('idle')
        setActionError(caught instanceof Error ? caught.message : 'Agent claim approval failed.')
      })
  }, [claim, claimStatus, onApprove, pendingClaim, selectedTargetOrganizationId])

  const deny = React.useCallback(() => {
    if (!claim) {
      setActionError('Trial claim is not loaded.')
      return
    }
    if (!pendingClaim) {
      setActionError(trialClaimClosedMessage(claimStatus))
      return
    }

    setActionError(null)
    setPhase('denying')
    Promise.resolve(onDeny())
      .then(() => {
        setPhase('denied')
      })
      .catch((caught: unknown) => {
        setPhase('idle')
        setActionError(caught instanceof Error ? caught.message : 'Agent claim denial failed.')
      })
  }, [claim, claimStatus, onDeny, pendingClaim])

  return (
    <AuthScreenFrame>
      <section
        className='border-border bg-card text-card-foreground w-full max-w-lg rounded-lg border p-6 shadow-sm'
      >
        <div className='mb-6 flex items-start gap-3'>
          <div
            className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center
              rounded-md'
          >
            <RobotIcon className='size-5' />
          </div>
          <div>
            <h1 className='text-xl font-semibold'>Claim trial agent</h1>
            <p className='text-muted-foreground mt-1 text-sm'>
              Review the autonomous agent and attach it to {accountLabel}.
            </p>
          </div>
        </div>

        <div className='space-y-4'>
          {loading ? (
            <div className='bg-muted/50 flex items-center gap-3 rounded-md border p-4 text-sm'>
              <Spinner />
              Loading trial claim
            </div>
          ) : null}

          {claim ? (
            <>
              <div className='bg-muted/50 rounded-md border p-4'>
                <div className='flex items-start gap-3'>
                  <RobotIcon className='text-muted-foreground mt-0.5 size-5 shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-muted-foreground text-xs font-medium uppercase'>Agent</p>
                    <p className='mt-1 truncate text-sm font-medium'>{claim.agent.name}</p>
                    <div className='mt-2 flex flex-wrap gap-2'>
                      <Badge variant='outline'>{claim.agent.status}</Badge>
                      <Badge variant='secondary'>{claim.agent.id}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className='bg-muted/50 rounded-md border p-4'>
                <div className='flex items-start gap-3'>
                  <EnvelopeSimpleIcon className='text-muted-foreground mt-0.5 size-5 shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-muted-foreground text-xs font-medium uppercase'>Mailbox</p>
                    <p className='mt-1 truncate font-mono text-sm'>{claim.mailbox.address}</p>
                    <p className='text-muted-foreground mt-2 text-xs'>
                      Claim expires {formatClaimDateTime(claim.claim.expires_at)}
                    </p>
                    <Badge
                      className='mt-2'
                      variant={pendingClaim ? 'outline' : 'secondary'}
                    >
                      {formatClaimStatus(claimStatus)}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className='bg-muted/50 rounded-md border p-4'>
                <div className='flex items-start gap-3'>
                  <ShieldCheckIcon className='text-muted-foreground mt-0.5 size-5 shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-muted-foreground text-xs font-medium uppercase'>Capabilities</p>
                    <div className='mt-3 space-y-3'>
                      <CapabilityBadgeGroup
                        capabilities={claim.capabilities}
                        label='Trial'
                      />
                      <CapabilityBadgeGroup
                        capabilities={postClaimCapabilities}
                        label='After claim'
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className='bg-muted/50 rounded-md border p-4'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='min-w-0'>
                    <p className='text-muted-foreground text-xs font-medium uppercase'>Before claim</p>
                    <p className='mt-1 text-sm font-medium'>Independent trial agent</p>
                    <p className='text-muted-foreground mt-1 truncate text-xs'>
                      {claim.capabilities.length} trial capabilities on {claim.mailbox.address}
                    </p>
                  </div>
                  <div className='min-w-0'>
                    <p className='text-muted-foreground text-xs font-medium uppercase'>After claim</p>
                    <p className='mt-1 truncate text-sm font-medium'>
                      {selectedTargetOrganization?.name ?? 'Selected organization'}
                    </p>
                    <p className='text-muted-foreground mt-1 truncate text-xs'>
                      {postClaimCapabilities.length} requested capabilities on {claim.mailbox.address}
                    </p>
                  </div>
                </div>
              </div>

              <div className='bg-muted/50 rounded-md border p-4'>
                <div className='flex items-start gap-3'>
                  <BuildingsIcon className='text-muted-foreground mt-0.5 size-5 shrink-0' />
                  <div className='min-w-0 flex-1 space-y-2'>
                    <Label
                      className='text-muted-foreground text-xs font-medium uppercase'
                      htmlFor='agent-trial-claim-organization'
                    >
                      Target organization
                    </Label>
                    <Select
                      disabled={busy || finalPhase || targetOptions.length <= 1}
                      onValueChange={setTargetOrganizationId}
                      value={selectedTargetOrganizationId ?? undefined}
                    >
                      <SelectTrigger
                        aria-label='Target organization'
                        className='w-full'
                        id='agent-trial-claim-organization'
                      >
                        <SelectValue placeholder='Choose organization' />
                      </SelectTrigger>
                      <SelectContent>
                        {targetOptions.map((organization) => (
                          <SelectItem
                            key={organization.id}
                            value={organization.id}
                          >
                            <span className='truncate'>{organization.name}</span>
                            {organization.slug ? (
                              <span className='text-muted-foreground ml-2 truncate text-xs'>
                                {organization.slug}
                              </span>
                            ) : null}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {phase === 'approved' ? (
            <Alert>
              <CheckCircleIcon />
              <AlertDescription>Agent claimed. Return to the agent client.</AlertDescription>
            </Alert>
          ) : null}

          {phase === 'denied' ? (
            <Alert>
              <XCircleIcon />
              <AlertDescription>Agent claim denied.</AlertDescription>
            </Alert>
          ) : null}

          {claim && phase === 'idle' && !pendingClaim ? (
            <Alert variant={claimStatus === 'expired' ? 'destructive' : 'default'}>
              {claimStatus === 'approved' ? <CheckCircleIcon /> : <XCircleIcon />}
              <AlertDescription>{trialClaimClosedMessage(claimStatus)}</AlertDescription>
            </Alert>
          ) : null}

          {loadError ? (
            <Alert variant='destructive'>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}

          {actionError ? (
            <Alert variant='destructive'>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}

          <div className='grid grid-cols-2 gap-3'>
            <Button
              disabled={busy || finalPhase || !claim || !pendingClaim}
              onClick={deny}
              type='button'
              variant='outline'
            >
              {phase === 'denying' ? <Spinner /> : <XCircleIcon />}
              Deny
            </Button>
            <Button
              disabled={busy || finalPhase || !claim || !pendingClaim || !selectedTargetOrganizationId}
              onClick={approve}
              type='button'
            >
              {phase === 'approving' ? <Spinner /> : <CheckCircleIcon />}
              Claim agent
            </Button>
          </div>
        </div>
      </section>
    </AuthScreenFrame>
  )
}

function CapabilityBadgeGroup({
  capabilities,
  label
}: {
  capabilities: ReadonlyArray<AgentMailCapability>
  label: string
}) {
  return (
    <div>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <div className='mt-1 flex flex-wrap gap-2'>
        {capabilities.map((capability) => (
          <Badge
            key={`${label}-${capability}`}
            variant='outline'
          >
            {formatCapability(capability)}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function normalizeTargetOrganizations(claim: AgentMailTrialClaim | null) {
  const options = new Map<string, AgentMailTrialClaimTarget>()

  for (const organization of claim?.target_organizations ?? []) {
    const id = organization.id.trim()
    if (!id) {
      continue
    }
    options.set(id, {
      id,
      name: organization.name.trim() || id,
      slug: organization.slug?.trim() || null
    })
  }

  if (claim?.organization_id && !options.has(claim.organization_id)) {
    options.set(claim.organization_id, {
      id: claim.organization_id,
      name: 'Active organization',
      slug: null
    })
  }

  return [...options.values()]
}

function formatCapability(value: string): string {
  const capability = agentMailCapabilityCatalog.capabilityOptions.find(
    (option) => option.value === (value as AgentMailCapability)
  )
  return capability?.label ?? value
}

function normalizeClaimStatus(value: string | null | undefined): AgentTrialClaimStatus {
  return value === 'approved' || value === 'denied' || value === 'expired' || value === 'pending'
    ? value
    : 'pending'
}

function formatClaimStatus(status: AgentTrialClaimStatus): string {
  return status.slice(0, 1).toUpperCase() + status.slice(1)
}

function trialClaimClosedMessage(status: AgentTrialClaimStatus): string {
  if (status === 'approved') {
    return 'Agent claimed. Return to the agent client.'
  }
  if (status === 'denied') {
    return 'Agent claim denied.'
  }
  if (status === 'expired') {
    return 'Trial claim has expired.'
  }
  return 'Trial claim is still pending.'
}

function formatClaimDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
