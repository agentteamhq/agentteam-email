# at-email Agent Auth Flow Plan

## Status

Proposed.

This document describes future authentication and agent-authorization work. It
does not authorize implementation. Implementation that changes authentication,
authorization, Better Auth configuration, session handling, token behavior,
credential storage, JWT behavior, API keys, OAuth, JWKS, or security-sensitive
routes requires current-task security approval under `SECURITY.md`.

## Goal

AgentTeam Email must distinguish personal CLI login from agent authorization.

The system must support these user-visible paths:

- A human logs in to `at-email` as themselves.
- An agent connects to a human or organization with approved capabilities.
- An agent starts with a constrained autonomous trial before a human account is
  involved.
- A human creates a tokenized enrollment path first and gives it to an agent.
- Existing managed-runtime environment variable setup continues until the
  capability-backed CLI path replaces it.

The visible approval flow may look like an OAuth or device-login flow, but the
identity model must not collapse agents into user sessions.

## Sources Reviewed

- `SECURITY.md`
- `ARCHITECTURE.md`
- `packages/backend/src/auth/auth.ts`
- `packages/backend/src/auth/oauth-provider-config.ts`
- `packages/db/src/schema/better-auth.ts`
- `apps/at-email-cli/internal/atemail/auth.go`
- `apps/at-email-cli/internal/atemail/config.go`
- `packages/frontend/src/screens/device-authorization-screen.tsx`
- `packages/frontend/src/partials/authenticated/settings-dialog.tsx`
- `packages/frontend/src/components/auth/settings/security/active-sessions.tsx`
- `packages/paperclip-email-plugin/OAUTH_AND_PERMISSION_TODO.md`
- CASL source and documentation:
  `https://github.com/stalniy/casl`
- OAuth and OpenID Connect standards:
  `https://datatracker.ietf.org/doc/html/rfc6749`,
  `https://openid.net/specs/openid-connect-core-1_0.html`, and
  `https://www.rfc-editor.org/info/rfc9728/`
- Better Auth Agent Auth docs and source:
  `https://better-auth.com/docs/plugins/agent-auth` and
  `https://github.com/better-auth/agent-auth`
- Agent Auth Protocol docs:
  `https://github.com/better-auth/agent-auth-protocol`

## Current State

The backend currently configures Better Auth device authorization with
`clientId` `at-email-cli`. The CLI command `at-email auth login` calls the
device-code endpoints and stores a local personal auth credential.

That login is a user/session login. It is not an agent identity.

The mailbox commands still require these environment variables:

```text
AT_EMAIL_WILDDUCK_API_BASE_URL
AT_EMAIL_WILDDUCK_ACCESS_TOKEN
AT_EMAIL_WILDDUCK_USER_ID
AT_EMAIL_CONTROL_API_BASE_URL
AT_EMAIL_MESSAGE_READ_TOKEN
```

Those variables are a managed-runtime setup path. They must not be silently
derived from personal CLI login, and missing variables must continue to fail
fast until a capability-backed agent path owns mailbox provisioning and access.

The frontend currently has a `cliAccess` settings section that filters Better
Auth sessions by the `at-email/` user agent. That model is not correct for
personal CLI login. A personal CLI login is just another user session and
belongs in the normal active sessions list.

The repo does not currently include the Better Auth Agent Auth plugin. Adding
Agent Auth requires a dependency/config/schema implementation task.

The current OAuth provider configuration supports identity scopes:

```text
openid
profile
email
offline_access
```

The public API protected-resource scope list is currently empty. That matches
the target model: mailbox authorization is not currently expressed as OAuth
scopes.

`ARCHITECTURE.md` already requires all public mailbox clients, including CLI
clients, public API clients, and agent runtime tools, to call the web server.
The web server must authenticate the caller, authorize the exact organization,
mailbox, and operation, then perform internal WildDuck or mail-control calls
server-side. Public clients must not receive WildDuck admin credentials,
WildDuck mailbox tokens, mail-control service tokens, or raw internal service
URLs.

## Credential Lanes

The implementation must keep these credential lanes distinct.

### Personal Session Lane

Personal CLI login authenticates a human user. It creates a revocable Better
Auth session or equivalent user credential. It must not grant an autonomous
agent mailbox permissions by itself.

### OAuth Integration Lane

