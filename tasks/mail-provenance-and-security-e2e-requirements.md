# Mail Provenance And Security E2E Requirements

## Status

Planning document. No implementation is accepted by this file until tests are
added, reviewed against the owning contracts, and passing through the relevant
repo-owned tasks.

This document focuses on silent correctness failures: message traceability and
security boundaries. Visible mail delivery failures are still important, but
these requirements prioritize metadata, identity, authorization, and provenance
because they are easy to regress without immediate user-visible symptoms.

## Owning Contracts

The implementation and tests must follow these canonical sources:

- `apps/mail-control-service/PROVENANCE.md`
- `apps/mail-control-service/R2-BUCKET-LAYOUT.md`
- `apps/mail-control-service/ARCHITECTURE.md`
- `SECURITY.md`
- `SETUP.md`

Tests must assert externally meaningful behavior from those contracts. Tests
must not assert source strings, copied constants, or incidental implementation
details unless the asserted value is itself the documented external contract.

## Current Baseline

The existing service-owned Go Testcontainers suites provide meaningful coverage
for parts of these contracts:

- `//apps/mail-control-service/test-containers/inbound-replay-smoke-e2e:test`
  covers inbound delivery outcomes, DSN behavior, existing WildDuck proof, and
  duplicate terminal-result handling.
- `//apps/mail-control-service/test-containers/smtp-relay-contract-e2e:test`
  covers SMTP relay authentication, provider payload sanitization, local
  routing provenance headers, local-route archive records, and reuse of existing
  local-route proof.
- `//test-containers/full-stack-e2e:test` covers the deployed chart, web auth,
  web ingest, broad inbound replay, webmail access, some Agent CLI flows, and
  selected negative security paths.

The full-stack suite is the main deployed-runtime gap. It does not yet stitch
the documented inbound provenance contract across archive objects, web ingest,
mail-control replay, WildDuck delivery, and the
`agentMail.message.provenance.get` API. Worker-runtime execution remains a
separate gap tracked by the existing mail-control E2E task documents.

Security coverage also needs a clearer split: full-stack must prove that
deployed credential lanes fail closed at the runtime boundary, while broad
permission matrix cases should live in `auth-e2e`, a web-server Testcontainers
suite, or service-level tests unless they require a deployed chart boundary.

## Inbound Provenance Chain

### Contract

One inbound message must be traceable from Worker/R2 ingress to the exact
WildDuck-delivered message.

The canonical inbound delivery key is:

```text
agent-mail:inbound:v1:ingest:<ingest>:wd:<user>:mb:<mailbox>:uid:<uid>
```

when the delivered WildDuck source contains `X-ATM-Ingest-ID`.

### Required Assertions

The E2E suite must add one full-stack inbound provenance trace scenario that
follows a single message through each transformation point.

#### Worker And Archive Boundary

The test must assert:

- `ingest_id` is a UUIDv7.
- `raw.eml` exists at the documented inbound object key.
- `edge.json` exists at the documented inbound object key.
- `edge.json` has schema `agent-mail.inbound.edge.v1` for Worker-origin
  inbound bundles.
- `raw_sha256` in `edge.json` matches the exact `raw.eml` bytes.
- `raw_key`, `edge_key`, and `result_key` are under
  `orgs/<org_public_id>/domains/<recipient_domain>/mail/inbound/...`.
- `edge.json` records the same `ingest_id`, recipient domain, envelope fields,
  message ID when present, organization identity, archive prefix, and currently
  accepted Worker identity fields used by the notification.
- `edge.json` includes `cloudflare_edge_evidence` for Worker-observed receive
  facts and does not include synthetic unavailable Cloudflare authentication
  verdicts.

Worker-runtime tests must additionally assert:

- The Worker derives the recipient domain from the envelope recipient.
- The Worker writes exact `raw.eml` before `edge.json`.
- The Worker notification is sent once, is metadata-only, is signed, and uses
  `/rpc/agent-mail/ingest/v1/{connectionPublicId}`.

#### Web Ingest Boundary

The test must assert:

- The Worker notification is signed and metadata-only.
- The notification carries the same `ingest_id`, `raw_key`, `edge_key`,
  `result_key`, `organization_id`, `organization_public_id`, recipient domain,
  Worker connection identity, Worker deployment identity, and `raw_sha256` as
  the archive bundle.
