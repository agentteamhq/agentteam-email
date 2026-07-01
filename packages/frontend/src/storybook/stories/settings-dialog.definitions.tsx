import { expect, fn, userEvent, within } from 'storybook/test'

import {
  domainSettingsAddDomainAuthorizeCloudflareState,
  domainSettingsAddDomainSelectZoneState,
  domainSettingsDenseDomainListState,
  domainSettingsDomainConnectedState,
  domainSettingsDomainLiveState,
  domainSettingsDomainNeedsAttentionState,
  domainSettingsDomainProvisioningState,
  domainSettingsEmptyFirstUseState
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
import { storyAuthClient } from '../auth-client-fixtures'
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

const domainSettingsDisconnectActionState = {
  ...domainSettingsDomainLiveState,
  onDisconnectCloudflare: fn()
} satisfies DomainSettingsState

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
    authClient: storyAuthClient,
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

export const Account: Story = {
  args: buildSettingsScreenArgs({
    settingsSection: 'account'
  })
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

export const AgentAccessPaperclipHandoff: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: agentAccessPaperclipHandoffView,
    routeSearch: {
      agentAccessSource: 'paperclip',
      paperclipCompanyId: 'paperclip-company-1',
      paperclipPluginId: 'agentteam.paperclip-email-plugin'
    },
    settingsSection: 'agentAccess'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await canvas.findByText('Paperclip connection requested')
    await canvas.findByText('Company context: Ready')
    await canvas.findByText('Plugin: AgentTeam Email plugin')
    await expect(canvas.queryByText('Company: paperclip-company-1')).toBeNull()
    await expect(canvas.queryByText('Plugin: agentteam.paperclip-email-plugin')).toBeNull()
    await expect(await canvas.findByRole('button', { name: /^register principal$/i })).toBeEnabled()
  }
}

export const AgentAccessPaperclipConnected: Story = {
  args: buildSettingsScreenArgs({
    agentAccessView: requiredAgentAccessView(agentAccessPaperclipConnectedState),
    settingsSection: 'agentAccess'
  }),
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Connected integrations')).toBeInTheDocument()
    await expect(await canvas.findByText('Paperclip Email')).toBeInTheDocument()
    await expect(await canvas.findByText('Research Agent')).toBeInTheDocument()
    await expect(canvas.queryByText('paperclip-company-1')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Paperclip connection requested')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^register principal$/i })).not.toBeInTheDocument()
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

export const DomainsEmptyFirstUse: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsEmptyFirstUseState,
    settingsSection: 'domains'
  })
}

export const DomainsAddDomainAuthorizeCloudflare: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsAddDomainAuthorizeCloudflareState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(args.storyPath).toBe('/settings/domains/')
    await expect(await canvas.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    await expect(await canvas.findByRole('button', { name: 'Continue with Cloudflare' })).toBeEnabled()
  }
}

export const DomainsAddDomainSelectZone: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsAddDomainSelectZoneState,
    settingsSection: 'domains'
  })
}

export const DomainsDomainConnected: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDomainConnectedState,
    settingsSection: 'domains'
  })
}

export const DomainsDomainProvisioning: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDomainProvisioningState,
    settingsSection: 'domains'
  })
}

export const DomainsDomainLive: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDomainLiveState,
    settingsSection: 'domains'
  })
}

export const DomainsDisconnectAction: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDisconnectActionState,
    settingsSection: 'domains'
  }),
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const activeGrantPublicId = args.domainSettingsState?.status?.grants.find(
      (grant) => grant.status === 'active'
    )?.publicId

    await userEvent.click(await canvas.findByRole('button', { name: /^disconnect cloudflare$/i }))
    await expect(args.domainSettingsState?.onDisconnectCloudflare).toHaveBeenCalledWith(activeGrantPublicId)
  }
}

export const DomainsDomainNeedsAttention: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDomainNeedsAttentionState,
    settingsSection: 'domains'
  })
}

export const DomainsDenseDomainList: Story = {
  args: buildSettingsScreenArgs({
    domainSettingsState: domainSettingsDenseDomainListState,
    settingsSection: 'domains'
  })
}
