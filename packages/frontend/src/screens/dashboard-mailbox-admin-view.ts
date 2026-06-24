import type { MailboxAdminSectionId, MailboxAdminView } from '../partials/authenticated/mailbox-admin-models'

export type MailboxAdminControllerActions = Pick<
  MailboxAdminView,
  | 'activeDialog'
  | 'createdAgentEnrollment'
  | 'onCreateAgent'
  | 'onCopyAgentEnrollmentCommand'
  | 'onDialogChange'
  | 'onDisableAccount'
  | 'onDisableGroup'
  | 'onOpenMailbox'
  | 'onRevokeAgent'
  | 'onRevokeAgentEnrollment'
  | 'onSaveAccount'
  | 'onSaveAgent'
  | 'onSaveAgentMailboxGrants'
  | 'onSaveAgentSystemPermissions'
  | 'onSaveGroup'
  | 'onSavePrincipalMailboxGrants'
  | 'onSavePrincipalSystemPermissions'
  | 'pendingAccountDisableId'
  | 'pendingAccountSave'
  | 'pendingAgentCreate'
  | 'pendingAgentEnrollmentRevokeId'
  | 'pendingAgentSaveId'
  | 'pendingAgentMailboxGrantsSaveId'
  | 'pendingAgentRevokeId'
  | 'pendingAgentSystemPermissionsSaveId'
  | 'pendingGroupDisableId'
  | 'pendingGroupSave'
  | 'pendingPrincipalMailboxGrantsSaveId'
  | 'pendingPrincipalSystemPermissionsSaveId'
>

export function toMailboxAdminView(
  section: MailboxAdminSectionId,
  status: 'error' | 'pending' | 'success',
  error: Error | null,
  view: MailboxAdminView | undefined,
  onRetry: () => void,
  actions?: MailboxAdminControllerActions
): MailboxAdminView {
  if (status === 'pending') {
    return emptyMailboxAdminView(section, 'loading')
  }

  if (status === 'error') {
    return {
      ...emptyMailboxAdminView(section, 'error'),
      errorDescription: errorMessage(error, 'Mailbox administration data could not be loaded.'),
      errorTitle: 'Mailbox administration unavailable',
      onRetry,
      retryLabel: 'Retry'
    }
  }

  if (!view) {
    return emptyMailboxAdminView(section, 'empty')
  }

  return {
    ...view,
    section,
    ...allowedMailboxAdminControllerActions(view, actions)
  }
}

function allowedMailboxAdminControllerActions(
  view: MailboxAdminView,
  actions: MailboxAdminControllerActions | undefined
): MailboxAdminControllerActions | undefined {
  if (!actions) {
    return undefined
  }

  return {
    ...actions,
    onCopyAgentEnrollmentCommand: actions.onCopyAgentEnrollmentCommand,
    onCreateAgent: view.allowedActions.createAgent ? actions.onCreateAgent : undefined,
    onDisableAccount: view.allowedActions.disableAccount ? actions.onDisableAccount : undefined,
    onDisableGroup: view.allowedActions.disableGroup ? actions.onDisableGroup : undefined,
    onRevokeAgent: view.allowedActions.revokeAgent ? actions.onRevokeAgent : undefined,
    onRevokeAgentEnrollment: actions.onRevokeAgentEnrollment,
    onSaveAccount:
      view.allowedActions.createAccount ||
      view.allowedActions.provisionAccount ||
      view.allowedActions.updateAccount
        ? actions.onSaveAccount
        : undefined,
    onSaveAgent: view.allowedActions.updateAgent ? actions.onSaveAgent : undefined,
    onSaveAgentMailboxGrants: view.allowedActions.manageAgentMailboxGrants
      ? actions.onSaveAgentMailboxGrants
      : undefined,
    onSaveAgentSystemPermissions: view.allowedActions.manageAgentSystemPermissions
      ? actions.onSaveAgentSystemPermissions
      : undefined,
    onSavePrincipalMailboxGrants: view.allowedActions.manageAgentMailboxGrants
      ? actions.onSavePrincipalMailboxGrants
      : undefined,
    onSavePrincipalSystemPermissions: view.allowedActions.manageAgentSystemPermissions
      ? actions.onSavePrincipalSystemPermissions
      : undefined,
    onSaveGroup:
      view.allowedActions.createGroup || view.allowedActions.updateGroup ? actions.onSaveGroup : undefined
  }
}

const emptyMailboxAdminPermissionCatalog = {
  defaultMailboxGrants: [],
  mailboxGrantOptions: [],
  mailboxGrants: [],
  systemPermissionOptions: [],
  systemPermissions: []
} satisfies MailboxAdminView['permissionCatalog']

const emptyMailboxAdminAllowedActions = {
  createAccount: false,
  createAgent: false,
  createGroup: false,
  disableAccount: false,
  disableGroup: false,
  manageAgentMailboxGrants: false,
  manageAgentSystemPermissions: false,
  provisionAccount: false,
  revokeAgent: false,
  updateAccount: false,
  updateAgent: false,
  updateGroup: false
} satisfies MailboxAdminView['allowedActions']

function emptyMailboxAdminView(
  section: MailboxAdminSectionId,
  state: MailboxAdminView['state']
): MailboxAdminView {
  return {
    accounts: [],
    agents: [],
    allowedActions: emptyMailboxAdminAllowedActions,
    allowedSections: [],
    domain: 'mailbox',
    groups: [],
    pendingEnrollments: [],
    permissionCatalog: emptyMailboxAdminPermissionCatalog,
    principals: [],
    section,
    state
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