- The web server accepts the notification only for the active deployment and
  enqueues the same committed archive bundle.
- Invalid or mismatched org/domain/prefix/deployment notifications are rejected
  before mail-control work is created.

#### Mail-Control Replay Boundary

The test must assert:

- Mail-control rejects archive metadata that does not match the active runtime
  projection before queue mutation.
- Exactly one queue item is created for the `ingest_id`.
- The replay path reads the archived raw message, validates `raw_sha256`, and
  replays the message through Haraka/WildDuck.
- The replayed WildDuck copy contains `X-ATM-Ingest-ID` with the original
  `ingest_id`.
- The replayed WildDuck copy preserves the original RFC `Message-ID` when the
  inbound message has one.

#### WildDuck Proof Boundary

The test must assert:

- `result.json` is written only after WildDuck delivery is proven.
- `result.json` has schema `agent-mail.inbound.result.v1`.
- `result.json` records the same `ingest_id`, `raw_key`, `edge_key`,
  `wildduck_user_id`, `wildduck_mailbox_id`, `wildduck_message_id`,
  `delivery_source`, and terminal status.
- The delivered webmail/WildDuck message selected by the test subject and
  recipient is the same message referenced by `result.json`.

#### Provenance API Boundary

The test must assert:

- `agentMail.message.provenance.get` fetches the WildDuck stored source for the
  delivered message identity.
- The response contains the expected canonical delivery key:
  `agent-mail:inbound:v1:ingest:<ingest>:wd:<user>:mb:<mailbox>:uid:<uid>`.
- The response exposes only allowlisted provenance header-derived fields:
  `X-ATM-Ingest-ID`, `X-ATMCF-Edge-*`, and RFC `Message-ID` trace metadata.
- The API does not use WildDuck update event IDs, RFC `Message-ID`, or
  Cloudflare edge/message headers as the canonical delivery key.

Service-level coverage must also prove:

- If `X-ATM-Ingest-ID` is absent, the provenance API returns the documented
  deterministic fallback key.
- If WildDuck source fetch fails, the provenance API returns an error and
  consumers do not create downstream work from incomplete provenance.

#### Message Security Evidence Boundary

The test plan must include coverage for `agentMail.message.security.get`.

The service-level tests must assert:

- Security evidence binds `edge.json` to raw key, envelope, timestamp, and
  `raw_sha256` before trusting Cloudflare-added headers from archived
  `raw.eml`.
- Cloudflare authentication evidence is parsed from the verified archived
  `raw.eml`, not inferred from Haraka replay, Rspamd results, Worker request
  headers, or untrusted mailbox content.
- Spoofed `X-ATM*` and `X-ATMCF*` headers in mailbox content do not make local
  authentication results trusted.
- Missing evidence is reported explicitly instead of silently producing trusted
  summaries.
- Message view/source labels distinguish mailbox-visible WildDuck source from
  exact Cloudflare-boundary raw bytes.

Full-stack coverage must include at least one smoke assertion that the delivered
message's security view is available through the intended web/control boundary
and returns source labels and missing-evidence states without leaking internal
credentials.

#### Sweep Recovery Boundary

The test plan must include notification-drop recovery.

The relevant E2E suite must assert:

- A committed Worker-origin `edge.json` without a successful Worker
  notification is discovered by the sweep.
- The sweep creates or repairs the same Mongo-backed queue item used by web
  ingest.
- The message reaches the same terminal `result.json` and WildDuck delivery
  proof as the signed-notification path.
- The sweep does not process local-route `edge.json` records as Worker replay
  work.

## SMTP Relay And Outbound Traceability

### Contract

Outbound traceability is a separate relay contract. It uses WildDuck submit,
ZoneMTA queue identity, internal relay `send_id`, relay archive metadata, and
provider or local-route result records.

### Required Assertions

The full-stack outbound path must be fixed first, then tightened so it proves
the specific submitted message rather than proving that some provider request
occurred.

The test must assert:

- The web or CLI actor submits a message with a unique subject and RFC
  `Message-ID` or another test-owned identifier.
- WildDuck submit returns the user-visible Sent message mailbox ID, message ID,
  and ZoneMTA queue ID.
- ZoneMTA-to-relay carries `X-Agent-Mail-ZoneMTA-Queue-ID` matching the queue
  ID for that message.
