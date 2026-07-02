import { expect, fn, userEvent, within } from 'storybook/test'

import {
  domainSettingsAddDomainAuthorizeCloudflareState,
  domainSettingsAddDomainSelectZoneState,
  domainSettingsDenseDomainListState,
  domainSettingsDomainDisconnectedState,
  domainSettingsDomainLiveState,
  domainSettingsDomainNeedsAttentionState,
  domainSettingsDomainRetryBusyState,
  domainSettingsEmptyFirstUseState,
  domainSettingsLoadDomainsBusyState,
  domainSettingsLoadDomainsState,
  domainSettingsLoadErrorState,
  domainSettingsLoadingState,
  domainSettingsMissingCloudflarePermissionsState
} from '../authenticated-section-fixtures'
import {
  agentAccessActionableState,
  agentAccessActiveState,
  agentAccessClaimedState,
  agentAccessConstraintDetailsState,
  agentAccessDeniedExpiredApprovalState,
  agentAccessDenseState,
  agentAccessEmptyState,
  agentAccessPaperclipConnectedState,
  agentAccessPendingApprovalState,
  agentAccessRevokedExpiredState
} from '../agent-access-fixtures'
import { storyAuthClient, storyAuthClientEmptySecurity } from '../auth-client-fixtures'
import { mailWorkspaceEmptyView } from '../mail-workspace-fixtures'
import { authenticatedSettingsRouteState, storyPublicEnv } from '../screen-fixtures'
import { getSettingsSectionHref } from '../../partials/authenticated/settings-dialog-sections'
import { DashboardMailControllerStoryFrame } from './story-frames'
import type { SettingsRouteSearch } from '../../lib/dashboard-search'
import type { DomainSettingsState } from '../../partials/authenticated/settings-dialog'
import type { SettingsSectionId } from '../../partials/authenticated/settings-dialog-sections'
import type { DashboardMailControllerStoryFrameProps } from './story-frames'
import type { AgentAccessView, AgentMailAdminNavigation, AgentMailWebWorkspace } from '@main/backend'
import type { Meta, StoryObj } from '@storybook/react'

type SettingsStoryArgs = DashboardMailControllerStoryFrameProps
type AgentAccessViewLoader = NonNullable<SettingsStoryArgs['agentAccessViewLoader']>
type MailWorkspaceLoader = NonNullable<SettingsStoryArgs['mailWorkspaceLoader']>
type MailboxAdminNavigationLoader = NonNullable<SettingsStoryArgs['mailboxAdminNavigationLoader']>

interface SettingsScreenScenario {
  agentAccessError?: Error
  agentAccessPending?: boolean
  agentAccessView?: AgentAccessView
  authClient?: SettingsStoryArgs['authClient']
  domainSettingsState?: DomainSettingsState
  routeSearch?: SettingsRouteSearch
  settingsSection: SettingsSectionId
  workspace?: AgentMailWebWorkspace
}

const settingsMailboxAdminNavigation = {
  allowedSections: ['accounts', 'groups', 'agents']
} satisfies AgentMailAdminNavigation

const defaultAgentAccessView = requiredAgentAccessView(agentAccessEmptyState)
const activeAgentAccessView = requiredAgentAccessView(agentAccessActiveState)
const actionableAgentAccessView = requiredAgentAccessView(agentAccessActionableState)

const agentAccessPaperclipHandoffView = {
  ...activeAgentAccessView,
  allowedActions: {
    ...activeAgentAccessView.allowedActions,
    connectPaperclip: true
  }
} satisfies AgentAccessView

const agentAccessReviewOnlyView = {
  ...actionableAgentAccessView,
  agents: actionableAgentAccessView.agents.map((agent) => ({
    ...agent,
    canRevoke: false
  })),
  allowedActions: {
    ...actionableAgentAccessView.allowedActions,
    connectPaperclip: false,
    denyApproval: false,
    revokeAgent: false,
    revokeCapabilityGrant: false,
    reviewApproval: true
  },
  approvals: actionableAgentAccessView.approvals.map((approval) => ({
    ...approval,
    canDeny: false,
    canReview: approval.status === 'pending'
  })),
  grants: actionableAgentAccessView.grants.map((grant) => ({
    ...grant,
    canRevoke: false
  }))
} satisfies AgentAccessView

