import {
  AgentAccessActions as AgentAccessActionsStory,
  AgentAccessActive as AgentAccessActiveStory,
  AgentAccessClaimed as AgentAccessClaimedStory,
  AgentAccessConstraintDetails as AgentAccessConstraintDetailsStory,
  AgentAccessDeniedExpiredApprovals as AgentAccessDeniedExpiredApprovalsStory,
  AgentAccessDense as AgentAccessDenseStory,
  AgentAccessEmpty as AgentAccessEmptyStory,
  AgentAccessError as AgentAccessErrorStory,
  AgentAccessLoading as AgentAccessLoadingStory,
  AgentAccessPaperclipConnected as AgentAccessPaperclipConnectedStory,
  AgentAccessPaperclipHandoff as AgentAccessPaperclipHandoffStory,
  AgentAccessPartialActions as AgentAccessPartialActionsStory,
  AgentAccessPendingApproval as AgentAccessPendingApprovalStory,
  AgentAccessRevokedExpired as AgentAccessRevokedExpiredStory,
  settingsScreenStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsScreenStoryMeta,
  title: 'Screens/Settings/Agent Access'
} satisfies Meta<typeof settingsScreenStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const AgentAccessLoading: Story = {
  ...AgentAccessLoadingStory,
  name: 'Loading'
}

export const AgentAccessError: Story = {
  ...AgentAccessErrorStory,
  name: 'Error'
}

export const AgentAccessEmpty: Story = {
  ...AgentAccessEmptyStory,
  name: 'Empty'
}

export const AgentAccessActive: Story = {
  ...AgentAccessActiveStory,
  name: 'Active'
}

export const AgentAccessPaperclipHandoff: Story = {
  ...AgentAccessPaperclipHandoffStory,
  name: 'Paperclip handoff'
}

export const AgentAccessPaperclipConnected: Story = {
  ...AgentAccessPaperclipConnectedStory,
  name: 'Paperclip connected'
}

export const AgentAccessPendingApproval: Story = {
  ...AgentAccessPendingApprovalStory,
  name: 'Pending approval'
}

export const AgentAccessDeniedExpiredApprovals: Story = {
  ...AgentAccessDeniedExpiredApprovalsStory,
  name: 'Denied and expired approvals'
}

export const AgentAccessActions: Story = {
  ...AgentAccessActionsStory,
  name: 'Actions'
}

export const AgentAccessPartialActions: Story = {
  ...AgentAccessPartialActionsStory,
  name: 'Partial actions'
}

export const AgentAccessRevokedExpired: Story = {
  ...AgentAccessRevokedExpiredStory,
  name: 'Revoked and expired'
}

export const AgentAccessClaimed: Story = {
  ...AgentAccessClaimedStory,
  name: 'Claimed autonomous agent'
}

export const AgentAccessConstraintDetails: Story = {
  ...AgentAccessConstraintDetailsStory,
  name: 'Constraint details'
}

export const AgentAccessDense: Story = {
  ...AgentAccessDenseStory,
  name: 'Dense'
}
