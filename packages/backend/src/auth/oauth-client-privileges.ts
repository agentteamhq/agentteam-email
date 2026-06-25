import { agentMailSubject, buildAgentMailAbility } from '../agent-mail/permission-policy'
import type { OrganizationId, UserId } from '@main/db'
import type { AgentMailPrincipal } from '../agent-mail/permission-policy'
import type { Database } from '../db/db'

export interface OAuthClientPrivilegeSession {
  activeOrganizationId?: string | null
  id: string
  userId: string
}

export async function canManageOAuthClientsForSession({
  db,
  session
}: {
  db: Database
  session: OAuthClientPrivilegeSession | null | undefined
}): Promise<boolean> {
  if (!session?.activeOrganizationId) {
    return false
  }

  const organizationId = session.activeOrganizationId as OrganizationId
  const userId = session.userId as UserId
  const member = await db.models.member.findOne({ organizationId, userId }).exec()
  if (!member) {
    return false
  }

  const principal: AgentMailPrincipal = {
    credentialId: session.id,
    organizationId,
    organizationRole: member.role,
    principalId: userId,
    principalType: 'user_session',
    userId
  }
  const [mailboxGrants, systemGrants] = await Promise.all([
    db.models.agentMailMailboxGrant
      .find({ organizationId, principalId: principal.principalId, principalType: principal.principalType })
      .exec(),
    db.models.agentMailSystemGrant
      .find({ organizationId, principalId: principal.principalId, principalType: principal.principalType })
      .exec()
  ])
  const ability = buildAgentMailAbility({ mailboxGrants, principal, systemGrants })

  return ability.can('manage', agentMailSubject('OAuthConnection', { organizationId }))
}