export const settingsScreenStoryMeta = {
  component: DashboardMailControllerStoryFrame,
  args: buildSettingsScreenArgs({
    settingsSection: 'account'
  }),
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardMailControllerStoryFrame>

type Story = StoryObj<typeof settingsScreenStoryMeta>

function requiredAgentAccessView(state: { view: AgentAccessView | null }): AgentAccessView {
  if (!state.view) {
    throw new Error('Expected the agent access fixture to include a view.')
  }

  return state.view
}

function createStoryAgentAccessViewLoader({
  error,
  pending,
  view = defaultAgentAccessView
}: {
  error?: Error
  pending?: boolean
  view?: AgentAccessView
}): AgentAccessViewLoader {
  return async () => {
    if (pending) {
      await new Promise(() => {})
    }

    if (error) {
      throw error
    }

    return view
  }
}

function createStoryMailWorkspaceLoader(
  workspace: AgentMailWebWorkspace = mailWorkspaceEmptyView
): MailWorkspaceLoader {
  return async () => workspace
}

function createStoryMailboxAdminNavigationLoader(
  navigation = settingsMailboxAdminNavigation
): MailboxAdminNavigationLoader {
  return async () => navigation
}

function buildSettingsScreenArgs({
  agentAccessError,
  agentAccessPending,
  agentAccessView,
  authClient = storyAuthClient,
  domainSettingsState = domainSettingsEmptyFirstUseState,
  routeSearch,
  settingsSection,
  workspace
}: SettingsScreenScenario): SettingsStoryArgs {
  return {
    agentAccessViewLoader: createStoryAgentAccessViewLoader({
      error: agentAccessError,
      pending: agentAccessPending,
      view: agentAccessView
    }),
    authClient,
    domainSettingsState,
    mailWorkspaceLoader: createStoryMailWorkspaceLoader(workspace),
    mailboxAdminNavigationLoader: createStoryMailboxAdminNavigationLoader(),
    publicEnv: storyPublicEnv,
    routeSearch: routeSearch ?? {},
    routeState: authenticatedSettingsRouteState,
    sessionCleanupEnabled: false,
    settingsOpen: true,
    settingsSection,
    storyPath: getSettingsSectionHref(settingsSection)
  }
}

function storyBody(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body)
}

async function findAndScrollToText(canvasElement: HTMLElement, text: RegExp | string) {
  const canvas = storyBody(canvasElement)
  const element = await canvas.findByText(text)

  element.scrollIntoView({ block: 'center' })
  await expect(element).toBeInTheDocument()

  return canvas
}

async function expectSettingsDomainsDialog(args: SettingsStoryArgs, canvasElement: HTMLElement) {
  const canvas = storyBody(canvasElement)

  await expect(args.storyPath).toBe('/settings/domains/')
  await expect(await canvas.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  await expect(canvas.queryByRole('dialog', { name: /onboarding/i })).not.toBeInTheDocument()

  return canvas
}

export const Account: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'account'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('User profile')).toBeInTheDocument()
    await expect(await canvas.findByText('Change email')).toBeInTheDocument()
  }
}

export const AccountManageAccounts: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'account'
  }),
  play: async ({ canvasElement }) => {
    const canvas = await findAndScrollToText(canvasElement, 'Manage accounts')

    await expect(await canvas.findByText('marin.secondary@northstar-ops.example.test')).toBeInTheDocument()
  }
}

export const AccountAppearance: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'account'
  }),
  play: async ({ canvasElement }) => {
    const canvas = await findAndScrollToText(canvasElement, 'Appearance')

    await expect(await canvas.findByText('System')).toBeInTheDocument()
    await expect(await canvas.findByText('Light')).toBeInTheDocument()
    await expect(await canvas.findByText('Dark')).toBeInTheDocument()
  }
}

export const Security: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'security'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Active sessions')).toBeInTheDocument()
    await expect(await canvas.findByText(/Safari/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/Chrome/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/at-email/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/Linux/i)).toBeInTheDocument()
  }
}

