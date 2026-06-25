# Mail Control Service Contract Test Remaining Work

## Status

Partially implemented. Core inbound replay, delivery outcomes, SMTP relay, local
routing, control API auth, worker archive credential issuance, and provisioning
apply coverage exist. This file keeps only contract-test work that remains.

## Remaining P0 Hardening

### Worker Notification Boundary

- Reject or explicitly allow unknown JSON fields in signed Worker ingest
  notifications; add tests for the chosen contract.
- Keep rejection tests for stale/future timestamps, wrong content type,
  oversized body, malformed JSON, invalid UUIDv7 ingest id, uppercase digest,
  mismatched key family, mismatched domain, inactive domain, and metadata that
  carries raw RFC822-like payloads.
- Verify invalid notifications do not mutate queue state, read archive objects,
  or deliver SMTP.

### Bucket Sweep And Queue

- Add continuation-token tests that process objects beyond the first listing
  page.
- Prove sweep cursor advancement only happens after a successful sweep pass.
- Prove stale leases can be recovered after `lease_until`.
- Prove stale workers cannot mark delivered or completed after another lease
  owns the item.
- Add queue status tests for pending, leased, retry-wait, blocked, delivered,
  and completed counts.

### DSN And Delivery Outcomes

- Prove DSN state is reused across transient DSN-send retries.
- Keep null-sender DSN suppression and valid-sender DSN submission covered.
- Keep raw SHA mismatch terminal-blocked behavior covered.

### SMTP Relay Hardening

- Require and test `X-Agent-Mail-ZoneMTA-Queue-ID` for authenticated relay
  submissions if that remains the relay contract.
- Reject mixed local and external recipients.
- Add SES provider request-shape coverage or document Cloudflare-only support.
- Prove feedback return path is selected from the sender domain and never falls
  back to the first configured domain.
- Prove DSN null reverse-path submissions are accepted only for DSN-shaped
  messages.

### Provisioning And Deployment Exposure

- Extend status coverage for desired state, applied state, Cloudflare status,
  WildDuck feedback status, module health, dependency health, queue status, and
  issues.
- Add chart or kind assertions that deployed runtime does not silently use
  in-memory domain-control state.
- Keep public ingress limited to the web server; mail-control, WildDuck, Mongo,
  Redis, Haraka, ZoneMTA, Rspamd, and internal SMTP listeners must remain
  internal.

## Remaining P1 Full-Circle Runtime Tests

### Worker Runtime Contract

- Add Miniflare or Wrangler-local coverage for the Cloudflare Worker `email`
  handler.
- Prove the handler derives recipient domain from the envelope recipient.
- Prove raw bytes are written before `edge.json`.
- Prove the notification is signed, metadata-only, sent once, and uses
  `/rpc/agent-mail/ingest/v1`.
- Preserve Worker request, notification, redacted headers, and archived object
  inventory in the run directory.

### Worker To Haraka/WildDuck Inbound

- Add a service-owned full-circle inbound suite using real MongoDB, Redis,
  Rspamd, WildDuck, Haraka, MinIO/R2-compatible storage, mail-control runtime,
  and a Worker runtime actor.
- Forward the Worker's original signed notification through the web-owned Worker
  ingest endpoint.
- Prove exactly one queue item, one Haraka replay, one WildDuck delivery proof,
  one terminal `result.json`, and idempotency for duplicate notification.
- Prove notification drop converges through bucket sweep.

### ZoneMTA To Provider Outbound

- Add full-circle outbound coverage that enters through real ZoneMTA.
- Prove ZoneMTA provenance plugin output, mail-control relay behavior, fake
  provider delivery, local-domain route behavior, and terminal archive results.
- Prove provider failure writes a sanitized terminal failure result.

## Remaining Harness Requirements

- Each top-level run must produce one run directory with logs, object snapshots,
  request traces, SMTP transcripts, status output, and a result summary.
- Artifact submission must happen once per top-level invocation when enabled.
- Test tasks must not rerun package installation after the workspace is already
  installed.

## Acceptance Checks

- P0 hardening covers malformed inputs, duplicate work, stale leases, pagination,
  status counts, DSN retries, and relay sender-domain selection.
- P1 full-circle tests exercise real service boundaries instead of only package
  logic with fakes.
- No test asserts implementation details that do not prove externally
  meaningful behavior.
