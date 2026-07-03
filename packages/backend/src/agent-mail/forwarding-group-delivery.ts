import { parseUUIDv7, HttpStatusCode } from '@main/common'
import debug from 'debug'
import { z } from 'zod'

import { globals } from '../globals'
import { hasValidControlToWebToken } from './control-to-web-auth'
import { mailboxDomain, normalizeMailboxIdentifier } from './mailbox-address'
import type { OrganizationId } from '@main/db'

const log = debug('app:agent-mail:forwarding-group-delivery')

const forwardingGroupDeliveryRequestSchema = z.object({
  delivered_at: z.iso.datetime(),
  group_address: z.string().min(1),
  local_route_id: z.string().min(1),
  organization_id: z.string().min(1),
  source_ingest_id: z.string().min(1).optional(),
  target_mailbox: z.string().min(1)
})

export async function handleAgentMailForwardingGroupDeliveryRequest(request: Request): Promise<Response> {
  if (!hasValidControlToWebToken(request)) {
    return Response.json({ message: 'Unauthorized' }, { status: HttpStatusCode.Unauthorized })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: HttpStatusCode.BadRequest })
  }

  const parsed = forwardingGroupDeliveryRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ message: 'Invalid forwarding group delivery report' }, { status: HttpStatusCode.BadRequest })
  }

  const organizationId = parseOrganizationId(parsed.data.organization_id)
  const groupAddress = normalizeMailboxIdentifier(parsed.data.group_address)
  const targetMailbox = normalizeMailboxIdentifier(parsed.data.target_mailbox)
  const deliveredAt = new Date(parsed.data.delivered_at)

  if (!organizationId || !groupAddress || !targetMailbox || Number.isNaN(deliveredAt.getTime())) {
    return Response.json({ message: 'Invalid forwarding group delivery report' }, { status: HttpStatusCode.BadRequest })
  }

  const { db } = await globals()
  const result = await db.models.agentMailForwardingGroup
    .updateOne(
      {
        address: groupAddress,
        organizationId
      },
      {
        $max: { lastDeliveredAt: deliveredAt }
      }
    )
    .exec()
  const matched = updateMatched(result)
  const modified = modifiedCount(result) > 0

  log('forwarding_group_delivery_recorded %o', {
    domain: mailboxDomain(groupAddress),
    groupMatched: matched,
    groupModified: modified,
    localRouteId: parsed.data.local_route_id,
    organizationId: String(organizationId),
    targetDomain: mailboxDomain(targetMailbox)
  })

  return Response.json({
    matched,
    modified,
    success: true
  })
}

function parseOrganizationId(value: string): OrganizationId | null {
  try {
    return parseUUIDv7(value) as OrganizationId
  } catch {
    return null
  }
}

function modifiedCount(value: { modifiedCount?: number } | null | undefined) {
  return typeof value?.modifiedCount === 'number' ? value.modifiedCount : 0
}

function updateMatched(result: unknown) {
  if (!result || typeof result !== 'object') {
    return false
  }
  const record = result as {
    matchedCount?: unknown
    n?: unknown
  }
  return record.matchedCount === undefined ? Number(record.n ?? 0) > 0 : Number(record.matchedCount) > 0
}
