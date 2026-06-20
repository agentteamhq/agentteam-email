# Cloudflare Worker Shared R2 Temporary Credentials

## Goal

AgentTeam Email must support customer-owned Cloudflare Email Routing Workers
while storing inbound archive bundles in AgentTeam-owned R2 storage.

The required model is a shared AgentTeam R2 archive bucket with
organization-scoped object prefixes and Cloudflare R2 temporary credentials.
Each customer Worker must receive only temporary credentials scoped to that
organization's prefix. The Worker must never receive AgentTeam's parent R2 API
token or parent R2 secret access key.

## Architecture Requirements

- Browser/web public ingress exposes the web server.
- Worker fast-path public ingress exposes only the signed fast-path notification
  path.
- The control API is internal only. Public API requests must enter through the
  web server and may call the control service only over the internal
  service network.
- Cloudflare OAuth, customer account selection, Worker deployment, Worker
  secret updates, Email Routing setup, integration status, and customer-facing
  remediation messages belong to the web server.
- The control service owns mail runtime coordination, internal provisioning
  state reconciliation, inbound replay/queue processing, and archive status
  behavior.
- The Cloudflare Worker runs in the customer's Cloudflare account and writes
  archive objects to AgentTeam-owned R2 through S3-compatible R2 credentials.
- AgentTeam must use one shared archive bucket by default. The bucket layout
  must put the organization public identifier before domains and message-specific
  paths.

Required archive prefix shape:

```text
orgs/{org_public_id}/domains/{domain}/mail/inbound/{yyyy}/{mm}/{dd}/{ingest_id}/
```

`org_public_id` is the organization's public identifier. It must be generated
from a UUIDv7 and encoded as base62. Organization slugs must not be used in R2
paths or credential scopes.

The Worker must not write objects outside `orgs/{org_public_id}/`.

## R2 Credential Model

AgentTeam stores one parent R2 API token and its R2 S3 parent credentials in
backend-only secret storage. These parent credentials must be scoped to the
shared archive bucket and must not be exposed to customer Workers, browsers, or
customer Cloudflare accounts.

For each organization, the web server must mint R2 temporary credentials
with:

- bucket: the shared AgentTeam archive bucket
- permission: `object-read-write`
- prefix scope: `orgs/{org_public_id}/`
- TTL: `604800` seconds

`604800` seconds is seven days and is the required TTL for this contract.

The temporary credential set consists of:

- access key id
- secret access key
- session token
- expiration timestamp computed from issuance time and TTL

The Worker must use all three values when signing S3-compatible R2 requests.
The session token is required.

## Archive Encryption

Every hosted Worker-created archive object must be encrypted before it is written
to R2. Encryption must use organization-scoped archive encryption material. The
Worker must not receive parent archive encryption material or key material for
another organization.

The web server owns archive encryption key distribution to the Worker. The
Mail Control Service and web server must validate the organization/domain
binding before decrypting or processing an archived object.

## Worker Secret Contract

The web server must deploy or update the customer Worker with secrets or
encrypted variables equivalent to:

```text
AGENTTEAM_ORG_PUBLIC_ID
AGENTTEAM_DOMAIN_ID
AGENTTEAM_DOMAIN
AGENTTEAM_R2_ACCOUNT_ID
AGENTTEAM_R2_ENDPOINT
AGENTTEAM_R2_BUCKET
AGENTTEAM_R2_ACCESS_KEY_ID
AGENTTEAM_R2_SECRET_ACCESS_KEY
AGENTTEAM_R2_SESSION_TOKEN
AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT
AGENTTEAM_ARCHIVE_ENCRYPTION_KEY
AGENTTEAM_WORKER_HMAC_SECRET
AGENTTEAM_FASTPATH_URL
```

`AGENTTEAM_R2_ACCESS_KEY_ID`, `AGENTTEAM_R2_SECRET_ACCESS_KEY`, and
`AGENTTEAM_R2_SESSION_TOKEN` must be temporary credentials only.

`AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT` must be an absolute timestamp. The Worker
may include this value in health or diagnostic responses, but must not attempt
to mint replacement credentials.

`AGENTTEAM_ARCHIVE_ENCRYPTION_KEY` is the organization-scoped archive encryption
key used by the Worker before it writes hosted archive objects. The Worker must
receive only the key material for the organization prefix it is allowed to
write.

`AGENTTEAM_WORKER_HMAC_SECRET` signs fast-path notifications from the Worker to
the public fast-path ingress/gate. The gate forwards accepted notifications to
the mail-control-service fastpath path.

## Refresh Lifecycle

The web server must refresh each active organization's Worker R2
temporary credentials once every 24 hours.

Refresh steps:

1. Load the organization's active Cloudflare OAuth grant and selected account,
   zone, Worker script, and Email Routing configuration.
2. Mint a new R2 temporary credential set scoped to `orgs/{org_public_id}/` with
   `ttlSeconds: 604800`.
3. Update the customer Worker secrets with the new temporary credential set and
   expiration timestamp.
4. Verify the Worker script and Email Routing binding still exist.
5. Write an integration status record containing the refresh result and expiry.

