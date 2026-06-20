# Contributing

Thanks for contributing to AgentTeam Email.

## Before You Start

Read the current project docs for the area you are changing:

- [README.md](README.md) for project scope and architecture links
- [SETUP.md](SETUP.md) for local setup, validation commands, and test workflows
- [SECURITY.md](SECURITY.md) before changing authentication, authorization,
  credentials, encryption, sessions, cookies, API keys, or other
  security-sensitive behavior
- [PEER-DEPS.md](PEER-DEPS.md) before changing dependencies

Do not include secrets, private hostnames, credentials, tokens, absolute paths,
or references to files outside the repository root.

## Local Setup

Run setup from the repository root:

```bash
mise install
pnpm install
```

Configure your repo-local `.env` from `.env.example`. For worktrees, set `WT` to
a short kebab-case checkout name and keep local database names scoped to that
worktree. See [SETUP.md](SETUP.md) for the full workflow.

## Development

Use the owning workflow for the surface you are changing:

- Node, frontend, and package workflows use Corepack-managed `pnpm`.
- Repo-wide runtime, deployment, docs, chart, E2E, and aggregate workflows use
  `mise`.
- Scoped app, chart, docs, and test-container workflows are invoked through
  explicit monorepo task paths such as `mise run //charts:check`.

## Validation

Run the focused checks for your change, then the broader checks that match the
affected surface.

Common checks:

```bash
pnpm typecheck
pnpm lint
pnpm build
mise run test
```

Run formatting for package-owned files with:

```bash
pnpm format
```

Run targeted Prettier checks for docs and config files outside package format
scripts:

```bash
pnpm exec prettier --check <changed files>
```

Use [SETUP.md](SETUP.md) for Helm, docs, Compose, E2E, Go, Storybook, and
Playwright validation commands.

## Pull Requests

Open a pull request with:

- a concise summary of the change
- the validation commands you ran
- screenshots or recordings for user-facing frontend changes
- notes for any configuration, deployment, or documentation impact

Generated contracts must be changed by updating the owning source contract and
running the canonical generator.

## Security Reports

Do not open public issues for vulnerabilities, leaked secrets, credentials, or
private operational details. Follow [SECURITY.md](SECURITY.md).
