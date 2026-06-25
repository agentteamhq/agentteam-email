export {
  DEFAULT_SERVICE_BASE_URL,
  normalizeAgentTeamEmailConfig,
  validateAgentTeamEmailConfig,
  type AgentTeamEmailConfigValidation,
  type AgentTeamEmailPluginConfig
} from './config'
export { PLUGIN_ID, default as manifest } from './manifest'
export { default as plugin, type EmailConnectionStatus } from './worker'
export {
  EMAIL_TOOL_DECLARATION,
  EMAIL_TOOL_NAME,
  EmailToolOperationValues,
  PAPERCLIP_TOOL_SCHEMA,
  buildAgentTeamEmailCliCommand,
  buildAgentTeamEmailToolEnvelope,
  createEmailToolHandler,
  mapCliOutputToToolResult,
  redactDiagnosticText,
  runAgentTeamEmailCli,
  type AgentTeamEmailCliExecutor,
  type AgentTeamEmailCliOptions,
  type AgentTeamEmailPaperclipToolEnvelope,
  type EmailToolInput,
  type EmailToolHandlerOptions,
  type EmailToolOperation
} from './tool'
