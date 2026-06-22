# Product Shipping Scope And Gap Audit

Status: active planning document.

This document captures the product path required for AgentTeam Email to be
shippable and maps that target against the current repository state. It is a
shipping scope document, not a release note.

## Product Target

AgentTeam Email must let a user sign up, connect a domain, provision mail
ingress, create usable mailboxes for agents and groups, invite an agent, and let
that agent receive, read, and send mail through the public web boundary.

The web server is the only public application boundary. Browser clients, CLI
clients, and external integrations must call the web server. WildDuck,
ZoneMTA, Haraka, Redis, MongoDB, mail-control service, buckets, internal
credentials, and provider tokens remain internal.

The mail-control service owns mail runtime work behind the web server. It
coordinates ingress replay, safe message views, delivery state, feedback
processing, runtime domain state, R2 archive access, and outbound relay
execution.

## Existing Planning And Architecture Docs

The current documentation covers useful slices of the system but does not yet
hold the whole shippable product path in one place.

| Document | Current useful coverage | Gap to resolve |
| --- | --- | --- |
| `ARCHITECTURE.md` | Canonical boundary model: web server is public, internal services stay internal, mailbox clients must not receive WildDuck/control/R2 credentials. | Does not yet break down the full signup-to-agent-mailbox product path. |
| `tasks/cloudflare-worker-r2-temporary-credentials.md` | Hosted Worker provisioning, org-prefixed archive paths, temporary R2 credentials, web/control/Worker ownership. | Some implementation status is stale. Encryption and decrypt-key flow remain open. |
| `tasks/full-stack-helm-e2e-plan.md` | Stack-level E2E target with public web-only boundary, fake Cloudflare, fake provider, MinIO, inbound/outbound mail. | Needs product scenarios for onboarding, agent invite, mailbox permissions, and CLI agent auth. |
| `tasks/mail-control-e2e-testing-and-setup-gaps.md` | Mail-control and full-stack setup gaps. | Some current-mismatch sections are stale after Worker deployment, domain state, and temp credential work. |
| `tasks/mail-control-service-contract-test-plan.md` | Mail-control contract test roadmap for ingest, replay, SMTP relay, status, and provisioning. | Needs refresh for implemented temp credential pieces and current send-submit wiring. |
| `tasks/paperclip-email-plugin-deeper-integration.md` | Product-adjacent integration direction for agent mail tools. | Not the core shipping path. It still contains stale CLI status. |
| `apps/mail-control-service/ARCHITECTURE.md` | Mail-control internal contracts for control RPCs, replay, provisioning, safe view/security, and outbound relay. | Contains stale status for `agentMail.send.submit` and does not define product mailbox provisioning. |
| `apps/mail-control-service/R2-BUCKET-LAYOUT.md` | Archive key layout and replay contract. | Needs current Worker `edge.json` fields and hosted shared-bucket tenancy details. |
| `apps/mail-control-service/PROVENANCE.md` | Provenance, safe-view, security evidence, and archive prefix language. | Does not define archive encryption provenance or key ownership. |
| `apps/cloudflare-email-worker/README.md` | Worker bindings, temp R2 credential usage, HMAC ingest notification. | Does not describe archive encryption because it is not implemented. |
| `apps/at-email-cli/README.md` | Current CLI commands and direct WildDuck runtime environment. | Does not match the target public web-server API model for agent mailbox access. |

## Required Shipping Flow

1. User signs up through the web app.
2. The web server creates or selects the user's organization and actor context.
3. The user enters product onboarding, which is separate from instance/admin
   setup.
4. Product onboarding asks the user to connect Cloudflare.
5. The web server completes Cloudflare OAuth, account selection, zone selection,
   and domain connection.
6. The web server provisions the Cloudflare Worker into the user's Cloudflare
   account.
7. The Worker is configured with the org public id, domain deployment identity,
   archive prefix, ingest URL, HMAC secret, temporary R2 credentials, and the
   org archive encryption key material required for Worker-side encryption.
8. Hosted production uses the AgentTeam Email archive bucket under an org-scoped
   prefix. Self-hosted deployments use the operator's configured bucket.
9. Temporary R2 credentials are scoped to the org/domain archive prefix and use
   a bounded TTL. The current target TTL is seven days.
10. Archive prefixes use the public organization id, which is a base62-encoded
    UUIDv7, not a slug.
11. The Worker encrypts archived mail data before writing it to R2.
12. The web server owns archive encryption key lifecycle in its database or
    secret store. The mail-control service does not own user auth or key
    management.
13. The mail-control service obtains decrypt authority only through a defined
    web-owned boundary or an explicitly provisioned internal contract.
