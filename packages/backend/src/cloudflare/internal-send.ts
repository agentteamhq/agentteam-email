import { HttpStatusCode } from '@main/common'
import debug from 'debug'
import { z } from 'zod'

import { hasValidControlToWebToken } from '../agent-mail/control-to-web-auth'
import { createSafeErrorLogDetails, createSafeRequestLogDetails } from '../auth/log-redaction'
import { createSafeRequestCorrelationLogDetails, mapPublicErrorResponse } from '../public-error-response'

import { CloudflareControlSendError, sendCloudflareRawEmailForControl } from './service'
import type { PublicErrorResponse } from '../public-error-response'

const log = debug('app:cloudflare:internal-send')

const cloudflareControlSendRawRequestSchema = z.object({
  domain: z.string().min(1),
  from: z.string().min(1),
  mime_message: z.string().min(1),
  organization_id: z.string().min(1),
  organization_public_id: z.string().min(1),
  recipients: z.array(z.string().min(1)).min(1),
  send_id: z.string().min(1).optional(),
  zonemta_queue_id: z.string().min(1).optional()
})

export async function handleCloudflareControlSendRawRequest(request: Request): Promise<Response> {
  if (!hasValidControlToWebToken(request)) {
    return createCloudflareControlSendPublicErrorResponse({
      request,
      status: HttpStatusCode.Unauthorized
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return createCloudflareControlSendPublicErrorResponse({
      request,
      status: HttpStatusCode.BadRequest
    })
  }

  const parsed = cloudflareControlSendRawRequestSchema.safeParse(body)
  if (!parsed.success) {
    return createCloudflareControlSendPublicErrorResponse({
      request,
      status: HttpStatusCode.BadRequest
    })
  }

  try {
    const result = await sendCloudflareRawEmailForControl({
      domain: parsed.data.domain,
      from: parsed.data.from,
      mimeMessage: parsed.data.mime_message,
      organizationId: parsed.data.organization_id,
      organizationPublicId: parsed.data.organization_public_id,
      recipients: parsed.data.recipients,
      sendId: parsed.data.send_id,
      zoneMtaQueueId: parsed.data.zonemta_queue_id
    })
    return Response.json(result)
  } catch (error) {
    if (error instanceof CloudflareControlSendError) {
      const response = createCloudflareControlSendPublicErrorResponse({
        error,
        request,
        status: error.status
      })
      return response
    }
    throw error
  }
}

function createCloudflareControlSendPublicErrorResponse({
  error,
  request,
  status
}: {
  error?: unknown
  request: Request
  status: number
}): Response {
  const publicError = mapPublicErrorResponse({
    code: status,
    error: { status },
    request
  })

  if (error !== undefined) {
    logCloudflareControlSendError(error, publicError, request)
  }

  return Response.json(publicError.body, {
    status: publicError.status
  })
}

function logCloudflareControlSendError(error: unknown, publicError: PublicErrorResponse, request: Request) {
  const errorLogDetails = createSafeErrorLogDetails(error)
  log('cloudflare_control_send_raw_failed %o', {
    error: errorLogDetails,
    ...(errorLogDetails.code ? { errorCode: errorLogDetails.code } : {}),
    operation: 'cloudflare_control_send_raw',
    publicError: {
      code: publicError.body.code,
      status: publicError.status,
      ...(publicError.body.supportReference ? { supportReference: publicError.body.supportReference } : {})
    },
    ...createSafeRequestCorrelationLogDetails(request),
    ...createSafeRequestLogDetails(request)
  })
}