OAuth authenticates an OAuth client or plugin integration and records consent.
For example, a Paperclip integration may use OAuth to connect a Paperclip
workspace to an AgentTeam Email organization.

OAuth consent must not be treated as per-agent mailbox authorization. It only
establishes that the OAuth client may call the relevant AgentTeam Email API
surface for the user or organization named by the OAuth reference state.

### Agent Auth Lane

Agent Auth authenticates runtime agents as first-class principals. Agents must
use host and agent keys, short-lived signed agent JWTs, and persisted
capability grants. Agent authorization belongs in this lane.

### API Key Lane

API keys authenticate user-scoped, organization-scoped, service-scoped, or
integration-scoped server-to-server clients. API keys must not create Better
Auth sessions. API key permissions must resolve to the same server-side
authorization model used by sessions, OAuth clients, and agents.

## OAuth Scope Policy

OAuth scopes are the token and consent vocabulary for OAuth clients. They are
not the complete AgentTeam Email permission system.

The OAuth authorization server may use scopes to describe broad token class and
integration access. The resource server must still authorize each requested
organization, mailbox, and operation from persisted authorization state.

Required first-version OAuth scopes:

```text
openid
profile
email
offline_access
```

Potential future API scope:

```text
email.full_access
```

`email.full_access` may be added only for trusted first-party or explicitly
approved integration clients that need broad AgentTeam Email API access, such
as the Paperclip plugin. Even then, the scope must only establish that the
client can call the API surface. It must not authorize individual agent mailbox
operations without a server-side grant check.

The implementation must not introduce granular OAuth scopes such as
`mail.read`, `mail.send`, or `mailbox.provision` in the first version. Those
operations must be modeled as Agent Auth capabilities and internal
permissions. Granular OAuth API scopes should be revisited only if AgentTeam
Email exposes a public third-party OAuth developer platform.

The public protected-resource metadata should continue to advertise no API
scopes until an API OAuth scope is actually implemented. If `email.full_access`
is implemented, metadata must advertise only the supported API scopes and must
not imply that clients should request every advertised scope.

## Permission Model

Authorization must be enforced as server-side permissions, not as client-side
flags or OAuth scope checks alone.

Every protected mailbox request must follow this shape:

```text
credential -> principal -> organization context -> persisted grants ->
ability -> exact operation check -> internal WildDuck or mail-control call
```

Credential resolution must normalize every caller into a principal:

```text
principal_type: user_session | agent | oauth_client | api_key | service
principal_id: stable id for the credential owner
user_id: user id when the credential is user-backed
organization_id: selected or granted organization
credential_id: session, OAuth token/client, API key, agent, or service id
scopes: OAuth scopes when present
capabilities: Agent Auth capabilities when present
```

The server must authorize against the exact requested resource and action:

```text
organization id
mailbox id or address
message id, folder id, or thread id when applicable
operation
caller principal
credential lane
grant constraints
grant expiry
```

Caller-supplied identifiers are filters only. Authority must come from the
authenticated principal and persisted authorization state.

## CASL Ability Usage

CASL should be used as the request-time policy evaluator. The domain model must
still store stable AgentTeam Email grants and assignments as the source of
truth.

The backend should compile CASL Ability rules from persisted state:

- Better Auth organization role and membership state.
- Agent Auth hosts, agents, grants, statuses, constraints, and expiry.
- Mailbox assignment state owned by the web boundary.
- API key permission state.
- OAuth client consent and organization reference state.

The implementation should not make raw CASL JSON the only authorization data
model. Persisted domain records must remain understandable without executing
CASL-specific code.

Suggested CASL subjects:

```text
Organization
Mailbox
Message
Draft
ForwardingGroup
Agent
AgentGrant
ApiKey
OAuthConnection
CloudflareConnection
```

Suggested CASL actions:

```text
read
search
send
reply
createDraft
manageMessages
provision
create
update
delete
manage
```

CASL conditions must include organization and mailbox constraints for mailbox
resources. Query-level authorization must combine CASL-produced filters with
caller filters using an explicit conjunction. It must not merge filters with
object spread in a way that can overwrite permission restrictions.

## Required Identity Classes

### Personal User Session

Purpose: human/operator use of the CLI.

Created by:

```bash
at-email auth login
```

The credential represents the human user. It must be managed as a normal Better
Auth session and shown with browser/device sessions in account security
settings.

