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
  title: 'Mocks/Mail Admin/Agents'
} satisfies Meta<typeof mailAdminMockStoryMeta.component>

export default meta

type Story = StoryObj<typeof meta>

export const Agents: Story = {
  ...AgentsStory,
  name: 'table'
}

export const AgentsDisabledStatusFilter: Story = {
  ...AgentsDisabledStatusFilterStory,
  name: 'disabled status filter'
}

export const AgentsWithoutGrantManagement: Story = {
  ...AgentsWithoutGrantManagementStory,
  name: 'without grant management'
}

export const AgentsExternalPrincipalsOnly: Story = {
  ...AgentsExternalPrincipalsOnlyStory,
  name: 'external principals only'
}

export const AgentsPendingEnrollments: Story = {
  ...AgentsPendingEnrollmentsStory,
  name: 'pending enrollments'
}

export const AgentEnrollmentCancelSaving: Story = {
  ...AgentEnrollmentCancelSavingStory,
  name: 'enrollment cancel saving'
}

export const AgentEnrollmentCancelDenied: Story = {
  ...AgentEnrollmentCancelDeniedStory,
  name: 'enrollment cancel denied'
}

export const AgentCreateDialog: Story = {
  ...AgentCreateDialogStory,
  name: 'create dialog'
}

export const AgentCreateSaving: Story = {
  ...AgentCreateSavingStory,
  name: 'create saving'
}

export const AgentCreateEnrollment: Story = {
  ...AgentCreateEnrollmentStory,
  name: 'enrollment created'
}

export const AgentEditDialog: Story = {
  ...AgentEditDialogStory,
  name: 'edit dialog'
}

export const AgentEditSaving: Story = {
  ...AgentEditSavingStory,
  name: 'edit saving'
}

export const AgentPermissionsDialog: Story = {
  ...AgentPermissionsDialogStory,
  name: 'system permissions dialog'
}

export const AgentPermissionsSaving: Story = {
  ...AgentPermissionsSavingStory,
  name: 'system permissions saving'
}

export const AgentAccountAccessSheet: Story = {
  ...AgentAccountAccessSheetStory,
  name: 'account access sheet'
}

export const AgentAccountAccessSaving: Story = {
  ...AgentAccountAccessSavingStory,
  name: 'account access saving'
}

export const PrincipalAccountAccessSheet: Story = {
  ...PrincipalAccountAccessSheetStory,
  name: 'client account access sheet'
}

export const PrincipalAccountAccessSaving: Story = {
  ...PrincipalAccountAccessSavingStory,
  name: 'client account access saving'
}

export const PrincipalPermissionsDialog: Story = {
  ...PrincipalPermissionsDialogStory,
  name: 'client system permissions dialog'
}

export const PrincipalPermissionsSaving: Story = {
  ...PrincipalPermissionsSavingStory,
  name: 'client system permissions saving'
}

export const AgentProvisionAccountDialog: Story = {
  ...AgentProvisionAccountDialogStory,
  name: 'provision account dialog'
}

export const AgentProvisionAccountSaving: Story = {
  ...AgentProvisionAccountSavingStory,
  name: 'provision account saving'
}
