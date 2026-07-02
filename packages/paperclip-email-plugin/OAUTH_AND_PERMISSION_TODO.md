# OAuth And Permission TODO

This note captures the security-sensitive work for the AgentTeam Email
Paperclip plugin and the service-owned connection boundary.

## Current Scaffold Boundary

- Paperclip instance configuration stores only non-secret values:
  `serviceBaseUrl`, `oauthClientId`, `oauthRedirectUri`, and optional
  `apiKeySecretRef`.
- The worker does not resolve Paperclip secrets.
- The worker does not send outbound HTTP requests.
- The custom settings page exposes a branded AgentTeam Email OAuth start
  action, redacted connection status, and advanced provisioning fields.
- The dashboard widget exposes only redacted connection status.
- Paperclip connects to AgentTeam Email as an OAuth client. AgentTeam Email owns
  authorization, consent, token behavior, revocation, mailbox grant
  enforcement, and audit events at the web-server boundary.
- The plugin starts authorization with authorization code + PKCE against the
  AgentTeam Email OAuth authorize endpoint. AgentTeam Email settings show
  Paperclip authorization status and revoke user/org consent; settings do not
  register Paperclip clients.
- Runtime email tool execution uses `at-email paperclip-tool` with local Agent
  Auth credentials; Paperclip run context is request context only and does not
  define mailbox policy.

## Later Security-Sensitive Work

- Use a Paperclip `secret-ref` field for the AgentTeam Email service API key
  only for self-hosted or preview setups that cannot use OAuth.
- Add Paperclip-side OAuth callback handling and token storage for the runtime
  lane after AgentTeam Email issues the authorization code.
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
- `oauthClientId`: pre-provisioned AgentTeam Email OAuth client ID for this
  Paperclip plugin.
- `oauthRedirectUri`: Paperclip callback URI registered on the AgentTeam Email
  OAuth client.
- `apiKeySecretRef`: optional Paperclip secret reference for the service API key
  in self-hosted or preview setups.

## Planned Provisioning Interfaces

- Custom Paperclip settings page with visible AgentTeam Email OAuth start
  action.
- Advanced provisioning disclosure for `serviceBaseUrl`, `oauthClientId`,
  `oauthRedirectUri`, and `apiKeySecretRef`.
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
