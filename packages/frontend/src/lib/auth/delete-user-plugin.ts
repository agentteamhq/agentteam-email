import { createAuthPlugin } from "@better-auth-ui/core"
import {

  deleteUserPlugin as coreDeleteUserPlugin
} from "@better-auth-ui/core/plugins"
import { DangerZone } from "src/components/auth/delete-user/danger-zone"
import type { DeleteUserPluginOptions } from "@better-auth-ui/core/plugins";


export const deleteUserPlugin = createAuthPlugin(
  coreDeleteUserPlugin.id,
  (options: DeleteUserPluginOptions = {}) => ({
    ...coreDeleteUserPlugin(options),
    securityCards: [DangerZone]
  })
)
