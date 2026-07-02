import type { IntegrationSettingsState } from '../partials/authenticated/settings-dialog'
import type { IntegrationsView } from '@main/backend'

export const integrationsEmptyView = {
  allowedActions: {
    revokePaperclip: false
  },
  organizationId: 'org-story',
  paperclip: {
    available: true,
    connections: []
  },
  state: 'empty'
} satisfies IntegrationsView

export const integrationsUnavailableView = {
  ...integrationsEmptyView,
  paperclip: {
    available: false,
    connections: []
  }
} satisfies IntegrationsView

export const integrationsPaperclipConnectedView = {
  allowedActions: {
    revokePaperclip: true
  },
  organizationId: 'org-story',
  paperclip: {
    available: true,
    connections: [
      {
        clientId: 'paperclip-client-story',
        name: 'Paperclip plugin',
        pluginId: 'agentteam.paperclip-email-plugin',
        requiresReauthorization: false,
        status: 'connected'
      }
    ]
  },
  state: 'ready'
} satisfies IntegrationsView

export const integrationsPaperclipReconnectRequiredView = {
  allowedActions: {
    revokePaperclip: true
  },
  organizationId: 'org-story',
  paperclip: {
    available: true,
    connections: [
      {
        clientId: 'paperclip-client-story',
        name: 'Paperclip plugin',
        pluginId: 'agentteam.paperclip-email-plugin',
        requiresReauthorization: true,
        status: 'needs_reauthorization'
      }
    ]
  },
  state: 'ready'
} satisfies IntegrationsView

export const integrationsPaperclipUnavailableView = {
  allowedActions: {
    revokePaperclip: true
  },
  organizationId: 'org-story',
  paperclip: {
    available: true,
    connections: [
      {
        clientId: 'paperclip-client-story',
        name: 'Paperclip plugin',
        pluginId: 'agentteam.paperclip-email-plugin',
        requiresReauthorization: false,
        status: 'unavailable'
      }
    ]
  },
  state: 'ready'
} satisfies IntegrationsView

export const integrationsEmptyState = {
  readOnly: true,
  view: integrationsEmptyView
} satisfies IntegrationSettingsState

export const integrationsPaperclipConnectedState = {
  onRevokePaperclip: () => undefined,
  readOnly: false,
  view: integrationsPaperclipConnectedView
} satisfies IntegrationSettingsState

export const integrationsPaperclipReconnectRequiredState = {
  onRevokePaperclip: () => undefined,
  readOnly: false,
  view: integrationsPaperclipReconnectRequiredView
} satisfies IntegrationSettingsState

export const integrationsPaperclipUnavailableState = {
  onRevokePaperclip: () => undefined,
  readOnly: false,
  view: integrationsPaperclipUnavailableView
} satisfies IntegrationSettingsState

export const integrationsUnavailableState = {
  readOnly: true,
  view: integrationsUnavailableView
} satisfies IntegrationSettingsState
