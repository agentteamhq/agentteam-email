export { copyHeaders, HttpStatusCode } from '@main/common'
export type { Database } from './db/db'
export { createStripeCheckoutSession } from './payments/create-checkout-session'
export { createStripePortalLink } from './payments/create-portal-link'
export { updateAfterStripeRedirect } from './payments/update-after-stripe-redirect'
export { getCustomerStripeStatus } from './payments/get-customer-status'
export {
  startScheduledJobs,
  syncStripeCustomers,
  type ScheduledJobs,
  type SyncStripeCustomersOptions,
  type SyncStripeCustomersResult
} from './jobs'
export { isAuthed } from './auth/is-authed'
export { getUser } from './auth/get-user'
export * from './auth/auth'
export {
  handleAgentAuthConfigurationRequest,
  isAgentAuthConfigurationRequestPath
} from './auth/agent-auth-metadata'
export { handleAtEmailMetadataRequest, isAtEmailMetadataRequestPath } from './auth/at-email-metadata'
export { handleAgentMailIngestRequest, isAgentMailIngestRequestPath } from './agent-mail/ingest'
export type {
  AgentAccessAgent,
  AgentAccessAllowedActions,
  AgentAccessApproval,
  AgentAccessApprovalCapability,
  AgentAccessApprovalPreview,
  AgentAccessGrant,
  AgentAccessHost,
  AgentAccessMutationResult,
  AgentAccessPaperclipConnectResult,
  AgentAccessPaperclipConnection,
  AgentAccessUserActor,
  AgentAccessView
} from './agent-access/service'
export type {
  AgentMailTrialClaimDecisionResult,
  AgentMailTrialClaimTargetOrganization,
  AgentMailTrialClaimView,
  AgentMailTrialGrantView,
  AgentMailTrialStartResult
} from './agent-access/trial-service'
export type {
  AgentMailAdminAccount,
  AgentMailAdminAllowedActions,
  AgentMailAdminAgent,
  AgentMailAdminAgentEnrollment,
  AgentMailAdminAccountInput,
  AgentMailAdminAgentMailboxGrantsInput,
  AgentMailAdminAgentInput,
  AgentMailAdminAgentSystemPermissionsInput,
  AgentMailAdminCreateAgentResult,
  AgentMailAdminForwardingGroupInput,
  AgentMailAdminExternalPrincipal,
  AgentMailAdminGroup,
  AgentMailAdminGrantPrincipalTargetInput,
  AgentMailAdminGrantPrincipalType,
  AgentMailAdminMailboxGrant,
  AgentMailAdminNavigation,
  AgentMailAdminPagination,
  AgentMailAdminPendingAgentEnrollment,
  AgentMailAdminRevokeAgentEnrollmentResult,
  AgentMailAdminRevokeAgentResult,
  AgentMailAdminSectionId,
  AgentMailAdminSaveAccountResult,
  AgentMailAdminSaveAgentResult,
  AgentMailAdminSaveAgentMailboxGrantsResult,
  AgentMailAdminSaveAgentPermissionsResult,
  AgentMailAdminSaveForwardingGroupResult,
  AgentMailAdminSavePrincipalMailboxGrantsResult,
  AgentMailAdminSavePrincipalSystemPermissionsResult,
  AgentMailAdminStatus,
  AgentMailAdminStatusFilter,
  AgentMailAdminUpdateAccountInput,
  AgentMailAdminUpdateForwardingGroupInput,
  AgentMailAdminView,
  AgentMailAdminViewState
} from './agent-mail/admin-service'
export {
  agentMailCapabilityCatalog,
  agentMailAdminPermissionCatalog,
  type AgentMailAdminPermissionCatalog,
  type AgentMailAdminPermissionMetadata,
  type AgentMailAdminPermissionOption,
  type AgentMailCapabilityCatalog
} from '@main/db'
export type { AgentMailPublicStatus } from './agent-mail/service'
export type {
  AdminAuditLogList,
  AdminAuditLogListFilters,
  AdminAuditLogListInput,
  AdminAuditLogListPagination,
  AdminAuditLogPageSize,
  AdminAuditLogSeverityFilter,
  AdminAuditLogStatusFilter,
  AdminDashboardAuditEvent,
  AdminDashboardStatusCount,
  AdminDashboardSummary
} from './admin/dashboard-service'
export type { AgentMailSendSubmitResult } from './agent-mail/control-client'
export type {
  AgentMailComposeInput,
  AgentMailMessageActionInput,
  AgentMailWebAccount,
  AgentMailWebAttachment,
  AgentMailWebFolder,
  AgentMailWebMessageDetail,
  AgentMailWebMessageSummary,
  AgentMailWebThreadMessage,
  AgentMailWebWorkspace,
  AgentMailWorkspaceInput
} from './agent-mail/webmail-service'
export { handleOAuthMetadataRequest, isOAuthMetadataRequestPath } from './auth/oauth-metadata'
export { backendRpcApp, type BackendRpcAppType } from './rpc/'
export * from './cloudflare/service'
export * from './payments/is-delayed-data'
// HMR - invalidate importers when this module changes
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate('[SSR] @main/backend changed, propagating to importers...')
  })
}
