import {
  authenticatedSectionBaseArgs,
  domainSettingsAddDomainAuthorizeCloudflareState,
  emptyAuthenticatedSidebarView
} from './authenticated-section-fixtures'
import type { DashboardScreenProps } from '../screens/dashboard-screen'
import type {
  AuthenticatedDashboardView,
  AuthenticatedSidebarView
} from '../partials/authenticated/authenticated-shell-models'

const onboardingPrompt = {
  actionLabel: 'Continue with Cloudflare',
  description: 'Connect Cloudflare to choose the domain you want to use with AgentTeam Email.',
  helperText:
    'Cloudflare will open in a secure window. AgentTeam Email will only configure the domain you approve.',
  state: 'ready',
  title: 'Connect your domain'
} satisfies NonNullable<AuthenticatedDashboardView['onboardingPrompt']>

const connectingOnboardingPrompt = {
  ...onboardingPrompt,
  state: 'connecting'
} satisfies NonNullable<AuthenticatedDashboardView['onboardingPrompt']>

const errorOnboardingPrompt = {
  ...onboardingPrompt,
  errorDescription: 'Cloudflare authorization was not completed. Try again when you are ready.',
  state: 'error'
} satisfies NonNullable<AuthenticatedDashboardView['onboardingPrompt']>

const firstUseDashboardView = {
  emptyDescription: 'Connect a Cloudflare domain to start receiving agent email.',
  emptyTitle: 'Connect your domain',
  onboardingPrompt,
  state: 'empty'
} satisfies AuthenticatedDashboardView

const connectingDashboardView = {
  ...firstUseDashboardView,
  onboardingPrompt: connectingOnboardingPrompt
} satisfies AuthenticatedDashboardView

const errorDashboardView = {
  ...firstUseDashboardView,
  onboardingPrompt: errorOnboardingPrompt
} satisfies AuthenticatedDashboardView

const noAccountSidebarView = {
  ...emptyAuthenticatedSidebarView,
  accounts: [],
  emptyDescription: 'Connect Cloudflare to add the first mailbox.',
  emptyTitle: 'No mailbox yet',
  mails: [],
  state: 'empty'
} satisfies AuthenticatedSidebarView

export const productOnboardingAuthenticatedShellArgs = {
  ...authenticatedSectionBaseArgs,
  dashboardView: firstUseDashboardView,
  defaultSettingsSection: 'domains',
  domainSettingsState: domainSettingsAddDomainAuthorizeCloudflareState,
  emailPreviewsById: {},
  mailboxAdminView: undefined,
  onComposeOpenChange: undefined,
  sidebarView: noAccountSidebarView
} satisfies Partial<DashboardScreenProps>

export const productOnboardingConnectingShellArgs = {
  ...productOnboardingAuthenticatedShellArgs,
  dashboardView: connectingDashboardView
} satisfies Partial<DashboardScreenProps>

export const productOnboardingErrorShellArgs = {
  ...productOnboardingAuthenticatedShellArgs,
  dashboardView: errorDashboardView
} satisfies Partial<DashboardScreenProps>

export const productOnboardingSettingsOpenShellArgs = {
  ...productOnboardingAuthenticatedShellArgs,
  defaultSettingsOpen: true,
  settingsOpen: true,
  settingsSection: 'domains'
} satisfies Partial<DashboardScreenProps>
