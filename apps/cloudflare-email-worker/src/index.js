import { WORKER_NAME, archiveInboundMessage, sendFastPathNotification } from './lib.js'

export default {
  async fetch() {
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

  async email(message, env, ctx) {
    console.log(`agent-mail-ingress receive raw_size=${safeRawSize(message.rawSize)}`)

    try {
      const archived = await archiveInboundMessage(message, env)
      console.log(`agent-mail-ingress archived ingest_id=${archived.ingestId}`)
      const notification = sendFastPathNotification(archived, env).catch((error) => {
        console.error(
          `agent-mail-ingress fast_path_notify_failed ingest_id=${archived.ingestId} error_type=${safeErrorType(error)}`
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

function safeRawSize(value) {
  return Number.isFinite(value) ? String(value) : 'unknown'
}

function safeErrorType(error) {
  const name = error instanceof Error ? error.name : typeof error
  return /^[A-Za-z0-9_.:-]{1,64}$/u.test(name) ? name : 'Error'
}

function safeIngressError() {
  const error = new Error('agent mail ingress failed')
  error.name = 'AgentMailIngressError'
  return error
}