- `relay.eml` preserves the exact SMTP DATA accepted from ZoneMTA.
- `relay.json` has schema `agent-mail.outbound.relay.v1` and records
  `send_id`, `zonemta_queue_id`, WildDuck IDs, sender domain, source domain,
  delivery domain, envelope sender, envelope recipients, route type, provider,
  and relay raw key/hash.
- Provider-bound payloads remove inbound and internal headers, including
  `X-ATMCF-*`, `X-ATM-Ingest-ID`, `X-Agent-Mail-ZoneMTA-Queue-ID`, `Bcc`,
  `Return-Path`, `Received`, DKIM, Authentication-Results, ARC, Rspamd,
  Haraka, spam, and provider authorization headers.
- `result.json` has schema `agent-mail.outbound.result.v1` and records the
  expected provider or local-route terminal status for the same `send_id`.

### Local Route Assertions

For active local-domain routing, the test must assert:

- No external provider request is made.
- The local route stamps `X-Agent-Mail-Local-Route-ID`,
  `X-Agent-Mail-Source-Mailbox`, `X-Agent-Mail-Target-Mailbox`, and
  `X-Agent-Mail-Source-Ingest-ID` when a source ingest ID is available.
- The source-side outbound archive and target-side inbound archive are linked
  by the same `local_route_id`.
- The target-side inbound `edge.json` uses
  `agent-mail.inbound.local-route.edge.v1`.
- The target-side result records local-route delivery and the correct target
  mailbox identity.

## Security And Permissions

### Contract

Email access must fail closed at the web, agent, API-key, OAuth-client,
mail-control, and ingest boundaries. Unauthorized actors must not read mailbox
content, send mail, mutate agent grants, enqueue replay work, access another
organization's resources, or leak credential material.

### Required Full-Stack Negative Scenarios

The full-stack E2E suite must add a small deployed-boundary smoke matrix for
these actors:

- Invalid API key cannot read mailbox contents.
- Invalid API key cannot send mail.
- Revoked agent cannot send mail.
- Read-only mailbox grant can read the granted mailbox and cannot send.
- Grant for mailbox A cannot read or send as mailbox B.
- Actor from organization A cannot read or send as organization B mailbox
  identity.
- Wrong organization/domain Worker ingest notification is rejected before queue
  mutation.
- Prefix mismatch Worker ingest notification is rejected before queue mutation.
- Public web routes do not expose mail-control, WildDuck, ZoneMTA, MinIO,
  Mongo, Redis, Haraka, Rspamd, internal SMTP listeners, or internal control
  APIs.

Each negative scenario must assert both the rejection and the absence of side
effects. Examples of required side-effect checks include unchanged provider
request count, unchanged WildDuck message count for the tested subject,
unchanged mail-control queue count, unchanged R2 object inventory for the tested
bundle, or unchanged grant status.

For each full-stack negative scenario:

- Missing, malformed, expired, wrong-audience, wrong-issuer, or invalid
  credentials must return exact `401 Unauthorized`.
- Bearer authentication failures must include the applicable
  `WWW-Authenticate` challenge.
- Valid credentials without required authority must return exact
  `403 Forbidden`.
- Request validation failures must not be counted as authentication or
  authorization failures.
- The run directory must contain redacted request/response evidence proving
  secret non-disclosure and credential-boundary preservation.

### Required Service-Level Security Tests

The service-level test suites, `auth-e2e`, or a smaller web-server
Testcontainers suite must cover lower-level contracts that are too expensive or
too narrow for full-stack E2E:

- CASL permission construction and capability constraints.
- Recipient constraint parsing through RFC-aware mailbox parsing.
- Revoked grants and revoked capabilities.
- Revoked API key cannot read mailbox contents.
- Revoked API key cannot send mail.
- Revoked agent cannot read mailbox contents.
- `sendAs`-only grant can send from the granted mailbox and cannot read mailbox
  contents.
- Actor from organization A cannot manage organization B agents,
  enrollments, API-key grants, OAuth-client grants, domains, or runtime
  projection.
- Agent Auth approval races.
- Trial claim authorization and target-organization authorization.
- Worker ingest signature validation, timestamp validation, content-type
  validation, malformed JSON rejection, inactive connection rejection, and
  prefix/domain/key-family mismatch rejection.
