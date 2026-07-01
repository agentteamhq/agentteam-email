# Setup

## Worktree Identity

Run repo-managed development, local runtime, container, and end-to-end workflows
through the checked-out repository root:

```bash
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
cp .env.example .env
mise install
pnpm install
pnpm clean
```

The main checkout should use:

```dotenv
WT=main
```

For a non-main worktree, copy `.env.example` to `.env`, then set `WT` in the
repo-local `.env` to a short kebab-case slug for that worktree. Also give the
app database names the same suffix, for example:

```dotenv
WT=feature-mailbox
MONGODB_URI=mongodb://127.0.0.1:27017/agentteam_email_feature_mailbox?directConnection=true
MONGODB_DATABASE=agentteam_email_feature_mailbox
DATABASE_URL=mongodb://127.0.0.1:27017/agentteam_email_feature_mailbox?directConnection=true
```

`mise run dev:start` uses `WT` to scope local container names and volumes. The
database name and dependency service ports in `.env` are the worktree isolation
boundary when multiple dev runtimes run on one host.

## Local Runtime

Start the full source-development runtime through the repo-owned task:

```bash
mise run dev:start
```

This starts the local dependency containers required by source development:
MongoDB, Redis, Mailpit, MinIO, WildDuck, Rspamd, Haraka, and ZoneMTA. It also
starts the Mail Control Service from source and the root `pnpm dev` Turbo graph
for the backend and frontend packages. Each invocation writes a run directory
under `tmp/run-<id>/` and prints the current run id.

Stop or restart that runtime with:

```bash
mise run dev:stop
mise run dev:restart
```

Inspect the active runtime marker and dependency container status with:

```bash
mise run dev:status
```

For local OAuth providers that require HTTPS redirect URLs, set
`DEV_HTTPS=true` in the repo-root `.env`, set `PUBLIC_HOSTNAME` to the matching
HTTPS origin, and export `DEV_TLS_CERT` plus `DEV_TLS_KEY` from your local
shell/profile. The frontend Vite dev server reads those two certificate
variables only when `DEV_HTTPS=true`; keep machine-specific certificate paths
out of committed files and repo-local example files.

For lower-level debugging, start the dependency containers separately, then run
the source processes in the foreground:

```bash
mise run dev:deps:start
mise run dev:mail-control
pnpm dev
```

The source-development runtime reads configuration from the repo-root `.env`.
Docker Compose self-hosting uses `.env.compose` and the `stack:*` tasks instead.

Run the production-like local stack through the Compose-backed stack tasks:

```bash
mise run stack:env
mise run stack:up
mise run stack:status
mise run stack:smoke
```

`stack:env` creates `.env.compose` from
`docs/examples/compose/.env.example` when missing. Review `.env.compose` before
starting the stack; it is ignored by Git and is separate from the source-dev
`.env` file.

`stack:up` uses the root `compose.yaml` plus `compose.build.yaml`, builds the
first-party web server and mail control service images locally, and starts the
single-host stack with MongoDB, Redis, WildDuck, Haraka, Rspamd, ZoneMTA, the
mail control service, and the web server.

Inspect or stop the production-like local stack with:

```bash
mise run stack:config
mise run stack:logs
mise run stack:down
```

The legacy `deploy`, `deploy:build`, and `deploy:start` task names are aliases
for the production-like local stack tasks.

## Repo-Built Images

The repository currently builds these local images:

- `apps/mail-control-service/Containerfile` builds the Mail Control Service
  image.
- `apps/web-server/Containerfile` builds the web server image.
- `apps/at-email-cli/Containerfile` builds the at-email CLI image.

Repo-owned local image repositories derive from `WT`:

```text
atemail.<WT>.mail-control-service:stage
atemail.<WT>.web-server:stage
atemail.<WT>.at-email-cli:stage
atemail.<WT>.at-email-cli-test:stage
```

Repo-owned local container names and image repositories must use the
`atemail.<WT>.<resource>` form.

Build the images directly with:

```bash
mise run //apps/mail-control-service:image:build
mise run //apps/web-server:image:build
mise run //apps/at-email-cli:image:build
```

Build the complete Helm/kind E2E image set with:

```bash
mise run //test-containers/kind-e2e:images:build
```

The kind E2E task is for Helm chart and Kubernetes packaging coverage. It is
not required for ordinary Compose or no-DB Compose development testing. It
derives the default kind cluster, namespace, and Helm release from the same
slug. Pulled runtime images such as MongoDB, Redis, Mailpit, WildDuck, Haraka,
ZoneMTA, and Rspamd are not rebuilt by this repo and are not worktree-scoped.

## Validation Commands

Run validation from the repository root after `mise install` and `pnpm install`.
Use the scoped checks for the area you changed, then run the broader checks
before a release or public handoff.

### Node Workspace

Use Corepack-managed `pnpm` for TypeScript, frontend, and package validation:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Run repo unit tests through the aggregate task:

```bash
mise run test
```

