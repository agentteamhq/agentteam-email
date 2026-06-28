# AgentTeam Email

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-www.agentteam.email-111827.svg)](https://www.agentteam.email)
[![App](https://img.shields.io/badge/app-app.agentteam.email-111827.svg)](https://app.agentteam.email)
[![Docs](https://img.shields.io/badge/docs-Mintlify-111827.svg)](https://agentteamemail.mintlify.com)
[![Storybook](https://img.shields.io/badge/storybook-live-ff4785.svg)](https://agentteamhq.github.io/agentteam-email/)
[![Helm OCI](https://img.shields.io/badge/helm-OCI-0f1689.svg)](https://github.com/agentteamhq/agentteam-email)

AgentTeam Email is an open-source email service for AI agents. It gives every
agent its own mailbox and provides the mail infrastructure needed to receive,
send, archive, inspect, and operate agent-owned email.

The project is built for self-hosting and for hosted AgentTeam deployments. The
self-hosted stack packages a web app, mail control service, mail server
components, archive storage, and Cloudflare Email Worker integration behind one
operator-owned deployment.

## Links

- Website: [www.agentteam.email](https://www.agentteam.email)
- App: [app.agentteam.email](https://app.agentteam.email)
- Docs: [agentteamemail.mintlify.com](https://agentteamemail.mintlify.com)
- Repository: [github.com/agentteamhq/agentteam-email](https://github.com/agentteamhq/agentteam-email)
- Agent skill: [skills/at-email-cli/SKILL.md](skills/at-email-cli/SKILL.md)

## What It Provides

- Agent-owned mailboxes backed by WildDuck.
- Authenticated web app for mailbox administration, message review, credentials,
  and integration setup.
- Inbound mail capture through Cloudflare Email Routing and a Cloudflare Email
  Worker.
- Raw message and metadata archival in Cloudflare R2 storage.
- Internal replay from archive storage through Haraka into WildDuck.
- Outbound delivery through ZoneMTA and the Mail Control Service relay path.
- Provider feedback and DSN handling for active sender domains.
- Compose and Helm deployment surfaces with fail-closed configuration for
  required secrets.

## Runtime Shape

AgentTeam Email has one public application boundary: the web server in
`apps/web-server`. It owns browser/API ingress, authentication, credential
management, and user-facing integration flows.

All other services are internal:

- `apps/mail-control-service` coordinates domain provisioning, inbound replay,
  outbound relay handling, feedback processing, and status.
- `packages/cloudflare-email-worker` provides the Cloudflare Email Routing
  Worker source that writes archive bundles before sending signed worker
  notifications.
- WildDuck, Haraka, ZoneMTA, Rspamd, MongoDB, Redis, and archive storage provide
  the mail runtime.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full architecture contract.

## Self-Hosting

The supported self-host paths are:

- `compose.yaml` for a single-host deployment.
- `charts/agentteam-email` for Kubernetes deployments.

Start with the self-hosting docs in [docs/README.md](docs/README.md). Helm
users can install the chart from GHCR:

```bash
helm upgrade --install atemail \
  oci://ghcr.io/agentteamhq/agentteam-email \
  --namespace agentteam-email \
  --create-namespace \
  -f values.yaml
```

Compose users should copy `.env.example`, provide the required values, and run
the root Compose file with their container runtime.

## Development

Install repo-managed tools first:

```bash
mise install
pnpm install
```

Common workflows:

```bash
pnpm typecheck
mise run test
mise run typegen
```

Repo-level tasks are defined in `mise.toml`; package workflows use
Corepack-managed `pnpm`.

For local worktree setup and container-test isolation, see [SETUP.md](SETUP.md).

## Agent Skill

The at-email CLI skill is published from [skills/at-email-cli](skills/at-email-cli)
for agent-skill marketplaces and GitHub tap discovery.

Skill publishing and update procedures are tracked in
[SKILL-PUBLISHING.md](SKILL-PUBLISHING.md).

Install directly with the skills CLI:

```bash
npx skills add https://github.com/agentteamhq/agentteam-email/tree/main/skills/at-email-cli
```

Hermes users can add the repository as a tap or install the skill directly:

```bash
hermes skills tap add agentteamhq/agentteam-email
hermes skills install agentteamhq/agentteam-email/skills/at-email-cli
```

OpenClaw/ClawHub users can install it with:

```bash
openclaw skills install @agentteamhq/at-email-cli
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, validation, and pull
request guidance.

## Security

Read [SECURITY.md](SECURITY.md) before changing authentication, authorization,
credential handling, encryption, session, cookie, API key, or other
security-sensitive behavior.

The public repository must not contain private hostnames, private repository
names, credentials, tokens, fixed runtime secrets, or references to files outside
the repository root.

## License

MIT. See [LICENSE](LICENSE).
