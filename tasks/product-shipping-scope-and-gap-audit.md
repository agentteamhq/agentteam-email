# Product Shipping Remaining Gaps

Status: active shipping gap tracker.

This document keeps only the product work that remains before AgentTeam Email is
shippable as a signup-to-agent-mailbox workflow. Implemented Cloudflare Worker
provisioning, temporary R2 credentials, Agent Auth CLI flows, web-backed mailbox
RPCs, permission contracts, and core mail-control replay/relay coverage are no
longer repeated here.

## Product Target

A user can sign up, connect a domain, provision ingress, create useful mailboxes
for agents and groups, invite an agent, and let that agent receive, read, and
send mail through the public web boundary.

The web server remains the only public application boundary. Browser clients,
CLI clients, and integrations must not receive WildDuck credentials, mail-control
tokens, bucket credentials, provider credentials, or internal service URLs.

## Remaining Shipping Blockers

### Product Onboarding

- Build product onboarding after signup, separate from instance/admin setup.
- Move Cloudflare connect, domain selection, and provisioning into onboarding
  while keeping settings for later management.
- Show provisioning status, failures, retries, and required user fixes.
- Prove onboarding reaches a connected domain with active Worker deployment and
  active archive credentials.

### Hosted Archive Encryption

- Define the org archive encryption key model, owner, storage format, wrapping
  format or secret reference, rotation policy, and decrypt boundary.
- Pass only the required encryption material to the Worker.
- Encrypt hosted archive objects before R2 writes.
- Define encrypted object metadata so mail-control can verify provenance and
  decrypt only after org/domain/deployment authority is validated.
- Add tests proving hosted R2 objects do not contain plaintext raw messages.

Security-sensitive implementation of this section requires current-task
approval under `SECURITY.md`.

### Mailbox, Group, And Agent Provisioning

- Implement the onboarding workflow for default shared/group addresses such as
  `support@`, `info@`, and `hello@`.
- Implement the product flow for provisioning an agent mailbox.
- Bind agent bootstrap tokens or commands to the intended organization, mailbox,
  and grant set.
- Ensure agents never receive WildDuck admin tokens, direct WildDuck access
  tokens, R2 credentials, mail-control tokens, provider credentials, or internal
  service URLs.

### Permission And Audit Coverage

- Verify route-by-route permission enforcement for mailbox, message, send,
  forwarding, group, agent, invite, domain, and provisioning operations.
- Add behavior tests for allowed and denied read, send, manage, invite, and
  domain operations.
- Record product audit events for Cloudflare provisioning, domain changes,
  mailbox creation, forwarding changes, invite creation, agent authentication,
  message reads, sends, and permission changes.

### Outbound Product Authority

- Verify web outbound routes enforce mailbox permissions, sender authority,
  recipient constraints, active domain connection, and connected-domain
  provider authority.
- Decide whether hosted outbound always uses Cloudflare Email Sending for
  connected domains or supports provider integrations per domain.
- Align per-account/per-domain outbound credentials with product sender
  authority.

### Frontend Product Flow

- Wire product onboarding, default mailbox/group setup, agent invitation,
  mailbox switching, denied states, and provisioning failures to live APIs.
- Keep Storybook coverage for loading, empty, success, denied, and failure
  states for the changed screens.
- Ensure dashboard mail screens continue to use live web-server RPCs rather than
  fixture-only paths.

### Cloudflare And Mail Runtime Hardening

- Finish or explicitly revise Worker credential refresh status semantics.
- Prove refresh can run under scheduled OAuth authority.
- Prove temporary Worker credentials cannot escape the org/domain prefix.
- Resolve the durable domain-control state mismatch between docs, chart, and
  mail-control runtime.
- Add full-circle tests for Worker runtime -> web ingest -> mail-control ->
  Haraka/WildDuck and real ZoneMTA -> mail-control relay -> provider/local
  route.

## Required Shipping E2E

The core shipping E2E must prove:

1. User signs up.
2. User completes product onboarding.
3. User connects Cloudflare and a domain.
4. Web server provisions the Worker.
5. Worker writes encrypted archive objects under the org/domain prefix.
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

## Open Decisions

- Exact bootstrap UX: curl command, `npx` command, binary install command, or a
  combination.
- Whether the agent mailbox address is created before invite acceptance or
  during token exchange.
- Default local parts for group/shared addresses and first agent mailbox.
- Archive encryption algorithm, key wrapping format, metadata format, and
  rotation policy.
- Whether mail-control obtains decrypt authority per replay, through a
  short-lived key grant, or through cached wrapped key material.
- Hosted outbound provider model for connected domains.
- Product plan or billing gates for domain count, mailbox count, agent count,
  and retention.
