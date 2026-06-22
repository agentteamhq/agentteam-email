import { definePlugin, runWorker } from '@paperclipai/plugin-sdk'
import { normalizeAgentTeamEmailConfig, validateAgentTeamEmailConfig } from './config'
import type { ScopeKey } from '@paperclipai/plugin-sdk'

import type { AgentTeamEmailPluginConfig } from './config'

const LAST_CONNECTION_CHECK_SCOPE = {
  scopeKind: 'instance',
  namespace: 'connection',
  stateKey: 'last-connection-check'
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
    oauthAvailable: false,
    lastConnectionCheckAt: typeof lastConnectionCheckAt === 'string' ? lastConnectionCheckAt : null
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    const getConnectionStatus = async () => {
      const config = normalizeAgentTeamEmailConfig(await ctx.config.get())
      const lastConnectionCheckAt = await ctx.state.get(LAST_CONNECTION_CHECK_SCOPE)
      return statusFromConfig(config, lastConnectionCheckAt)
    }

    ctx.data.register('email-connection-status', getConnectionStatus)

    ctx.actions.register('record-synthetic-connection-check', async () => {
      const checkedAt = new Date().toISOString()
      await ctx.state.set(LAST_CONNECTION_CHECK_SCOPE, checkedAt)
      ctx.logger.info('Recorded synthetic AgentTeam Email connection check', { checkedAt })
      return { checkedAt }
    })

    ctx.actions.register('start-oauth-connect', async () => {
      return {
        ok: false,
        message: 'Account linking is not implemented in this scaffold yet.'
      }
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

export default plugin
// Paperclip worker entrypoints must start RPC when executed directly by the host.
// eslint-disable-next-line no-restricted-syntax
runWorker(plugin, import.meta.url)
