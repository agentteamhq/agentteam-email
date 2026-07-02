import { definePlugin, runWorker } from '@paperclipai/plugin-sdk'
import { normalizeAgentTeamEmailConfig, validateAgentTeamEmailConfig } from './config'
import { PLUGIN_ID } from './constants'
import {
  buildAgentTeamEmailOAuthConnectUrl,
  createOAuthPkce,
  createOAuthState
} from './oauth'
import { EMAIL_TOOL_DECLARATION, EMAIL_TOOL_NAME, createEmailToolHandler } from './tool'
import type { ScopeKey } from '@paperclipai/plugin-sdk'

import type { AgentTeamEmailPluginConfig } from './config'
import type { AgentTeamEmailCliExecutor, EmailToolHandlerOptions } from './tool'

const LAST_CONNECTION_CHECK_SCOPE = {
  scopeKind: 'instance',
  namespace: 'connection',
  stateKey: 'last-connection-check'
} satisfies ScopeKey
const PENDING_OAUTH_AUTHORIZATION_SCOPE = {
  scopeKind: 'instance',
  namespace: 'oauth',
  stateKey: 'pending-authorization'
} satisfies ScopeKey
export interface EmailConnectionStatus {
  status: 'api_key_configured' | 'not_connected'
  serviceBaseUrl: string
  apiKeyConfigured: boolean
  oauthAvailable: boolean
  lastConnectionCheckAt: string | null
}

function statusFromConfig(
  config: AgentTeamEmailPluginConfig,
  lastConnectionCheckAt: unknown
): EmailConnectionStatus {
  return {
    status: config.apiKeySecretRef ? 'api_key_configured' : 'not_connected',
    serviceBaseUrl: config.serviceBaseUrl,
    apiKeyConfigured: Boolean(config.apiKeySecretRef),
    oauthAvailable: Boolean(config.oauthClientId && config.oauthRedirectUri),
    lastConnectionCheckAt: typeof lastConnectionCheckAt === 'string' ? lastConnectionCheckAt : null
  }
}

export interface AgentTeamEmailOAuthConnectResult {
  ok: boolean
  connectUrl?: string
  message: string
}

interface PendingOAuthAuthorization {
  companyId: string
  codeVerifier: string
  createdAt: string
  oauthClientId: string
  oauthRedirectUri: string
  pluginId: typeof PLUGIN_ID
  state: string
}

function stringParam(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export interface AgentTeamEmailPaperclipPluginOptions {
  emailToolHandler?: ReturnType<typeof createEmailToolHandler>
  runCli?: AgentTeamEmailCliExecutor
}

export function createAgentTeamEmailPaperclipPlugin(options: AgentTeamEmailPaperclipPluginOptions = {}) {
  const emailToolOptions: EmailToolHandlerOptions = options.runCli ? { runCli: options.runCli } : {}
  const emailToolHandler = options.emailToolHandler ?? createEmailToolHandler(emailToolOptions)

  return definePlugin({
    async setup(ctx) {
      const getConnectionStatus = async () => {
        const config = normalizeAgentTeamEmailConfig(await ctx.config.get())
        const lastConnectionCheckAt = await ctx.state.get(LAST_CONNECTION_CHECK_SCOPE)
        return statusFromConfig(config, lastConnectionCheckAt)
      }

      ctx.data.register('email-connection-status', getConnectionStatus)
      ctx.tools.register(EMAIL_TOOL_NAME, EMAIL_TOOL_DECLARATION, emailToolHandler)

      ctx.actions.register('record-synthetic-connection-check', async () => {
        const checkedAt = new Date().toISOString()
        await ctx.state.set(LAST_CONNECTION_CHECK_SCOPE, checkedAt)
        ctx.logger.info('Recorded synthetic AgentTeam Email connection check', { checkedAt })
        return { checkedAt }
      })

      ctx.actions.register('start-oauth-connect', async (params, actionContext) => {
        const serviceBaseUrl = stringParam(params.serviceBaseUrl)
        const oauthClientId = stringParam(params.oauthClientId)
        const oauthRedirectUri = stringParam(params.oauthRedirectUri)
        const config = normalizeAgentTeamEmailConfig({
          ...(await ctx.config.get()),
          ...(oauthClientId ? { oauthClientId } : {}),
          ...(oauthRedirectUri ? { oauthRedirectUri } : {}),
          ...(serviceBaseUrl ? { serviceBaseUrl } : {})
        })
        const validation = validateAgentTeamEmailConfig({ ...config })
        if (validation.errors.length > 0) {
          return {
            ok: false,
            message: validation.errors.join(' ')
          } satisfies AgentTeamEmailOAuthConnectResult
        }
        if (!validation.config.oauthClientId || !validation.config.oauthRedirectUri) {
          return {
            ok: false,
            message:
              'AgentTeam Email OAuth is not provisioned. Configure the OAuth client ID and redirect URI before connecting.'
          } satisfies AgentTeamEmailOAuthConnectResult
        }
        const companyId = actionContext.companyId ?? stringParam(params.companyId)
        if (!companyId) {
          return {
            ok: false,
            message: 'Open this plugin from a Paperclip company workspace before connecting AgentTeam Email.'
          } satisfies AgentTeamEmailOAuthConnectResult
        }
        const state = createOAuthState()
        const pkce = createOAuthPkce()
        await ctx.state.set(PENDING_OAUTH_AUTHORIZATION_SCOPE, {
          codeVerifier: pkce.codeVerifier,
          companyId,
          createdAt: new Date().toISOString(),
          oauthClientId: validation.config.oauthClientId,
          oauthRedirectUri: validation.config.oauthRedirectUri,
          pluginId: PLUGIN_ID,
          state
        } satisfies PendingOAuthAuthorization)

        return {
          ok: true,
          connectUrl: buildAgentTeamEmailOAuthConnectUrl({
            codeChallenge: pkce.codeChallenge,
            oauthClientId: validation.config.oauthClientId,
            oauthRedirectUri: validation.config.oauthRedirectUri,
            serviceBaseUrl: validation.config.serviceBaseUrl,
            state
          }),
          message: 'Authorize AgentTeam Email to connect this Paperclip workspace.'
        } satisfies AgentTeamEmailOAuthConnectResult
      })
    },

    async onHealth() {
      return { status: 'ok', message: 'AgentTeam Email plugin worker is running.' }
    },

    async onValidateConfig(config) {
      const validation = validateAgentTeamEmailConfig(config)
      return {
        ok: validation.errors.length === 0,
        errors: validation.errors,
        warnings: validation.warnings
      }
    }
  })
}

const plugin = createAgentTeamEmailPaperclipPlugin()

export default plugin
export { buildAgentTeamEmailOAuthConnectUrl } from './oauth'
export {
  buildAgentTeamEmailCliCommand,
  buildAgentTeamEmailToolEnvelope,
  createEmailToolHandler,
  EMAIL_TOOL_DECLARATION,
  EMAIL_TOOL_NAME,
  mapCliOutputToToolResult,
  redactDiagnosticText,
  runAgentTeamEmailCli
} from './tool'
// Paperclip worker entrypoints must start RPC when executed directly by the host.
// eslint-disable-next-line no-restricted-syntax
runWorker(plugin, import.meta.url)
