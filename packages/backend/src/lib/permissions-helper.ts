import { subject } from '@casl/ability'
import { PermissionPolicyV1, publicIdFromUUIDv7 } from '@main/db'
import { abilityForActor } from './permission-policy-schema'
import type { Policy } from './permission-policy-schema'
import type {
  ActorPublicId,
  AuditActorEntry,
  PermissionPolicyActionType,
  SubjectPolicyDocument,
  SubjectPolicyId,
  UserId
} from '@main/db'
import type { Patch, WritableDraft } from 'immer'

import type { Database } from '../db/db'

type SubjectPolicyRow = SubjectPolicyDocument

export async function userCannotProjectAction(
  db: Database,
  actionType: PermissionPolicyActionType,
  user: { id: UserId } | null,
  subjectPolicyId: SubjectPolicyId
): Promise<boolean> {
  const actor = await userActor(db, user)
  const subjectPolicy = await projectSubjectPolicy(db, subjectPolicyId)
  const abilities = abilityForActor(actor)
  return abilities.cannot(actionType, subject('Policy', subjectPolicy.policy))
}

export async function userActor(db: Database, user: { id: UserId } | null): Promise<AuditActorEntry> {
  if (!user) {
    return { actorType: 'anonymous' }
  }
  const actor = await db.models.actor.findOne({ userId: user.id }).exec()
  if (!actor) {
    throw new Error('User actor not found!')
  }
  return { actorType: 'actor', actorId: publicIdFromUUIDv7(actor._id) as ActorPublicId }
}

export async function projectSubjectPolicy(
  db: Database,
  subjectPolicyId: SubjectPolicyId
): Promise<SubjectPolicyRow> {
  const subjectPolicy = await db.models.subjectPolicy.findById(subjectPolicyId).exec()
  if (!subjectPolicy) {
    throw new Error('Project subjectPolicy not found!')
  }
  return subjectPolicy
}

export function createDefaultPolicy(ownerId: ActorPublicId) {
  const defaultPolicy: Policy = {
    version: 1,
    ownerId: ownerId,
    visibility: 'private',
    actorPermissions: {},
    publicPermissions: []
  }
  return PermissionPolicyV1.parse(defaultPolicy)
}

export interface updatePolicyArgs {
  db: Database
  policy: WritableDraft<Policy>
  patches: Patch[]
  inversePatches: Patch[]
  subjectPolicyId: SubjectPolicyId
  actor: AuditActorEntry
  actionType: PermissionPolicyActionType
}
export async function updatePolicy(args: updatePolicyArgs): Promise<SubjectPolicyRow | undefined> {
  const { db, policy, patches, inversePatches, actor, actionType, subjectPolicyId } = args

  const subjectPolicy = await db.models.subjectPolicy
    .findByIdAndUpdate(subjectPolicyId, { $set: { policy } }, { returnDocument: 'after' })
    .exec()

  await db.models.policyAuditEntry.create({
    subjectPolicyId,
    entry: {
      actionType,
      actor,
      patches,
      inversePatches
    }
  })
  return subjectPolicy ?? undefined
}
