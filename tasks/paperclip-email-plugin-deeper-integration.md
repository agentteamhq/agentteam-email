# Paperclip Email Plugin Remaining Work

## Status

Partially implemented. The package, manifest, worker, single `email` tool,
typed validation, CLI delegation through `at-email paperclip-tool --json`,
redacted errors, current settings/dashboard UI, sandbox, and E2E harness exist.
This file keeps only remaining integration work.

## Remaining Connection Lifecycle

- Decide the first production connection mode: OAuth, API key, external
  service-managed connection, or a phased combination.
- Replace the current safe OAuth handoff with the intended connection lifecycle
  once that boundary is approved.
- Add real connect, test connection, and disconnect actions.
- Show connected AgentTeam Email account or organization metadata without
  exposing tokens, API keys, bearer headers, mailbox passwords, or resolved
  secret values.
- Keep API key setup limited to advanced self-hosting when Paperclip
  company-scoped secret references are available and approved.

## Remaining Status And UI Work

- Replace shallow connected/not-connected state with service health,
  provisioned-agent summary, latest sync or test time, and latest redacted
  error.
- Add optional agent `detailTab` or `toolbarButton` only if the first product
  integration needs an agent-scoped status/support surface.
- Limit any agent-scoped Paperclip UI to status, support, and AgentTeam Email
  deep links. Do not move mailbox policy editing into Paperclip.

## Remaining Authorization Work

- Prove Paperclip company, agent, project, run, plugin, and operation context is
  mapped to persisted AgentTeam Email authorization state before each mailbox
  operation.
- Prove Paperclip-supplied agent identifiers alone never authorize mailbox
  access.
- Keep plugin state non-authoritative for mailbox grants and provisioning
  decisions.

## Remaining Operations Work

- Add scheduled reconciliation only after the AgentTeam Email service exposes a
  stable summary-status contract.
- Add webhooks or plugin API routes only after the upstream service requires
  push delivery into Paperclip.
- Add metrics and activity logging only after the exact redacted event contract
  is defined.
- Keep the sandbox seed aligned with the current demo path.

## Remaining Validation

- Keep package validation current:
  - `pnpm --filter @agentteam/paperclip-email-plugin typecheck`
  - `pnpm --filter @agentteam/paperclip-email-plugin lint`
  - `pnpm --filter @agentteam/paperclip-email-plugin build`
  - `mise run //test-containers/paperclip-plugin-e2e:test`
- Add tests for real connect, test connection, disconnect, richer status, and
  any optional agent detail or toolbar surface when those features land.
- Preserve tests proving raw credentials and raw email bodies are not written to
  plugin state, logs, UI bridge responses, or activity records.

## Acceptance Checks

- Paperclip can connect to AgentTeam Email through the approved connection
  lifecycle.
- The dashboard shows useful health/provisioning status and redacted failures.
- Tool calls are authorized by AgentTeam Email, not by Paperclip context alone.
- Disconnect and test-connection actions behave predictably.
- Plugin state and logs never contain raw credentials or raw email content.