export const SecurityActiveSessions: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'security'
  }),
  play: async ({ canvasElement }) => {
    const canvas = await findAndScrollToText(canvasElement, 'Active sessions')

    await expect(await canvas.findByText(/at-email/i)).toBeInTheDocument()
    await expect((await canvas.findAllByRole('button', { name: /revoke/i })).length).toBeGreaterThan(0)
  }
}

export const SecurityPasskeys: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'security'
  }),
  play: async ({ canvasElement }) => {
    const canvas = await findAndScrollToText(canvasElement, 'Passkeys')

    await expect(await canvas.findByText('Platform authenticator')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^add passkey$/i })).toBeEnabled()
  }
}

export const SecurityApiKeys: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'security'
  }),
  play: async ({ canvasElement }) => {
    const canvas = await findAndScrollToText(canvasElement, 'API keys')

    await expect(await canvas.findByText('CI mailbox client')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^create api key$/i })).toBeEnabled()
  }
}

export const SecurityDangerZone: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'security'
  }),
  play: async ({ canvasElement }) => {
    const canvas = await findAndScrollToText(canvasElement, 'Danger zone')

    await expect(await canvas.findByRole('button', { name: /^delete account$/i })).toBeEnabled()
  }
}

export const SecurityEmptyCredentials: Story = {
  args: buildSettingsScreenArgs({
    authClient: storyAuthClientEmptySecurity,
    settingsSection: 'security'
  }),
  play: async ({ canvasElement }) => {
    const canvas = await findAndScrollToText(canvasElement, 'Passkeys')

    await expect(await canvas.findByText('No passkeys')).toBeInTheDocument()
    await findAndScrollToText(canvasElement, 'API keys')
    await expect(await canvas.findByText('No API keys')).toBeInTheDocument()
  }
}

export const AgentAccessLoading: Story = {
  args: buildSettingsScreenArgs({
    agentAccessPending: true,
    settingsSection: 'agentAccess'
  })
}

export const AgentAccessError: Story = {
  args: buildSettingsScreenArgs({
    agentAccessError: new Error('Agent Access request failed with HTTP 403.'),
    settingsSection: 'agentAccess'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Agent access unavailable')).toBeInTheDocument()
    await expect(await canvas.findByText('Agent Access request failed with HTTP 403.')).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^retry$/i })).toBeEnabled()
  }
}

export const AgentAccessEmpty: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: defaultAgentAccessView,
    settingsSection: 'agentAccess'
  })
}

export const AgentAccessActive: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: activeAgentAccessView,
    settingsSection: 'agentAccess'
  })
}

export const IntegrationsPaperclipHandoff: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: agentAccessPaperclipHandoffView,
    routeSearch: {
      integrationSource: 'paperclip',
      paperclipCompanyId: 'paperclip-company-1',
      paperclipPluginId: 'agentteam.paperclip-email-plugin'
    },
    settingsSection: 'integrations'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await canvas.findByText('Paperclip authorization requested')
    await canvas.findByText('Context: Ready')
    await canvas.findByText('Plugin: AgentTeam Email plugin')
    await expect(canvas.queryByText('Company: paperclip-company-1')).toBeNull()
    await expect(canvas.queryByText('Plugin: agentteam.paperclip-email-plugin')).toBeNull()
    await expect(await canvas.findByRole('button', { name: /^register plugin$/i })).toBeEnabled()
  }
}

export const IntegrationsPaperclipConnected: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: requiredAgentAccessView(agentAccessPaperclipConnectedState),
    settingsSection: 'integrations'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Plugin authorizations')).toBeInTheDocument()
    await expect(await canvas.findByText('Paperclip Email')).toBeInTheDocument()
    await expect(
      (await canvas.findAllByText(/Paperclip plugin authorization for mailbox access/iu)).length
    ).toBeGreaterThan(0)
    await expect(canvas.queryByText('paperclip-company-1')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Paperclip authorization requested')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^register plugin$/i })).not.toBeInTheDocument()
  }
}

export const AgentAccessPendingApproval: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: requiredAgentAccessView(agentAccessPendingApprovalState),
    settingsSection: 'agentAccess'
  })
}