14. When inbound mail arrives, the Worker writes the encrypted archive bundle
    and sends a signed metadata-only fast-path notification to the web server.
15. The web server verifies the notification, validates org/domain/archive
    authority, and enqueues replay through the mail-control service.
16. The mail-control service reads and decrypts the archived data, verifies the
    manifest and raw hash, projects replay headers, and replays the message into
    Haraka/WildDuck.
17. During onboarding, the user can create default group or shared addresses
    such as `support@`, `info@`, and `hello@`.
18. During onboarding, the user can provision an agent mailbox.
19. Agent provisioning creates an invitation link or token-bearing bootstrap
    command that an agent can use without receiving WildDuck credentials.
20. The agent bootstrap flow gives the agent a web-server-scoped credential and
    a usable mailbox address, then lands the agent in the mailbox workflow.
21. The CLI supports agent login through the agent bootstrap credential flow.
    This is distinct from ordinary user device authorization.
22. The CLI calls the web server for mailbox operations. Normal agent usage must
    not require `AT_EMAIL_WILDDUCK_API_BASE_URL`,
    `AT_EMAIL_WILDDUCK_ACCESS_TOKEN`, or internal WildDuck user ids.
23. The web server exposes a typed mailbox API layer for the supported WildDuck
    operations. It is not a raw generic proxy.
24. The web server authorizes every mailbox, forwarding group, domain,
    provisioning, read, write, send, and manage operation before calling
    WildDuck or mail-control service.
25. Permissions are represented as data structures, not simple role strings.
    The permission system must support per-entity grants such as read, write,
    send, manage, and administer.
26. Product-level audit events cover Cloudflare provisioning, domain changes,
    mailbox creation, forwarding changes, invite creation, agent authentication,
    message reads, sends, and permission changes.
27. Outbound mail starts at an authenticated web-server operation. The web
    server validates the actor, mailbox, sender address, recipient, and domain
    authority before submitting mail.
28. Outbound mail is submitted through the supported WildDuck/ZoneMTA path and
    delivered by the mail-control relay/provider integration for the connected
    domain.
29. The product UI displays real mailboxes, conversations, messages, security
    evidence, compose/reply/send flows, account switching, agent mailboxes, and
    group/shared addresses.
30. Billing can be added after the core mail path is working. Billing is not a
    blocker for proving the first shippable mail workflow.

## Current Implementation Status

| Area | Status |
| --- | --- |
| User signup/auth | Implemented through Better Auth and frontend signup. First session creates/selects organization and provisions a user actor. |
| Admin/instance onboarding | Partial. `/onboarding` is currently instance/admin-oriented and does not submit a product domain onboarding flow. |
| Product onboarding | Missing. There is no cohesive signup-to-domain-to-mailbox onboarding workflow. |
| Cloudflare OAuth and domain connection | Implemented in backend RPC/service and frontend settings. |
| Worker provisioning | Implemented for hosted provisioning. The web server deploys a per-domain Worker script into the connected Cloudflare account and configures Email Routing. |
| Public Worker ingest route | Implemented at `/rpc/agent-mail/ingest/v1` through the backend RPC mount. Some docs still mention `/agent-mail/ingest/v1`. |
| Archive prefixing | Implemented with `orgs/<org_public_id>/domains/<domain>/mail/inbound`. |
| Temporary R2 credentials | Implemented through mail-control service credential issuance and web-server deployment records. Current credentials are scoped to the archive prefix and use a seven-day TTL. |
| Credential refresh records | Implemented. Scheduled refresh exists, but OAuth token handling during scheduled refresh needs verification against Better Auth token encryption. |
| Archive encryption | Missing. The Worker writes raw message bytes to R2, and tests currently assert plaintext raw object storage. |
| Archive encryption key lifecycle | Missing. There is no org archive key model, Worker encryption binding, encrypted object format, decrypt-key API, or rotation plan. |
| Inbound replay | Implemented inside mail-control service: reads archive objects, verifies hashes, projects headers, replays through Haraka/WildDuck, and writes receipt state. |
| Full hosted inbound E2E | Partial. Existing full-stack tests cover raw archive, ingest rejection, duplicate handling, and manually seeded WildDuck mailbox paths. They do not prove encrypted archive or product onboarding. |
| Outbound relay runtime | Implemented internally through ZoneMTA and mail-control relay/provider code. |
| Web outbound API | Minimal prototype. It checks organization context and active domain connection, then submits raw mail. It does not yet enforce mailbox permissions or full sender authority. |
| Per-account/per-domain outbound credentials | Partial or mismatched. Runtime delivery currently uses deployment-level provider configuration rather than deriving send authority from each connected user domain account. |
| Agent mailbox provisioning | Missing. Ordinary agent/shared mailbox lifecycle is not implemented as a web product flow. |
| Forwarding groups | Missing as product provisioning. Existing replay can classify forwarded delivery, but product setup for default group/shared addresses is not present. |
| CLI user auth | Implemented as Better Auth device authorization. |
| CLI agent auth | Missing. Current device auth is user auth, not agent invite bootstrap. |
| CLI mailbox API boundary | Mismatched. Mailbox commands currently require direct WildDuck environment credentials and call WildDuck directly. |
| Permission model | Scaffolding only. CASL-style policy and audit primitives exist, but mailbox/domain/agent/group/send/read permissions are not applied to product routes. |
| Product audit log | Partial. Better Auth audit logging exists. Product actions are not consistently audited. |
| Typed WildDuck web API layer | Missing. Web mail RPC currently exposes status and minimal outbound send, not a typed authorized mailbox API surface. |
| Frontend mailbox UI | Mostly fixture-driven. Storybook and UI shells exist, but real mailbox data, compose/send mutations, mailbox switching, agent accounts, and group addresses are not wired end to end. |

