import { AbilityBuilder, type ForcedSubject, type MatchConditions, PureAbility } from '@casl/ability'
import type { AuditActorEntry, PermissionPolicyActionType, PermissionPolicyV1Schema } from '@main/db'

export type Policy = PermissionPolicyV1Schema

// ==== CASL Ability Builder ====

// https://github.com/stalniy/casl/discussions/812
const lambdaMatcher = (matchConditions: MatchConditions) => matchConditions

type Subject = 'all' | 'Policy' | (ForcedSubject<'Policy'> & Policy)
type Action = PermissionPolicyActionType
type AppAbility = PureAbility<[Action, Subject], MatchConditions>

export function abilityForActor(actor: AuditActorEntry) {
  // const actor = resolveActorEntry(actorEntry)

  const { can, build } = new AbilityBuilder<AppAbility>(PureAbility)

  if (actor.actorType === 'actor') {
    can(
      ['create', 'read', 'update', 'delete', 'setPermissions'],
      'Policy',
      (policy) => policy.ownerId === actor.actorId
    )

    can(['create'], 'Policy', (policy) => {
      const actorPermission = policy.actorPermissions[actor.actorId]
      if (actorPermission?.includes('create')) {
        return true
      }
      return false
    })
    can(['read'], 'Policy', (policy) => {
      const actorPermission = policy.actorPermissions[actor.actorId]
      if (actorPermission?.includes('read')) {
        return true
      }
      return false
    })
    can(['update'], 'Policy', (policy) => {
      const actorPermission = policy.actorPermissions[actor.actorId]
      if (actorPermission?.includes('update')) {
        return true
      }
      return false
    })
    can(['delete'], 'Policy', (policy) => {
      const actorPermission = policy.actorPermissions[actor.actorId]
      if (actorPermission?.includes('delete')) {
        return true
      }
      return false
    })
    can(['setPermissions'], 'Policy', (policy) => {
      const actorPermission = policy.actorPermissions[actor.actorId]
      if (actorPermission?.includes('setPermissions')) {
        return true
      }
      return false
    })
  }
  // if (actor.actorType === 'anonymous') {
  can('read', 'Policy', (policy) => {
    const publicPermission = policy.publicPermissions
    if (policy.visibility === 'public' && publicPermission?.includes('read')) {
      return true
    }
    return false
  })
  // }

  return build({
    conditionsMatcher: lambdaMatcher
  })
}
