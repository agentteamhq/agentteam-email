import * as React from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'

import {
  connectPaperclipAgentAccess,
  decideAgentAccessApproval,
  fetchAgentAccessView,
  revokeAgentAccessAgent,
  revokeAgentAccessCapability
} from '../lib/agent-access-rpc'
import {
  connectCloudflareDomain,
  disconnectCloudflareConnection,
  fetchCloudflareAccounts,
  fetchCloudflareStatus,
  fetchCloudflareZones,
  finalizeCloudflareOAuth,
  provisionCloudflareConnection,
  startCloudflareOAuth
} from '../lib/cloudflare-rpc'
import {
  createMailboxAdminAccount,
  createMailboxAdminAgentEnrollment,
  createMailboxAdminGroup,
  disableMailboxAdminAccount,
  disableMailboxAdminGroup,
  fetchMailboxAdminNavigation,
  fetchMailboxAdminView,
  revokeMailboxAdminAgent,
  revokeMailboxAdminAgentEnrollment,
  updateMailboxAdminAccount,
  updateMailboxAdminAgent,
  updateMailboxAdminAgentMailboxGrants,
  updateMailboxAdminAgentSystemPermissions,
  updateMailboxAdminGroup,
  updateMailboxAdminPrincipalMailboxGrants,
  updateMailboxAdminPrincipalSystemPermissions
} from '../lib/mail-admin-rpc'
import {
  createMailFolder,
  deleteMailFolder,
  deleteMailMessage,
  fetchMailOriginalSource,
  fetchMailStatus,
  fetchMailWorkspace,
  moveMailMessage,
  renameMailFolder,
  saveMailDraft,
  sendMailDraft,
  sendMailMessage,
  updateMailMessage
} from '../lib/mail-rpc'
import { mailboxAddress, mailboxLocalPart } from '../lib/mail-addresses'
import { isMailboxAdminSectionId } from '../partials/authenticated/mailbox-admin-models'
import { cloudflareConnectionInputForSelectedDomain } from './dashboard-cloudflare-connection-input'
import { cloudflareOAuthCompletionPath } from './dashboard-cloudflare-oauth-routing'
import { FIRST_USE_SETUP_NAV_ITEM_ID, findSystemFolder } from './dashboard-mail-sidebar-view'
import { DashboardScreen } from './dashboard-screen'
import { toMailboxAdminView } from './dashboard-mailbox-admin-view'
import { invalidateMailboxAdminQueries } from './dashboard-mailbox-admin-query-cache'
import { mailboxAdminViewQueryForSection } from './dashboard-mailbox-admin-query'
import { deriveDashboardMailWorkspaceScreenModel } from './dashboard-mail-screen-model'
import type { MailWorkspaceQuery } from '../lib/mail-rpc'
import type { MailboxAdminViewQuery } from '../lib/mail-admin-rpc'
import type {
  AgentAccessGrant,
  AgentAccessView,
  AgentMailComposeInput,
  AgentMailMessageActionInput,
  AgentMailPublicStatus,
  AgentMailWebAccount,
  AgentMailWebFolder,
  AgentMailWebMessageDetail,
  AgentMailWebThreadMessage,
  AgentMailWebWorkspace,
  CloudflareAccountSummary,
  CloudflareOAuthReturnTarget,
  CloudflareStatusResult,
  CloudflareZoneSummary
} from '@main/backend'
import type {
  AuthenticatedComposeField,
  AuthenticatedComposeMode,
  AuthenticatedComposeView,
  AuthenticatedEmailAction,
  AuthenticatedEmailPreview,
  AuthenticatedMailActionDialogKind,
  AuthenticatedMailActionView,
  AuthenticatedMailFolderAction,
  AuthenticatedMailPageChange
} from '../partials/authenticated/authenticated-shell-models'
import type { DashboardSearch, SettingsRouteSearch } from '../lib/dashboard-search'
import type { DashboardScreenProps } from './dashboard-screen'
import type {
  MailboxAdminAccountInput,
  MailboxAdminAgentEnrollment,
  MailboxAdminAgentInput,
  MailboxAdminAgentMailboxGrantsInput,
  MailboxAdminAgentSystemPermissionsInput,
  MailboxAdminDialogState,
  MailboxAdminExternalPrincipal,
  MailboxAdminGroupInput,
  MailboxAdminPagination,
  MailboxAdminSectionId,
  MailboxAdminStatusFilter,
  MailboxAdminView
} from '../partials/authenticated/mailbox-admin-models'
import type {
  AgentAccessConnectionHandoff,
  AgentAccessSettingsState,
  DomainSettingsState
} from '../partials/authenticated/settings-dialog'

const AGENT_ACCESS_QUERY_KEY = ['agent-access', 'view'] as const
const MAIL_QUERY_LIMIT = 25
const MAILBOX_ADMIN_PAGE_SIZE = 25
function mailboxAdminPrincipalKey(principal: Pick<MailboxAdminExternalPrincipal, 'id' | 'kind'>) {
  return `${principal.kind}:${principal.id}`
}

function mailWorkspaceQueryOptions(
  routeSearch: DashboardSearch | undefined,
  enabled: boolean,
  mailWorkspaceLoader: MailWorkspaceLoader
) {
  const mailboxAdmin = routeSearch?.mailboxAdmin
  const input = {
    accountId: routeSearch?.accountId,
    cursor: mailboxAdmin ? undefined : routeSearch?.cursor,
    direction: mailboxAdmin ? undefined : routeSearch?.direction,
    folderId: mailboxAdmin ? undefined : routeSearch?.folderId,
    limit: MAIL_QUERY_LIMIT,
    messageId: mailboxAdmin ? undefined : routeSearch?.messageId,
    query: mailboxAdmin ? undefined : routeSearch?.mailQuery,
    unreadOnly: mailboxAdmin ? undefined : routeSearch?.unreadOnly
  } satisfies MailWorkspaceQuery

  return queryOptions({
    enabled,
    queryFn: () => mailWorkspaceLoader(input),
    queryKey: ['mail', 'workspace', input, mailWorkspaceLoader] as const
  })
}

type AgentAccessViewLoader = typeof fetchAgentAccessView
type MailWorkspaceLoader = typeof fetchMailWorkspace
type MailboxAdminNavigationLoader = typeof fetchMailboxAdminNavigation
type MailboxAdminViewLoader = typeof fetchMailboxAdminView

function mailboxAdminNavigationQueryOptions(mailboxAdminNavigationLoader: MailboxAdminNavigationLoader) {
  return queryOptions({
    queryFn: mailboxAdminNavigationLoader,
    queryKey: ['mail', 'admin', 'navigation', mailboxAdminNavigationLoader] as const
  })
}

function mailboxAdminQueryOptions(
  query: MailboxAdminViewQuery | undefined,
  mailboxAdminViewLoader: MailboxAdminViewLoader
) {
  return queryOptions({
    enabled: query !== undefined,
    queryFn: ({ queryKey }) => {
      const [, , nextQuery, nextMailboxAdminViewLoader] = queryKey

      if (!nextQuery) {
        throw new Error('Mailbox admin section is required.')
      }

      return nextMailboxAdminViewLoader(nextQuery)
    },
    queryKey: ['mail', 'admin', query, mailboxAdminViewLoader] as const
  })
}

function agentAccessQueryOptions(agentAccessViewLoader: AgentAccessViewLoader) {
  return queryOptions({
    queryFn: agentAccessViewLoader,
    queryKey: AGENT_ACCESS_QUERY_KEY
  })
}

function runAsync(promise: Promise<unknown>) {
  promise.catch(ignoreAsyncError)
}

function ignoreAsyncError() {}

function canEditAgentAccess(view: AgentAccessView | null | undefined) {
  const allowedActions = view?.allowedActions
  return Boolean(
    allowedActions?.connectPaperclip ||
    allowedActions?.denyApproval ||
    allowedActions?.reviewApproval ||
    allowedActions?.revokeAgent ||
    allowedActions?.revokeCapabilityGrant
  )
}

interface CloudflareOAuthCallbackState {
  intentPublicId: string
  oauthError?: string
}

type CloudflareGrantPublicId = CloudflareStatusResult['grants'][number]['publicId']

interface DomainSettingsControllerResult {
  dashboardOnboardingStartOAuth?: () => void
  settingsState: DomainSettingsState
}

interface FirstMailboxDraft {
  addressLocalPart: string
  displayName: string
  key: string
}

interface FirstMailboxErrorState {
  key: string
  message: string | null
}

function useAgentAccessController({
  agentAccessViewLoader,
  createdAgentEnrollment,
  onCopyEnrollmentCommand,
  paperclipConnectionHandoff
}: {
  agentAccessViewLoader: AgentAccessViewLoader
  createdAgentEnrollment: MailboxAdminAgentEnrollment | null
  onCopyEnrollmentCommand: (command: string) => void
  paperclipConnectionHandoff: AgentAccessConnectionHandoff | null
}): AgentAccessSettingsState {
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    data: agentAccessView,
    error: agentAccessError,
    isError: isAgentAccessError,
    isFetching: isAgentAccessFetching,
    refetch: refetchAgentAccess
  } = useQuery(agentAccessQueryOptions(agentAccessViewLoader))
  const [message, setMessage] = React.useState<string | null>(null)
  const [mutationBusy, setMutationBusy] = React.useState(false)
  const agentAccessAllowedActions = agentAccessView?.allowedActions

  const runMutation = React.useCallback(
    async (
      operation: () => Promise<{ status: string | null; view: AgentAccessView }>,
      successMessage: string
    ) => {
      setMutationBusy(true)
      setMessage(null)
      try {
        const result = await operation()
        queryClient.setQueryData(AGENT_ACCESS_QUERY_KEY, result.view)
        setMessage(
          result.status ? `${successMessage}: ${agentAccessStatusLabel(result.status)}` : successMessage
        )
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Agent Access could not be updated')
      } finally {
        setMutationBusy(false)
      }
    },
    [queryClient]
  )

  return React.useMemo(
    () => ({
      busy: isAgentAccessFetching || mutationBusy,
      canApproveApproval: Boolean(agentAccessAllowedActions?.reviewApproval),
      canCopyEnrollmentCommand: true,
      canDenyApproval: Boolean(agentAccessAllowedActions?.denyApproval),
      canRefresh: true,
      canRevokeAgent: Boolean(agentAccessAllowedActions?.revokeAgent),
      canRevokeCapabilityGrant: Boolean(agentAccessAllowedActions?.revokeCapabilityGrant),
      connectionHandoff: paperclipConnectionHandoff,
      createdAgentEnrollment,
      message:
        message ??
        (agentAccessError instanceof Error
          ? agentAccessError.message
          : isAgentAccessError
            ? 'Agent Access could not be loaded'
            : null),
      onApproveApproval: (approvalId: string) => {
        if (!agentAccessAllowedActions?.reviewApproval) {
          return
        }
        router
          .navigate({
            href: `/device/capabilities/?approval_id=${encodeURIComponent(approvalId)}`
          })
          .catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : 'Agent Access could not be updated')
          })
      },
      onDenyApproval: agentAccessAllowedActions?.denyApproval
        ? (approvalId: string) => {
            runAsync(
              runMutation(
                () =>
                  decideAgentAccessApproval({
                    action: 'deny',
                    approvalId,
                    reason: 'Denied from settings'
                  }),
                'Approval updated'
              )
            )
          }
        : undefined,
      onCopyEnrollmentCommand,
      onConnectPaperclip:
        paperclipConnectionHandoff?.companyId &&
        paperclipConnectionHandoff.pluginId === 'agentteam.paperclip-email-plugin' &&
        agentAccessAllowedActions?.connectPaperclip
          ? (handoff: AgentAccessConnectionHandoff) => {
              const companyId = handoff.companyId
              const pluginId = handoff.pluginId
              if (!companyId || pluginId !== 'agentteam.paperclip-email-plugin') {
                setMessage('Paperclip connection context is incomplete.')
                return
              }
              runAsync(
                runMutation(
                  () =>
                    connectPaperclipAgentAccess({
                      companyId,
                      pluginId
                    }),
                  'Paperclip principal registered'
                )
              )
            }
          : undefined,
      onRefresh: () => {
        setMessage(null)
        runAsync(refetchAgentAccess().then(() => undefined))
      },
      onRevokeAgent: agentAccessAllowedActions?.revokeAgent
        ? (agentId: string) => {
            runAsync(runMutation(() => revokeAgentAccessAgent(agentId), 'Agent revoked'))
          }
        : undefined,
      onRevokeCapabilityGrant: agentAccessAllowedActions?.revokeCapabilityGrant
        ? (grant: AgentAccessGrant) => {
            runAsync(
              runMutation(
                () =>
                  revokeAgentAccessCapability({
                    agentId: grant.agentId,
                    capability: grant.capability,
                    grantId: grant.id
                  }),
                'Capability revoked'
              )
            )
          }
        : undefined,
      readOnly: !canEditAgentAccess(agentAccessView),
      view: agentAccessView ?? null
    }),
    [
      agentAccessAllowedActions?.connectPaperclip,
      agentAccessAllowedActions?.denyApproval,
      agentAccessAllowedActions?.reviewApproval,
      agentAccessAllowedActions?.revokeAgent,
      agentAccessAllowedActions?.revokeCapabilityGrant,
      agentAccessError,
      agentAccessView,
      createdAgentEnrollment,
      isAgentAccessError,
      isAgentAccessFetching,
      message,
      mutationBusy,
      onCopyEnrollmentCommand,
      paperclipConnectionHandoff,
      refetchAgentAccess,
      router,
      runMutation
    ]
  )
}

