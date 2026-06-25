# Cloudflare Worker R2 Temporary Credentials Remaining Work

## Status

Partially implemented. Org-prefixed archive paths, temporary Worker R2
credentials, web-owned Worker deployment, signed web ingest, DB deployment
records, runtime sync, and mail-control credential issuance are implemented.
This file keeps only the remaining work.

Security-sensitive changes to credentials, secret storage, Worker HMAC handling,
archive encryption, OAuth tokens, or protected routes require current-task
approval under `SECURITY.md`.

## Remaining Backend And Worker Work

### Credential Refresh Lifecycle

- Refresh Worker temporary archive credentials before expiration without
  rewriting Worker code when the code hash is unchanged.
- Decide whether to implement the task's original `degraded`, `expiring`, and
  `down` lifecycle exactly or update the contract to match the current status
  enum.
- Verify scheduled refresh can use the required Cloudflare OAuth authority when
  Better Auth token encryption is enabled.
- Add or verify operator-triggered retry for credential minting, secret update,
  missing Worker, wrong Email Routing target, revoked grant, and archive-write
  probe failures.
- Persist refresh attempt, success, expiration, and failure metadata without
  persisting decrypted temporary credentials.

### Runtime Sync Semantics

- Decide whether `agentMail.runtime.sync` is a partial upsert API or a full
  organization/domain snapshot.
- If it is a full snapshot, disable or remove domains absent from the current
  snapshot and add tests for removal.
- Keep self-host/local single-Worker provisioner behavior clearly separate from
  hosted per-domain Worker deployment.

### Worker Identity Consistency

- Decide whether `worker_domain_deployment_id` should identify the
  `agentMailDomain` record or the `agentMailWorkerDeployment` record.
- Update code, docs, tests, and Worker notification fields so the chosen
  identity is consistent across web ingest, runtime sync, control validation,
  and `edge.json`.

### Credential Scope Hardening

- Prove Worker credentials cannot write outside
  `orgs/{org_public_id}/domains/{domain}/mail/inbound/`.
- Use write-only object permissions if Cloudflare R2 temporary credentials
  support that shape; otherwise document why read access is required.
- Add fake S3/R2 negative tests for prefix escape and cross-org writes.
- Keep parent archive credentials inside mail-control configuration only.

## Remaining Documentation Cleanup

- Update Worker docs that still describe a bound customer R2 bucket when the
  hosted path uses temporary S3-compatible credentials.
- Update mail-control architecture docs so the single configured Worker path is
  scoped to self-host/local behavior rather than hosted per-domain Worker
  deployment.
- Update R2 layout docs to include the current required `edge.json` org,
  archive prefix, connection, and domain deployment metadata.
- Keep archive encryption documented in the product shipping tracker until the
  key lifecycle and encrypted object format are implemented.

## Remaining E2E Scenarios

- Credential refresh updates only Worker secrets/config when Worker code is
  unchanged.
- Refresh failure with still-valid credentials reports a degraded/remediable
  state; expired credentials report a down/expired state.
- Two organizations and same-domain policy are covered with explicit conflict or
  allowed-isolation behavior.
- Crossed Worker identity, bad HMAC, wrong domain, wrong archive prefix, and
  inactive deployment notifications never enqueue mail.
- Prefix escape writes fail at the fake S3/R2 credential policy and at
  web/control validation if metadata reaches those boundaries.
- Notification drop still converges through bucket sweep without processing
  another org or domain prefix.

## Acceptance Checks

- Temporary Worker credentials are short-lived, prefix scoped, and never returned
  to browsers.
- Web stores only secret references, encrypted HMAC material, and expiration or
  status metadata.
- Worker notifications are metadata-only and authenticated before trusted JSON
  fields are parsed.
- Runtime sync and ingest enqueue reject mismatched org, domain, connection,
  deployment, prefix, and key combinations.