It must not be used as the default runtime identity for autonomous agents.

### Agent Host

Purpose: persistent local runtime/device identity for an agent environment.

The host owns a keypair and can register agents under itself. A host may be
linked to a user or organization, pending approval, or unclaimed.

This maps to Better Auth Agent Auth `agentHost`.

### Agent

Purpose: a specific AI actor with its own identity and capability grants.

The agent owns a keypair and signs short-lived agent JWTs through the local CLI
or client boundary. It does not receive a Better Auth user session.

This maps to Better Auth Agent Auth `agent`.

### Agent Capability Grant

Purpose: the approved operations an agent can perform.

This maps to Better Auth Agent Auth `agentCapabilityGrant`.

Each grant must name a capability and may carry constraints, TTL, granted-by
metadata, and status.

### Approval Request

Purpose: browser or device-code approval state for agent registration,
capability escalation, and autonomous-agent claim.

This maps to Better Auth Agent Auth `approvalRequest`.

### OAuth Integration

Purpose: an external or plugin client that has been connected to an AgentTeam
Email user or organization through OAuth consent.

An OAuth integration is not an agent. It may carry broad integration consent,
but each email operation still needs an internal permission check against the
agent, mailbox, organization, and operation being requested.

### API Key

Purpose: a server-to-server credential for users, organizations, services, or
advanced self-hosted integrations.

API keys must be non-session-bearing. API key records must carry or reference
permission state that can be compiled into the same authorization model as
sessions, OAuth integrations, and agents.

## Flow 1: Personal CLI Login

Command:

```bash
at-email auth login
```

Required default behavior:

1. CLI starts a browser-first login flow.
2. CLI prints the URL before opening the browser.
3. CLI opens the browser when possible.
4. Human signs in or signs up.
5. CLI receives a personal user credential.
6. CLI stores only the personal auth credential.
7. `at-email auth status` reports the personal login state.
8. `at-email auth logout` revokes/removes the personal login credential.

Device-code behavior:

```bash
at-email auth login --device
```

Device code must be a fallback for SSH, remote terminals, browserless
environments, and cases where a local callback cannot be used. Device code must
not be the default for interactive local login.

Settings behavior:

- Personal CLI sessions must appear in the normal Security active sessions list.
- A session created by `at-email` may render with a CLI/device label based on
  its user agent.
- Personal CLI sessions must not have a dedicated `CLI access` settings
  section.

## Flow 2: Delegated Agent Connect

Command:

```bash
at-email agent connect
```

Purpose: an agent asks to act for a human or organization.

Required agent-side behavior:

1. CLI discovers Agent Auth metadata from `/.well-known/agent-configuration`.
2. CLI creates or loads a local host keypair.
3. CLI creates an agent keypair for this specific agent connection.
4. CLI registers the agent with requested capabilities and a human-readable
   agent name.
5. CLI prints the approval URL before opening it.
6. CLI opens the browser by default when possible.
7. CLI waits for approval.
8. CLI stores the host key, agent key, agent id, issuer, and granted
   capabilities.
9. Future agent operations use short-lived signed agent JWTs.

Required human-side behavior:

1. Human opens the approval URL.
2. If not signed in, human signs in or signs up.
3. Human selects the target account or organization.
4. Human sees the requesting agent name, host label, requested capabilities,
   constraints, and expiry when present.
5. Human approves or denies.
6. On approval, the server activates the agent and grants capabilities.

Required server behavior:

- The server must not return a user session token to the agent.
- The server must link approved delegated agents to the approving user and
  selected organization.
- The server must record which user approved each grant.
- The server must allow grants to be revoked without revoking the user's browser
  or personal CLI sessions.

Device-code variant:

```bash
at-email agent connect --device
```

This variant may use a code-entry screen, but the approved artifact remains an
agent identity and capability grants, not a user session.

## Flow 3: Autonomous Agent Trial

Command:

```bash
at-email agent trial
```

Purpose: an agent can try AgentTeam Email before a human account exists.

Required behavior:

1. CLI discovers Agent Auth metadata.
2. CLI creates or loads a local host keypair.
3. CLI registers an autonomous agent.
4. Server auto-grants only trial-safe capabilities.
5. Server provisions or assigns a constrained trial mailbox.
6. CLI prints the trial mailbox status and a claim URL.
7. Agent operations use short-lived signed agent JWTs.

