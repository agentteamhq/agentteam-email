# OAuth And Permission TODO

This note captures the security-sensitive work for the AgentTeam Email
Paperclip plugin and the service-owned connection boundary.

## Current Scaffold Boundary

- Paperclip instance configuration stores only non-secret values and a future
  `apiKeySecretRef` pointer.
- The worker does not resolve Paperclip secrets.
- The worker does not send outbound HTTP requests.
- The custom settings page exposes a branded AgentTeam Email connect handoff,
  redacted connection status, and advanced self-hosting fields.
- The dashboard widget exposes only redacted connection status.
- The AgentTeam Email app accepts the Paperclip handoff in Agent Access and can
  register a backend-owned OAuth grant principal for that Paperclip company and
  plugin id without returning client secrets to the browser or plugin.
- Runtime email tool execution uses `at-email paperclip-tool` with local Agent
  Auth credentials; Paperclip run context is request context only and does not
  define mailbox policy.

## Later Security-Sensitive Work

- Use a Paperclip `secret-ref` field for the AgentTeam Email service API key
  only for self-hosted or preview setups that cannot use OAuth.
- Add service-owned OAuth callback handling, consent reference, token storage,
  and persisted account metadata only if a Paperclip-native OAuth runtime lane
  replaces the current CLI Agent Auth execution lane.
- Add `secrets.read-ref` only when the worker actually resolves the API key at
  the execution boundary.
- Add `http.outbound` only when the worker starts calling the upstream service.
- Never return raw API keys, OAuth access tokens, OAuth refresh tokens, bearer
  headers, or resolved secret values through plugin data, actions, logs, state,
  metrics, or UI.
- Keep upstream service policy in the upstream service: which agents get
  addresses, domain assignment, aliases, mailbox lifecycle, suspension, and
  audit trails should be controlled there unless Paperclip later adds a
  company-scoped settings surface that requires local overrides.

## Planned Configuration Shape

- `serviceBaseUrl`: default public AgentTeam Email API origin.
- `apiKeySecretRef`: optional Paperclip secret reference for the service API key
  in self-hosted or preview setups.

## Planned Provisioning Interfaces

- Custom Paperclip settings page with visible AgentTeam Email connect handoff.
- Advanced self-hosting disclosure for `serviceBaseUrl` and
  `apiKeySecretRef`.
- Dashboard status widget for connected/not-connected state and last synthetic
  check.
- Future operator action to test upstream connectivity without disclosing the
  secret.
- Future per-agent view or action only if Paperclip-side selection becomes a
  product requirement; otherwise the upstream service remains the owner of
  agent-email policy.

## Agent Runtime Question

Paperclip does not need to receive raw mailbox credentials by default. Preferred
agent access is through narrow, service-issued capability tokens or an
AgentTeam-hosted tool/API that lets an agent send and receive only for its
assigned mailbox. If a future agent adapter requires environment variables,
they should be short-lived, scoped to one agent/run/mailbox, and injected by the
runtime boundary that owns agent execution, not persisted in plugin state.
