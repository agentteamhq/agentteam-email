import { expect, fn, userEvent, within } from 'storybook/test'

import {
  authenticatedSectionBaseArgs,
  domainSettingsAddDomainAuthorizeCloudflareState,
  domainSettingsAddDomainSelectZoneState,
  domainSettingsDenseDomainListState,
  domainSettingsDomainConnectedState,
  domainSettingsDomainLiveState,
  domainSettingsDomainNeedsAttentionState,
  domainSettingsDomainProvisioningState,
  domainSettingsEmptyFirstUseState
} from '../storybook/authenticated-section-fixtures'
import {
  agentAccessActionableState,
  agentAccessActiveState,
  agentAccessBusyApprovalState,
  agentAccessClaimedState,
  agentAccessConstraintDetailsState,
  agentAccessDeniedExpiredApprovalState,
  agentAccessDenseState,
  agentAccessEmptyState,
  agentAccessEnrollmentCreatedState,
  agentAccessErrorState,
  agentAccessLoadingState,
  agentAccessPaperclipConnectedState,
  agentAccessPendingApprovalState,
  agentAccessRevokedExpiredState
} from '../storybook/agent-access-fixtures'
import { DashboardScreen } from './dashboard-screen'
import type { AgentAccessSettingsState, DomainSettingsState } from '../partials/authenticated/settings-dialog'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Mail Client/Settings',
  component: DashboardScreen,
  args: {
    ...authenticatedSectionBaseArgs,
    domainSettingsState: domainSettingsEmptyFirstUseState,
    settingsOpen: true
  },
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<typeof DashboardScreen>

export default meta

type Story = StoryObj<typeof meta>

const agentAccessInteractiveActionState = {
  ...agentAccessActionableState,
  canApproveApproval: true,
  canDenyApproval: true,
  canRevokeAgent: true,
  canRevokeCapabilityGrant: true,
  onApproveApproval: fn(),
  onDenyApproval: fn(),
  onRefresh: fn(),
  onRevokeAgent: fn(),
  onRevokeCapabilityGrant: fn()
} satisfies AgentAccessSettingsState

const agentAccessReviewOnlyActionState = {
  ...agentAccessActionableState,
  canApproveApproval: true,
  canDenyApproval: false,
  canRevokeAgent: false,
  canRevokeCapabilityGrant: false,
  onApproveApproval: fn(),
  onDenyApproval: fn(),
  onRefresh: fn(),
  onRevokeAgent: fn(),
  onRevokeCapabilityGrant: fn()
} satisfies AgentAccessSettingsState

const domainSettingsDisconnectActionState = {
  ...domainSettingsDomainLiveState,
  onDisconnectCloudflare: fn()
} satisfies DomainSettingsState

function storyBody(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body)
}

export const Account: Story = {
  name: 'settings / account',
  args: {
    settingsSection: 'account'
  }
}

export const Security: Story = {
  name: 'settings / security',
  args: {
    settingsSection: 'security'
  },
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
  name: 'agent access / loading',
  args: {
    agentAccessState: agentAccessLoadingState,
    settingsSection: 'agentAccess'
  }
}

export const AgentAccessError: Story = {
  name: 'agent access / error',
  args: {
    agentAccessState: {
      ...agentAccessErrorState,
      onRefresh: fn()
    },
    settingsSection: 'agentAccess'
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^retry$/i }))
    await expect(args.agentAccessState?.onRefresh).toHaveBeenCalled()
  }
}

export const AgentAccessEmpty: Story = {
  name: 'agent access / empty',
  args: {
    agentAccessState: agentAccessEmptyState,
    settingsSection: 'agentAccess'
  }
}

export const AgentAccessEnrollmentCreated: Story = {
  name: 'agent access / enrollment created',
  args: {
    agentAccessState: {
      ...agentAccessEnrollmentCreatedState,
      onCopyEnrollmentCommand: fn()
    },
    settingsSection: 'agentAccess'
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('at-email agent enroll enroll_AAAAAAAAAAAAAAAA')).toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^copy command$/i }))
    await expect(args.agentAccessState?.onCopyEnrollmentCommand).toHaveBeenCalledWith(
      'at-email agent enroll enroll_AAAAAAAAAAAAAAAA'
    )
  }
}