This aggregate runs workspace package tests and Mail Control Service Go tests.
End-to-end test-container packages are excluded from the unit aggregate and run
through `mise run test:e2e`.

Apply package-owned formatting with:

```bash
pnpm format
```

For Markdown, YAML, JSON, TOML, or other config files that are outside package
format scripts, run targeted Prettier checks:

```bash
pnpm exec prettier --check <changed files>
pnpm exec prettier --write <changed files>
```

Validate static YAML files with:

```bash
mise run lint:yaml
```

When API or RPC contracts change, regenerate the committed contract output:

```bash
mise run typegen
```

### Package-Scoped Node Checks

Use package filters for a faster check when a change is isolated:

```bash
pnpm --filter @main/frontend typecheck
pnpm --filter @main/frontend lint
pnpm --filter @main/backend test
pnpm --filter @main/common test
pnpm --filter @main/web-server test:integration
```

Validate and debug changed frontend screens and interactions with Playwright CLI
from the repository root after starting the relevant dev or preview server:

```bash
pnpm playwright-cli
```

Run Storybook for frontend component development and visual validation with:

```bash
pnpm --filter @main/frontend storybook
```

### Mail Control Service Go Checks

The Mail Control Service owns its Go tasks in
`apps/mail-control-service/mise.toml`.

```bash
mise run //apps/mail-control-service:fmt:check
mise run //apps/mail-control-service:mod:check
mise run //apps/mail-control-service:test
```

Run the service-owned mail-control E2E smoke suite with:

```bash
mise run //apps/mail-control-service:test:e2e
```

The aggregate Go validation command is:

```bash
mise run //apps/mail-control-service:check
```

Use the mutating Go maintenance tasks when formatting or module files need to be
updated:

```bash
mise run //apps/mail-control-service:fmt
mise run //apps/mail-control-service:mod:tidy
```

### at-email CLI Checks

The at-email CLI owns its Go, container, and npm package validation tasks in
`apps/at-email-cli/mise.toml`.

```bash
mise run //apps/at-email-cli:fmt:check
mise run //apps/at-email-cli:mod:check
mise run //apps/at-email-cli:test
mise run //apps/at-email-cli:release:check
mise run //apps/at-email-cli:release:npm:check
mise run //apps/at-email-cli:release:plugins:check
mise run //apps/at-email-cli:skills:check
```

`release:npm:check` builds a GoReleaser snapshot, generates the npm
distribution packages, validates and packs them, and smoke-tests the generated
Linux npm package on glibc and musl Node images.

`release:plugins:check` builds a GoReleaser snapshot, generates the versioned
Claude Code and Codex plugin bundles, validates the generated manifests and
skill copies, and packs the release tarballs.

`skills:check` validates the canonical root skill under `skills/at-email-cli`,
and confirms that `skills.sh.json` lists the skill for marketplace/tap
discovery.

### Helm Chart

The chart validation tasks live in `charts/mise.toml`.

```bash
mise run //charts:lint
mise run //charts:template
mise run //charts:check
```

### Docs

The Mintlify docs validation tasks live in `docs/mise.toml`.

```bash
mise run //docs:dev
mise run //docs:snippets
mise run //docs:validate
mise run //docs:broken-links
mise run //docs:check
```

### Compose And E2E

Validate Compose rendering with the example environment when Compose files or
required environment values change. Use the Compose CLI for your container
engine:

```bash
podman-compose --env-file docs/examples/compose/.env.example -f compose.yaml config
docker compose --env-file docs/examples/compose/.env.example -f compose.yaml config
podman-compose --env-file docs/examples/compose/.env.example -f compose.yaml -f compose.build.yaml config
docker compose --env-file docs/examples/compose/.env.example -f compose.yaml -f compose.build.yaml config
```

For the local production-like stack, use the repo-owned wrapper task:

```bash
mise run stack:config
```

Run all end-to-end suites through the aggregate root task:

```bash
mise run test:e2e
```

Run an individual suite through its owning test-container task:

```bash
mise run //test-containers/auth-e2e:test
mise run //apps/mail-control-service/test-containers/inbound-replay-smoke-e2e:test
mise run //test-containers/cloudflare-oauth-e2e:test
mise run //test-containers/kind-e2e:test
mise run //test-containers/full-stack-e2e:test
```

The kind E2E task uses `WT` to scope local image names, the kind cluster,
namespace, and Helm release. Treat kind as a Helm packaging test harness, not
as the default local dev stack.

The full-stack E2E task is currently a kind-backed P1 contract suite for the
Helm-deployed stack, the web-server-only public boundary, and full
inbound/outbound mail-flow contracts. Treat it as Helm/Kubernetes coverage until
a Compose/Testcontainers full-stack successor exists. Failures in this suite
should be triaged through the failing runtime boundary.

### Shell And Diff Hygiene

Check changed shell scripts directly:

```bash
bash -n <changed shell scripts>
shellcheck <changed shell scripts>
```

Before committing or handing off, check for whitespace and patch formatting
issues:

```bash
git diff --check
git status --short
```