- SMTP relay authentication and rejection before archive mutation.
- Audit records for authentication, authorization, credential, session, API-key,
  agent grant, message read, message send, and denied security-sensitive
  operations are generated by the server boundary that owns the event and do not
  contain raw credential material.

## Bucket Layout Validation

Bucket layout must remain correct, but tests must not become broad string-only
checks.

Runtime E2E tests must assert bucket keys when the key is part of the behavior
being tested, such as rejecting a cross-domain prefix or proving a delivered
message's `result.json` references the same archive bundle.

Manual or static review is sufficient for broad cutover checks such as ensuring
new code does not reintroduce non-org-prefixed inbound paths. Do not add tests
whose only purpose is proving stale path strings are absent.

## Test Harness Requirements

Every new or modified test-container suite must satisfy the repo test harness
procedure:

- One top-level invocation must create exactly one run directory.
- The run directory must be created before meaningful work starts.
- All retained logs, request traces, SMTP transcripts, object snapshots,
  status output, generated inputs, diagnostics, and machine-readable reports
  must be written under that run directory.
- Long waits must emit live progress or heartbeat output.
- Failure paths must preserve partial evidence and final diagnostics.
- Artifact submission must submit the whole run directory exactly once when
  enabled.
- `TEST_ARTIFACT_SUBMIT_SKIP` must skip only artifact submission, not local
  artifact creation.

## Implementation Requirements

Test implementations must follow these rules:

- Use the repo-owned `mise` tasks and package scripts from `SETUP.md`.
- Use structured parsers for RFC822, JSON, YAML, URLs, UUIDs, timestamps, and
  object keys. Do not parse structured formats with ad hoc string splitting
  when a parser exists in the codebase or standard tooling.
- Use documented service APIs or shared key builders/parsers instead of
  duplicating bucket key logic in tests.
- Assert behavior at the lowest level that proves the contract. Use full-stack
  E2E only when the behavior depends on deployed service boundaries.
- Keep service-owned contract tests for narrow mail-control behavior that does
  not require the web app, chart, or CLI boundary.
- For every negative security test, assert no side effect at the downstream
  boundary that would have been mutated by success.
- Do not weaken assertions to broad status classes unless the documented
  contract allows that range. If the contract requires `401`, `403`, or `400`,
  assert the exact status.
- Do not log secrets, cookies, raw credentials, bearer tokens, API keys,
  session IDs, raw authorization headers, or broad unredacted payload dumps.
- Preserve useful failing evidence by writing redacted request/response
  summaries into the run directory.

## Validation Plan

Implementation must proceed in this order:

1. Fix the current `//test-containers/auth-e2e:test` harness startup failure.
2. Fix the current `//test-containers/full-stack-e2e:test` outbound failure.
3. Add the full-stack inbound provenance trace scenario.
4. Add service-level message security evidence coverage and a full-stack
   security-view smoke assertion.
5. Add notification-drop sweep recovery coverage.
6. Tighten full-stack outbound traceability assertions for the exact submitted
   message.
7. Add full-stack security negative scenarios for invalid, revoked,
   wrong-mailbox, and wrong-organization actors.
8. Re-run the affected service-owned suites and full-stack suite through
   repo-owned `mise` tasks.

The acceptance baseline for this work is:

- `//apps/mail-control-service/test-containers/inbound-replay-smoke-e2e:test`
  passes.
- `//apps/mail-control-service/test-containers/smtp-relay-contract-e2e:test`
  passes.
- `//test-containers/auth-e2e:test` passes.
- `//test-containers/full-stack-e2e:test` passes.
- Each modified suite writes a complete run directory with the evidence needed
  to debug provenance or security failures without rerunning immediately.

## Open Questions

- Which exact public API route should the full-stack suite use to call
  `agentMail.message.provenance.get` through the trusted web boundary, if any,
  rather than through internal cluster execution?
- Which exact public API route should expose message security evidence to the
  full-stack suite, if the intended product boundary is not the internal control
  API?
- Which API-key creation path should the full-stack suite use for deployed
  invalid/revoked API-key scenarios?
- Which scenarios belong in `full-stack-e2e` versus a smaller web-server
  Testcontainers suite if full-stack runtime becomes too slow for every
  permission matrix case?
- Which persisted identity should `worker_domain_deployment_id` represent:
  `agentMailDomain` or `agentMailWorkerDeployment`?
