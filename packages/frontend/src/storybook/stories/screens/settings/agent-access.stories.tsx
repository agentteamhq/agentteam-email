import {
  AgentAccessActions as AgentAccessActionsStory,
  AgentAccessActive as AgentAccessActiveStory,
  AgentAccessClaimed as AgentAccessClaimedStory,
  AgentAccessConstraintDetails as AgentAccessConstraintDetailsStory,
  AgentAccessDeniedExpiredApprovals as AgentAccessDeniedExpiredApprovalsStory,
  AgentAccessDense as AgentAccessDenseStory,
  AgentAccessEmpty as AgentAccessEmptyStory,
  AgentAccessEnrollmentCreated as AgentAccessEnrollmentCreatedStory,
  AgentAccessError as AgentAccessErrorStory,
  AgentAccessLoading as AgentAccessLoadingStory,
  AgentAccessPaperclipConnected as AgentAccessPaperclipConnectedStory,
  AgentAccessPaperclipHandoff as AgentAccessPaperclipHandoffStory,
  AgentAccessPartialActions as AgentAccessPartialActionsStory,
  AgentAccessPendingApproval as AgentAccessPendingApprovalStory,
  AgentAccessPendingBusy as AgentAccessPendingBusyStory,
  AgentAccessRevokedExpired as AgentAccessRevokedExpiredStory,
  settingsDialogStoryMeta
} from '../../settings-dialog.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...settingsDialogStoryMeta,
  title: 'Screens/Settings/Agent Access'
} satisfies Meta<typeof settingsDialogStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const AgentAccessLoading: Story = {
  ...AgentAccessLoadingStory,
  name: 'loading'
}

export const AgentAccessError: Story = {
  ...AgentAccessErrorStory,
  name: 'error'
}

export const AgentAccessEmpty: Story = {
  ...AgentAccessEmptyStory,
  name: 'empty'
}

export const AgentAccessEnrollmentCreated: Story = {
  ...AgentAccessEnrollmentCreatedStory,
  name: 'enrollment created'
}

export const AgentAccessActive: Story = {
  ...AgentAccessActiveStory,
  name: 'active'
}

export const AgentAccessPaperclipHandoff: Story = {
  ...AgentAccessPaperclipHandoffStory,
  name: 'paperclip handoff'
}

export const AgentAccessPaperclipConnected: Story = {
  ...AgentAccessPaperclipConnectedStory,
  name: 'paperclip connected'
}

export const AgentAccessPendingApproval: Story = {
  ...AgentAccessPendingApprovalStory,
  name: 'pending approval'
}

export const AgentAccessPendingBusy: Story = {
  ...AgentAccessPendingBusyStory,
  name: 'pending busy'
}

export const AgentAccessDeniedExpiredApprovals: Story = {
  ...AgentAccessDeniedExpiredApprovalsStory,
  name: 'denied and expired approvals'
}

export const AgentAccessActions: Story = {
  ...AgentAccessActionsStory,
  name: 'actions'
}

export const AgentAccessPartialActions: Story = {
  ...AgentAccessPartialActionsStory,
  name: 'partial actions'
}

export const AgentAccessRevokedExpired: Story = {
  ...AgentAccessRevokedExpiredStory,
  name: 'revoked and expired'
}

export const AgentAccessClaimed: Story = {
  ...AgentAccessClaimedStory,
  name: 'claimed autonomous agent'
}

export const AgentAccessConstraintDetails: Story = {
  ...AgentAccessConstraintDetailsStory,
  name: 'constraint details'
}

export const AgentAccessDense: Story = {
  ...AgentAccessDenseStory,
  name: 'dense'
}