export const AgentAccessActive: Story = {
  name: 'agent access / active',
  args: {
    agentAccessState: agentAccessActiveState,
    settingsSection: 'agentAccess'
  }
}

export const AgentAccessPaperclipHandoff: Story = {
  name: 'agent access / paperclip handoff',
  args: {
    agentAccessState: {
      ...agentAccessActiveState,
      connectionHandoff: {
        companyId: 'paperclip-company-1',
        pluginId: 'agentteam.paperclip-email-plugin',
        source: 'paperclip'
      },
      onConnectPaperclip: fn(),
      readOnly: false,
      view: {
        ...agentAccessActiveState.view,
        allowedActions: {
          ...agentAccessActiveState.view.allowedActions,
          connectPaperclip: true
        }
      }
    },
    settingsSection: 'agentAccess'
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Paperclip connection requested')).toBeInTheDocument()
    await expect(await canvas.findByText('Company context: Ready')).toBeInTheDocument()
    await expect(await canvas.findByText('Plugin: AgentTeam Email plugin')).toBeInTheDocument()
    await expect(canvas.queryByText('Company: paperclip-company-1')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Plugin: agentteam.paperclip-email-plugin')).not.toBeInTheDocument()
    await userEvent.click(await canvas.findByRole('button', { name: /^register principal$/i }))
    await expect(args.agentAccessState?.onConnectPaperclip).toHaveBeenCalledWith({
      companyId: 'paperclip-company-1',
      pluginId: 'agentteam.paperclip-email-plugin',
      source: 'paperclip'
    })
  }
}

export const AgentAccessPaperclipConnected: Story = {
  name: 'agent access / paperclip connected',
  args: {
    agentAccessState: {
      ...agentAccessPaperclipConnectedState,
      connectionHandoff: null,
      message: 'Paperclip principal registered'
    },
    settingsSection: 'agentAccess'
  },
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Paperclip principal registered')).toBeInTheDocument()
    await expect(await canvas.findByText('Connected integrations')).toBeInTheDocument()
    await expect(await canvas.findByText('Paperclip Email')).toBeInTheDocument()
    await expect(await canvas.findByText('Research Agent')).toBeInTheDocument()
    await expect(canvas.queryByText('paperclip-company-1')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Paperclip connection requested')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^register principal$/i })).not.toBeInTheDocument()
  }
}

export const AgentAccessPendingApproval: Story = {
  name: 'agent access / pending approval',
  args: {
    agentAccessState: agentAccessPendingApprovalState,
    settingsSection: 'agentAccess'
  }
}

export const AgentAccessPendingBusy: Story = {
  name: 'agent access / pending busy',
  args: {
    agentAccessState: agentAccessBusyApprovalState,
    settingsSection: 'agentAccess'
  },
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByRole('button', { name: /^refreshing$/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /^review approval$/i })).toBeDisabled()
    await expect(await canvas.findByRole('button', { name: /^deny$/i })).toBeDisabled()
  }
}

export const AgentAccessDeniedExpiredApprovals: Story = {
  name: 'agent access / denied and expired approvals',
  args: {
    agentAccessState: agentAccessDeniedExpiredApprovalState,
    settingsSection: 'agentAccess'
  },
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
  name: 'agent access / actions',
  args: {
    agentAccessState: agentAccessInteractiveActionState,
    settingsSection: 'agentAccess'
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await userEvent.click(await canvas.findByRole('button', { name: /^review approval$/i }))
    await expect(args.agentAccessState?.onApproveApproval).toHaveBeenCalledWith('approval-send')

    await userEvent.click(await canvas.findByRole('button', { name: /^deny$/i }))
    await expect(args.agentAccessState?.onDenyApproval).toHaveBeenCalledWith('approval-send')

    await userEvent.click(await canvas.findByRole('button', { name: /^revoke agent$/i }))
    await expect(args.agentAccessState?.onRevokeAgent).toHaveBeenCalledWith('agent-research')

    const capabilityButtons = await canvas.findAllByRole('button', { name: /^revoke capability$/i })
    await userEvent.click(capabilityButtons[0])
    await expect(args.agentAccessState?.onRevokeCapabilityGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'grant-read'
      })
    )
  }
}

