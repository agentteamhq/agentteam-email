# Agent Mail Cloudflare Worker

Repo-owned Cloudflare Email Routing Worker source for inbound archive and edge
metadata creation.

This worker is the canonical ingress edge:

- receives inbound mail via `email()`
- stores exact raw RFC822 bytes into the bound R2 bucket
- writes the `edge.json` commit marker for reconciler discovery
- sends one signed metadata-only fast-path notification after `edge.json` is
  durable
- preserves Cloudflare receive-surface metadata in `X-ATMCF-*`
- logs ingress success and failure with the canonical ingest ID

Checked-in Worker artifacts:

- `src/index.js` and `src/lib.js` are the editable Worker source.
- `packages/backend/src/cloudflare/email-worker.generated.ts` is the generated,
  checked-in bundled artifact imported by backend provisioning.
- `corepack pnpm --filter agent-mail-cloudflare-worker run generate:backend-bundle`
  regenerates the backend artifact with the Vite JavaScript API.
- `corepack pnpm --filter agent-mail-cloudflare-worker run check:backend-bundle`
  verifies the checked-in backend artifact is fresh.
- bootstrap/test Email Routing input: `config/email-routing.json`

Runtime bindings supplied by backend provisioning:

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
- backend provisioning uploads the checked-in generated artifact as `index.js`
- the Worker gets per-domain org, connection, archive-prefix, temporary R2
  credential, HMAC, and ingest URL bindings from the provisioning call
- the Worker posts signed fast-path notifications to
  `/rpc/agent-mail/ingest/v1`
- `deploy-worker.mjs` remains a developer utility and is not the production
  provisioning path

Operational contract:

- `config/email-routing.json` must not contain production domain state;
  steady-state routing mutation is driven from web-owned connection/domain state
- raw archive is written first
- `edge.json` is written second as the commit marker
- the Worker does not query Cloudflare Analytics or GraphQL during inbound
  receive; Cloudflare auth evidence is derived later from the verified archived
  `raw.eml` Cloudflare-added headers
- if `edge.json` write fails after raw archive succeeds, the Worker logs and
  throws a hard error instead of degrading into another path
- after `edge.json` succeeds, the Worker posts to
  `AGENTTEAM_INGEST_URL` with `X-Agent-Mail-Connection-Id`,
  `X-Agent-Mail-Timestamp`, and `X-Agent-Mail-Signature`
- fast-path notification failures are logged and are not retried by the Worker;
  the R2 reconciler sweep remains authoritative for recovery

Local test surface:

- `mise run test` runs the Worker unit tests inside a Node LTS container

Local smoke paths do not require a live Cloudflare account. They use the
official local Email Worker flow:

- `wrangler dev` runs the Worker locally
- local email is posted to `/cdn-cgi/handler/email`
- local R2 state is persisted under Wrangler's local storage directory

Cloudflare references:

- https://developers.cloudflare.com/email-routing/email-workers/local-development/
- https://developers.cloudflare.com/workers/development-testing/local-data/