Trial grants must be narrow. The first version must not grant broad mailbox
administration, domain provisioning, organization administration, or unlimited
send.

Trial policy must be owned by the server. The CLI must not enforce trial limits
as the source of authority.

Possible trial constraints:

- fixed daily send count
- fixed total send count
- fixed mailbox lifetime
- hosted trial domain only
- no custom domain
- no administrative provisioning capabilities

The exact quota values are open product decisions.

## Flow 4: Autonomous Agent Claim

Purpose: a human adopts a previously autonomous trial agent.

Required behavior:

1. Agent prints or shares a claim URL.
2. Human opens the claim URL.
3. If not signed in, human signs in or signs up.
4. Human reviews the agent name, trial mailbox, prior grants, and requested
   post-claim capabilities.
5. Human selects the target account or organization.
6. Human approves or denies.
7. On approval, the server links the agent and host to the human or
   organization.
8. Server transfers or associates trial resources according to product policy.

The claim flow must preserve auditability. Records must distinguish:

- actions performed while the agent was autonomous
- the user who claimed the agent
- actions performed after claim

## Flow 5: Human-First Agent Enrollment

Command shape:

```bash
at-email agent enroll <token>
```

Purpose: a human starts in the web app and gives the agent a tokenized
enrollment instruction.

Required human-side behavior:

1. Human opens settings.
2. Human creates an agent enrollment request.
3. Human chooses the organization, initial capabilities, constraints, and
   expiry.
4. Server creates a pending host enrollment token.
5. UI shows a copyable command or link for the agent.

Required agent-side behavior:

1. Agent runs the enrollment command.
2. CLI creates or loads a local host keypair.
3. CLI enrolls the host with the token.
4. CLI registers an agent under the enrolled host.
5. If additional approval is required, CLI follows the delegated approval flow.

Enrollment tokens must be one-time or short-lived. They must not grant broad
capabilities without persisted server-side authorization state.

## Existing Managed-Runtime Environment Path

The current environment-variable path remains a separate managed-runtime path.

It is allowed for runtimes that already receive WildDuck and Control API
credentials from an owning orchestration boundary.

It must not be treated as a fallback for Agent Auth. If no managed-runtime
environment variables are present, mailbox commands must fail with the existing
missing-runtime-configuration errors until capability-backed mailbox commands
exist.

Future work may replace direct WildDuck environment variables with an
Agent Auth capability execution path. That replacement must be explicit and
tested as a behavior change.

## Better Auth Agent Auth Setup

The backend must add the Better Auth Agent Auth plugin in a dedicated
implementation task.

Required setup:

- Add `@better-auth/agent-auth` as an exact dependency.
- Configure `agentAuth()` in `packages/backend/src/auth/auth.ts`.
- Expose `/.well-known/agent-configuration` at the app root.
- Add database schema ownership for:
  - `agentHost`
  - `agent`
  - `agentCapabilityGrant`
  - `approvalRequest`
- Use secondary storage for replay/JWKS caches in multi-instance deployments.
- Configure supported modes intentionally.
- Configure `deviceAuthorizationPage` for device fallback and browser approval.
- Configure `onEvent` for audit logs.
- Configure capability validation, blocked capabilities, and grant TTL policy.

Dynamic host registration must be an explicit product/security decision. If
enabled for autonomous trial, it must be paired with trial-only default
capabilities and abuse controls.

## Initial Capabilities

Capabilities must be narrow and named for product behavior.

Initial candidates:

```text
email.status
email.mailbox.provision
email.message.list
email.message.read
email.message.search
email.message.create_draft
email.message.mark_read
email.message.archive
email.message.manage
email.message.send
email.message.reply
email.agent.claim
email.mailbox.create
email.forwarding_group.manage
email.mailbox.read_all
```

The server must own capability enforcement. The CLI may help choose requested
capabilities, but it must not be the source of authorization.

`email.message.send` and `email.message.reply` should support constraints
before broad approval is allowed. Candidate constraints include allowed sender,
allowed recipient patterns, daily count, total count, and expiry.

The product UI may present friendlier labels such as:

```text
Read mailbox
Send as mailbox
Create drafts
Manage messages
Create accounts
Manage forwarding groups
Read all mailboxes
```

Those labels must map to the canonical capability and permission names owned by
the backend contract.

## Mailbox Grants And System Permissions