## Current Inconsistencies To Clean Up

1. Worker provisioning and the backend RPC mount use
   `/rpc/agent-mail/ingest/v1`, while several self-host docs and chart notes
   still mention `/agent-mail/ingest/v1`.
2. `apps/mail-control-service/ARCHITECTURE.md` says `agentMail.send.submit` is
   not wired, but current mail-control code implements the control RPC.
3. `tasks/cloudflare-worker-r2-temporary-credentials.md` still lists
   org-prefixed keys, runtime sync validation, ingest validation, and Worker
   credential issuance as missing even though current code implements those
   pieces.
4. `apps/mail-control-service/R2-BUCKET-LAYOUT.md` omits newer Worker
   `edge.json` fields such as org public id, archive prefix, connection id, and
   domain deployment id.
5. `apps/mail-control-service/README.md` still describes Worker R2 bucket
   binding language that is unclear beside the current temporary credential
   model.
6. `apps/at-email-cli/README.md` documents direct WildDuck environment
   credentials as the normal mailbox path. That remains accurate for current
   code but conflicts with the target web-server public boundary.
7. `tasks/mail-control-e2e-testing-and-setup-gaps.md` and
   `tasks/mail-control-service-contract-test-plan.md` need status refreshes for
   implemented Worker/deployment/temp-credential pieces.

## Security-Critical Gaps

1. Hosted archive objects are plaintext today. The shipped product requires
   org-scoped encryption before Worker archive writes.
2. The archive encryption key owner, storage format, rotation policy, Worker
   binding format, and mail-control decrypt boundary are not defined.
3. Control-service temp credential issuance validates archive-prefix shape and
   org/domain consistency, but the product needs a verified active deployment
   authority check before issuing Worker credentials.
4. Temporary R2 credentials currently request read/write object access. If
   Cloudflare supports a narrower write-only credential for the Worker archive
   path, the product should use the narrower permission.
5. Mail-control poller validation needs to require manifest authority fields to
   match active org/domain/deployment state before replay.
6. Product APIs need permission checks before all mailbox, message, send,
   forwarding, invite, and domain operations.
7. Product APIs need audit events for security-sensitive user and agent actions.

## Work Plan

### P0: Contract And Documentation Alignment

1. Choose the canonical Worker ingest public path and update docs, chart notes,
   Worker README, and task docs to match it.
2. Refresh mail-control architecture docs for the current `agentMail.send.submit`
   implementation.
3. Refresh R2 bucket layout docs for current Worker manifest fields.
4. Refresh task docs that still describe implemented temp-credential and
   deployment-state work as missing.
5. Define product data contracts for domain, agent mailbox, shared/group
   address, mailbox assignment, invite token, archive encryption key,
   permission subject, and audit event.
6. Define the web-server API contracts for onboarding, domains, mailboxes,
   groups, invites, agent auth, mailbox read/search, compose/send, message
   state, and safe message/security evidence.

### P1: User Onboarding And Domain Provisioning

1. Build product onboarding after signup, separate from instance/admin setup.
2. Move Cloudflare connect/domain selection/provisioning from settings-only
   behavior into onboarding while keeping settings for later management.
3. Show provisioning status, failures, retry actions, and required user fixes.
4. Prove onboarding reaches a connected domain with active Worker deployment and
   active archive credentials.

### P1: Hosted Archive Security

