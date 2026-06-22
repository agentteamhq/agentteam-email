# Paperclip Email Plugin Deeper Integration

## Status

Proposed.

## Goal

The Paperclip email plugin must make AgentTeam Email available as a native
Paperclip integration while keeping mailbox policy, mailbox lifecycle, provider
credentials, and detailed email administration in the AgentTeam Email service.

The plugin must expose one Paperclip agent tool named `email`. Specific email
behaviors must be selected through tool arguments and delegated to the
prospective internal `atemail-cli` boundary.

## Scope

The plugin must provide:

- Paperclip installation, manifest, build, and validation wiring.
- Operator configuration for the AgentTeam Email service connection, with
  OAuth as the default path and API key setup only under advanced self-hosting.
- A custom settings UI for connect, disconnect, test connection, and status.
- A dashboard status widget for service health and provisioning summary.
- Optional agent detail or toolbar UI for agent-scoped status and support links.
- One agent tool named `email`.
- Worker-side command execution that delegates email operations to
  `atemail-cli`.
- Minimal Paperclip plugin state for cache and status only.

The plugin must not provide separate Paperclip tools such as `email_send`,
`email_search`, `email_read`, or `email_reply`. Those are operations of the
single `email` tool.

## Non-Goals

- The plugin must not become the authoritative mailbox policy store.
- The plugin must not create a second email administration product inside
  Paperclip.
- The plugin must not persist raw mailbox credentials, API keys, OAuth tokens,
  refresh tokens, or bearer tokens in plugin state.
- The plugin must not inject long-lived mailbox credentials into agent
  environments by default.
- The plugin must not bypass AgentTeam Email authorization by trusting
  Paperclip-supplied agent identifiers alone.
- The plugin must not implement Paperclip-native per-agent mailbox setup
  controls.

## Ownership Boundary

AgentTeam Email service owns:

- Customer account and organization binding.
- Domain selection and domain verification state.
- Agent-to-mailbox eligibility policy.
- Mailbox creation, suspension, deletion, aliasing, and lifecycle audit.
- Provider OAuth grants and provider credentials.
- Inbound and outbound message storage, search, retention, and delivery rules.
- Authorization for each agent email operation.

The Paperclip plugin owns:

- Paperclip manifest declarations and capability requests.
- Operator connection UI inside Paperclip.
- Paperclip-side status display and cached summary state.
- Agent tool registration.
- Worker-side translation from Paperclip tool calls to `atemail-cli` calls.
- Agent-scoped Paperclip UI only for status, support, or deep links.
- Redacted logs, activity records, and metrics for Paperclip-visible plugin
  behavior.

## Paperclip Surface Findings

Paperclip plugin SDK `2026.618.0` provides these relevant surfaces:

- `settingsPage` for custom instance configuration UI.
- `dashboardWidget` for workspace-level status summary.
- `tools[]` plus `agent.tools.register` for agent-run tool calls.
- `detailTab` with `entityTypes: ["agent"]` for an additional tab on an agent
  detail page.
- `toolbarButton` with `entityTypes: ["agent"]` for an entity-toolbar action
  when the host renders that placement for agents.
- managed agents, projects, routines, and skills for plugin-owned Paperclip
  business objects.

Paperclip does not expose a dedicated plugin slot for arbitrary agent profile
configuration. Agent-specific plugin UI must use an agent `detailTab` or agent
`toolbarButton`, and that UI must be treated as a status/support/deep-link
surface for this plugin.

The first AgentTeam Email plugin scope must not declare managed agents,
managed projects, managed routines, or managed skills. Those surfaces are for
plugin-owned Paperclip work. Email access for existing agents must be governed
by AgentTeam Email and reached through the single `email` tool.

## Paperclip Manifest Requirements

The manifest must eventually declare only the capabilities needed by the current
implementation phase.

Required deeper-integration capabilities:

- `agent.tools.register` when the `email` tool is implemented.
- `ui.dashboardWidget.register` for the dashboard status widget.
- `ui.action.register` if an agent toolbar support/deep-link button is added.
- `ui.detailTab.register` if an agent status/support tab is added.
- `instance.settings.register` when a custom settings page replaces the
  generated JSON Schema settings form.
- `plugin.state.read` and `plugin.state.write` for redacted status/cache.
- `metrics.write` and `activity.log.write` if plugin-visible telemetry is
  implemented.