function useDomainSettingsController({
  cloudflareOAuthCallback,
  state
}: {
  cloudflareOAuthCallback?: CloudflareOAuthCallbackState | null
  state?: DomainSettingsState
}): DomainSettingsControllerResult {
  const router = useRouter()
  const routePathname = useRouterState({ select: (routerState) => routerState.location.pathname })
  const cloudflareOAuthCompletionHref = React.useMemo(
    () => cloudflareOAuthCompletionPath(routePathname),
    [routePathname]
  )
  const isInjectedState = state !== undefined
  const readOnly = state?.readOnly ?? false
  const [runtimeStatus, setRuntimeStatus] = React.useState<CloudflareStatusResult | null>(null)
  const [runtimeMailStatus, setRuntimeMailStatus] = React.useState<AgentMailPublicStatus | null>(null)
  const [runtimeMailStatusMessage, setRuntimeMailStatusMessage] = React.useState<string | null>(null)
  const [runtimeAccounts, setRuntimeAccounts] = React.useState<CloudflareAccountSummary[]>([])
  const [runtimeZones, setRuntimeZones] = React.useState<CloudflareZoneSummary[]>([])
  const [runtimeSelectedGrantPublicId, setRuntimeSelectedGrantPublicId] = React.useState<
    CloudflareAccountSummary['grantPublicId'] | ''
  >('')
  const [runtimeSelectedAccountId, setRuntimeSelectedAccountId] = React.useState('')
  const [runtimeSelectedZoneId, setRuntimeSelectedZoneId] = React.useState('')
  const [runtimeSelectedDomainPublicId, setRuntimeSelectedDomainPublicId] =
    React.useState<DomainSettingsState['selectedDomainPublicId']>(null)
  const [runtimeMode, setRuntimeMode] = React.useState<NonNullable<DomainSettingsState['mode']> | null>(null)
  const [runtimeDraftDomain, setRuntimeDraftDomain] = React.useState('')
  const [runtimeMessage, setRuntimeMessage] = React.useState<string | null>(null)
  const [runtimeBusy, setRuntimeBusy] = React.useState(false)
  const handledCloudflareIntentIdsRef = React.useRef(new Set<string>())

  const selectedAccount =
    runtimeAccounts.find(
      (account) =>
        account.id === runtimeSelectedAccountId &&
        (!runtimeSelectedGrantPublicId || account.grantPublicId === runtimeSelectedGrantPublicId)
    ) ?? null
  const selectedZone =
    runtimeZones.find(
      (zone) =>
        zone.id === runtimeSelectedZoneId &&
        (!runtimeSelectedGrantPublicId || zone.grantPublicId === runtimeSelectedGrantPublicId)
    ) ?? null

  const loadCloudflareDomainsForStatus = React.useCallback(
    async (statusForEligibility: CloudflareStatusResult | null) => {
      const accounts = await fetchCloudflareAccounts()
      const usableGrantPublicIds = usableCloudflareGrantPublicIds(statusForEligibility)
      const eligibleAccounts =
        usableGrantPublicIds.size > 0
          ? accounts.filter((account) => usableGrantPublicIds.has(account.grantPublicId))
          : accounts
      const zoneResults = await Promise.allSettled(
        eligibleAccounts.map((account) =>
          fetchCloudflareZones({
            accountId: account.id,
            grantPublicId: account.grantPublicId
          })
        )
      )
      const zones = zoneResults.flatMap((result) => (result.status === 'fulfilled' ? [...result.value] : []))
      const firstZone = firstEligibleCloudflareZone(zones, statusForEligibility)

      setRuntimeAccounts([...eligibleAccounts])
      setRuntimeZones(zones)
      setRuntimeSelectedGrantPublicId(firstZone?.grantPublicId ?? eligibleAccounts[0]?.grantPublicId ?? '')
      setRuntimeSelectedAccountId(firstZone?.accountId ?? eligibleAccounts[0]?.id ?? '')
      setRuntimeSelectedZoneId(firstZone?.id ?? '')
      setRuntimeDraftDomain(firstZone?.name ?? '')

      return zones
    },
    []
  )

  const refreshStatus = React.useCallback(async () => {
    if (isInjectedState) {
      return null
    }

    const nextStatus = await fetchCloudflareStatus()
    setRuntimeStatus(nextStatus)
    setRuntimeSelectedDomainPublicId((current) => selectCloudflareConnectionPublicId(nextStatus, current))
    return nextStatus
  }, [isInjectedState])

  const refreshMailStatus = React.useCallback(async () => {
    if (isInjectedState) {
      return null
    }

    const nextStatus = await fetchMailStatus()
    setRuntimeMailStatus(nextStatus)
    setRuntimeMailStatusMessage(null)
    return nextStatus
  }, [isInjectedState])

  const handleUnexpectedCloudflareActionError = React.useCallback((error: unknown) => {
    setRuntimeMessage(errorMessage(error, 'Cloudflare action failed.'))
    setRuntimeBusy(false)
  }, [])

  React.useEffect(() => {
    if (isInjectedState) {
      return
    }

    Promise.resolve()
      .then(async () => {
        const [cloudflareStatus, mailStatus] = await Promise.allSettled([
          refreshStatus(),
          refreshMailStatus()
        ])
        if (cloudflareStatus.status === 'rejected') {
          setRuntimeMessage(errorMessage(cloudflareStatus.reason, 'Failed to load Cloudflare status.'))
        }
        if (mailStatus.status === 'rejected') {
          setRuntimeMailStatusMessage(errorMessage(mailStatus.reason, 'Failed to load mail runtime status.'))
        }
      })
      .catch((error: unknown) => {
        setRuntimeMessage(errorMessage(error, 'Failed to load Cloudflare status.'))
      })
  }, [isInjectedState, refreshMailStatus, refreshStatus])

  React.useEffect(() => {
    if (
      isInjectedState ||
      readOnly ||
      runtimeBusy ||
      runtimeAccounts.length > 0 ||
      runtimeZones.length > 0 ||
      usableCloudflareGrantPublicIds(runtimeStatus).size === 0
    ) {
      return
    }

    Promise.resolve()
      .then(() => {
        setRuntimeBusy(true)
        return loadCloudflareDomainsForStatus(runtimeStatus)
      })
      .catch((error: unknown) => {
        setRuntimeMessage(errorMessage(error, 'Failed to load Cloudflare domains.'))
      })
      .finally(() => {
        setRuntimeBusy(false)
      })
  }, [
    isInjectedState,
    loadCloudflareDomainsForStatus,
    readOnly,
    runtimeAccounts.length,
    runtimeBusy,
    runtimeStatus,
    runtimeZones.length
  ])

  React.useEffect(() => {
    if (isInjectedState) {
      return
    }

    const intentPublicId = cloudflareOAuthCallback?.intentPublicId
    const oauthError = cloudflareOAuthCallback?.oauthError

    if (!intentPublicId || handledCloudflareIntentIdsRef.current.has(intentPublicId)) {
      return
    }
    handledCloudflareIntentIdsRef.current.add(intentPublicId)

    const finalize = async () => {
      setRuntimeBusy(true)

      if (oauthError) {
        throw new Error('Cloudflare authorization was not completed')
      }

      const result = await finalizeCloudflareOAuth(intentPublicId)
      setRuntimeMessage(
        result.missingScopes.length > 0
          ? `Missing Cloudflare scopes: ${result.missingScopes.join(', ')}`
          : 'Cloudflare account connected'
      )

      await router.navigate({
        href: cloudflareOAuthCompletionHref,
        replace: true
      })
      const [cloudflareStatus, mailStatus] = await Promise.allSettled([refreshStatus(), refreshMailStatus()])
      if (cloudflareStatus.status === 'fulfilled' && cloudflareStatus.value) {
        await loadCloudflareDomainsForStatus(cloudflareStatus.value)
      }
      if (mailStatus.status === 'rejected') {
        setRuntimeMailStatusMessage(errorMessage(mailStatus.reason, 'Failed to load mail runtime status.'))
      }
      setRuntimeMode('addDomain')
    }

    Promise.resolve()
      .then(finalize)
      .catch((error: unknown) => {
        setRuntimeMessage(errorMessage(error, 'Failed to finalize Cloudflare OAuth.'))
      })
      .finally(() => {
        setRuntimeBusy(false)
      })
  }, [
    cloudflareOAuthCallback?.intentPublicId,
    cloudflareOAuthCallback?.oauthError,
    cloudflareOAuthCompletionHref,
    isInjectedState,
    loadCloudflareDomainsForStatus,
    refreshStatus,
    refreshMailStatus,
    router
  ])

  const startOAuth = React.useCallback(
    async (returnTarget: CloudflareOAuthReturnTarget) => {
      if (isInjectedState || readOnly) {
        return
      }

      setRuntimeBusy(true)
      setRuntimeMessage(null)
      try {
        const result = await startCloudflareOAuth(returnTarget)
        await router.navigate({ href: result.redirectUrl })
      } catch (error) {
        setRuntimeMessage(errorMessage(error, 'Failed to start Cloudflare OAuth.'))
        setRuntimeBusy(false)
      }
    },
    [isInjectedState, readOnly, router]
  )

  const startDashboardOnboardingOAuth = React.useCallback(() => {
    startOAuth('dashboard-onboarding').catch(handleUnexpectedCloudflareActionError)
  }, [handleUnexpectedCloudflareActionError, startOAuth])

  const startSettingsConnectedAccountsOAuth = React.useCallback(() => {
    startOAuth('settings-connected-accounts').catch(handleUnexpectedCloudflareActionError)
  }, [handleUnexpectedCloudflareActionError, startOAuth])

  const startSettingsDomainsOAuth = React.useCallback(() => {
    startOAuth('settings-domains').catch(handleUnexpectedCloudflareActionError)
  }, [handleUnexpectedCloudflareActionError, startOAuth])

  const loadAccounts = React.useCallback(async () => {
    if (isInjectedState || readOnly) {
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      await loadCloudflareDomainsForStatus(runtimeStatus)
    } catch (error) {
      setRuntimeMessage(errorMessage(error, 'Failed to load Cloudflare domains.'))
    } finally {
      setRuntimeBusy(false)
    }
  }, [isInjectedState, loadCloudflareDomainsForStatus, readOnly, runtimeStatus])

  const loadZones = React.useCallback(async () => {
    if (isInjectedState || readOnly || !runtimeSelectedAccountId || !runtimeSelectedGrantPublicId) {
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      const zones = await fetchCloudflareZones({
        accountId: runtimeSelectedAccountId,
        grantPublicId: runtimeSelectedGrantPublicId
      })
      const firstZone = firstEligibleCloudflareZone(zones, runtimeStatus)
      setRuntimeZones([...zones])
      setRuntimeSelectedGrantPublicId(firstZone?.grantPublicId ?? runtimeSelectedGrantPublicId)
      setRuntimeSelectedZoneId(firstZone?.id ?? '')
      setRuntimeDraftDomain(firstZone?.name ?? '')
    } catch (error) {
      setRuntimeMessage(errorMessage(error, 'Failed to load Cloudflare zones.'))
    } finally {
      setRuntimeBusy(false)
    }
  }, [isInjectedState, readOnly, runtimeSelectedAccountId, runtimeSelectedGrantPublicId, runtimeStatus])

  const connectDomain = React.useCallback(async () => {
    if (isInjectedState || readOnly) {
      return
    }

    if (!selectedAccount || !selectedZone || !runtimeDraftDomain) {
      setRuntimeMessage('Select a Cloudflare account, zone, and domain')
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      const nextStatus = await connectCloudflareDomain({
        ...cloudflareConnectionInputForSelectedDomain({
          account: selectedAccount,
          domain: runtimeDraftDomain,
          zone: selectedZone
        })
      })
      setRuntimeStatus(nextStatus)
      setRuntimeSelectedDomainPublicId(
        selectCloudflareConnectionPublicId(
          nextStatus,
          nextStatus.connections.find(
            (connection) =>
              connection.cloudflareAccountId === selectedAccount.id &&
              connection.cloudflareZoneId === selectedZone.id &&
              connection.domain === runtimeDraftDomain
          )?.publicId
        )
      )
      setRuntimeMode('domain')
      setRuntimeMessage('Cloudflare domain connected')
      await refreshMailStatus().catch(() => null)
    } catch (error) {
      setRuntimeMessage(errorMessage(error, 'Failed to connect Cloudflare domain.'))
    } finally {
      setRuntimeBusy(false)
    }
  }, [isInjectedState, readOnly, refreshMailStatus, runtimeDraftDomain, selectedAccount, selectedZone])

  const provisionDomain = React.useCallback(
    async (connectionPublicId: NonNullable<DomainSettingsState['selectedDomainPublicId']>) => {
      if (isInjectedState || readOnly) {
        return
      }

      setRuntimeBusy(true)
      setRuntimeMessage(null)
      try {
        const nextStatus = await provisionCloudflareConnection(connectionPublicId)
        setRuntimeStatus(nextStatus)
        setRuntimeSelectedDomainPublicId(selectCloudflareConnectionPublicId(nextStatus, connectionPublicId))
        setRuntimeMode('domain')
        setRuntimeMessage('Cloudflare provisioning applied')
        await refreshMailStatus().catch(() => null)
      } catch (error) {
        setRuntimeMessage(errorMessage(error, 'Failed to provision Cloudflare connection.'))
      } finally {
        setRuntimeBusy(false)
      }
    },
    [isInjectedState, readOnly, refreshMailStatus]
  )

  const setupDomain = React.useCallback(async () => {
    if (isInjectedState || readOnly) {
      return
    }

    if (!selectedAccount || !selectedZone || !runtimeDraftDomain) {
      setRuntimeMessage('Select a Cloudflare domain')
      return
    }

    setRuntimeBusy(true)
    setRuntimeMessage(null)
    try {
      const connectedStatus = await connectCloudflareDomain({
        ...cloudflareConnectionInputForSelectedDomain({
          account: selectedAccount,
          domain: runtimeDraftDomain,
          zone: selectedZone
        })
      })
      const connectionPublicId = findCloudflareConnectionPublicId(
        connectedStatus,
        selectedAccount.id,
        selectedZone.id,
        runtimeDraftDomain
      )

      if (!connectionPublicId) {
        throw new Error('Cloudflare connection was not returned.')
      }

      setRuntimeStatus(connectedStatus)
      setRuntimeSelectedDomainPublicId(connectionPublicId)
      setRuntimeMode('domain')

      const provisionedStatus = await provisionCloudflareConnection(connectionPublicId)
      setRuntimeStatus(provisionedStatus)
      setRuntimeSelectedDomainPublicId(
        selectCloudflareConnectionPublicId(provisionedStatus, connectionPublicId)
      )
      setRuntimeMessage('Domain setup complete')
      await refreshMailStatus().catch(() => null)
    } catch (error) {
      setRuntimeMessage(errorMessage(error, 'Failed to set up Cloudflare domain.'))
    } finally {
      setRuntimeBusy(false)
    }
  }, [isInjectedState, readOnly, refreshMailStatus, runtimeDraftDomain, selectedAccount, selectedZone])

  const disconnectCloudflare = React.useCallback(
    async (grantPublicId: CloudflareGrantPublicId) => {
      if (isInjectedState || readOnly) {
        return
      }

      setRuntimeBusy(true)
      setRuntimeMessage(null)
      try {
        const nextStatus = await disconnectCloudflareConnection(grantPublicId)
        const nextSelectedDomainPublicId = selectCloudflareConnectionPublicId(nextStatus)
        setRuntimeStatus(nextStatus)
        setRuntimeSelectedDomainPublicId(nextSelectedDomainPublicId)
        setRuntimeMode(nextSelectedDomainPublicId ? 'domain' : 'addDomain')
        setRuntimeMessage('Cloudflare disconnected')
        await refreshMailStatus().catch(() => null)
      } catch (error) {
        setRuntimeMessage(errorMessage(error, 'Failed to disconnect Cloudflare.'))
      } finally {
        setRuntimeBusy(false)
      }
    },
    [isInjectedState, readOnly, refreshMailStatus]
  )

  if (state) {
    return {
      dashboardOnboardingStartOAuth: state.onStartOAuth,
      settingsState: state
    }
  }

  return {
    dashboardOnboardingStartOAuth: startDashboardOnboardingOAuth,
    settingsState: {
      accounts: runtimeAccounts,
      busy: runtimeBusy,
      draftDomain: runtimeDraftDomain,
      message: runtimeMessage,
      mailStatus: runtimeMailStatus,
      mailStatusMessage: runtimeMailStatusMessage,
      mode: runtimeMode ?? ((runtimeStatus?.connections.length ?? 0) > 0 ? 'domain' : 'addDomain'),
      onAddDomain: () => {
        if (readOnly) {
          return
        }
        setRuntimeMode('addDomain')
        setRuntimeMessage(null)
      },
      onConnectDomain: () => {
        connectDomain().catch(handleUnexpectedCloudflareActionError)
      },
      onDisconnectCloudflare: (grantPublicId) => {
        disconnectCloudflare(grantPublicId).catch(handleUnexpectedCloudflareActionError)
      },
      onDraftDomainChange: (domain) => {
        if (!readOnly) {
          setRuntimeDraftDomain(domain)
        }
      },
      onLoadAccounts: () => {
        loadAccounts().catch(handleUnexpectedCloudflareActionError)
      },
      onLoadZones: () => {
        loadZones().catch(handleUnexpectedCloudflareActionError)
      },
      onProvisionDomain: (connectionPublicId) => {
        provisionDomain(connectionPublicId).catch(handleUnexpectedCloudflareActionError)
      },
      onSelectAccount: (accountId) => {
        if (readOnly) {
          return
        }
        const nextAccount = runtimeAccounts.find((account) => account.id === accountId) ?? null
        setRuntimeSelectedGrantPublicId(nextAccount?.grantPublicId ?? '')
        setRuntimeSelectedAccountId(accountId)
        setRuntimeSelectedZoneId('')
        setRuntimeZones([])
        setRuntimeDraftDomain('')
      },
      onSelectDomain: (connectionPublicId) => {
        if (readOnly) {
          return
        }
        setRuntimeSelectedDomainPublicId(connectionPublicId)
        setRuntimeMode('domain')
        setRuntimeMessage(null)
      },
      onSelectZone: (zoneId) => {
        if (readOnly) {
          return
        }
        const zoneSelection = parseCloudflareZoneSelectionValue(zoneId)
        const nextZone =
          runtimeZones.find(
            (zone) =>
              zone.id === zoneSelection.zoneId &&
              (!zoneSelection.grantPublicId || zone.grantPublicId === zoneSelection.grantPublicId)
          ) ?? null
        setRuntimeSelectedGrantPublicId(nextZone?.grantPublicId ?? '')
        setRuntimeSelectedZoneId(nextZone?.id ?? zoneSelection.zoneId)
        setRuntimeSelectedAccountId(nextZone?.accountId ?? '')
        setRuntimeDraftDomain(nextZone?.name ?? '')
      },
      onSetupDomain: () => {
        setupDomain().catch(handleUnexpectedCloudflareActionError)
      },
      onStartConnectedAccountOAuth: startSettingsConnectedAccountsOAuth,
      onStartOAuth: startSettingsDomainsOAuth,
      onRefreshMailStatus: () => {
        refreshMailStatus().catch((error: unknown) => {
          setRuntimeMailStatusMessage(errorMessage(error, 'Failed to load mail runtime status.'))
        })
      },
      readOnly,
      selectedGrantPublicId: runtimeSelectedGrantPublicId || undefined,
      selectedAccountId: runtimeSelectedAccountId,
      selectedDomainPublicId:
        runtimeSelectedDomainPublicId ?? runtimeStatus?.connections[0]?.publicId ?? null,
      selectedZoneId: runtimeSelectedZoneId,
      status: runtimeStatus,
      zones: runtimeZones
    }
  }
}