export const AgentAccessDeniedExpiredApprovals: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: requiredAgentAccessView(agentAccessDeniedExpiredApprovalState),
    settingsSection: 'agentAccess'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const reviewButtons = await canvas.findAllByRole('button', { name: /^review approval$/i })
    const denyButtons = await canvas.findAllByRole('button', { name: /^deny$/i })

    for (const button of [...reviewButtons, ...denyButtons]) {
      await expect(button).toBeDisabled()
    }
  }
}

export const AgentAccessActions: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: actionableAgentAccessView,
    settingsSection: 'agentAccess'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^review approval$/i })).toBeEnabled()
    await expect(await canvas.findByRole('button', { name: /^deny$/i })).toBeEnabled()
    await expect(await canvas.findByRole('button', { name: /^revoke agent$/i })).toBeEnabled()
    await expect(
      (await canvas.findAllByRole('button', { name: /^revoke capability$/i })).length
    ).toBeGreaterThan(0)
  }
}

export const AgentAccessPartialActions: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: agentAccessReviewOnlyView,
    settingsSection: 'agentAccess'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const reviewButton = await canvas.findByRole('button', { name: /^review approval$/i })
    const denyButton = await canvas.findByRole('button', { name: /^deny$/i })

    await expect(reviewButton).toBeEnabled()
    await expect(denyButton).toBeDisabled()
    await expect(canvas.queryByRole('button', { name: /^revoke agent$/i })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^revoke capability$/i })).not.toBeInTheDocument()
  }
}

export const AgentAccessRevokedExpired: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: requiredAgentAccessView(agentAccessRevokedExpiredState),
    settingsSection: 'agentAccess'
  })
}

export const AgentAccessClaimed: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: requiredAgentAccessView(agentAccessClaimedState),
    settingsSection: 'agentAccess'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Claimed Trial Agent')).toBeInTheDocument()
    await expect(await canvas.findByText('Claimed')).toBeInTheDocument()
  }
}

export const AgentAccessConstraintDetails: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: requiredAgentAccessView(agentAccessConstraintDetailsState),
    settingsSection: 'agentAccess'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Host Laptop host')).toBeInTheDocument()
    await expect((await canvas.findAllByText(/Agent Research Agent/iu)).length).toBeGreaterThan(0)
    await expect(await canvas.findAllByText(/research@agentteam\.example.*folder: Drafts/iu)).toHaveLength(2)
    await expect(await canvas.findAllByText('folder: Drafts')).toHaveLength(2)
    await expect(await canvas.findAllByText('maxDailyMessages: 25')).toHaveLength(2)
    await expect(canvas.queryByText('Custom constraints')).not.toBeInTheDocument()
  }
}

export const AgentAccessDense: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: requiredAgentAccessView(agentAccessDenseState),
    settingsSection: 'agentAccess'
  })
}

export const IntegrationsEmpty: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsEmptyFirstUseState,
    settingsSection: 'integrations'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(args.storyPath).toBe('/settings/integrations/')
    await expect(await canvas.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Connect Cloudflare' })).toBeEnabled()
  }
}

export const IntegrationsCloudflare: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsAddDomainSelectZoneState,
    settingsSection: 'integrations'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(args.storyPath).toBe('/settings/integrations/')
    await expect(await canvas.findByText('Integrations', { selector: 'p' })).toBeInTheDocument()
    await expect(await canvas.findByText('admin@example.com')).toBeInTheDocument()
    await expect((await canvas.findAllByText('Connected')).length).toBeGreaterThan(0)
    await expect(await canvas.findByRole('button', { name: 'Connect Cloudflare' })).toBeEnabled()
    await expect(
      (await canvas.findAllByRole('button', { name: /^disconnect account$/i })).length
    ).toBeGreaterThan(0)
    await expect(canvas.queryByRole('button', { name: /^disconnect cloudflare$/i })).not.toBeInTheDocument()
    await expect(canvas.queryByText(/cloudflare-user/iu)).not.toBeInTheDocument()
    await expect(canvas.queryByText(/grant /iu)).not.toBeInTheDocument()
    await expect(canvas.queryByText(/last checked/iu)).not.toBeInTheDocument()
  }
}