Security-sensitive capabilities must be added only with explicit security
approval for that implementation task:

- `secrets.read-ref`
- `http.outbound`
- `api.routes.register`
- `webhooks.receive`

## Configuration Requirements

The plugin configuration must remain small:

- `serviceBaseUrl`: HTTPS AgentTeam Email app origin, defaulting to
  `https://app.agentteam.email`, exposed only under advanced self-hosting.
- `apiKeySecretRef`: Paperclip secret reference, exposed only under advanced
  self-hosting when Paperclip company-scoped plugin secret references are
  available and approved.

The plugin settings UI must show connection status, expose a default OAuth
connect path, and link to the AgentTeam Email service for detailed policy. The
settings UI must expose only service URL and API key secret reference under
advanced self-hosting. The settings UI must not expose detailed mailbox policy
controls unless a future task explicitly moves those controls into Paperclip.

`atemail-cli` is an internal worker implementation boundary, not an
operator-configurable setting in the first plugin scope.

## Single Tool Contract

The plugin must register one Paperclip agent tool:

```ts
{
  name: "email",
  displayName: "Email",
  description: "Use AgentTeam Email for the current agent mailbox.",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["operation"],
    properties: {
      operation: {
        type: "string",
        enum: [
          "status",
          "provision",
          "send",
          "search",
          "read",
          "reply"
        ]
      },
      mailbox: { type: "string" },
      messageId: { type: "string" },
      threadId: { type: "string" },
      to: { type: "array", items: { type: "string" } },
      cc: { type: "array", items: { type: "string" } },
      bcc: { type: "array", items: { type: "string" } },
      subject: { type: "string" },
      body: { type: "string" },
      query: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 50 },
      dryRun: { type: "boolean" }
    }
  }
}
```

The worker must validate the operation-specific arguments before invoking
`atemail-cli`. Invalid tool input must return a tool error, not invoke the CLI.

The worker must pass Paperclip run context to the CLI for authorization:

- `companyId`
- `agentId`
- `projectId`
- `runId`
- plugin id
- requested operation

The worker must not trust the agent to choose another agent id. The current
agent identity must come from Paperclip `ToolRunContext`.

## CLI Delegation Requirements

`atemail-cli` is prospective and is not implemented in this repository.

The plugin worker must call `atemail-cli` through a narrow wrapper that:

- uses an argument array, not shell string interpolation
- sets a bounded timeout
- passes structured JSON on stdin or through a single explicit input file
- reads structured JSON from stdout
- treats stderr as diagnostic text only
- redacts secrets and bearer headers from errors and logs
- maps non-zero exits to Paperclip tool errors

The CLI input envelope must include:

```json
{
  "schema": "agentteam-email.paperclip-tool.v1",
  "operation": "status",
  "context": {
    "companyId": "paperclip-company-id",
    "agentId": "paperclip-agent-id",
    "projectId": "paperclip-project-id",
    "runId": "paperclip-run-id"
  },
  "parameters": {}
}
```

The CLI output envelope must include:

```json
{
  "ok": true,
  "content": "Human-readable result for the agent.",
  "data": {}
}
```

When `ok` is false, the plugin must return the CLI-provided redacted error as
the Paperclip tool error.

## Provisioning Behavior

`operation: "status"` must return the current agent mailbox status.

`operation: "provision"` must request mailbox provisioning for the current
agent through AgentTeam Email. The service must decide whether provisioning is
allowed.

`operation: "send"` must send mail only from a mailbox authorized for the
current agent.

`operation: "search"`, `"read"`, and `"reply"` must operate only on mailboxes
authorized for the current agent.

The plugin must not persist mailbox authorization decisions as authoritative
state. It may cache recent status for display, but each tool operation must be
authorized by AgentTeam Email.

## UI Requirements

The custom settings page must support:

- connect or configure service access
- test connection
- disconnect
- show connected account or organization metadata
- show domain summary
- show advanced self-hosting fields for service URL and API key secret refs
- link to AgentTeam Email for detailed mailbox policy

The dashboard widget must support:

- connected or not connected
- service health
- provisioned agent count
- latest sync or test time
- latest redacted error

The optional agent detail UI must support:

- current agent mailbox address, when the service exposes it
- provisioning status, when the service exposes it
- latest sync time
- recent redacted operation status
- a primary button or link to AgentTeam Email support or the AgentTeam Email
  web app for agent-specific provisioning questions