Mailbox access should be split into per-mailbox grants and organization-level
system permissions.

Per-mailbox grant examples:

```text
readMailbox -> email.message.list, email.message.read, email.message.search
sendAs -> email.message.send, email.message.reply
createDrafts -> email.message.create_draft
manageMessages -> email.message.mark_read, email.message.archive, email.message.manage
```

System permission examples:

```text
createAccounts -> email.mailbox.create
manageForwardingGroups -> email.forwarding_group.manage
readAllMailboxes -> email.mailbox.read_all
```

The backend must be the owner of the canonical mapping. Frontend labels and
Storybook fixtures must not become the source of permission semantics.

Per-mailbox grants must carry mailbox identity and organization identity.
Organization-level system permissions must still be constrained to one
organization unless a future admin role explicitly grants broader authority.

## Paperclip Integration Policy

The Paperclip plugin must use OAuth as the default operator connection path
once the service contract exists. API key configuration remains an advanced
self-hosted or preview path.

The Paperclip OAuth connection must establish:

- connected AgentTeam Email organization
- connected AgentTeam Email user when applicable
- OAuth client id
- OAuth consent reference
- granted OAuth scopes
- connection status metadata safe to show in Paperclip

The Paperclip OAuth connection must not establish:

- per-agent mailbox access
- mailbox credentials
- WildDuck credentials
- mail-control service credentials
- raw OAuth access tokens in Paperclip-visible plugin state

Paperclip tool calls must pass Paperclip run context to AgentTeam Email:

```text
company id
agent id
project id
run id
plugin id
requested email operation
```

AgentTeam Email must treat that context as input for lookup and audit, not as
authority by itself. The web server must map Paperclip's external agent
identity to an AgentTeam Email agent, host, OAuth integration, API key, or
grant record before authorizing an operation.

The Paperclip plugin must not become the authoritative mailbox policy store.
It may cache redacted connection and status data for display, but each
operation must be authorized by AgentTeam Email at request time.

If the Paperclip worker later receives service-issued capability tokens or
environment variables for an agent run, those credentials must be short-lived,
scoped to one agent, run, and mailbox, and injected only at the runtime
boundary that owns execution. They must not be persisted in plugin state.

## API And Execution Model

Agent operations must authenticate with Agent Auth agent JWTs.

The API boundary must resolve an agent session and enforce:

- agent status is active or otherwise allowed for the operation
- host status is valid
- requested capability is granted
- grant is active and unexpired
- constraints cover the requested operation
- organization and mailbox ownership match persisted authorization state

Missing, malformed, expired, wrong-audience, wrong-issuer, or invalid agent
JWTs must return `401 Unauthorized` with an applicable `WWW-Authenticate`
challenge. Valid agent credentials without required authority must return
`403 Forbidden`.

Resource routes may use a future `/api/ingress/v1/` prefix for public agent API
traffic, but the canonical route shape is not decided in this document.

### Authorization By Credential Lane

Personal user session requests must authorize through the user's membership,
role, selected organization, and any mailbox assignment state.

Agent requests must authorize through Agent Auth session resolution, active
agent state, active host state, active capability grants, grant constraints,
grant expiry, organization binding, and mailbox assignment state.

OAuth integration requests must first validate the OAuth token, client,
audience, issuer, expiry, org reference, and OAuth scope. The route must then
resolve the user, organization, integration, and requested agent or mailbox
context before evaluating internal permissions.

API key requests must first validate the key, enabled status, rate limit,
expiry, reference owner, and key permission state. The route must then evaluate
the same internal permission model as other credential lanes.

Service requests must authenticate with service-owned credentials and must be
accepted only on routes owned by that service boundary.

### Error Semantics

Authentication failures must return `401 Unauthorized`.

Authorization failures after valid authentication must return `403 Forbidden`.

Malformed request input must return request-validation errors, not
authentication or authorization failures.

Bearer authentication failures must include the applicable `WWW-Authenticate`
challenge for the credential lane when a challenge exists.

## Settings And UI Requirements

### Security Sessions

The settings UI must merge personal CLI sessions into the existing Security
active sessions list.

Required changes:

- Remove `cliAccess` as a separate settings section for Better Auth sessions.
- Remove `/settings/cli-access/` as a dedicated personal session destination, or
  redirect it to `/settings/security/` during transition.