export const IntegrationsReconnectRequired: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsMissingCloudflarePermissionsState,
    settingsSection: 'integrations'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('limited-admin@example.com')).toBeInTheDocument()
    await expect(await canvas.findByText('Reconnect required')).toBeInTheDocument()
    await expect(await canvas.findByText(/1 required permission/iu)).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: /^reconnect account$/i })).toBeEnabled()
  }
}

export const IntegrationsDisconnectConfirmation: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: {
      ...domainSettingsAddDomainSelectZoneState,
      onDisconnectCloudflare: fn()
    },
    settingsSection: 'integrations'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const body = within(globalThis.document.body)
    const disconnectCloudflare = args.domainSettingsState?.onDisconnectCloudflare

    if (!disconnectCloudflare) {
      throw new Error('Expected disconnect handler for confirmation story.')
    }

    await userEvent.click((await canvas.findAllByRole('button', { name: /^disconnect account$/i }))[0])
    await expect(disconnectCloudflare).not.toHaveBeenCalled()

    const dialog = await body.findByRole('alertdialog', { name: /^disconnect cloudflare account\\?/i })
    await expect(dialog).toBeInTheDocument()
    await expect(
      await within(dialog).findByText(/domains tied to this cloudflare account/iu)
    ).toBeInTheDocument()
  }
}

export const Organizations: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'organizations'
  })
}

export const OrganizationSettings: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'organizationSettings'
  })
}

export const OrganizationPeople: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'organizationPeople'
  })
}

export const DomainsLoading: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsLoadingState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    await expectSettingsDomainsDialog(args, canvasElement)
  }
}

export const DomainsLoadErrorMessage: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsLoadErrorState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = await expectSettingsDomainsDialog(args, canvasElement)

    await expect(await canvas.findByRole('button', { name: /cloudflare/i })).toBeEnabled()
  }
}

export const DomainsAddDomainAuthorizeCloudflare: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsAddDomainAuthorizeCloudflareState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = await expectSettingsDomainsDialog(args, canvasElement)

    await expect(await canvas.findByRole('button', { name: /cloudflare/i })).toBeEnabled()
  }
}

export const DomainsMissingCloudflarePermissions: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsMissingCloudflarePermissionsState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = await expectSettingsDomainsDialog(args, canvasElement)

    await expect(await canvas.findByRole('button', { name: /cloudflare/i })).toBeEnabled()
  }
}

export const DomainsLoadDomains: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsLoadDomainsState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = await expectSettingsDomainsDialog(args, canvasElement)

    await expect(await canvas.findByRole('button', { name: /load domains/i })).toBeEnabled()
  }
}

export const DomainsLoadDomainsBusy: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsLoadDomainsBusyState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = await expectSettingsDomainsDialog(args, canvasElement)

    await expect(await canvas.findByRole('button', { name: /load domains/i })).toBeDisabled()
  }
}

export const DomainsAddDomainSelectZone: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsAddDomainSelectZoneState,
    settingsSection: 'domains'
  })
}

export const DomainsDomainLive: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDomainLiveState,
    settingsSection: 'domains'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect((await canvas.findAllByText('agentteam.example')).length).toBeGreaterThan(0)
    await expect(canvas.queryByRole('button', { name: /^disconnect cloudflare$/i })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^disconnect account$/i })).not.toBeInTheDocument()
  }
}

export const DomainsDomainNeedsAttention: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDomainNeedsAttentionState,
    settingsSection: 'domains'
  })
}

export const DomainsDomainDisconnected: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDomainDisconnectedState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = await expectSettingsDomainsDialog(args, canvasElement)

    await expect(await canvas.findByRole('button', { name: /email|routing|setup/i })).toBeDisabled()
  }
}

export const DomainsDomainRetryBusy: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDomainRetryBusyState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = await expectSettingsDomainsDialog(args, canvasElement)

    await expect(await canvas.findByRole('button', { name: /email|routing|setup/i })).toBeDisabled()
  }
}

export const DomainsDenseDomainList: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDenseDomainListState,
    settingsSection: 'domains'
  })
}