1. Add org archive encryption key generation and storage under web-server
   ownership.
2. Pass the required encryption material to the Worker through the provisioning
   path.
3. Encrypt archive objects in the Worker before R2 writes.
4. Define and implement encrypted object metadata that lets mail-control verify
   provenance and decrypt safely without owning user auth.
5. Add key rotation and credential refresh behavior.
6. Add tests proving R2 does not contain plaintext raw messages in hosted mode.

### P1: Mailbox, Group, And Invite Provisioning

1. Implement web-owned mailbox provisioning on top of WildDuck primitives.
2. Implement default group/shared address creation for onboarding templates such
   as `support@`, `info@`, and `hello@`.
3. Implement agent mailbox provisioning.
4. Implement invitation links or bootstrap tokens that bind an agent to the
   intended organization, mailbox, and grant set.
5. Ensure agents never receive WildDuck admin tokens, direct WildDuck access
   tokens, R2 credentials, mail-control tokens, or internal service URLs.

### P1: Permissions And Auditing

1. Extend the permission model to product subjects and actions.
2. Enforce permissions before every mailbox, message, send, forwarding, group,
   agent, invite, domain, and provisioning operation.
3. Record product audit events for security-sensitive mutations and access.
4. Add behavior tests for allowed and denied read, send, manage, invite, and
   domain operations.

### P1: Web Mail API And UI

1. Build a typed web-server API layer for supported WildDuck mailbox operations.
2. Wire mailbox list, folder/message list, search, read, safe HTML/text view,
   attachments, compose, reply, send, message state, and security evidence.
3. Wire account switching across agent mailboxes and group/shared addresses.
4. Replace fixture-only dashboard paths with live API-backed product data.
5. Keep Storybook coverage for important loading, empty, success, denied, and
   failure states.

### P1: Agent CLI

1. Add agent invite/bootstrap authentication distinct from user device auth.
2. Store the agent web-server credential in the CLI config.
3. Route CLI mailbox commands through web-server APIs.
4. Remove direct WildDuck environment requirements from the normal agent path.
5. Keep diagnostic or internal WildDuck paths only if they are explicitly marked
   as development/internal workflows.

### P1: End-To-End Proof

The core shipping E2E must prove:

1. User signs up.
2. User completes product onboarding.
3. User connects Cloudflare and a domain.
4. Web server provisions the Worker.
5. Worker writes encrypted archived mail under the org/domain prefix.
6. Web server accepts signed Worker notification and rejects invalid scope or
   signatures.
7. Mail-control decrypts and replays inbound mail into WildDuck.
8. User creates a default group/shared address.
9. User provisions an agent mailbox and invite.
10. Agent authenticates through the CLI bootstrap flow.
11. Agent reads an inbound message through the web-server API.
12. Agent sends outbound mail through the authorized web-server API.
13. Unauthorized agents cannot read, send, or manage outside their grants.
14. Browser and CLI clients never receive internal service URLs, WildDuck
    credentials, R2 credentials, encryption keys, or mail-control credentials.

## Open Questions

1. What exact bootstrap UX should the agent receive: curl command, `npx`
   command, binary install command, or a combination?
2. Is the agent mailbox address created before invite acceptance or during token
   exchange?
3. What default local parts should onboarding suggest for group/shared addresses
   and first agent mailbox?
4. Which archive encryption algorithm, key wrapping format, and metadata format
   should be used?
5. Does mail-control obtain decrypt authority per replay, through a short-lived
   key grant, or through cached wrapped key material?
6. Does hosted outbound mail always use Cloudflare Email Sending for connected
   domains, or can it use other provider integrations per domain?
7. What product plan or billing state gates domain count, mailbox count, agent
   count, and retention?

## Acceptance Checks

1. Documentation has one current Worker ingest path.
2. Product onboarding can be tested from signup through connected domain.
3. Hosted Worker archive writes are encrypted and scoped under
   `orgs/<org_public_id>/domains/<domain>/mail/inbound`.
4. Temporary Worker credentials expire and cannot access another org or domain
   prefix.
5. Mail-control replay verifies org/domain/deployment authority before delivery.
6. CLI normal agent usage calls the web server and does not require WildDuck
   credentials.
7. Web APIs enforce product permissions for read, send, manage, invite, group,
   and domain operations.
8. Product audit logs record security-sensitive actions.
9. UI mailbox data and send/read flows are API-backed, not fixture-backed.
10. Full-stack E2E covers signup, onboarding, domain provisioning, encrypted
    inbound archive, replay, agent invite, CLI auth, read, send, and denied
    authorization cases.