function selectCloudflareConnectionPublicId(
  status: CloudflareStatusResult,
  preferredPublicId?: DomainSettingsState['selectedDomainPublicId']
): DomainSettingsState['selectedDomainPublicId'] {
  if (
    preferredPublicId &&
    status.connections.some((connection) => connection.publicId === preferredPublicId)
  ) {
    return preferredPublicId
  }

  return (
    status.connections.find((connection) => connection.status !== 'disconnected')?.publicId ??
    status.connections[0]?.publicId ??
    null
  )
}

function firstEligibleCloudflareZone(
  zones: readonly CloudflareZoneSummary[],
  status: CloudflareStatusResult | null
) {
  return zones.find((zone) => !isCloudflareZoneConnected(zone, status)) ?? null
}

function usableCloudflareGrantPublicIds(
  status: CloudflareStatusResult | null
): Set<CloudflareAccountSummary['grantPublicId']> {
  return new Set(
    status?.grants
      .filter(
        (grant) =>
          grant.status === 'active' &&
          grant.requiredScopes.every((scope) => grant.grantedScopes.includes(scope))
      )
      .map((grant) => grant.publicId) ?? []
  )
}

function parseCloudflareZoneSelectionValue(value: string): {
  grantPublicId: string | null
  zoneId: string
} {
  const separatorIndex = value.indexOf('|')
  if (separatorIndex <= 0) {
    return {
      grantPublicId: null,
      zoneId: value
    }
  }

  return {
    grantPublicId: value.slice(0, separatorIndex),
    zoneId: value.slice(separatorIndex + 1)
  }
}

