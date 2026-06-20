# Agent Mail Cloudflare Worker

Repo-owned Cloudflare Email Routing worker for inbound archive and edge metadata
creation.

This worker is the canonical ingress edge:

- receives inbound mail via `email()`
- stores exact raw RFC822 bytes into the bound R2 bucket
- writes the `edge.json` commit marker for reconciler discovery
- sends one signed metadata-only fast-path notification after `edge.json` is
  durable
- preserves Cloudflare receive-surface metadata in `X-ATMCF-*`
- logs ingress success and failure with the canonical ingest ID

Checked-in Cloudflare config:

- Worker script name and R2 bucket name are owned by `wrangler.toml` and the
  worker constants in `src/lib.js`.
- R2 bucket binding name: `ARCHIVE_BUCKET`
- inbound bundle prefix: `mail/inbound`
- bootstrap/test Email Routing input: `config/email-routing.json`

Required environment variables for Cloudflare API tasks:

- `AGENT_MAIL_CLOUDFLARE_API_TOKEN`
- `AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID`
- `AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL`
- `AGENT_MAIL_CF_TUNNEL_HMAC_SECRET`

Cloudflare provisioning is intentionally separate from the app deployment path:

- `mise run cf-provision` deploys the Worker and bootstrap routing config
- `mise run cf-provision:status` is the read-only status exception
- scripts under `scripts/` are implementation details for these service-level
  tasks and report failure if regular non-catch-all rules remain
- every active Agent Mail domain and subdomain routes to the same configured
  Worker
- provisioning declares the Worker binding to the existing R2 bucket; it does
  not create, delete, or preflight-check the bucket

Operational contract:

- the control service R2 bucket setting must match the Worker bucket configured
  in `wrangler.toml`
- routing is not configured from per-run zone/domain environment variables
- `config/email-routing.json` must not contain production domain state;
  steady-state routing mutation is an internal step of Mail Control API
  provision apply fed by service-owned domain state
- configured Agent Mail zones use catch-all routing to the configured Worker
- raw archive is written first
- `edge.json` is written second as the commit marker
- the Worker does not query Cloudflare Analytics or GraphQL during inbound
  receive; Cloudflare auth evidence is derived later from the verified archived
  `raw.eml` Cloudflare-added headers
- if `edge.json` write fails after raw archive succeeds, the Worker logs and
  throws a hard error instead of degrading into another path
- after `edge.json` succeeds, the Worker posts to
  `AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL` with `X-Agent-Mail-Timestamp` and
  `X-Agent-Mail-Signature`
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