export const AgentAccessPartialActions: Story = {
  name: 'agent access / partial actions',
  args: {
    agentAccessState: agentAccessReviewOnlyActionState,
    settingsSection: 'agentAccess'
  },
  play: async ({ args, canvasElement }) => {
    const canvas = storyBody(canvasElement)
    const reviewButton = await canvas.findByRole('button', { name: /^review approval$/i })
    const denyButton = await canvas.findByRole('button', { name: /^deny$/i })

    await expect(reviewButton).toBeEnabled()
    await expect(denyButton).toBeDisabled()
    await expect(canvas.queryByRole('button', { name: /^revoke agent$/i })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /^revoke capability$/i })).not.toBeInTheDocument()

    await userEvent.click(reviewButton)
    await expect(args.agentAccessState?.onApproveApproval).toHaveBeenCalledWith('approval-send')
    await expect(args.agentAccessState?.onDenyApproval).not.toHaveBeenCalled()
    await expect(args.agentAccessState?.onRevokeAgent).not.toHaveBeenCalled()
    await expect(args.agentAccessState?.onRevokeCapabilityGrant).not.toHaveBeenCalled()
  }
}

export const AgentAccessRevokedExpired: Story = {
  name: 'agent access / revoked and expired',
  args: {
    agentAccessState: agentAccessRevokedExpiredState,
    settingsSection: 'agentAccess'
  }
}

export const AgentAccessClaimed: Story = {
  name: 'agent access / claimed autonomous agent',
  args: {
    agentAccessState: agentAccessClaimedState,
    settingsSection: 'agentAccess'
  },
  play: async ({ canvasElement }) => {
    const canvas = storyBody(canvasElement)

    await expect(await canvas.findByText('Claimed Trial Agent')).toBeInTheDocument()
    await expect(await canvas.findByText('Claimed')).toBeInTheDocument()
  }
}

export const AgentAccessConstraintDetails: Story = {
  name: 'agent access / constraint details',
  args: {
    agentAccessState: agentAccessConstraintDetailsState,
    settingsSection: 'agentAccess'
  },
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
  name: 'agent access / dense',
  args: {
    agentAccessState: agentAccessDenseState,
    settingsSection: 'agentAccess'
  }
}

export const Organizations: Story = {
  name: 'settings / organizations',
  args: {
    settingsSection: 'organizations'
  }
}

export const OrganizationSettings: Story = {
  name: 'organization / settings',
  args: {
    settingsSection: 'organizationSettings'
  }
}

export const OrganizationPeople: Story = {
  name: 'organization / people',
  args: {
    settingsSection: 'organizationPeople'
  }
}

export const DomainsEmptyFirstUse: Story = {
  name: 'domains / empty first use',
  args: {
    domainSettingsState: domainSettingsEmptyFirstUseState,
    settingsSection: 'domains'
  }
}

export const DomainsAddDomainAuthorizeCloudflare: Story = {
  name: 'domains / add domain authorize cloudflare',
  args: {
    domainSettingsState: domainSettingsAddDomainAuthorizeCloudflareState,
    settingsSection: 'domains'
  }
}

export const DomainsAddDomainSelectZone: Story = {
  name: 'domains / add domain select zone',
  args: {
    domainSettingsState: domainSettingsAddDomainSelectZoneState,
    settingsSection: 'domains'
  }
}

export const DomainsDomainConnected: Story = {
  name: 'domains / domain connected',
  args: {
    domainSettingsState: domainSettingsDomainConnectedState,
    settingsSection: 'domains'
  }
}

export const DomainsDomainProvisioning: Story = {
  name: 'domains / domain provisioning',
  args: {
    domainSettingsState: domainSettingsDomainProvisioningState,
    settingsSection: 'domains'
  }
}

export const DomainsDomainLive: Story = {
  name: 'domains / domain live',
  args: {
    domainSettingsState: domainSettingsDomainLiveState,
    settingsSection: 'domains'
  }
}

export const DomainsDisconnectAction: Story = {
  name: 'domains / disconnect action',
  args: {
    domainSettingsState: domainSettingsDisconnectActionState,
    settingsSection: 'domains'
  },
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
  name: 'domains / domain needs attention',
  args: {
    domainSettingsState: domainSettingsDomainNeedsAttentionState,
    settingsSection: 'domains'
  }
}

export const DomainsDenseDomainList: Story = {
  name: 'domains / dense domain list',
  args: {
    domainSettingsState: domainSettingsDenseDomainListState,
    settingsSection: 'domains'
  }
}