- Render `at-email/` user-agent sessions inside `ActiveSessions`.
- Label those rows as CLI/device sessions without changing their revocation
  semantics.
- Revoke still uses normal Better Auth session revocation.

### Agent Access

Agent identities and grants need a separate settings section because they are
not user sessions.

Suggested section name:

```text
Agent access
```

This section must show agent-auth records, not Better Auth sessions.

Required first-version records:

- agent name
- mode: account-connected or independent/trial
- host label
- linked organization
- status
- granted capabilities
- grant expiry
- last used time
- approved by
- revoke action

Autonomous claim approvals and delegated capability approvals need their own
browser-facing screens. They must not reuse copy that says "CLI session" when
the request is for agent capability grants.

## CLI Command Plan

Required personal auth commands:

```bash
at-email auth login
at-email auth login --device
at-email auth status
at-email auth logout
```

Required agent commands:

```bash
at-email agent connect
at-email agent connect --device
at-email agent trial
at-email agent enroll <token>
at-email agent status
at-email agent disconnect
```

Every command must support `-h` and `--help`.

Every command that can be automated must support `--json`.

Text output must never print raw tokens, private keys, refresh tokens, user
session tokens, agent JWTs, authorization headers, or secret-derived hashes.

The CLI must store personal user login and agent credentials as separate local
credential classes. Deleting or revoking one class must not silently delete the
other unless a command explicitly says it will remove all local credentials.

## Documentation Requirements

Add or update durable docs when implementation starts:

- CLI README must explain the difference between personal login, agent connect,
  agent trial, and managed-runtime environment variables.
- The skill must direct agents toward `agent connect` or `agent trial` once
  those commands exist.
- The public docs must include a user-facing agent setup page.
- Release notes must call out any behavior change to `auth login`, especially
  moving device code behind `--device`.

## Testing Requirements

Security-sensitive implementation must include tests for each changed boundary.

Required CLI tests:

- `auth login` browser-first flow prints URL and does not require a device code
  by default.
- `auth login --device` keeps the code-entry flow.
- `agent connect` stores agent identity and grants, not a user session token.
- `agent trial` stores autonomous agent identity and prints a claim URL.
- `agent enroll` rejects missing or invalid token input.
- JSON output excludes secrets.

Required backend tests:

- Agent Auth discovery document is served from
  `/.well-known/agent-configuration`.
- Agent registration rejects unsupported modes and invalid capabilities.
- Delegated registration creates pending approval when human approval is
  required.
- Approval links grants to the approving user and selected organization.
- Autonomous trial grants only trial-safe capabilities.
- Claim links an autonomous agent to the approving user or organization.
- Revoking an agent does not revoke user browser or personal CLI sessions.
- Revoking a personal CLI session does not revoke agent grants.
- Agent JWT auth returns `401` for invalid credentials and `403` for missing
  grants.
- OAuth tokens with identity scopes alone cannot perform mailbox operations
  without persisted internal authorization.
- An OAuth integration token with future API scope still cannot operate on a
  mailbox unless the requested agent or mailbox has an allowed grant.
- API keys remain non-session-bearing and authorize only through their own
  permission state.
- CASL-generated permission filters cannot be overwritten by caller filters.
- Paperclip-supplied agent ids are treated as lookup context only and do not
  authorize mailbox operations by themselves.
- WildDuck and mail-control credentials are never returned to public clients.

Required frontend tests or stories:

- Active sessions show browser sessions and `at-email` CLI sessions together.
- Agent access list shows delegated, autonomous, claimed, revoked, and expired
  agents.
- Agent approval screen shows requested capabilities and constraints.
- Autonomous claim screen shows pre-claim state and target organization choice.
- Denied and expired approval states are visible.
- OAuth integration settings show connected organization and status without
  exposing OAuth tokens.
- Paperclip-related UI surfaces show redacted connection state only.

Required E2E coverage:

- Existing user completes `agent connect`.
- New user signs up during `agent connect` approval and returns to approval.
- Agent starts autonomous trial, sends within trial limits, and later gets
  claimed.
- Human creates enrollment token, agent enrolls, and the resulting agent can
  execute an approved capability.

## Workstreams

### 1. Settings Cleanup

Remove the personal `CLI access` section and merge CLI sessions into normal
active sessions.

Acceptance checks:

