import { createAuthPlugin } from "@better-auth-ui/core"
import {

  apiKeyPlugin as coreApiKeyPlugin
} from "@better-auth-ui/core/plugins"

import { ApiKeys } from "src/components/auth/api-key/api-keys"
import { OrganizationApiKeys } from "src/components/auth/api-key/organization-api-keys"
import type { ApiKeyPluginOptions } from "@better-auth-ui/core/plugins";

export const apiKeyPlugin = createAuthPlugin(
  coreApiKeyPlugin.id,
  (options: ApiKeyPluginOptions = {}) => {
    const core = coreApiKeyPlugin(options)

    return {
      ...core,
      securityCards: [ApiKeys],
      ...(core.organization ? { organizationCards: [OrganizationApiKeys] } : {})
    }
  }
)
