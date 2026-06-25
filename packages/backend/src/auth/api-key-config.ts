import type { ApiKeyConfigurationOptions } from '@better-auth/api-key'

export const apiKeyConfigurationDefaults = {
  enableMetadata: true,
  enableSessionForAPIKeys: false,
  defaultPrefix: '_secret_api_',
  storage: 'secondary-storage',
  fallbackToDatabase: true,
  rateLimit: {
    enabled: true,
    timeWindow: 60_000,
    maxRequests: 200
  }
} as const

export const apiKeyConfigurations = [
  {
    ...apiKeyConfigurationDefaults,
    configId: 'default',
    references: 'user'
  },
  {
    ...apiKeyConfigurationDefaults,
    configId: 'organization',
    references: 'organization'
  }
] satisfies ApiKeyConfigurationOptions[]
