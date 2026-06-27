import { HttpStatusCode } from '@main/common'
import { z } from 'zod'

import { hasValidControlToWebToken } from '../agent-mail/control-to-web-auth'

import { CloudflareControlSendError, sendCloudflareRawEmailForControl } from './service'

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
    return Response.json(
      { message: 'Unauthorized' },
      {
        status: HttpStatusCode.Unauthorized
      }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: 'Invalid JSON body' }, { status: HttpStatusCode.BadRequest })
  }

  const parsed = cloudflareControlSendRawRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ message: 'Invalid send request' }, { status: HttpStatusCode.BadRequest })
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
      return Response.json({ message: error.message }, { status: error.status })
    }
    throw error
  }
}
