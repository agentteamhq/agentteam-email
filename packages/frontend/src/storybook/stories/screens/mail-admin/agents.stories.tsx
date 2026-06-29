import {
  AgentAccountAccessSaving as AgentAccountAccessSavingStory,
  AgentAccountAccessSheet as AgentAccountAccessSheetStory,
  AgentCreateDialog as AgentCreateDialogStory,
  AgentCreateEnrollment as AgentCreateEnrollmentStory,
  AgentCreateSaving as AgentCreateSavingStory,
  AgentEditDialog as AgentEditDialogStory,
  AgentEditSaving as AgentEditSavingStory,
  AgentEnrollmentCancelDenied as AgentEnrollmentCancelDeniedStory,
  AgentEnrollmentCancelSaving as AgentEnrollmentCancelSavingStory,
  AgentPermissionsDialog as AgentPermissionsDialogStory,
  AgentPermissionsSaving as AgentPermissionsSavingStory,
  AgentProvisionAccountDialog as AgentProvisionAccountDialogStory,
  AgentProvisionAccountSaving as AgentProvisionAccountSavingStory,
  AgentsDisabledStatusFilter as AgentsDisabledStatusFilterStory,
  AgentsExternalPrincipalsOnly as AgentsExternalPrincipalsOnlyStory,
  AgentsPendingEnrollments as AgentsPendingEnrollmentsStory,
  Agents as AgentsStory,
  AgentsWithoutGrantManagement as AgentsWithoutGrantManagementStory,
  PrincipalAccountAccessSaving as PrincipalAccountAccessSavingStory,
  PrincipalAccountAccessSheet as PrincipalAccountAccessSheetStory,
  PrincipalPermissionsDialog as PrincipalPermissionsDialogStory,
  PrincipalPermissionsSaving as PrincipalPermissionsSavingStory,
  mailAdminMockStoryMeta
} from '../../mail-admin-mocks.definitions'
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  ...mailAdminMockStoryMeta,
  title: 'Screens/Mail Admin/Agents'
} satisfies Meta<typeof mailAdminMockStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Agents: Story = {
  ...AgentsStory,
  name: 'Table'
}

export const AgentsDisabledStatusFilter: Story = {
  ...AgentsDisabledStatusFilterStory,
  name: 'Disabled status filter'
}

export const AgentsWithoutGrantManagement: Story = {
  ...AgentsWithoutGrantManagementStory,
  name: 'Without grant management'
}

export const AgentsExternalPrincipalsOnly: Story = {
  ...AgentsExternalPrincipalsOnlyStory,
  name: 'External principals only'
}

export const AgentsPendingEnrollments: Story = {
  ...AgentsPendingEnrollmentsStory,
  name: 'Pending enrollments'
}

export const AgentEnrollmentCancelSaving: Story = {
  ...AgentEnrollmentCancelSavingStory,
  name: 'Enrollment cancel saving'
}

export const AgentEnrollmentCancelDenied: Story = {
  ...AgentEnrollmentCancelDeniedStory,
  name: 'Enrollment cancel denied'
}

export const AgentCreateDialog: Story = {
  ...AgentCreateDialogStory,
  name: 'Create dialog'
}

export const AgentCreateSaving: Story = {
  ...AgentCreateSavingStory,
  name: 'Create saving'
}

export const AgentCreateEnrollment: Story = {
  ...AgentCreateEnrollmentStory,
  name: 'Enrollment created'
}

export const AgentEditDialog: Story = {
  ...AgentEditDialogStory,
  name: 'Edit dialog'
}

export const AgentEditSaving: Story = {
  ...AgentEditSavingStory,
  name: 'Edit saving'
}

export const AgentPermissionsDialog: Story = {
  ...AgentPermissionsDialogStory,
  name: 'System permissions dialog'
}

export const AgentPermissionsSaving: Story = {
  ...AgentPermissionsSavingStory,
  name: 'System permissions saving'
}

export const AgentAccountAccessSheet: Story = {
  ...AgentAccountAccessSheetStory,
  name: 'Account access sheet'
}

export const AgentAccountAccessSaving: Story = {
  ...AgentAccountAccessSavingStory,
  name: 'Account access saving'
}

export const PrincipalAccountAccessSheet: Story = {
  ...PrincipalAccountAccessSheetStory,
  name: 'Client account access sheet'
}

export const PrincipalAccountAccessSaving: Story = {
  ...PrincipalAccountAccessSavingStory,
  name: 'Client account access saving'
}

export const PrincipalPermissionsDialog: Story = {
  ...PrincipalPermissionsDialogStory,
  name: 'Client system permissions dialog'
}

export const PrincipalPermissionsSaving: Story = {
  ...PrincipalPermissionsSavingStory,
  name: 'Client system permissions saving'
}

export const AgentProvisionAccountDialog: Story = {
  ...AgentProvisionAccountDialogStory,
  name: 'Provision account dialog'
}

export const AgentProvisionAccountSaving: Story = {
  ...AgentProvisionAccountSavingStory,
  name: 'Provision account saving'
}
