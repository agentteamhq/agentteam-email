import { createAuthPlugin } from "@better-auth-ui/core"
import {


  organizationPlugin as coreOrganizationPlugin
} from "@better-auth-ui/core/plugins"
import { BriefcaseIcon as Briefcase } from "@phosphor-icons/react"

import { OrganizationsSettings } from "src/components/auth/organization/organizations-settings"
import type { OrganizationLocalization, OrganizationPluginOptions } from "@better-auth-ui/core/plugins";

export const organizationPlugin = createAuthPlugin(
  coreOrganizationPlugin.id,
  (options: OrganizationPluginOptions = {}) => {
    const core = coreOrganizationPlugin(options)

    return {
      ...core,
      localization: core.localization,
      settingsTabs: [
        {
          view: "organizations",
          label: (
            <>
              <Briefcase className="text-muted-foreground" />
              {core.localization.organizations}
            </>
          ),
          component: OrganizationsSettings
        }
      ]
    }
  }
)