function isCloudflareZoneConnected(zone: CloudflareZoneSummary, status: CloudflareStatusResult | null) {
  return (
    status?.connections.some(
      (connection) =>
        connection.status !== 'disconnected' &&
        (connection.cloudflareZoneId === zone.id ||
          connection.domain.toLowerCase() === zone.name.toLowerCase())
    ) ?? false
  )
}

function findCloudflareConnectionPublicId(
  status: CloudflareStatusResult,
  accountId: string,
  zoneId: string,
  domain: string
) {
  return status.connections.find(
    (connection) =>
      connection.cloudflareAccountId === accountId &&
      connection.cloudflareZoneId === zoneId &&
      connection.domain === domain
  )?.publicId
}

function readyCloudflareDomain(domainSettingsState: DomainSettingsState) {
  return (
    domainSettingsState.status?.connections.find(
      (connection) => connection.status === 'active' && connection.provisioningStatus === 'succeeded'
    )?.domain ?? null
  )
}

function firstNameMailboxLocalPart(name: string) {
  return mailboxLocalPart(name.trim().split(/\s+/u)[0] ?? '')
}

function agentAccessStatusLabel(value: string): string {
  return value
    .split(/[_-]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function cleanDashboardSearch(search: DashboardSearch): DashboardSearch {
  return {
    accountId: cleanSearchValue(search.accountId),
    cloudflareIntentId: cleanSearchValue(search.cloudflareIntentId),
    cloudflareOAuthError: cleanSearchValue(search.cloudflareOAuthError),
    cursor: cleanSearchValue(search.cursor),
    direction: search.direction,
    folderId: cleanSearchValue(search.folderId),
    mailboxAdmin: search.mailboxAdmin,
    mailQuery: cleanSearchValue(search.mailQuery),
    messageId: cleanSearchValue(search.messageId),
    unreadOnly: search.unreadOnly === true ? true : undefined
  }
}

function cleanSearchValue(value: string | undefined) {
  return value === undefined || value === '' ? undefined : value
}

function paperclipConnectionHandoffFromSearch(
  routeSearch: SettingsRouteSearch | undefined
): AgentAccessConnectionHandoff | null {
  if (routeSearch?.agentAccessSource !== 'paperclip') {
    return null
  }

  return {
    companyId: routeSearch.paperclipCompanyId ?? null,
    pluginId: routeSearch.paperclipPluginId ?? null,
    source: 'paperclip'
  }
}

interface ComposeState {
  bcc: string
  body: string
  cc: string
  draftId?: string
  draftMailboxId?: string
  errorMessage?: string
  fromAddress?: string
  fromLabel?: string
  mode: AuthenticatedComposeMode
  reference?: AgentMailComposeInput['reference']
  state: 'closed' | 'open'
  subject: string
  title: string
  to: string
}

interface DashboardMailControllerProps extends Pick<
  DashboardScreenProps,
  | 'authClient'
  | 'defaultSettingsOpen'
  | 'defaultSettingsSection'
  | 'domainSettingsState'
  | 'firstMailboxSetupState'
  | 'publicEnv'
  | 'routeState'
  | 'sessionCleanupEnabled'
  | 'settingsContentState'
  | 'onSettingsOpenChange'
  | 'onSettingsSectionChange'
  | 'settingsOpen'
  | 'settingsSection'
> {
  agentAccessViewLoader?: AgentAccessViewLoader
  mailWorkspaceLoader?: MailWorkspaceLoader
  mailboxAdminViewLoader?: MailboxAdminViewLoader
  mailboxAdminNavigationLoader?: MailboxAdminNavigationLoader
  routeSearch?: SettingsRouteSearch
}

export function DashboardMailController({
  agentAccessViewLoader = fetchAgentAccessView,
  firstMailboxSetupState: providedFirstMailboxSetupState,
  domainSettingsState: providedDomainSettingsState,
  mailWorkspaceLoader = fetchMailWorkspace,
  mailboxAdminNavigationLoader = fetchMailboxAdminNavigation,
  mailboxAdminViewLoader = fetchMailboxAdminView,
  routeSearch,
  ...screenProps
}: DashboardMailControllerProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [composeState, setComposeState] = React.useState<ComposeState>(() => closedComposeState())
  const [moveDialog, setMoveDialog] = React.useState<{
    actionInput?: AgentMailMessageActionInput
    errorMessage?: string
    isSubmitting?: boolean
    selectedFolderId?: string
    state: 'closed' | 'open'
  }>({ state: 'closed' })
  const [deleteDialog, setDeleteDialog] = React.useState<{
    actionInput?: AgentMailMessageActionInput
    errorMessage?: string
    isSubmitting?: boolean
    isDraft?: boolean
    state: 'closed' | 'open'
  }>({ state: 'closed' })
  const [originalSourceDialog, setOriginalSourceDialog] = React.useState<{
    errorMessage?: string
    isLoading?: boolean
    source?: string
    state: 'closed' | 'open'
  }>({ state: 'closed' })
  const [folderCreate, setFolderCreate] = React.useState<{
    errorMessage?: string
    isSubmitting?: boolean
    name: string
    state: 'closed' | 'open'
  }>({ name: '', state: 'closed' })
  const [folderDelete, setFolderDelete] = React.useState<{
    errorMessage?: string
    folderId?: string
    isSubmitting?: boolean
    state: 'closed' | 'open'
    title?: string
  }>({ state: 'closed' })
  const [folderRename, setFolderRename] = React.useState<{
    errorMessage?: string
    folderId?: string
    isSubmitting?: boolean
    name: string
    state: 'closed' | 'open'
    title?: string
  }>({ name: '', state: 'closed' })
  const [mailboxAdminDialog, setMailboxAdminDialog] = React.useState<MailboxAdminDialogState | null>(null)
  const [createdAgentEnrollment, setCreatedAgentEnrollment] =
    React.useState<MailboxAdminAgentEnrollment | null>(null)
  const [firstMailboxDraftState, setFirstMailboxDraftState] = React.useState<FirstMailboxDraft>({
    addressLocalPart: '',
    displayName: '',
    key: ''
  })
  const [firstMailboxErrorState, setFirstMailboxErrorState] = React.useState<FirstMailboxErrorState>({
    key: '',
    message: null
  })
  const handleCopyAgentEnrollmentCommand = React.useCallback((command: string) => {
    const clipboard = globalThis.navigator?.clipboard ?? null
    if (!clipboard) {
      toast.error('Clipboard is not available.')
      return
    }

    runAsync(
      clipboard
        .writeText(command)
        .then(() => {
          toast.success('Enrollment command copied')
        })
        .catch(() => {
          toast.error('Enrollment command could not be copied.')
        })
    )
  }, [])
  const agentAccessState = useAgentAccessController({
    agentAccessViewLoader,
    createdAgentEnrollment,
    onCopyEnrollmentCommand: handleCopyAgentEnrollmentCommand,
    paperclipConnectionHandoff: paperclipConnectionHandoffFromSearch(routeSearch)
  })
  const { dashboardOnboardingStartOAuth, settingsState: domainSettingsState } = useDomainSettingsController({
    cloudflareOAuthCallback: routeSearch?.cloudflareIntentId
      ? {
          intentPublicId: routeSearch.cloudflareIntentId,
          oauthError: routeSearch.cloudflareOAuthError
        }
      : null,
    state: providedDomainSettingsState
  })
  const [mailboxAdminSearchBySection, setMailboxAdminSearchBySection] = React.useState<
    Readonly<Partial<Record<MailboxAdminSectionId, string>>>
  >({})
  const [mailboxAdminStatusFilterBySection, setMailboxAdminStatusFilterBySection] = React.useState<
    Readonly<Partial<Record<MailboxAdminSectionId, MailboxAdminStatusFilter>>>
  >({})
  const [mailboxAdminPageBySection, setMailboxAdminPageBySection] = React.useState<
    Readonly<Partial<Record<MailboxAdminSectionId, number>>>
  >({})

  const handleMailboxAdminDialogChange = React.useCallback((dialog: MailboxAdminDialogState | null) => {
    setMailboxAdminDialog(dialog)
    if (dialog?.type !== 'agentEditor' || dialog.agentId) {
      setCreatedAgentEnrollment(null)
    }
  }, [])

  const activeMailboxAdminSection = routeSearch?.mailboxAdmin
  const workspaceQueryOptions = React.useMemo(
    () => mailWorkspaceQueryOptions(routeSearch, !activeMailboxAdminSection, mailWorkspaceLoader),
    [activeMailboxAdminSection, mailWorkspaceLoader, routeSearch]
  )
  const {
    data: workspace,
    error: workspaceError,
    refetch: refetchWorkspace,
    status: workspaceStatus
  } = useQuery(workspaceQueryOptions)
  const mailboxAdminSearchQuery = activeMailboxAdminSection
    ? (mailboxAdminSearchBySection[activeMailboxAdminSection] ?? '')
    : ''
  const mailboxAdminStatusFilter = activeMailboxAdminSection
    ? (mailboxAdminStatusFilterBySection[activeMailboxAdminSection] ?? 'all')
    : 'all'
  const mailboxAdminPage = activeMailboxAdminSection
    ? (mailboxAdminPageBySection[activeMailboxAdminSection] ?? 1)
    : 1
  const mailboxAdminViewQuery = React.useMemo<MailboxAdminViewQuery | undefined>(
    () =>
      mailboxAdminViewQueryForSection({
        page: mailboxAdminPage,
        pageSize: MAILBOX_ADMIN_PAGE_SIZE,
        searchQuery: mailboxAdminSearchQuery,
        section: activeMailboxAdminSection,
        statusFilter: mailboxAdminStatusFilter
      }),
    [activeMailboxAdminSection, mailboxAdminPage, mailboxAdminSearchQuery, mailboxAdminStatusFilter]
  )
  const mailboxAdminNavigationOptions = React.useMemo(
    () => mailboxAdminNavigationQueryOptions(mailboxAdminNavigationLoader),
    [mailboxAdminNavigationLoader]
  )
  const mailboxAdminOptions = React.useMemo(
    () => mailboxAdminQueryOptions(mailboxAdminViewQuery, mailboxAdminViewLoader),
    [mailboxAdminViewLoader, mailboxAdminViewQuery]
  )
  const { data: mailboxAdminNavigationData } = useQuery(mailboxAdminNavigationOptions)
  const {
    data: mailboxAdminData,
    error: mailboxAdminError,
    refetch: refetchMailboxAdmin,
    status: mailboxAdminStatus
  } = useQuery(mailboxAdminOptions)
  const allowedMailboxAdminSections =
    mailboxAdminData?.allowedSections ?? mailboxAdminNavigationData?.allowedSections
  const selectedMessage = workspace?.selectedMessage ?? null
  const selectedMessageActionInput = React.useMemo(
    () =>
      selectedMessage && workspace?.activeAccountId
        ? {
            accountId: workspace.activeAccountId,
            mailboxId: selectedMessage.mailboxId,
            messageId: selectedMessage.id
          }
        : null,
    [selectedMessage, workspace?.activeAccountId]
  )

  const invalidateMail = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: workspaceQueryOptions.queryKey })
  }, [queryClient, workspaceQueryOptions])
  const invalidateMailboxAdmin = React.useCallback(async () => {
    await invalidateMailboxAdminQueries(queryClient)
  }, [queryClient])

  const { mutateAsync: updateMessage } = useMutation({
    mutationFn: updateMailMessage,
    onSuccess: invalidateMail
  })
  const { mutateAsync: moveMessage } = useMutation({
    mutationFn: moveMailMessage,
    onSuccess: invalidateMail
  })
  const { mutateAsync: deleteMessage } = useMutation({
    mutationFn: deleteMailMessage,
    onSuccess: invalidateMail
  })
  const { isPending: isSendingMessage, mutateAsync: sendMessage } = useMutation({
    mutationFn: sendMailMessage,
    onSuccess: invalidateMail
  })
  const { isPending: isSavingDraft, mutateAsync: saveDraft } = useMutation({
    mutationFn: saveMailDraft,
    onSuccess: invalidateMail
  })
  const { isPending: isSendingDraft, mutateAsync: sendDraft } = useMutation({
    mutationFn: sendMailDraft,
    onSuccess: invalidateMail
  })
  const { mutateAsync: createFolder } = useMutation({
    mutationFn: createMailFolder,
    onSuccess: invalidateMail
  })
  const { mutateAsync: deleteFolder } = useMutation({
    mutationFn: deleteMailFolder,
    onSuccess: invalidateMail
  })
  const { mutateAsync: renameFolder } = useMutation({
    mutationFn: renameMailFolder,
    onSuccess: invalidateMail
  })
  const {
    isPending: isRevokingAgent,
    mutateAsync: revokeAgent,
    variables: revokingAgentId
  } = useMutation({
    mutationFn: revokeMailboxAdminAgent,
    onError: (error) => {
      toast.error(errorMessage(error, 'Agent access could not be revoked.'))
    },
    onSuccess: async () => {
      await invalidateMailboxAdmin()
      toast.success('Agent access revoked')
    }
  })
  const {
    isPending: isRevokingAgentEnrollment,
    mutateAsync: revokeAgentEnrollment,
    variables: revokingAgentEnrollmentId
  } = useMutation({
    mutationFn: revokeMailboxAdminAgentEnrollment,
    onError: (error) => {
      toast.error(errorMessage(error, 'Agent enrollment could not be cancelled.'))
    },
    onSuccess: async () => {
      await invalidateMailboxAdmin()
      toast.success('Agent enrollment cancelled')
    }
  })
  const { isPending: isSavingAccount, mutateAsync: saveAccount } = useMutation({
    mutationFn: ({ accountId, input }: { accountId?: string; input: MailboxAdminAccountInput }) =>
      accountId ? updateMailboxAdminAccount({ accountId, input }) : createMailboxAdminAccount(input),
    onError: (error) => {
      toast.error(errorMessage(error, 'Mailbox account could not be saved.'))
    },
    onSuccess: async (_result, variables) => {
      setMailboxAdminDialog(null)
      await Promise.all([invalidateMailboxAdmin(), invalidateMail()])
      toast.success(variables.accountId ? 'Mailbox account saved' : 'Mailbox account created')
    }
  })
  const {
    isPending: isDisablingAccount,
    mutateAsync: disableAccount,
    variables: disablingAccountId
  } = useMutation({
    mutationFn: disableMailboxAdminAccount,
    onError: (error) => {
      toast.error(errorMessage(error, 'Mailbox account could not be disabled.'))
    },
    onSuccess: async () => {
      await Promise.all([invalidateMailboxAdmin(), invalidateMail()])
      toast.success('Mailbox account disabled')
    }
  })
  const {
    isPending: isSavingAgent,
    mutateAsync: saveAgent,
    variables: savingAgentVariables
  } = useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: MailboxAdminAgentInput }) =>
      updateMailboxAdminAgent({ agentId, input }),
    onError: (error) => {
      toast.error(errorMessage(error, 'Agent profile could not be saved.'))
    },
    onSuccess: async () => {
      setMailboxAdminDialog(null)
      await invalidateMailboxAdmin()
      toast.success('Agent profile saved')
    }
  })
  const { isPending: isCreatingAgent, mutateAsync: createAgent } = useMutation({
    mutationFn: createMailboxAdminAgentEnrollment,
    onError: (error) => {
      toast.error(errorMessage(error, 'Agent enrollment could not be created.'))
    },
    onSuccess: async (result) => {
      setCreatedAgentEnrollment(result.enrollment)
      await invalidateMailboxAdmin()
      toast.success('Agent enrollment created')
    }
  })
  const {
    isPending: isSavingAgentSystemPermissions,
    mutateAsync: saveAgentSystemPermissions,
    variables: savingAgentSystemPermissionsVariables
  } = useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: MailboxAdminAgentSystemPermissionsInput }) =>
      updateMailboxAdminAgentSystemPermissions({ agentId, input }),
    onError: (error) => {
      toast.error(errorMessage(error, 'Agent system permissions could not be saved.'))
    },
    onSuccess: async () => {
      setMailboxAdminDialog(null)
      await invalidateMailboxAdmin()
      toast.success('Agent system permissions saved')
    }
  })
  const {
    isPending: isSavingAgentMailboxGrants,
    mutateAsync: saveAgentMailboxGrants,
    variables: savingAgentMailboxGrantsVariables
  } = useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: MailboxAdminAgentMailboxGrantsInput }) =>
      updateMailboxAdminAgentMailboxGrants({ agentId, input }),
    onError: (error) => {
      toast.error(errorMessage(error, 'Agent mailbox access could not be saved.'))
    },
    onSuccess: async () => {
      setMailboxAdminDialog(null)
      await invalidateMailboxAdmin()
      toast.success('Agent mailbox access saved')
    }
  })
  const {
    isPending: isSavingPrincipalSystemPermissions,
    mutateAsync: savePrincipalSystemPermissions,
    variables: savingPrincipalSystemPermissionsVariables
  } = useMutation({
    mutationFn: ({
      input,
      principal
    }: {
      input: MailboxAdminAgentSystemPermissionsInput
      principal: Pick<MailboxAdminExternalPrincipal, 'id' | 'kind'>
    }) =>
      updateMailboxAdminPrincipalSystemPermissions({
        input,
        principal: {
          principalId: principal.id,
          principalType: principal.kind
        }
      }),
    onError: (error) => {
      toast.error(errorMessage(error, 'Client system permissions could not be saved.'))
    },
    onSuccess: async () => {
      setMailboxAdminDialog(null)
      await invalidateMailboxAdmin()
      toast.success('Client system permissions saved')
    }
  })
  const {
    isPending: isSavingPrincipalMailboxGrants,
    mutateAsync: savePrincipalMailboxGrants,
    variables: savingPrincipalMailboxGrantsVariables
  } = useMutation({
    mutationFn: ({
      input,
      principal
    }: {
      input: MailboxAdminAgentMailboxGrantsInput
      principal: Pick<MailboxAdminExternalPrincipal, 'id' | 'kind'>
    }) =>
      updateMailboxAdminPrincipalMailboxGrants({
        input,
        principal: {
          principalId: principal.id,
          principalType: principal.kind
        }
      }),
    onError: (error) => {
      toast.error(errorMessage(error, 'Client mailbox access could not be saved.'))
    },
    onSuccess: async () => {
      setMailboxAdminDialog(null)
      await invalidateMailboxAdmin()
      toast.success('Client mailbox access saved')
    }
  })
  const { isPending: isSavingGroup, mutateAsync: saveGroup } = useMutation({
    mutationFn: ({ groupId, input }: { groupId?: string; input: MailboxAdminGroupInput }) =>
      groupId ? updateMailboxAdminGroup({ groupId, input }) : createMailboxAdminGroup(input),
    onError: (error) => {
      toast.error(errorMessage(error, 'Forwarding group could not be saved.'))
    },
    onSuccess: async () => {
      setMailboxAdminDialog(null)
      await invalidateMailboxAdmin()
      toast.success('Forwarding group saved')
    }
  })
  const {
    isPending: isDisablingGroup,
    mutateAsync: disableGroup,
    variables: disablingGroupId
  } = useMutation({
    mutationFn: disableMailboxAdminGroup,
    onError: (error) => {
      toast.error(errorMessage(error, 'Forwarding group could not be disabled.'))
    },
    onSuccess: async () => {
      await invalidateMailboxAdmin()
      toast.success('Forwarding group disabled')
    }
  })

  const firstMailboxDomain = readyCloudflareDomain(domainSettingsState)
  const firstMailboxDefaultDisplayName = screenProps.routeState.user?.name?.trim() ?? ''
  const firstMailboxDefaultLocalPart = firstNameMailboxLocalPart(firstMailboxDefaultDisplayName)
  const firstMailboxDraftKey = firstMailboxDomain
    ? `${screenProps.routeState.user?.id ?? 'user'}:${firstMailboxDomain}`
    : ''
  const firstMailboxDefaultDraft = React.useMemo<FirstMailboxDraft>(
    () => ({
      addressLocalPart: firstMailboxDefaultLocalPart,
      displayName: firstMailboxDefaultDisplayName,
      key: firstMailboxDraftKey
    }),
    [firstMailboxDefaultDisplayName, firstMailboxDefaultLocalPart, firstMailboxDraftKey]
  )
  const firstMailboxDraft =
    firstMailboxDraftState.key === firstMailboxDraftKey ? firstMailboxDraftState : firstMailboxDefaultDraft
  const firstMailboxError =
    firstMailboxErrorState.key === firstMailboxDraftKey ? firstMailboxErrorState.message : null
  const setFirstMailboxError = React.useCallback(
    (message: string | null) => {
      setFirstMailboxErrorState({
        key: firstMailboxDraftKey,
        message
      })
    },
    [firstMailboxDraftKey]
  )
  const updateFirstMailboxDraft = React.useCallback(
    (updateDraft: (draft: FirstMailboxDraft) => FirstMailboxDraft) => {
      setFirstMailboxDraftState((current) =>
        updateDraft(current.key === firstMailboxDraftKey ? current : firstMailboxDefaultDraft)
      )
    },
    [firstMailboxDefaultDraft, firstMailboxDraftKey]
  )

  const firstMailboxAddress =
    firstMailboxDomain && firstMailboxDraft.addressLocalPart
      ? `${firstMailboxDraft.addressLocalPart}@${firstMailboxDomain}`
      : ''
  const normalizedFirstMailboxAddress = mailboxAddress(firstMailboxAddress)
  const firstMailboxSetupState = React.useMemo<DashboardScreenProps['firstMailboxSetupState']>(
    () =>
      providedFirstMailboxSetupState ??
      (firstMailboxDomain && workspace?.accounts.length === 0
        ? {
            addressLocalPart: firstMailboxDraft.addressLocalPart,
            canSubmit: Boolean(
              normalizedFirstMailboxAddress &&
              normalizedFirstMailboxAddress === firstMailboxAddress &&
              firstMailboxDraft.displayName.trim() &&
              !isSavingAccount
            ),
            displayName: firstMailboxDraft.displayName,
            domain: firstMailboxDomain,
            errorDescription: firstMailboxError,
            onAddressLocalPartChange: (localPart) => {
              updateFirstMailboxDraft((current) => ({
                ...current,
                addressLocalPart: mailboxLocalPart(localPart)
              }))
              setFirstMailboxError(null)
            },
            onDisplayNameChange: (displayName) => {
              updateFirstMailboxDraft((current) => ({
                ...current,
                displayName
              }))
              setFirstMailboxError(null)
            },
            onSubmit: () => {
              if (!normalizedFirstMailboxAddress || !firstMailboxDraft.displayName.trim()) {
                setFirstMailboxError('Enter a mailbox address and display name.')
                return
              }

              runAsync(
                saveAccount({
                  input: {
                    address: normalizedFirstMailboxAddress,
                    name: firstMailboxDraft.displayName.trim(),
                    type: 'mailbox'
                  }
                }).catch((error: unknown) => {
                  setFirstMailboxError(errorMessage(error, 'Mailbox account could not be created.'))
                })
              )
            },
            readOnly: false,
            state: isSavingAccount ? 'creating' : firstMailboxError ? 'error' : 'ready'
          }
        : undefined),
    [
      firstMailboxAddress,
      firstMailboxDomain,
      firstMailboxDraft.addressLocalPart,
      firstMailboxDraft.displayName,
      firstMailboxError,
      isSavingAccount,
      normalizedFirstMailboxAddress,
      providedFirstMailboxSetupState,
      saveAccount,
      setFirstMailboxError,
      updateFirstMailboxDraft,
      workspace?.accounts.length
    ]
  )

  const workspaceScreenModel = React.useMemo(
    () =>
      deriveDashboardMailWorkspaceScreenModel({
        allowedMailboxAdminSections,
        domainSettingsState,
        firstMailboxSetupState,
        folderCreate,
        folderDelete,
        folderRename,
        routeSearch,
        sidebarError: activeMailboxAdminSection ? mailboxAdminError : workspaceError,
        sidebarStatus: activeMailboxAdminSection ? mailboxAdminStatus : workspaceStatus,
        workspace,
        workspaceError,
        workspaceStatus
      }),
    [
      activeMailboxAdminSection,
      allowedMailboxAdminSections,
      domainSettingsState,
      firstMailboxSetupState,
      folderCreate,
      folderDelete,
      folderRename,
      mailboxAdminError,
      mailboxAdminStatus,
      routeSearch,
      workspace,
      workspaceError,
      workspaceStatus
    ]
  )
  const openMailboxFromAdmin = React.useCallback(
    (accountId: string) => {
      setMailboxAdminDialog(null)
      router
        .navigate({
          search: cleanDashboardSearch({
            ...routeSearch,
            accountId,
            cursor: undefined,
            direction: undefined,
            folderId: undefined,
            mailboxAdmin: undefined,
            messageId: undefined
          }),
          to: '/dashboard/'
        })
        .catch(ignoreAsyncError)
    },
    [routeSearch, router]
  )
  const mailboxAdminBaseView = React.useMemo(
    () =>
      activeMailboxAdminSection
        ? toMailboxAdminView(
            activeMailboxAdminSection,
            mailboxAdminStatus,
            mailboxAdminError,
            mailboxAdminData,
            () => {
              runAsync(refetchMailboxAdmin())
            },
            {
              activeDialog: mailboxAdminDialog,
              createdAgentEnrollment,
              onCopyAgentEnrollmentCommand: handleCopyAgentEnrollmentCommand,
              onDialogChange: handleMailboxAdminDialogChange,
              onDisableAccount: (accountId) => {
                runAsync(disableAccount(accountId))
              },
              onDisableGroup: (groupId) => {
                runAsync(disableGroup(groupId))
              },
              onOpenMailbox: openMailboxFromAdmin,
              onRevokeAgent: (agentId) => {
                runAsync(revokeAgent(agentId))
              },
              onRevokeAgentEnrollment: (enrollmentId) => {
                runAsync(revokeAgentEnrollment(enrollmentId))
              },
              onSaveAccount: (accountId, input) => {
                runAsync(saveAccount({ accountId, input }))
              },
              onCreateAgent: (input) => {
                runAsync(createAgent(input))
              },
              onSaveAgent: (agentId, input) => {
                runAsync(saveAgent({ agentId, input }))
              },
              onSaveAgentSystemPermissions: (agentId, input) => {
                runAsync(saveAgentSystemPermissions({ agentId, input }))
              },
              onSaveAgentMailboxGrants: (agentId, input) => {
                runAsync(saveAgentMailboxGrants({ agentId, input }))
              },
              onSavePrincipalMailboxGrants: (principal, input) => {
                runAsync(savePrincipalMailboxGrants({ input, principal }))
              },
              onSavePrincipalSystemPermissions: (principal, input) => {
                runAsync(savePrincipalSystemPermissions({ input, principal }))
              },
              onSaveGroup: (groupId, input) => {
                runAsync(saveGroup({ groupId, input }))
              },
              pendingAccountDisableId: isDisablingAccount ? disablingAccountId : null,
              pendingAccountSave: isSavingAccount,
              pendingAgentCreate: isCreatingAgent,
              pendingAgentEnrollmentRevokeId: isRevokingAgentEnrollment ? revokingAgentEnrollmentId : null,
              pendingAgentSaveId: isSavingAgent ? savingAgentVariables?.agentId : null,
              pendingAgentMailboxGrantsSaveId: isSavingAgentMailboxGrants
                ? savingAgentMailboxGrantsVariables?.agentId
                : null,
              pendingAgentRevokeId: isRevokingAgent ? revokingAgentId : null,
              pendingAgentSystemPermissionsSaveId: isSavingAgentSystemPermissions
                ? savingAgentSystemPermissionsVariables?.agentId
                : null,
              pendingPrincipalMailboxGrantsSaveId: isSavingPrincipalMailboxGrants
                ? savingPrincipalMailboxGrantsVariables?.principal
                  ? mailboxAdminPrincipalKey(savingPrincipalMailboxGrantsVariables.principal)
                  : null
                : null,
              pendingPrincipalSystemPermissionsSaveId: isSavingPrincipalSystemPermissions
                ? savingPrincipalSystemPermissionsVariables?.principal
                  ? mailboxAdminPrincipalKey(savingPrincipalSystemPermissionsVariables.principal)
                  : null
                : null,
              pendingGroupDisableId: isDisablingGroup ? disablingGroupId : null,
              pendingGroupSave: isSavingGroup
            }
          )
        : undefined,
    [
      activeMailboxAdminSection,
      createAgent,
      createdAgentEnrollment,
      disableAccount,
      disablingAccountId,
      disableGroup,
      disablingGroupId,
      isDisablingAccount,
      isDisablingGroup,
      isCreatingAgent,
      isSavingAgentMailboxGrants,
      isSavingAgentSystemPermissions,
      isSavingPrincipalMailboxGrants,
      isSavingPrincipalSystemPermissions,
      isRevokingAgent,
      isRevokingAgentEnrollment,
      isSavingAgent,
      isSavingAccount,
      isSavingGroup,
      mailboxAdminDialog,
      mailboxAdminData,
      mailboxAdminError,
      mailboxAdminStatus,
      openMailboxFromAdmin,
      refetchMailboxAdmin,
      handleCopyAgentEnrollmentCommand,
      handleMailboxAdminDialogChange,
      revokeAgent,
      revokeAgentEnrollment,
      revokingAgentEnrollmentId,
      revokingAgentId,
      saveAccount,
      saveAgent,
      saveAgentMailboxGrants,
      saveAgentSystemPermissions,
      savePrincipalMailboxGrants,
      savePrincipalSystemPermissions,
      saveGroup,
      savingAgentVariables?.agentId,
      savingAgentMailboxGrantsVariables?.agentId,
      savingAgentSystemPermissionsVariables?.agentId,
      savingPrincipalMailboxGrantsVariables?.principal,
      savingPrincipalSystemPermissionsVariables?.principal
    ]
  )
  const mailboxAdminPagination = React.useMemo<MailboxAdminPagination | undefined>(() => {
    if (!activeMailboxAdminSection) {
      return mailboxAdminBaseView?.pagination
    }

    return (
      mailboxAdminBaseView?.pagination ?? {
        page: mailboxAdminPage,
        pageSize: MAILBOX_ADMIN_PAGE_SIZE
      }
    )
  }, [activeMailboxAdminSection, mailboxAdminBaseView?.pagination, mailboxAdminPage])
  const handleMailboxAdminSearchChange = React.useCallback(
    (nextQuery: string) => {
      if (!activeMailboxAdminSection) {
        return
      }

      setMailboxAdminSearchBySection((current) => ({
        ...current,
        [activeMailboxAdminSection]: nextQuery
      }))
      setMailboxAdminPageBySection((current) => ({
        ...current,
        [activeMailboxAdminSection]: 1
      }))
      mailboxAdminBaseView?.onSearchQueryChange?.(nextQuery)
    },
    [activeMailboxAdminSection, mailboxAdminBaseView]
  )
  const handleMailboxAdminStatusFilterChange = React.useCallback(
    (nextStatusFilter: MailboxAdminStatusFilter) => {
      if (!activeMailboxAdminSection) {
        return
      }

      setMailboxAdminStatusFilterBySection((current) => ({
        ...current,
        [activeMailboxAdminSection]: nextStatusFilter
      }))
      setMailboxAdminPageBySection((current) => ({
        ...current,
        [activeMailboxAdminSection]: 1
      }))
      mailboxAdminBaseView?.onStatusFilterChange?.(nextStatusFilter)
    },
    [activeMailboxAdminSection, mailboxAdminBaseView]
  )
  const handleMailboxAdminPageChange = React.useCallback(
    (nextPage: number) => {
      if (!activeMailboxAdminSection) {
        return
      }

      setMailboxAdminPageBySection((current) => ({
        ...current,
        [activeMailboxAdminSection]: nextPage
      }))
      mailboxAdminBaseView?.onPageChange?.(nextPage)
    },
    [activeMailboxAdminSection, mailboxAdminBaseView]
  )
  const mailboxAdminView = React.useMemo<MailboxAdminView | undefined>(
    () =>
      activeMailboxAdminSection && mailboxAdminBaseView
        ? {
            ...mailboxAdminBaseView,
            onPageChange: handleMailboxAdminPageChange,
            onSearchQueryChange: handleMailboxAdminSearchChange,
            onStatusFilterChange: handleMailboxAdminStatusFilterChange,
            pagination: mailboxAdminPagination,
            searchQuery: mailboxAdminBaseView.searchQuery ?? mailboxAdminSearchQuery,
            section: activeMailboxAdminSection,
            statusFilter: mailboxAdminBaseView.statusFilter ?? mailboxAdminStatusFilter
          }
        : mailboxAdminBaseView,
    [
      activeMailboxAdminSection,
      handleMailboxAdminPageChange,
      handleMailboxAdminSearchChange,
      handleMailboxAdminStatusFilterChange,
      mailboxAdminBaseView,
      mailboxAdminPagination,
      mailboxAdminSearchQuery,
      mailboxAdminStatusFilter
    ]
  )
  const { dashboardView, emailPreviewsById, sidebarView } = workspaceScreenModel
  const mailActionView = React.useMemo(
    () =>
      toMailActionView({
        deleteDialog,
        folders: workspace?.folders ?? [],
        moveDialog,
        originalSourceDialog,
        selectedMessage
      }),
    [deleteDialog, moveDialog, originalSourceDialog, selectedMessage, workspace?.folders]
  )
  const composeView = React.useMemo(
    () =>
      toComposeView(composeState, {
        isSavingDraft,
        isSending: isSendingDraft || isSendingMessage
      }),
    [composeState, isSavingDraft, isSendingDraft, isSendingMessage]
  )

  const navigateMail = React.useCallback(
    (patch: Partial<DashboardSearch>) => {
      const nextSearch: DashboardSearch = {
        ...routeSearch,
        ...patch
      }

      router
        .navigate({
          search: cleanDashboardSearch(nextSearch),
          to: '/dashboard/'
        })
        .catch(ignoreAsyncError)
    },
    [routeSearch, router]
  )

  const handleComposeOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        setComposeState(closedComposeState())
        return
      }
      const account = workspace?.accounts.find(
        (candidate: AgentMailWebAccount) => candidate.id === workspace.activeAccountId
      )
      setComposeState({
        ...closedComposeState(),
        fromAddress: account?.address,
        fromLabel: account?.name,
        state: 'open'
      })
    },
    [workspace?.accounts, workspace?.activeAccountId]
  )
  const handleComposeFieldChange = React.useCallback((field: AuthenticatedComposeField, value: string) => {
    setComposeState((current) => ({
      ...current,
      [field === 'body' ? 'body' : field]: value,
      errorMessage: undefined
    }))
  }, [])
  const handleComposeSaveDraft = React.useCallback(async () => {
    if (!workspace?.activeAccountId) {
      setComposeState((current) => ({ ...current, errorMessage: 'Select a mailbox before saving.' }))
      return
    }
    try {
      const result = await saveDraft(composePayload(workspace.activeAccountId, composeState))
      setComposeState((current) => ({
        ...current,
        draftId: result.draftId,
        draftMailboxId: result.mailboxId,
        errorMessage: undefined
      }))
    } catch (error) {
      setComposeState((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Draft could not be saved.')
      }))
    }
  }, [composeState, saveDraft, workspace?.activeAccountId])
  const handleComposeSubmit = React.useCallback(async () => {
    if (!workspace?.activeAccountId) {
      setComposeState((current) => ({ ...current, errorMessage: 'Select a mailbox before sending.' }))
      return
    }
    try {
      if (composeState.draftId && composeState.draftMailboxId) {
        const draft = await saveDraft(composePayload(workspace.activeAccountId, composeState))
        await sendDraft({
          accountId: workspace.activeAccountId,
          mailboxId: draft.mailboxId,
          messageId: draft.draftId
        })
      } else {
        await sendMessage(composePayload(workspace.activeAccountId, composeState))
      }
      setComposeState(closedComposeState())
    } catch (error) {
      setComposeState((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Message could not be sent.')
      }))
    }
  }, [composeState, saveDraft, sendDraft, sendMessage, workspace?.activeAccountId])
  const handleComposeDiscardDraft = React.useCallback(async () => {
    if (workspace?.activeAccountId && composeState.draftId && composeState.draftMailboxId) {
      await deleteMessage({
        accountId: workspace.activeAccountId,
        mailboxId: composeState.draftMailboxId,
        messageId: composeState.draftId
      })
    }
    setComposeState(closedComposeState())
  }, [composeState.draftId, composeState.draftMailboxId, deleteMessage, workspace?.activeAccountId])

  const handleEmailAction = React.useCallback(
    (action: AuthenticatedEmailAction, email: AuthenticatedEmailPreview) => {
      if (
        action === 'show-remote-images' ||
        action === 'collapse-thread-message' ||
        action === 'expand-thread-message'
      ) {
        return
      }

      const targetMessage = findActionMessage(selectedMessage, email)
      const actionInput =
        targetMessage && workspace?.activeAccountId
          ? {
              accountId: workspace.activeAccountId,
              mailboxId: targetMessage.mailboxId,
              messageId: targetMessage.id
            }
          : null

      if (!actionInput || !targetMessage) {
        return
      }

      switch (action) {
        case 'reply':
        case 'reply-all':
        case 'forward':
          setComposeState(composeFromMessage(action, targetMessage, workspace?.activeAccountId))
          break
        case 'star':
        case 'unstar':
          runAsync(
            updateMessage({
              ...actionInput,
              flagged: action === 'star'
            })
          )
          break
        case 'mark-read':
        case 'mark-unread':
          runAsync(
            updateMessage({
              ...actionInput,
              seen: action === 'mark-read'
            })
          )
          break
        case 'mark-spam':
        case 'mark-not-spam': {
          const targetMailbox = findSystemFolder(
            workspace?.folders ?? [],
            action === 'mark-spam'
              ? { path: 'Junk', specialUse: '\\Junk' }
              : { path: 'INBOX', specialUse: '\\Inbox' }
          )
          if (targetMailbox) {
            runAsync(
              moveMessage({
                ...actionInput,
                targetMailboxId: targetMailbox.id
              })
            )
          }
          break
        }
        case 'move':
          setMoveDialog({
            actionInput,
            selectedFolderId: targetMessage.mailboxId,
            state: 'open'
          })
          break
        case 'delete':
        case 'discard-draft':
          setDeleteDialog({ actionInput, isDraft: targetMessage.isDraft, state: 'open' })
          break
        case 'edit-draft':
          setComposeState(composeFromDraft(targetMessage, workspace?.activeAccountId))
          break
        case 'send-draft':
          runAsync(sendDraft(actionInput))
          break
        case 'view-original':
          setOriginalSourceDialog({ isLoading: true, state: 'open' })
          runAsync(
            fetchMailOriginalSource(actionInput)
              .then((source) => {
                setOriginalSourceDialog({ source, state: 'open' })
              })
              .catch((error: unknown) => {
                setOriginalSourceDialog({
                  errorMessage: errorMessage(error, 'Original source could not be loaded.'),
                  state: 'open'
                })
              })
          )
          break
        case 'back':
        case 'close':
          navigateMail({ messageId: undefined })
          break
        case 'archive': {
          const archiveFolder = findSystemFolder(workspace?.folders ?? [], {
            path: 'Archive',
            specialUse: '\\Archive'
          })
          if (archiveFolder && archiveFolder.id !== targetMessage.mailboxId) {
            runAsync(
              moveMessage({
                ...actionInput,
                targetMailboxId: archiveFolder.id
              })
            )
          }
          break
        }
        case 'restore':
        case 'snooze':
          break
      }
    },
    [
      moveMessage,
      navigateMail,
      selectedMessage,
      sendDraft,
      updateMessage,
      workspace?.activeAccountId,
      workspace?.folders
    ]
  )

  const handleMailDeleteConfirm = React.useCallback(async () => {
    const actionInput = deleteDialog.actionInput ?? selectedMessageActionInput
    if (!actionInput) {
      return
    }
    setDeleteDialog((current) => ({ ...current, isSubmitting: true }))
    try {
      await deleteMessage(actionInput)
      setDeleteDialog({ state: 'closed' })
      if (actionInput.messageId === selectedMessage?.id) {
        navigateMail({ messageId: undefined })
      }
    } catch (error) {
      setDeleteDialog({
        actionInput,
        errorMessage: errorMessage(error, 'Message could not be deleted.'),
        isDraft: deleteDialog.isDraft,
        state: 'open'
      })
    }
  }, [
    deleteDialog.actionInput,
    deleteDialog.isDraft,
    deleteMessage,
    navigateMail,
    selectedMessage?.id,
    selectedMessageActionInput
  ])

  const handleMailMoveSubmit = React.useCallback(async () => {
    const actionInput = moveDialog.actionInput ?? selectedMessageActionInput
    if (!actionInput || !moveDialog.selectedFolderId) {
      return
    }
    setMoveDialog((current) => ({ ...current, isSubmitting: true }))
    try {
      await moveMessage({
        ...actionInput,
        targetMailboxId: moveDialog.selectedFolderId
      })
      setMoveDialog({ state: 'closed' })
    } catch (error) {
      setMoveDialog({
        actionInput,
        errorMessage: errorMessage(error, 'Message could not be moved.'),
        selectedFolderId: moveDialog.selectedFolderId,
        state: 'open'
      })
    }
  }, [moveDialog.actionInput, moveDialog.selectedFolderId, moveMessage, selectedMessageActionInput])

  const handleMailboxFolderCreateSubmit = React.useCallback(async () => {
    if (!workspace?.activeAccountId) {
      return
    }
    setFolderCreate((current) => ({ ...current, isSubmitting: true }))
    try {
      await createFolder({
        accountId: workspace.activeAccountId,
        name: folderCreate.name
      })
      setFolderCreate({ name: '', state: 'closed' })
    } catch (error) {
      setFolderCreate((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Folder could not be created.'),
        isSubmitting: false,
        state: 'open'
      }))
    }
  }, [createFolder, folderCreate.name, workspace?.activeAccountId])

  const handleMailboxFolderDeleteConfirm = React.useCallback(async () => {
    if (!workspace?.activeAccountId || !folderDelete.folderId) {
      return
    }
    setFolderDelete((current) => ({ ...current, isSubmitting: true }))
    try {
      await deleteFolder({
        accountId: workspace.activeAccountId,
        mailboxId: folderDelete.folderId
      })
      setFolderDelete({ state: 'closed' })
      if (routeSearch?.folderId === folderDelete.folderId) {
        navigateMail({ folderId: undefined, messageId: undefined })
      }
    } catch (error) {
      setFolderDelete((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Folder could not be deleted.'),
        isSubmitting: false,
        state: 'open'
      }))
    }
  }, [deleteFolder, folderDelete.folderId, navigateMail, routeSearch?.folderId, workspace?.activeAccountId])

  const handleMailboxFolderRenameSubmit = React.useCallback(async () => {
    if (!workspace?.activeAccountId || !folderRename.folderId) {
      return
    }
    setFolderRename((current) => ({ ...current, isSubmitting: true }))
    try {
      await renameFolder({
        accountId: workspace.activeAccountId,
        mailboxId: folderRename.folderId,
        name: folderRename.name
      })
      setFolderRename({ name: '', state: 'closed' })
      if (routeSearch?.folderId === folderRename.folderId) {
        navigateMail({ messageId: undefined })
      }
    } catch (error) {
      setFolderRename((current) => ({
        ...current,
        errorMessage: errorMessage(error, 'Folder could not be renamed.'),
        isSubmitting: false,
        state: 'open'
      }))
    }
  }, [
    folderRename.folderId,
    folderRename.name,
    navigateMail,
    renameFolder,
    routeSearch?.folderId,
    workspace?.activeAccountId
  ])

  return (
    <DashboardScreen
      {...screenProps}
      agentAccessState={agentAccessState}
      composeView={composeView}
      dashboardView={dashboardView}
      domainSettingsState={domainSettingsState}
      emailPreviewsById={emailPreviewsById}
      firstMailboxSetupState={firstMailboxSetupState}
      mailboxAdminView={mailboxAdminView}
      mailActionView={mailActionView}
      onComposeDiscardDraft={() => {
        runAsync(handleComposeDiscardDraft())
      }}
      onComposeFieldChange={handleComposeFieldChange}
      onComposeOpenChange={handleComposeOpenChange}
      onComposeSaveDraft={() => {
        runAsync(handleComposeSaveDraft())
      }}
      onComposeSubmit={() => {
        runAsync(handleComposeSubmit())
      }}
      onEmailAction={handleEmailAction}
      onMailActionDialogOpenChange={(dialog, open) => {
        handleDialogOpenChange(dialog, open, setMoveDialog, setDeleteDialog, setOriginalSourceDialog)
      }}
      onMailDeleteConfirm={() => {
        runAsync(handleMailDeleteConfirm())
      }}
      onMailMoveSubmit={() => {
        runAsync(handleMailMoveSubmit())
      }}
      onMailMoveTargetChange={(folderId) => {
        setMoveDialog((current) => ({ ...current, selectedFolderId: folderId }))
      }}
      onMailOriginalSourceDownload={() => {
        downloadOriginalSource(selectedMessage, originalSourceDialog.source)
      }}
      onDashboardOnboardingConnect={dashboardOnboardingStartOAuth}
      onMailboxAccountSelect={(accountId) => {
        navigateMail({
          accountId,
          cursor: undefined,
          direction: undefined,
          folderId: undefined,
          messageId: undefined
        })
      }}
      onMailboxFolderAction={(action, folder) => {
        if (action === 'delete-folder') {
          setFolderDelete({
            folderId: folder.id,
            state: 'open',
            title: `Delete ${folder.title}?`
          })
        } else if (action === 'rename-folder') {
          setFolderRename({
            folderId: folder.id,
            name: folder.title,
            state: 'open',
            title: `Rename ${folder.title}`
          })
        }
      }}
      onMailboxFolderCreateNameChange={(name) => {
        setFolderCreate((current) => ({ ...current, errorMessage: undefined, name }))
      }}
      onMailboxFolderCreateOpenChange={(open) => {
        setFolderCreate((current) => ({
          ...current,
          errorMessage: undefined,
          state: open ? 'open' : 'closed'
        }))
      }}
      onMailboxFolderCreateSubmit={() => {
        runAsync(handleMailboxFolderCreateSubmit())
      }}
      onMailboxFolderDeleteConfirm={() => {
        runAsync(handleMailboxFolderDeleteConfirm())
      }}
      onMailboxFolderDeleteOpenChange={(open) => {
        setFolderDelete((current) => ({
          ...current,
          errorMessage: undefined,
          state: open ? 'open' : 'closed'
        }))
      }}
      onMailboxFolderRenameNameChange={(name) => {
        setFolderRename((current) => ({ ...current, errorMessage: undefined, name }))
      }}
      onMailboxFolderRenameOpenChange={(open) => {
        setFolderRename((current) => ({
          ...current,
          errorMessage: undefined,
          state: open ? 'open' : 'closed'
        }))
      }}
      onMailboxFolderRenameSubmit={() => {
        runAsync(handleMailboxFolderRenameSubmit())
      }}
      onMailboxFolderSelect={(folderId) => {
        if (folderId === FIRST_USE_SETUP_NAV_ITEM_ID) {
          navigateMail({
            accountId: undefined,
            cursor: undefined,
            direction: undefined,
            folderId: undefined,
            mailboxAdmin: undefined,
            mailQuery: undefined,
            messageId: undefined,
            unreadOnly: undefined
          })
          return
        }

        if (isMailboxAdminSectionId(folderId)) {
          navigateMail({
            cursor: undefined,
            direction: undefined,
            folderId: undefined,
            mailboxAdmin: folderId,
            mailQuery: undefined,
            messageId: undefined,
            unreadOnly: undefined
          })
          return
        }

        navigateMail({
          cursor: undefined,
          direction: undefined,
          folderId,
          mailboxAdmin: undefined,
          messageId: undefined
        })
      }}
      onMailboxMessageSelect={(mailId) => {
        navigateMail({ messageId: mailId })
      }}
      onMailboxPageChange={(pageChange: AuthenticatedMailPageChange) => {
        navigateMail({
          cursor: pageChange.cursor ?? undefined,
          direction: pageChange.direction
        })
      }}
      onMailboxRefresh={() => {
        runAsync(refetchWorkspace())
      }}
      onMailboxRetry={() => {
        runAsync(refetchWorkspace())
      }}
      onMailboxSearchChange={(mailQuery) => {
        navigateMail({
          cursor: undefined,
          direction: undefined,
          mailQuery,
          messageId: undefined
        })
      }}
      onMailboxUnreadOnlyChange={(unreadOnly) => {
        navigateMail({
          cursor: undefined,
          direction: undefined,
          messageId: undefined,
          unreadOnly
        })
      }}
      onMessageRetry={() => {
        runAsync(refetchWorkspace())
      }}
      sidebarView={sidebarView}
    />
  )
}

