export {
  DEFAULT_SERVICE_BASE_URL,
  normalizeAgentTeamEmailConfig,
  validateAgentTeamEmailConfig,
  type AgentTeamEmailConfigValidation,
  type AgentTeamEmailPluginConfig
} from './config'
export { PLUGIN_ID, default as manifest } from './manifest'
export { default as plugin, type EmailConnectionStatus } from './worker'
