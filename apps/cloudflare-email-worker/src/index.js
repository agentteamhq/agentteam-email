import {
  R2_BUCKET_NAME,
  WORKER_NAME,
  archiveInboundMessage,
  sendFastPathNotification
} from "./lib.js";

export default {
  async fetch() {
    return new Response(
      JSON.stringify({
        worker: WORKER_NAME,
        role: "agent-mail ingress archive worker",
        archive_bucket: R2_BUCKET_NAME
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      }
    );
  },

  async email(message, env, ctx) {
    console.log(
      `agent-mail-ingress receive to=${message.to} from=${message.from} raw_size=${message.rawSize}`
    );

    try {
      const archived = await archiveInboundMessage(message, env);
      console.log(
        `agent-mail-ingress archived ingest_id=${archived.ingestId} raw_key=${archived.rawKey} edge_key=${archived.edgeKey}`
      );
      const notification = sendFastPathNotification(archived, env).catch((error) => {
        const detail = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(
          `agent-mail-ingress fast_path_notify_failed ingest_id=${archived.ingestId} edge_key=${archived.edgeKey} error=${detail}`
        );
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(notification);
      } else {
        await notification;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(
        `agent-mail-ingress failure to=${message.to} from=${message.from} raw_size=${message.rawSize} error=${detail}`
      );
      throw error;
    }
  }
};
