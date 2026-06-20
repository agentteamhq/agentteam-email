import { readFile } from "node:fs/promises";

import { R2_BUCKET_NAME, WORKER_NAME } from "../src/lib.js";
import {
  CLOUDFLARE_API_BASE,
  SCRIPT_NAME,
  parseCloudflareResponse,
  requireEnv
} from "./cloudflare-api.mjs";

const accountID = requireEnv("AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID");
const token = requireEnv("AGENT_MAIL_CLOUDFLARE_API_TOKEN");
const fastPathExternalURL = requireEnv("AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL");
const fastPathHMACSecret = requireEnv("AGENT_MAIL_CF_TUNNEL_HMAC_SECRET");
const method = "PUT";
const path = `/accounts/${accountID}/workers/scripts/${SCRIPT_NAME}`;

if (WORKER_NAME !== SCRIPT_NAME) {
  throw new Error(
    `worker name mismatch: src/lib.js has ${WORKER_NAME}, API config has ${SCRIPT_NAME}`
  );
}

const mainModule = "worker.mjs";
const bundlePath = "dist/worker.mjs";
const metadata = {
  main_module: mainModule,
  compatibility_date: "2026-04-18",
  bindings: [
    {
      type: "plain_text",
      name: "AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL",
      text: fastPathExternalURL
    },
    {
      type: "secret_text",
      name: "AGENT_MAIL_CF_TUNNEL_HMAC_SECRET",
      text: fastPathHMACSecret
    },
    {
      type: "r2_bucket",
      name: "ARCHIVE_BUCKET",
      bucket_name: R2_BUCKET_NAME
    },
    {
      type: "send_email",
      name: "EMAIL"
    }
  ],
  annotations: {
    "workers/message": "agent-mail cf-provision",
    "workers/tag": "agent-mail"
  }
};

const form = new FormData();
form.append("metadata", JSON.stringify(metadata));
form.append(
  mainModule,
  new Blob([await readFile(bundlePath, "utf8")], { type: "application/javascript+module" }),
  mainModule
);

// The R2 bucket is an existing static resource. cf-provision only attaches the
// Worker binding and intentionally does not query, create, or modify R2 buckets.
const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
  method,
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: form
});
const result = await parseCloudflareResponse(response, method, path);

console.log(
  JSON.stringify(
    {
      script: SCRIPT_NAME,
      status: "deployed",
      result: {
        id: result.id,
        etag: result.etag,
        modified_on: result.modified_on,
        handlers: result.handlers,
        compatibility_date: result.compatibility_date
      }
    },
    null,
    2
  )
);
