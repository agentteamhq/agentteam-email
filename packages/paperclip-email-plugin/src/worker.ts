import { definePlugin, runWorker } from '@paperclipai/plugin-sdk'
import { normalizeAgentTeamEmailConfig, validateAgentTeamEmailConfig } from './config'
import { PLUGIN_ID } from './constants'
import { EMAIL_TOOL_DECLARATION, EMAIL_TOOL_NAME, createEmailToolHandler } from './tool'
import type { ScopeKey } from '@paperclipai/plugin-sdk'

import type { AgentTeamEmailPluginConfig } from './config'
import type { AgentTeamEmailCliExecutor, EmailToolHandlerOptions } from './tool'

const LAST_CONNECTION_CHECK_SCOPE = {
  scopeKind: 'instance',
  namespace: 'connection',
  stateKey: 'last-connection-check'
} satisfies ScopeKey
const PAPERCLIP_CONNECT_PATH = '/settings/agent-access/'

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
    oauthAvailable: true,
    lastConnectionCheckAt: typeof lastConnectionCheckAt === 'string' ? lastConnectionCheckAt : null
  }
}

export interface AgentTeamEmailOAuthConnectResult {
  ok: boolean
  connectUrl?: string
  message: string
}

export function buildAgentTeamEmailOAuthConnectUrl({
  companyId,
  serviceBaseUrl
}: {
  companyId: string
  serviceBaseUrl: string
}): string {
  const url = new URL(PAPERCLIP_CONNECT_PATH, serviceBaseUrl)
  url.searchParams.set('source', 'paperclip')
  url.searchParams.set('paperclip_company_id', companyId)
  url.searchParams.set('paperclip_plugin_id', PLUGIN_ID)
  return url.toString()
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
        const config = normalizeAgentTeamEmailConfig({
          ...(await ctx.config.get()),
          serviceBaseUrl: stringParam(params.serviceBaseUrl) ?? undefined
        })
        const validation = validateAgentTeamEmailConfig({ ...config })
        if (validation.errors.length > 0) {
          return {
            ok: false,
            message: validation.errors.join(' ')
          } satisfies AgentTeamEmailOAuthConnectResult
        }
        const companyId = actionContext.companyId ?? stringParam(params.companyId)
        if (!companyId) {
          return {
            ok: false,
            message: 'Open this plugin from a Paperclip company workspace before connecting AgentTeam Email.'
          } satisfies AgentTeamEmailOAuthConnectResult
        }

        return {
          ok: true,
          connectUrl: buildAgentTeamEmailOAuthConnectUrl({
            companyId,
            serviceBaseUrl: validation.config.serviceBaseUrl
          }),
          message: 'Open AgentTeam Email to finish connecting this Paperclip workspace.'
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