function toMailActionView({
  deleteDialog,
  folders,
  moveDialog,
  originalSourceDialog,
  selectedMessage
}: {
  deleteDialog: {
    actionInput?: AgentMailMessageActionInput
    errorMessage?: string
    isDraft?: boolean
    isSubmitting?: boolean
    state: 'closed' | 'open'
  }
  folders: ReadonlyArray<AgentMailWebFolder>
  moveDialog: {
    actionInput?: AgentMailMessageActionInput
    errorMessage?: string
    isSubmitting?: boolean
    selectedFolderId?: string
    state: 'closed' | 'open'
  }
  originalSourceDialog: {
    errorMessage?: string
    isLoading?: boolean
    source?: string
    state: 'closed' | 'open'
  }
  selectedMessage: AgentMailWebMessageDetail | null
}): AuthenticatedMailActionView {
  const deleteTargetIsDraft = deleteDialog.isDraft ?? selectedMessage?.isDraft
  const moveSourceMailboxId = moveDialog.actionInput?.mailboxId ?? selectedMessage?.mailboxId
  return {
    delete: {
      confirmLabel: deleteTargetIsDraft ? 'Discard draft' : 'Delete message',
      description: deleteTargetIsDraft
        ? 'This removes the saved draft from the WildDuck Drafts folder.'
        : 'This removes the message from the selected WildDuck folder.',
      errorMessage: deleteDialog.errorMessage,
      isSubmitting: deleteDialog.isSubmitting,
      state: deleteDialog.state,
      title: deleteTargetIsDraft ? 'Discard this draft?' : 'Delete this message?'
    },
    move: {
      description: 'Choose the WildDuck folder that should receive this message.',
      errorMessage: moveDialog.errorMessage,
      folders: folders.map((folder) => ({
        disabled: folder.id === moveSourceMailboxId,
        disabledReason: folder.id === moveSourceMailboxId ? 'Message is already in this folder' : undefined,
        id: folder.id,
        title: folder.name,
        unreadCountLabel: folder.unread ? String(folder.unread) : undefined
      })),
      isSubmitting: moveDialog.isSubmitting,
      selectedFolderId: moveDialog.selectedFolderId,
      state: moveDialog.state,
      submitLabel: moveDialog.isSubmitting ? 'Moving' : 'Move',
      title: 'Move message'
    },
    originalSource: {
      description: 'WildDuck RFC822 source for the selected message.',
      downloadLabel: 'Download .eml',
      errorMessage: originalSourceDialog.errorMessage,
      isLoading: originalSourceDialog.isLoading,
      rawSources: [
        {
          id: 'wildduck-source',
          source: originalSourceDialog.source,
          title: 'Final WildDuck Raw Source'
        }
      ],
      source: originalSourceDialog.source,
      state: originalSourceDialog.state,
      title: 'Original source'
    }
  }
}

