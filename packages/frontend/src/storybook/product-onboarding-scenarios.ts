import { agentAccessActionableState } from './agent-access-fixtures'
import { storyAuthClient } from './auth-client-fixtures'
import {
  domainSettingsAddDomainAuthorizeCloudflareState,
  domainSettingsAddDomainSelectZoneState,
  domainSettingsDomainConnectedState,
  domainSettingsDomainLiveState,
  domainSettingsDomainProvisioningState
} from './authenticated-section-fixtures'
import { mailWorkspaceEmptyView } from './mail-workspace-fixtures'
import { authenticatedSettingsRouteState, storyPublicEnv } from './screen-fixtures'
import type { DashboardSearch } from '../lib/dashboard-search'
import type { MailWorkspaceQuery } from '../lib/mail-rpc'
import type { SettingsSectionId } from '../partials/authenticated/settings-dialog-sections'
import type { DomainSettingsState } from '../partials/authenticated/settings-dialog'
import type { DashboardMailControllerStoryFrameProps } from './stories/story-frames'
import type { AgentMailAdminNavigation, AgentMailWebWorkspace } from '@main/backend'

interface ProductOnboardingScenario {
  defaultSettingsOpen?: boolean
  domainSettingsState: DomainSettingsState
  routeSearch?: DashboardSearch
  settingsOpen?: boolean
  settingsSection?: SettingsSectionId
  workspace: AgentMailWebWorkspace
}

type ProductOnboardingStoryHandlers = Pick<DomainSettingsState, 'onStartOAuth'>

const firstUseWorkspace = {
  ...mailWorkspaceEmptyView,
  accounts: [],
  activeAccountId: '',
  activeFolderId: '',
  folders: []
} satisfies AgentMailWebWorkspace

const configuredMailboxWorkspace = mailWorkspaceEmptyView

const onboardingMailboxAdminNavigation = {
  allowedSections: ['accounts', 'groups', 'agents']
} satisfies AgentMailAdminNavigation

const cloudflareConnectingState = {
  ...domainSettingsAddDomainAuthorizeCloudflareState,
  busy: true
} satisfies DomainSettingsState

const cloudflareErrorState = {
  ...domainSettingsAddDomainAuthorizeCloudflareState,
  message: 'Cloudflare authorization was not completed. Try again when you are ready.'
} satisfies DomainSettingsState

const returningFromCloudflareState = {
  ...domainSettingsAddDomainSelectZoneState,
  busy: true,
  message: 'Cloudflare account connected'
} satisfies DomainSettingsState

export const productOnboardingScenarios = {
  chooseDomain: {
    domainSettingsState: domainSettingsAddDomainSelectZoneState,
    workspace: firstUseWorkspace
  },
  cloudflareError: {
    domainSettingsState: cloudflareErrorState,
    workspace: firstUseWorkspace
  },
  connectCloudflare: {
    domainSettingsState: domainSettingsAddDomainAuthorizeCloudflareState,
    workspace: firstUseWorkspace
  },
  connectingCloudflare: {
    domainSettingsState: cloudflareConnectingState,
    workspace: firstUseWorkspace
  },
  domainConnected: {
    domainSettingsState: domainSettingsDomainConnectedState,
    workspace: firstUseWorkspace
  },
  mailboxReady: {
    domainSettingsState: domainSettingsDomainLiveState,
    workspace: configuredMailboxWorkspace
  },
  provisionDomain: {
    domainSettingsState: domainSettingsDomainProvisioningState,
    workspace: firstUseWorkspace
  },
  returningFromCloudflare: {
    domainSettingsState: returningFromCloudflareState,
    workspace: firstUseWorkspace
  },
  settingsOpen: {
    defaultSettingsOpen: true,
    domainSettingsState: domainSettingsAddDomainAuthorizeCloudflareState,
    settingsOpen: true,
    settingsSection: 'domains',
    workspace: firstUseWorkspace
  }
} satisfies Record<string, ProductOnboardingScenario>

export function buildProductOnboardingControllerArgs(
  scenario: ProductOnboardingScenario,
  handlers: ProductOnboardingStoryHandlers = {}
): DashboardMailControllerStoryFrameProps {
  const routeSearch = scenario.routeSearch ?? {}
  const domainSettingsState = {
    ...scenario.domainSettingsState,
    ...handlers
  } satisfies DomainSettingsState

  return {
    agentAccessViewLoader: createProductOnboardingAgentAccessViewLoader(),
    authClient: storyAuthClient,
    defaultSettingsOpen: scenario.defaultSettingsOpen,
    defaultSettingsSection: 'domains',
    domainSettingsState,
    mailWorkspaceLoader: createProductOnboardingMailWorkspaceLoader(scenario.workspace),
    mailboxAdminNavigationLoader: createProductOnboardingMailboxAdminNavigationLoader(),
    publicEnv: storyPublicEnv,
    routeSearch,
    routeState: authenticatedSettingsRouteState,
    sessionCleanupEnabled: false,
    settingsOpen: scenario.settingsOpen,
    settingsSection: scenario.settingsSection
  }
}

function createProductOnboardingAgentAccessViewLoader() {
  return async () => agentAccessActionableState.view
}

function createProductOnboardingMailboxAdminNavigationLoader() {
  return async () => onboardingMailboxAdminNavigation
}

function createProductOnboardingMailWorkspaceLoader(workspace: AgentMailWebWorkspace) {
  return async (query: MailWorkspaceQuery) => mailWorkspaceForQuery(workspace, query)
}

function mailWorkspaceForQuery(
  workspace: AgentMailWebWorkspace,
  query: MailWorkspaceQuery
): AgentMailWebWorkspace {
  const activeAccountId = query.accountId ?? workspace.activeAccountId
  const activeFolderId = query.folderId ?? workspace.activeFolderId
  const selectedMessage =
    query.messageId && workspace.selectedMessage?.id !== query.messageId ? null : workspace.selectedMessage

  return {
    ...workspace,
    activeAccountId,
    activeFolderId,
    selectedMessage
  }
}
