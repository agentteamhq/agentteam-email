import { parseUUIDv7, HttpStatusCode } from '@main/common'
import debug from 'debug'
import { z } from 'zod'

import { createSafeErrorLogDetails, createSafeRequestLogDetails } from '../auth/log-redaction'
import { globals } from '../globals'
import { createSafeRequestCorrelationLogDetails, mapPublicErrorResponse } from '../public-error-response'
import { hasValidControlToWebToken } from './control-to-web-auth'
import { mailboxDomain, normalizeMailboxIdentifier } from './mailbox-address'
import type { PublicErrorResponse } from '../public-error-response'
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
    return createForwardingGroupDeliveryPublicErrorResponse({
      reason: 'missing_control_to_web_token',
      request,
      status: HttpStatusCode.Unauthorized
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    return createForwardingGroupDeliveryPublicErrorResponse({
      error,
      reason: 'invalid_json_body',
      request,
      status: HttpStatusCode.BadRequest
    })
  }

  const parsed = forwardingGroupDeliveryRequestSchema.safeParse(body)
  if (!parsed.success) {
    return createForwardingGroupDeliveryPublicErrorResponse({
      reason: 'invalid_delivery_report_schema',
      request,
      status: HttpStatusCode.BadRequest
    })
  }

  const organizationId = parseOrganizationId(parsed.data.organization_id)
  const groupAddress = normalizeMailboxIdentifier(parsed.data.group_address)
  const targetMailbox = normalizeMailboxIdentifier(parsed.data.target_mailbox)
  const deliveredAt = new Date(parsed.data.delivered_at)

  if (!organizationId || !groupAddress || !targetMailbox || Number.isNaN(deliveredAt.getTime())) {
    return createForwardingGroupDeliveryPublicErrorResponse({
      reason: 'invalid_delivery_report_values',
      request,
      status: HttpStatusCode.BadRequest
    })
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

function createForwardingGroupDeliveryPublicErrorResponse({
  error,
  reason,
  request,
  status
}: {
  error?: unknown
  reason: string
  request: Request
  status: number
}): Response {
  const publicError = mapPublicErrorResponse({
    code: status,
    error: error ?? { status },
    request
  })
  logForwardingGroupDeliveryHandledError(error ?? { status }, publicError, request, reason)
  return Response.json(publicError.body, { status: publicError.status })
}

function logForwardingGroupDeliveryHandledError(
  error: unknown,
  publicError: PublicErrorResponse,
  request: Request,
  reason: string
) {
  const errorLogDetails = createSafeErrorLogDetails(error)
  log('forwarding_group_delivery_handled_error %o', {
    error: errorLogDetails,
    ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
    operation: 'agent_mail_forwarding_group_delivery',
    publicError: {
      code: publicError.body.code,
      status: publicError.status,
      ...(publicError.body.supportReference ? { supportReference: publicError.body.supportReference } : {})
    },
    reason,
    ...createSafeRequestCorrelationLogDetails(request),
    ...createSafeRequestLogDetails(request)
  })
}