function toComposeView(
  state: ComposeState,
  status: { isSavingDraft?: boolean; isSending?: boolean }
): AuthenticatedComposeView {
  return {
    bcc: state.bcc,
    body: state.body,
    canSaveDraft: state.state === 'open',
    canSend: state.state === 'open',
    cc: state.cc,
    draftId: state.draftId,
    draftStatusLabel: state.draftId ? 'Saved to WildDuck Drafts' : undefined,
    errorMessage: state.errorMessage,
    fromAddress: state.fromAddress,
    fromLabel: state.fromLabel,
    isSavingDraft: status.isSavingDraft,
    isSending: status.isSending,
    mode: state.mode,
    state: state.state,
    subject: state.subject,
    title: state.title,
    to: state.to
  }
}

function closedComposeState(): ComposeState {
  return {
    bcc: '',
    body: '',
    cc: '',
    mode: 'new',
    state: 'closed',
    subject: '',
    title: 'New message',
    to: ''
  }
}

function composePayload(accountId: string, state: ComposeState): AgentMailComposeInput {
  return {
    accountId,
    bcc: state.bcc,
    body: state.body,
    cc: state.cc,
    draftMailboxId: state.draftMailboxId,
    draftMessageId: state.draftId,
    reference: state.reference,
    subject: state.subject,
    to: state.to
  }
}

