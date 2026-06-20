import type { Patch } from 'immer'
import { z } from 'zod'

import { parseBase62UUIDv7 } from '@main/common'
import type { ActorPublicId } from './schema'

export const ActorValues = ['anonymous', 'user'] as const
export type ActorType = (typeof ActorValues)[number]

export const PermissionPolicyActionValues = ['create', 'read', 'update', 'delete', 'setPermissions'] as const
export type PermissionPolicyActionType = (typeof PermissionPolicyActionValues)[number]

export type AuditActorEntry =
  | { actorType: 'actor'; actorId: ActorPublicId }
  | { actorType: 'anonymous'; actorId?: undefined }

const ActorPublicIdSchema = z.string().transform((value): ActorPublicId => parseBase62UUIDv7(value) as ActorPublicId)

const ImmerPatchSchema = z
  .object({
    op: z.enum(['replace', 'remove', 'add']),
    path: z.array(z.union([z.string(), z.number()])),
    value: z.unknown().optional()
  })
  .transform((value): Patch => value)

export const AuditEntry = z.object({
  actor: z.union([
    z.object({
      actorType: z.literal('actor'),
      actorId: ActorPublicIdSchema
    }),
    z.object({
      actorType: z.literal('anonymous'),
      actorId: z.undefined()
    })
  ]),
  actionType: z.enum(PermissionPolicyActionValues),
  patches: z.array(ImmerPatchSchema),
  inversePatches: z.array(ImmerPatchSchema)
})

export type AuditEntrySchema = Readonly<z.infer<typeof AuditEntry>>

const BasePolicySchema = z.object({
  version: z.literal(0).default(0)
})

export const PermissionPolicyV1VisibilityValues = ['private', 'public'] as const
export type PermissionPolicyV1VisibilityType = (typeof PermissionPolicyV1VisibilityValues)[number]

export const PermissionPolicyV1 = BasePolicySchema.extend({
  version: z.literal(1).default(1),
  visibility: z.enum(PermissionPolicyV1VisibilityValues).default('private'),
  ownerId: ActorPublicIdSchema,
  publicPermissions: z.array(z.enum(PermissionPolicyActionValues)).optional(),
  actorPermissions: z.record(ActorPublicIdSchema, z.array(z.enum(PermissionPolicyActionValues)).optional()).default({})
})

export type PermissionPolicyV1Schema = z.infer<typeof PermissionPolicyV1>
