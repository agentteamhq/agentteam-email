import {

  useAuth,
  useAuthPlugin,
  useListUserInvitations
} from "@better-auth-ui/react"

import { Card, CardContent } from "src/components/ui/card"
import { Separator } from "src/components/ui/separator"
import { organizationPlugin } from "src/lib/auth/organization-plugin"
import { UserInvitationRow } from "./user-invitation-row"
import { UserInvitationRowSkeleton } from "./user-invitation-row-skeleton"
import { UserInvitationsEmpty } from "./user-invitations-empty"
import type { OrganizationAuthClient } from "@better-auth-ui/react";

export type UserInvitationsProps = {
  className?: string
}

/**
 * Organization invitations for the signed-in user. Always renders the section
 * card; uses `UserInvitationsEmpty` when there are no pending invitations.
 */
export function UserInvitations({ className }: UserInvitationsProps) {
  const { authClient } = useAuth()
  const { localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin)

  const { data: invitations, isPending } = useListUserInvitations(
    authClient as OrganizationAuthClient
  )

  return (
    <div className={className}>
      <div className="flex flex-col gap-3">
        <h2 className="truncate text-sm font-semibold">
          {organizationLocalization.invitations}
        </h2>

        <Card className="p-0">
          <CardContent className="p-0">
            {isPending ? (
              <div className="p-4">
                <UserInvitationRowSkeleton />
              </div>
            ) : !invitations?.length ? (
              <UserInvitationsEmpty />
            ) : (
              invitations.map((invitation, index) => (
                <div key={invitation.id}>
                  {index > 0 && <Separator />}

                  <div className="p-4">
                    <UserInvitationRow invitation={invitation} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