function findActionMessage(
  selectedMessage: AgentMailWebMessageDetail | null,
  email: AuthenticatedEmailPreview
): AgentMailWebThreadMessage | null {
  if (!selectedMessage) {
    return null
  }
  if (selectedMessage.id === email.id && (!email.folderId || selectedMessage.mailboxId === email.folderId)) {
    return selectedMessage
  }
  return (
    selectedMessage.thread?.find(
      (message: AgentMailWebThreadMessage) =>
        message.id === email.id && (!email.folderId || message.mailboxId === email.folderId)
    ) ?? null
  )
}

function composeFromMessage(
  action: 'forward' | 'reply' | 'reply-all',
  message: AgentMailWebThreadMessage,
  accountId: string | null | undefined
): ComposeState {
  const mode = action === 'reply-all' ? 'reply-all' : action
  return {
    ...closedComposeState(),
    body: action === 'forward' ? forwardedBody(message) : '',
    fromAddress: accountId ?? undefined,
    mode,
    reference: {
      action: action === 'reply-all' ? 'replyAll' : action,
      mailboxId: message.mailboxId,
      messageId: message.id
    },
    state: 'open',
    subject: prefixedSubject(action === 'forward' ? 'Fwd' : 'Re', message.subject),
    title: action === 'forward' ? 'Forward message' : action === 'reply-all' ? 'Reply all' : 'Reply',
    to: action === 'forward' ? '' : replyRecipient(message)
  }
}