The optional agent detail UI must not edit per-agent mailbox policy in
Paperclip. Any agent-specific provisioning request must be sent to AgentTeam
Email for authorization and execution.

The UI must not render raw tokens, API keys, OAuth credentials, mailbox
passwords, resolved secret values, or raw email content.

## State And Logging Requirements

Plugin state may store:

- last successful connection check timestamp
- last failed connection check timestamp
- redacted failure code and message
- non-authoritative mailbox status cache
- last reconciliation timestamp

Plugin state must not store:

- raw API keys
- OAuth access tokens
- OAuth refresh tokens
- bearer headers
- mailbox passwords
- decrypted secret values
- raw email message bodies
- raw email attachments

Plugin logs and activity records must include stable correlation fields when
available:

- plugin id
- company id
- agent id
- run id
- operation
- upstream request id, when returned by AgentTeam Email

Logs and activity records must not include raw credentials or broad email
payload dumps.

## Implementation Tasks

1. Replace the generated-only configuration experience with a custom
   `settingsPage` once connection work begins.
2. Add the `email` tool declaration to the manifest with the single-tool
   operation schema.
3. Add `agent.tools.register` only when the worker registers the `email` tool.
4. Implement a typed tool input parser and operation-specific validation.
5. Implement the `atemail-cli` wrapper behind a small worker module.
6. Add tool handlers that map Paperclip `ToolRunContext` and validated tool
   input into the CLI input envelope.
7. Add redacted CLI output and error mapping to Paperclip `ToolResult`.
8. Add dashboard data handlers for connection and provisioning status.
9. Add settings actions for test connection and disconnect.
10. Add optional agent `detailTab` or `toolbarButton` only after the core tool
    path lands, and limit that UI to status, support, and AgentTeam Email deep
    links.
11. Add scheduled reconciliation only after the service contract for summary
    status exists.
12. Add webhooks or plugin API routes only after the upstream service requires
    push delivery into Paperclip.
13. Keep the isolated Paperclip sandbox current as the plugin gains
    capabilities, so the integration remains manually tryable during
    development.
14. Keep the sandbox first-start seed aligned with the current demo path, so
    preview users land in an example workspace without manual signup/setup.

## Validation Tasks

The plugin package must pass:

- `pnpm --filter @agentteam/paperclip-email-plugin typecheck`
- `pnpm --filter @agentteam/paperclip-email-plugin lint`
- `pnpm --filter @agentteam/paperclip-email-plugin build`
- `mise run //test-containers/paperclip-plugin-e2e:test`

Manual tryability must be preserved through:

- `mise run paperclip-plugin:start`
- `mise run paperclip-plugin:smoke`
- `mise run paperclip-plugin:install`
- `mise run paperclip-plugin:seed`
- `mise run paperclip-plugin:preview:start`
- `mise run paperclip-plugin:preview:smoke`
- `mise run paperclip-plugin:stop`

The sandbox flow must run Paperclip in an isolated container, install the local
plugin from the repository checkout, preserve named sandbox volumes across stop
and start, seed an example workspace on first start, and expose the Paperclip UI
on a stable local URL.

The preview flow must keep Paperclip in local-trusted loopback mode and expose
it through the separate unauthenticated test proxy for LAN demo access while
preserving Caddy runtime state in named preview volumes.

The single-tool implementation must include tests proving:

- the manifest declares exactly one tool named `email`
- the worker rejects invalid operation arguments before invoking `atemail-cli`
- the worker passes Paperclip `ToolRunContext.agentId` instead of any
  agent-supplied agent id
- CLI arguments are not shell-interpolated
- non-zero CLI exits become redacted Paperclip tool errors
- successful CLI output becomes Paperclip tool content and structured data
- raw credentials and raw email bodies are not written to plugin state, logs, or
  UI bridge responses

## Open Questions

- Whether the first production connection mode is `api-key`, `oauth`, or
  `external`.
- Whether Paperclip company-scoped plugin secret references are available in the
  target Paperclip host version.
- Whether `atemail-cli` should receive input through stdin or an explicit
  temporary JSON file.
- Which operation set ships first. The expected first set is `status`,
  `provision`, and `send`.
- Whether the later agent-scoped support surface should be an agent
  `detailTab`, an agent `toolbarButton`, or omitted from the first production
  integration.
- Which AgentTeam Email support or app route should receive the agent-scoped
  deep link, and which Paperclip context fields are safe to include.
