import { deriveDashboardMailWorkspaceScreenModel } from '../screens/dashboard-mail-screen-model'
import { storyAuthClient } from './auth-client-fixtures'
import {
  domainSettingsAddDomainAuthorizeCloudflareState,
  domainSettingsAddDomainSelectZoneState,
  domainSettingsDomainConnectedState,
  domainSettingsDomainLiveState,
  domainSettingsDomainProvisioningState
} from './authenticated-section-fixtures'
import { mailWorkspaceEmptyView } from './mail-workspace-fixtures'
import { mailboxAdminReadyView } from './mailbox-admin-fixtures'
import { authenticatedSettingsRouteState, storyPublicEnv } from './screen-fixtures'
import type { DashboardSearch } from '../lib/dashboard-search'
import type { DashboardScreenProps } from '../screens/dashboard-screen'
import type { SettingsSectionId } from '../partials/authenticated/settings-dialog-sections'
import type { DomainSettingsState } from '../partials/authenticated/settings-dialog'
import type { AgentMailWebWorkspace } from '@main/backend'

interface ProductOnboardingScenario {
  defaultSettingsOpen?: boolean
  domainSettingsState: DomainSettingsState
  routeSearch?: DashboardSearch
  settingsOpen?: boolean
  settingsSection?: SettingsSectionId
  workspace: AgentMailWebWorkspace
}

type ProductOnboardingStoryHandlers = Pick<DashboardScreenProps, 'onDashboardOnboardingConnect'>

const firstUseWorkspace = {
  ...mailWorkspaceEmptyView,
  accounts: [],
  activeAccountId: '',
  activeFolderId: '',
  folders: []
} satisfies AgentMailWebWorkspace

const configuredMailboxWorkspace = mailWorkspaceEmptyView

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

export function buildProductOnboardingScreenArgs(
  scenario: ProductOnboardingScenario,
  handlers: ProductOnboardingStoryHandlers = {}
): DashboardScreenProps {
  const routeSearch = scenario.routeSearch ?? {}
  const screenModel = deriveDashboardMailWorkspaceScreenModel({
    allowedMailboxAdminSections: mailboxAdminReadyView.allowedSections,
    domainSettingsState: scenario.domainSettingsState,
    folderCreate: { name: '', state: 'closed' },
    folderDelete: { state: 'closed' },
    folderRename: { name: '', state: 'closed' },
    routeSearch,
    sidebarError: null,
    sidebarStatus: 'success',
    workspace: scenario.workspace,
    workspaceError: null,
    workspaceStatus: 'success'
  })

  return {
    authClient: storyAuthClient,
    defaultSettingsOpen: scenario.defaultSettingsOpen,
    defaultSettingsSection: 'domains',
    domainSettingsState: scenario.domainSettingsState,
    publicEnv: storyPublicEnv,
    routeSearch,
    routeState: authenticatedSettingsRouteState,
    sessionCleanupEnabled: false,
    settingsOpen: scenario.settingsOpen,
    settingsSection: scenario.settingsSection,
    ...screenModel,
    ...handlers
  }
}