The refresh job must not require rewriting the Worker script when only the R2
temporary credentials changed. It should update Worker secrets/configuration
only.

If refresh fails, the previous temporary credentials remain valid until their
recorded expiration. The system must keep retrying on the normal refresh
schedule and may allow an operator-triggered retry from the frontend.

## Integration Status

The web server must persist per-organization Cloudflare integration status
with at least:

```text
org_public_id
cloudflare_account_id
cloudflare_zone_id
domain
worker_script_name
email_routing_rule_id
r2_bucket
r2_prefix
last_refresh_attempt_at
last_refresh_success_at
temp_credentials_expires_at
last_worker_deploy_success_at
last_email_routing_success_at
status
status_reason
```

Required status values:

- `ready`: Worker deployment, Email Routing, and R2 temporary credential
  refresh are current.
- `degraded`: the latest refresh or Cloudflare configuration check failed, but
  temporary credentials are still valid for more than 48 hours.
- `expiring`: temporary credentials expire within 48 hours.
- `down`: temporary credentials are expired, the Worker is missing, Email
  Routing no longer targets the Worker, or an archive write probe fails.

The customer-facing UI must make `degraded`, `expiring`, and `down` visible.
The system must send a customer alert when status enters `expiring` or `down`.

## Web Server And Mail Control Service Boundary

The web server must own the public Cloudflare OAuth and Worker deployment
API. The control service must not expose public endpoints for customer
Cloudflare OAuth, Worker deployment, Worker secret refresh, or customer
integration repair.

The web server may call internal Mail Control Service operations for runtime
state reconciliation after Cloudflare setup succeeds. Those internal calls must
use an internal service credential and must not be reachable directly from
public ingress.

Helm, Compose, and e2e tests must reflect this boundary:

- browser/web public ingress exposes the web server
- Worker fast-path public ingress exposes only the signed notification path
- control API is ClusterIP/internal only
- Worker fast-path URL is the full public ingest URL ending in
  `/agent-mail/ingest/v1`
- the fast-path gate forwards accepted notifications to the mail-control-service
  fastpath path

## Failure Handling

Refresh failure must not immediately disable ingress. The current credential
remains valid until `temp_credentials_expires_at`.

The system must distinguish:

- Cloudflare OAuth grant revoked or expired
- Worker script missing
- Worker secret update failed
- Email Routing rule missing or disabled
- Email Routing rule targets the wrong Worker
- R2 temporary credential mint failed
- R2 archive write probe failed

The status reason must name the failing boundary. It must not collapse all
Cloudflare failures into a generic unavailable state.

## Security Requirements

- Parent R2 credentials must stay in AgentTeam backend secret storage.
- Parent R2 credentials must never be stored in customer Worker secrets.
- Parent archive encryption material must stay in AgentTeam backend secret
  storage.
- Customer Workers must receive only prefix-scoped temporary credentials.
- Customer Workers must receive only organization-scoped archive encryption
  material.
- Worker archive writes must include the organization public id in the key
  prefix.
- The web server must validate that the Worker configuration it writes
  uses the expected organization public id, bucket, prefix, and fast-path
  endpoint.
- The Mail Control Service and web server must ignore or reject archive objects whose
  path organization does not match the persisted organization/domain binding.
- The Worker must not trust user-controlled email headers to choose the R2 org
  prefix.

## E2E Test Plan

The Helm/kind e2e test must install the stack through the chart and expose only
the web server for browser/web traffic and the fast-path gate for Worker
ingest. It must use fake Cloudflare and fake R2/S3 services unless the test is
explicitly a live Cloudflare smoke test.

Required fake Cloudflare assertions:

- OAuth account/zone selection is persisted.
- Worker script is deployed or updated through the web server.
- Worker temporary R2 secrets are written.
- Email Routing rule is created or verified.
- Daily refresh updates only the temporary R2 credential secrets when the
  Worker code is unchanged.
- Failed secret update moves status to `degraded` while unexpired credentials
  remain valid.
- Expiring credentials move status to `expiring`.
- Expired credentials move status to `down`.

Required fake R2 assertions:

- Temporary credentials scoped to `orgs/{org_public_id}/` can write inside that
  prefix.
- The same credentials cannot write outside that prefix.
- Archive bundle keys include the organization public id before domain and date
  segments.

Required rendered-manifest assertions:

- browser/web ingress targets only the web server
- Worker fast-path ingress targets only the signed notification path
- control API has no public ingress
- no config-map or CRD domain-control backend is required for steady state

## Open Questions

- Exact Cloudflare OAuth scopes must be confirmed against Cloudflare's current
  OAuth scope list for Worker script write, Worker secret write, Email Routing
  edit, zone read, and DNS edit.
- Exact Worker secret names may change if the Worker runtime requires a
  different binding shape, but the Worker must still receive only temporary R2
  credentials and organization-scoped archive encryption material.
- The archive write probe shape is not yet decided. It must either write a
  bounded probe object under `orgs/{org_public_id}/health/` or verify a recent
  real archive write without creating extra objects.
