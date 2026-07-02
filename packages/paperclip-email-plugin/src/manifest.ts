import { DEFAULT_SERVICE_BASE_URL } from './config'
import { PLUGIN_ID } from './constants'
import { EMAIL_TOOL_DECLARATION } from './tool'
import type { JsonSchema, PaperclipPluginManifestV1 } from '@paperclipai/plugin-sdk'

export { PLUGIN_ID }

const instanceConfigSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceBaseUrl'],
  properties: {
    serviceBaseUrl: {
      type: 'string',
      format: 'uri',
      default: DEFAULT_SERVICE_BASE_URL,
      description: 'HTTPS base URL for the AgentTeam Email application.',
      'x-paperclip-advanced': true,
      'x-paperclip-group': 'Self-hosting'
    },
    apiKeySecretRef: {
      type: 'string',
      format: 'secret-ref',
      description: 'Paperclip secret reference for a self-hosted AgentTeam Email API key.',
      'x-paperclip-advanced': true,
      'x-paperclip-group': 'Self-hosting'
    },
    oauthClientId: {
      type: 'string',
      description: 'Pre-provisioned AgentTeam Email OAuth client ID for this Paperclip plugin.',
      'x-paperclip-advanced': true,
      'x-paperclip-group': 'OAuth provisioning'
    },
    oauthRedirectUri: {
      type: 'string',
      format: 'uri',
      description: 'Paperclip OAuth callback URI registered with the AgentTeam Email OAuth client.',
      'x-paperclip-advanced': true,
      'x-paperclip-group': 'OAuth provisioning'
    }
  }
} satisfies JsonSchema

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: '0.1.0',
  displayName: 'AgentTeam Email',
  description: 'Provisions agent email addresses through agentteam.email.',
  author: 'AgentTeam',
  categories: ['connector'],
  capabilities: [
    'agent.tools.register',
    'plugin.state.read',
    'plugin.state.write',
    'ui.dashboardWidget.register',
    'instance.settings.register'
  ],
  entrypoints: {
    worker: './dist/worker.js',
    ui: './dist/ui'
  },
  instanceConfigSchema,
  tools: [EMAIL_TOOL_DECLARATION],
  ui: {
    slots: [
      {
        type: 'settingsPage',
        id: 'settings',
        displayName: 'AgentTeam Email',
        exportName: 'SettingsPage'
      },
      {
        type: 'dashboardWidget',
        id: 'email-status',
        displayName: 'AgentTeam Email',
        exportName: 'DashboardWidget'
      }
    ]
  }
}

export default manifest
