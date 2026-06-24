import { createAuthPlugin } from "@better-auth-ui/core"
import {

  passkeyPlugin as corePasskeyPlugin
} from "@better-auth-ui/core/plugins"

import { PasskeyButton } from "src/components/auth/passkey/passkey-button"
import { Passkeys } from "src/components/auth/passkey/passkeys"
import type { PasskeyPluginOptions } from "@better-auth-ui/core/plugins";

export const passkeyPlugin = createAuthPlugin(
  corePasskeyPlugin.id,
  (options: PasskeyPluginOptions = {}) => ({
    ...corePasskeyPlugin(options),
    authButtons: [PasskeyButton],
    securityCards: [Passkeys]
  })
)