- `/settings/security/` shows `at-email` sessions alongside browser sessions.
- `at-email` session revocation uses normal session revocation.
- No UI describes personal CLI login as agent access.
- Existing `cliAccess` routes either disappear or redirect to security.

### 2. Browser-First Personal CLI Login

Change `at-email auth login` to browser-first login with device code behind
`--device`.

Acceptance checks:

- Default login prints and opens a browser URL.
- Device code appears only with `--device`.
- Existing user-session semantics remain clear.
- `auth status` and `auth logout` still operate on only personal auth.

### 3. Agent Auth Backend

Add Better Auth Agent Auth plugin, schema, discovery, events, and capability
definitions.

Acceptance checks:

- Discovery is available at `/.well-known/agent-configuration`.
- Database schema owns Agent Auth records.
- Unsupported modes and capabilities fail closed.
- Audit events record agent lifecycle and grant lifecycle.

### 4. Delegated Agent Connect

Implement `at-email agent connect`.

Acceptance checks:

- Agent creates host and agent keys.
- Human approval grants scoped capabilities.
- CLI stores agent credentials separately from user login.
- Agent operations use signed agent JWTs.

### 5. Autonomous Trial And Claim

Implement `at-email agent trial` and claim flow.

Acceptance checks:

- Trial requires no human account.
- Trial grants are constrained.
- Claim URL lets a signed-in or newly signed-up human adopt the agent.
- Audit records preserve pre-claim and post-claim actor identity.

### 6. Human-First Enrollment

Implement settings-created enrollment tokens and `at-email agent enroll`.

Acceptance checks:

- Enrollment token is short-lived and one-time.
- Human-selected capabilities become persisted server authorization state.
- Agent enrollment does not expose raw server credentials.

### 7. Capability-Backed Mail Operations

Move mailbox commands toward Agent Auth capability execution.

Acceptance checks:

- Agent-authenticated operations do not require direct WildDuck credentials in
  the agent environment.
- Existing managed-runtime environment variables remain supported only as their
  own explicit path during transition.
- Authorization is enforced by server-side grants and mailbox ownership.

### 8. Permission And Scope Contract

Define the shared authorization vocabulary and OAuth scope policy in the
backend contract.

Acceptance checks:

- OAuth identity scopes remain `openid`, `profile`, `email`, and
  `offline_access`.
- Public API OAuth scopes remain empty until a concrete API OAuth scope is
  implemented.
- If `email.full_access` is added, it is documented as broad integration API
  access, not as per-mailbox authorization.
- Agent Auth capabilities use the canonical `email.*` names from this plan.
- Frontend permission labels map to backend-owned capability or permission
  names.
- CASL Ability construction is derived from persisted domain grants and does
  not become the only persisted permission data model.

### 9. Paperclip OAuth And Agent Context

Implement the Paperclip integration connection and operation authorization.

Acceptance checks:

- Paperclip OAuth stores only server-owned connection metadata and credentials
  at the correct boundary.
- Paperclip-visible plugin state never contains raw OAuth tokens, API keys,
  bearer headers, mailbox passwords, or resolved secret values.
- Paperclip tool calls include company, agent, project, run, plugin, and
  operation context.
- AgentTeam Email maps Paperclip context to persisted authorization state
  before executing any mailbox operation.
- Paperclip context alone never authorizes a mailbox operation.
- API key configuration remains limited to the documented advanced self-hosted
  path.

## Open Questions

- Exact trial quota values.
- Whether the default personal login uses local-loopback OAuth PKCE, a
  browser-only approval poll, or another Better Auth-native browser flow.
- Whether autonomous dynamic host registration is enabled publicly on day one
  or limited by invite, rate limit, payment, CAPTCHA, or another abuse-control
  boundary.
- Final names for `agent trial` and `agent enroll`.
- Whether `/settings/cli-access/` should redirect permanently to security or be
  reused later for the new Agent access section under a different label.
- Whether the first API OAuth scope should be named `email.full_access`,
  `agentteam.email.full_access`, or another stable public name.
- Whether a public third-party OAuth developer platform is in scope later,
  which would justify granular OAuth API scopes.
- Whether Paperclip should map external agents to AgentTeam Email agents
  automatically on first tool use or require explicit adoption in the
  AgentTeam Email web UI.
- Whether Agent Auth autonomous trial is public on day one or restricted to
  invited/paid/verified environments.
