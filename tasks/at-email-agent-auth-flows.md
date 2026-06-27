# at-email Agent Auth Remaining Work

## Status

Partially implemented. This task file keeps only the Agent Auth work that is
still pending or needs verification.

Changing authentication, authorization, Better Auth configuration, sessions,
token behavior, credential storage, JWT behavior, API keys, OAuth, JWKS, or
security-sensitive routes still requires current-task security approval under
`SECURITY.md`.

## Remaining Product Work

### Product Onboarding Bootstrap

- Wire the product onboarding flow so a user can create or select the target
  organization, mailbox, and grant set before issuing an agent bootstrap path.
- Generate the user-facing bootstrap command or token for the intended agent.
- Ensure bootstrap acceptance lands the agent in a usable mailbox workflow.
- Connect default agent mailbox provisioning with default shared/group address
  provisioning where onboarding offers both.
- Keep personal user login, agent authorization, OAuth integration access, and
  API keys as separate credential lanes.

### Agent Access UI Verification

- Reconcile the current Agent Access screen against the first-version product
  fields: agent name, mode, host label, organization, status, capabilities,
  grant expiry, last used time, approved by, and revoke action.
- Verify delegated approvals, autonomous claim approvals, and enrollment-token
  flows do not use copy that describes the request as a personal CLI session.
- Verify revocation removes agent authority without revoking the human user's
  browser or personal CLI sessions.

### End-To-End Coverage

Add or refresh E2E coverage for:

- `at-email agent connect` through human approval.
- `at-email agent trial` through claim by a signed-in or newly signed-up human.
- Human-created enrollment token through `at-email agent enroll`.
- Agent JWT mailbox read, search, draft/send/reply, and denied operations.
- Grant expiry, revocation, wrong organization, wrong mailbox, and missing
  capability behavior.
- Separation between personal `at-email auth login` credentials and local agent
  credentials.
- Normal mailbox commands proving they call web-server RPC routes and do not
  fall back to direct WildDuck environment credentials.

### Security And Audit Hardening

- Verify `401 Unauthorized` responses include the applicable
  `WWW-Authenticate` challenge for each supported credential lane.
- Verify valid credentials without sufficient grant authority return
  `403 Forbidden`.
- Verify audit events cover agent registration, approval, claim, enrollment,
  grant creation, grant revocation, message read, message send, and denied
  security-sensitive operations.
- Verify replay/JWKS/cache behavior for multi-instance deployments.
- Verify autonomous dynamic registration is paired with the intended launch
  abuse controls, quotas, rate limits, and trial-only grants.

## Remaining Paperclip-Adjacent Work

- Map Paperclip company, agent, project, run, plugin, and operation context to
  persisted AgentTeam Email authorization state before every mailbox operation.
- Prove Paperclip context alone never authorizes mailbox access.
- Keep API key configuration limited to the documented advanced self-hosted or
  preview path.

## Acceptance Checks

- Product onboarding can produce a scoped agent bootstrap path.
- An agent can bootstrap, read authorized mail, send authorized mail, and receive
  denied responses outside its grants.
- Personal CLI sessions appear as normal Security sessions.
- Agent identities and grants appear in Agent Access and can be revoked.
- Browser, CLI, and plugin clients never receive WildDuck admin credentials,
  WildDuck mailbox tokens, raw internal service URLs, or agent private keys.
