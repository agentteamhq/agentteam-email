# Agent Mail Cloudflare Worker

Repo-owned Cloudflare Email Routing Worker source for inbound archive and edge
metadata creation.

This package owns the editable Worker source and the Vite-built Worker module
used by backend provisioning:

- `packages/cloudflare-email-worker/src/index.ts` and
  `packages/cloudflare-email-worker/src/lib.ts` are the editable Worker source.
- `pnpm --filter @main/cloudflare-email-worker run build` bundles the Worker
  and its runtime dependencies into
  `packages/cloudflare-email-worker/dist/worker.mjs`.
- `@main/backend` imports `@main/cloudflare-email-worker/worker.mjs?raw` and
  uploads that source as the Cloudflare Worker module.
- Worker deployments are provisioned by the backend through the connected
  user's Cloudflare OAuth grant; this package does not own a direct deploy
  script.

This Worker is the canonical ingress edge:

- receives inbound mail via `email()`
- stores exact raw RFC822 bytes into the archive bucket with temporary R2
  credentials
- writes `edge.json` as the commit marker for reconciler discovery
- sends one signed metadata-only Worker notification after `edge.json` is
  durable
- preserves Cloudflare receive-surface metadata in `X-ATMCF-*`
- logs ingress success and failure with the canonical ingest ID

Runtime bindings supplied by backend provisioning:

- `AGENTTEAM_ORGANIZATION_ID`
- `AGENTTEAM_ORG_PUBLIC_ID`
- `AGENTTEAM_CONNECTION_ID`
- `AGENTTEAM_DOMAIN_ID`
- `AGENTTEAM_DOMAIN`
- `AGENTTEAM_ARCHIVE_PREFIX`
- `AGENTTEAM_R2_ENDPOINT`
- `AGENTTEAM_R2_BUCKET`
- `AGENTTEAM_R2_REGION`
- `AGENTTEAM_R2_ACCESS_KEY_ID`
- `AGENTTEAM_R2_SECRET_ACCESS_KEY`
- `AGENTTEAM_R2_SESSION_TOKEN`
- `AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT`
- `AGENTTEAM_WORKER_HMAC_SECRET`
- `AGENTTEAM_INGEST_URL`

Cloudflare provisioning is owned by the web/backend orchestration path:

- one Worker deployment is created per connected domain
- backend provisioning uploads the package-built Worker bundle as `index.js`
- the Worker gets per-domain org, connection, archive-prefix, temporary R2
  credential, webhook signing, and ingest URL bindings from the provisioning call
- the Worker posts signed Worker notifications to
  `/rpc/agent-mail/ingest/v1/{connectionPublicId}`

Operational contract:

- production domain desired state is web-owned application state, not a
  repo-edited routing file
- raw archive is written first
- `edge.json` is written second as the commit marker
- the Worker does not query Cloudflare Analytics or GraphQL during inbound
  receive; Cloudflare auth evidence is derived later from the verified archived
  `raw.eml` Cloudflare-added headers
- if `edge.json` write fails after raw archive succeeds, the Worker logs and
  throws a hard error instead of degrading into another path
- after `edge.json` succeeds, the Worker posts to
  `AGENTTEAM_INGEST_URL` with Standard Webhooks `webhook-id`,
  `webhook-timestamp`, and `webhook-signature` headers
- Worker notification failures are logged and are not retried by the Worker;
  the R2 reconciler sweep remains authoritative for recovery

Local checks:

- `pnpm --filter @main/cloudflare-email-worker run build`
- `pnpm --filter @main/cloudflare-email-worker run typecheck`
- `pnpm --filter @main/cloudflare-email-worker run test`