function composeFromDraft(
  message: AgentMailWebThreadMessage,
  accountId: string | null | undefined
): ComposeState {
  return {
    ...closedComposeState(),
    body: stripHTML(message.html),
    draftId: message.id,
    draftMailboxId: message.mailboxId,
    fromAddress: accountId ?? undefined,
    mode: 'draft',
    state: 'open',
    subject: message.subject,
    title: 'Draft message',
    to: message.to.join(', ')
  }
}

function prefixedSubject(prefix: 'Fwd' | 'Re', subject: string) {
  return subject.startsWith(`${prefix}:`) ? subject : `${prefix}: ${subject}`
}

function forwardedBody(message: AgentMailWebThreadMessage) {
  return [
    '',
    '',
    '---------- Forwarded message ---------',
    `From: ${message.from}`,
    `To: ${message.to.join(', ')}`,
    `Subject: ${message.subject}`,
    '',
    stripHTML(message.html)
  ].join('\n')
}

function replyRecipient(message: AgentMailWebThreadMessage) {
  return mailboxAddress(message.replyTo[0]) || mailboxAddress(message.from)
}

function stripHTML(value: string) {
  return value
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/p>/giu, '\n')
    .replace(/<[^>]*>/gu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function handleDialogOpenChange(
  dialog: AuthenticatedMailActionDialogKind,
  open: boolean,
  setMoveDialog: React.Dispatch<
    React.SetStateAction<{
      actionInput?: AgentMailMessageActionInput
      errorMessage?: string
      isSubmitting?: boolean
      selectedFolderId?: string
      state: 'closed' | 'open'
    }>
  >,
  setDeleteDialog: React.Dispatch<
    React.SetStateAction<{
      actionInput?: AgentMailMessageActionInput
      errorMessage?: string
      isDraft?: boolean
      isSubmitting?: boolean
      state: 'closed' | 'open'
    }>
  >,
  setOriginalSourceDialog: React.Dispatch<
    React.SetStateAction<{
      errorMessage?: string
      isLoading?: boolean
      source?: string
      state: 'closed' | 'open'
    }>
  >
) {
  if (dialog === 'move') {
    setMoveDialog((current) => ({ ...current, state: open ? 'open' : 'closed' }))
  } else if (dialog === 'delete') {
    setDeleteDialog((current) => ({ ...current, state: open ? 'open' : 'closed' }))
  } else {
    setOriginalSourceDialog((current) => ({ ...current, state: open ? 'open' : 'closed' }))
  }
}

function downloadOriginalSource(message: AgentMailWebMessageDetail | null, source: string | undefined) {
  if (!message || !source || typeof globalThis.document === 'undefined') {
    return
  }

  const link = globalThis.document.createElement('a')
  link.download = `${message.id}.eml`
  link.href = globalThis.URL.createObjectURL(new Blob([source], { type: 'message/rfc822' }))
  link.click()
  globalThis.URL.revokeObjectURL(link.href)
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
