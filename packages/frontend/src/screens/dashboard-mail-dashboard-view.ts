import { defaultAuthenticatedDashboardView } from '../partials/authenticated/authenticated-shell-models'
import type { DomainSettingsState } from '../partials/authenticated/settings-dialog'
import type {
  AuthenticatedDashboardView,
  AuthenticatedEmailPreview,
  FirstMailboxSetupState
} from '../partials/authenticated/authenticated-shell-models'
import type { AgentMailWebWorkspace } from '@main/backend'

const FIRST_USE_DASHBOARD_ONBOARDING_PROMPT = {
  actionLabel: 'Continue with Cloudflare',
  description: 'Connect Cloudflare to choose the domain you want to use with AgentTeam Email.',
  helperText:
    'Cloudflare will open in a secure window. AgentTeam Email will only configure the domain you approve.',
  title: 'Connect your domain'
} satisfies Omit<NonNullable<AuthenticatedDashboardView['onboardingPrompt']>, 'state'>

const FIRST_USE_DASHBOARD_DOMAIN_SETUP_PROMPT = {
  actionLabel: 'Connect domain',
  description: 'Select the Cloudflare domain that should receive AgentTeam Email.',
  mode: 'configureDomain',
  title: 'Choose your domain'
} satisfies Omit<NonNullable<AuthenticatedDashboardView['onboardingPrompt']>, 'state'>

const FIRST_USE_DASHBOARD_MAILBOX_SETUP_PROMPT = {
  actionLabel: 'Create mailbox',
  description: 'Create the first mailbox account for this domain.',
  mode: 'createMailbox',
  title: 'Create your first mailbox'
} satisfies Omit<NonNullable<AuthenticatedDashboardView['onboardingPrompt']>, 'state'>

export function toDashboardView(
  status: 'error' | 'pending' | 'success',
  error: Error | null,
  selectedEmail: AuthenticatedEmailPreview | undefined,
  workspace: AgentMailWebWorkspace | undefined,
  domainSettingsState: DomainSettingsState,
  firstMailboxSetupState?: FirstMailboxSetupState
): AuthenticatedDashboardView {
  if (status === 'pending') {
    return {
      ...defaultAuthenticatedDashboardView,
      state: 'loading'
    }
  }

  if (status === 'error') {
    return {
      ...defaultAuthenticatedDashboardView,
      errorDescription: errorMessage(error, 'Message data could not be loaded.'),
      errorTitle: 'Message unavailable',
      retryLabel: 'Retry',
      state: 'error'
    }
  }

  if (!selectedEmail && isFirstUseWorkspace(workspace)) {
    return {
      ...defaultAuthenticatedDashboardView,
      emptyDescription: 'Connect a Cloudflare domain to start receiving agent email.',
      emptyTitle: 'Connect your domain',
      onboardingPrompt: toFirstUseDashboardOnboardingPrompt(domainSettingsState, firstMailboxSetupState),
      state: 'empty'
    }
  }

  return {
    ...defaultAuthenticatedDashboardView,
    selectedEmail,
    state: selectedEmail ? 'ready' : 'empty'
  }
}

function isFirstUseWorkspace(workspace: AgentMailWebWorkspace | undefined) {
  return Boolean(workspace && workspace.accounts.length === 0)
}

function toFirstUseDashboardOnboardingPrompt(
  domainSettingsState: DomainSettingsState,
  firstMailboxSetupState?: FirstMailboxSetupState
): NonNullable<AuthenticatedDashboardView['onboardingPrompt']> {
  const status = domainSettingsState.status
  const hasUsableGrant =
    status?.grants.some(
      (grant) =>
        grant.status === 'active' &&
        grant.requiredScopes.every((scope) => grant.grantedScopes.includes(scope))
    ) ?? false
  const hasConnection = (status?.connections.length ?? 0) > 0
  const isDomainSetupPending =
    status?.connections.some(
      (connection) => connection.status === 'provisioning' || connection.provisioningStatus === 'pending'
    ) ?? false
  const isBusy = domainSettingsState.busy === true

  if (firstMailboxSetupState) {
    return {
      ...FIRST_USE_DASHBOARD_MAILBOX_SETUP_PROMPT,
      errorDescription: firstMailboxSetupState.errorDescription ?? undefined,
      state:
        firstMailboxSetupState.state === 'creating'
          ? 'connecting'
          : firstMailboxSetupState.state === 'error'
            ? 'error'
            : 'ready'
    }
  }

  if (hasUsableGrant || hasConnection) {
    return {
      ...FIRST_USE_DASHBOARD_DOMAIN_SETUP_PROMPT,
      state: isBusy || isDomainSetupPending ? 'connecting' : 'ready'
    }
  }

  return {
    ...FIRST_USE_DASHBOARD_ONBOARDING_PROMPT,
    errorDescription: domainSettingsState.message ?? undefined,
    state: domainSettingsState.message && !isBusy ? 'error' : isBusy ? 'connecting' : 'ready'
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
