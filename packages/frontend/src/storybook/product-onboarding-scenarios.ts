import { agentAccessActionableState } from './agent-access-fixtures'
import { storyAuthClient } from './auth-client-fixtures'
import {
  domainSettingsAddDomainAuthorizeCloudflareState,
  domainSettingsAddDomainSelectZoneState,
  domainSettingsDomainLiveState
} from './authenticated-section-fixtures'
import { mailboxAdminEmptyView } from './mailbox-admin-fixtures'
import { mailWorkspaceEmptyView } from './mail-workspace-fixtures'
import { authenticatedSettingsRouteState, storyPublicEnv } from './screen-fixtures'
import type { DashboardSearch } from '../lib/dashboard-search'
import type { MailboxAdminViewQuery } from '../lib/mail-admin-rpc'
import type { MailWorkspaceQuery } from '../lib/mail-rpc'
import type { SettingsSectionId } from '../partials/authenticated/settings-dialog-sections'
import type { DomainSettingsState } from '../partials/authenticated/settings-dialog'
import type { DashboardMailControllerStoryFrameProps } from './stories/story-frames'
import type { AgentMailAdminNavigation, AgentMailAdminView, AgentMailWebWorkspace } from '@main/backend'

interface ProductOnboardingScenario {
  defaultSettingsOpen?: boolean
  domainSettingsState: DomainSettingsState
  firstMailboxSetupState?: DashboardMailControllerStoryFrameProps['firstMailboxSetupState']
  routeSearch?: DashboardSearch
  settingsOpen?: boolean
  settingsSection?: SettingsSectionId
  workspace: AgentMailWebWorkspace
}

type ProductOnboardingStoryHandlers = Pick<DomainSettingsState, 'onStartOAuth'>

const firstUseWorkspace = {
  ...mailWorkspaceEmptyView,
  accounts: [],
  activeAccountId: null,
  activeFolderId: null,
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

const settingUpDomainState = {
  ...domainSettingsAddDomainSelectZoneState,
  busy: true,
  message: 'Setting up Cloudflare-routed email for agentteam.example.'
} satisfies DomainSettingsState

const firstMailboxSetupState = {
  addressLocalPart: 'marin',
  canSubmit: true,
  displayName: 'Marin Patel',
  domain: 'agentteam.example',
  state: 'ready'
} satisfies NonNullable<DashboardMailControllerStoryFrameProps['firstMailboxSetupState']>

const creatingFirstMailboxSetupState = {
  ...firstMailboxSetupState,
  canSubmit: false,
  state: 'creating'
} satisfies NonNullable<DashboardMailControllerStoryFrameProps['firstMailboxSetupState']>

export const productOnboardingScenarios = {
  agentsNoMailboxSetupReturn: {
    domainSettingsState: domainSettingsAddDomainAuthorizeCloudflareState,
    routeSearch: { mailboxAdmin: 'agents' },
    workspace: firstUseWorkspace
  },
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
  createFirstMailbox: {
    domainSettingsState: domainSettingsDomainLiveState,
    firstMailboxSetupState,
    workspace: firstUseWorkspace
  },
  creatingFirstMailbox: {
    domainSettingsState: domainSettingsDomainLiveState,
    firstMailboxSetupState: creatingFirstMailboxSetupState,
    workspace: firstUseWorkspace
  },
  connectingCloudflare: {
    domainSettingsState: cloudflareConnectingState,
    workspace: firstUseWorkspace
  },
  mailboxReady: {
    domainSettingsState: domainSettingsDomainLiveState,
    workspace: configuredMailboxWorkspace
  },
  settingUpDomain: {
    domainSettingsState: settingUpDomainState,
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
    firstMailboxSetupState: scenario.firstMailboxSetupState,
    mailWorkspaceLoader: createProductOnboardingMailWorkspaceLoader(scenario.workspace),
    mailboxAdminNavigationLoader: createProductOnboardingMailboxAdminNavigationLoader(),
    mailboxAdminViewLoader: createProductOnboardingMailboxAdminViewLoader(),
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

function createProductOnboardingMailboxAdminViewLoader() {
  return async (query: MailboxAdminViewQuery) =>
    ({
      accounts: [],
      agents: [],
      allowedActions: mailboxAdminEmptyView.allowedActions,
      allowedSections: onboardingMailboxAdminNavigation.allowedSections,
      domain: mailboxAdminEmptyView.domain,
      groups: [],
      pendingEnrollments: [],
      permissionCatalog: mailboxAdminEmptyView.permissionCatalog,
      principals: [],
      searchQuery: query.searchQuery,
      section: query.section ?? 'accounts',
      state: 'empty',
      statusFilter: query.statusFilter
    }) satisfies AgentMailAdminView
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
