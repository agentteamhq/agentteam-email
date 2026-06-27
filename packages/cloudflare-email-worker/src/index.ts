import { WORKER_NAME, archiveInboundMessage, sendIngestNotification } from './lib.ts'

import type { WorkerEmailMessage, WorkerEnvironment, WorkerExecutionContext } from './lib.ts'

export type { WorkerEmailMessage, WorkerEnvironment, WorkerExecutionContext } from './lib.ts'

export default {
  async fetch(): Promise<Response> {
    return new Response(
      JSON.stringify({
        worker: WORKER_NAME,
        role: 'agent-mail ingress archive worker',
        archive_storage: 'temporary-r2-credentials'
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8'
        }
      }
    )
  },

  async email(
    message: WorkerEmailMessage,
    env: WorkerEnvironment,
    ctx?: WorkerExecutionContext
  ): Promise<void> {
    console.log(`agent-mail-ingress receive raw_size=${safeRawSize(message.rawSize)}`)

    try {
      const archived = await archiveInboundMessage(message, env)
      console.log(`agent-mail-ingress archived ingest_id=${archived.ingestId}`)
      const notification = sendIngestNotification(archived, env).catch((error: unknown) => {
        console.error(
          `agent-mail-ingress ingest_notification_failed ingest_id=${archived.ingestId} error_type=${safeErrorType(error)}`
        )
      })
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(notification)
      } else {
        await notification
      }
    } catch (error) {
      console.error(
        `agent-mail-ingress failure raw_size=${safeRawSize(message.rawSize)} error_type=${safeErrorType(error)}`
      )
      throw safeIngressError()
    }
  }
}

function safeRawSize(value: unknown): string {
  return Number.isFinite(value) ? String(value) : 'unknown'
}

function safeErrorType(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error
  return /^[A-Za-z0-9_.:-]{1,64}$/u.test(name) ? name : 'Error'
}

function safeIngressError(): Error {
  const error = new Error('agent mail ingress failed')
  error.name = 'AgentMailIngressError'
  return error
}
