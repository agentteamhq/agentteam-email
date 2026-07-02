export const DEFAULT_SERVICE_BASE_URL = 'https://app.agentteam.email'

export interface AgentTeamEmailPluginConfig {
  serviceBaseUrl: string
  apiKeySecretRef?: string
  oauthClientId?: string
  oauthRedirectUri?: string
}

export interface AgentTeamEmailConfigValidation {
  config: AgentTeamEmailPluginConfig
  errors: string[]
  warnings: string[]
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function validUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeAgentTeamEmailConfig(input: Record<string, unknown>): AgentTeamEmailPluginConfig {
  return {
    serviceBaseUrl: stringValue(input.serviceBaseUrl) ?? DEFAULT_SERVICE_BASE_URL,
    apiKeySecretRef: stringValue(input.apiKeySecretRef),
    oauthClientId: stringValue(input.oauthClientId),
    oauthRedirectUri: stringValue(input.oauthRedirectUri)
  }
}

export function validateAgentTeamEmailConfig(input: Record<string, unknown>): AgentTeamEmailConfigValidation {
  const config = normalizeAgentTeamEmailConfig(input)
  const errors: string[] = []
  const warnings: string[] = []

  if (!validUrl(config.serviceBaseUrl)) {
    errors.push('serviceBaseUrl must be an HTTPS URL.')
  }

  if (!config.apiKeySecretRef) {
    warnings.push('No API key secret reference is configured; API key fallback remains unavailable.')
  }

  if (!config.oauthClientId) {
    warnings.push('No OAuth client ID is configured; OAuth connection cannot start.')
  }

  if (!config.oauthRedirectUri) {
    warnings.push('No OAuth redirect URI is configured; OAuth connection cannot start.')
  } else if (!validUrl(config.oauthRedirectUri)) {
    errors.push('oauthRedirectUri must be an HTTPS URL.')
  }

  return { config, errors, warnings }
}
