# at-email CLI

Portable Go CLI for working with an AgentTeam Email mailbox through the
AgentTeam Email webserver.

## Configuration

Mailbox commands require a local Agent Auth credential:

```bash
at-email agent connect
at-email agent trial
at-email agent enroll TOKEN
```

`agent connect` creates or reuses a local host key, requests delegated Agent
Auth access, and stores a separate agent credential after browser approval. The
approving user selects the organization in the web app. `agent trial` starts an
autonomous trial agent with a server-provisioned trial mailbox and prints a
claim URL. Use `agent trial --post-claim-capability CAPABILITY` to request
capabilities the human reviews when claiming the trial agent. `agent enroll TOKEN`
uses a human-created enrollment token from the web app. Mailbox commands
sign requests to the webserver and do not read or send WildDuck or mail-control
credentials.

`auth login` opens the complete Better Auth verification URL in a browser by
default. Use `auth login --device` for code-entry login, or
`auth login --no-open` to copy the complete URL without opening a browser.

The CLI also reads:

- `AT_EMAIL_API_BASE_URL` (optional app origin for auth and agent enrollment)
- `AT_EMAIL_MAILBOX_ADDRESS` (optional authorized mailbox selector)

## Commands

Every command has scoped help:

```bash
at-email <command> --help
```

```bash
at-email status
at-email inbox --unseen
at-email read 7
at-email search invoice --json
at-email agent connect --mailbox-address support@example.com
at-email agent trial
at-email send --to alice@example.net --subject Hello --body 'Hi there'
at-email reply 7 --body 'Thanks, received.'
at-email version
at-email self-update
at-email skill > at-email-cli/SKILL.md
```

`send` accepts an intentionally empty subject with `--subject=`. Message bodies
from `--body`, `--body-file`, or stdin must be valid UTF-8.

`skill` prints the bundled Codex skill markdown to stdout and does not require
mailbox runtime configuration. Pipe it to the target skill directory when a
runtime has the CLI binary but not the skill file installed.

When installed from npm through `@agentteamhq/email`, the JavaScript wrapper sets
`AT_EMAIL_DISTRIBUTION=npm`. In that distribution, `self-update` is disabled
because npm owns the installed package version. Update notices still run, but
they tell users to update the npm package instead of running `self-update`.

In text mode, interpreted usage, configuration, and operation errors print to
stdout and stderr stays quiet. With `--json`, successful JSON is written to
stdout; failures keep stdout clean and write concise errors to stderr.

Exit codes:

- `0`: success
- `1`: normal API or operation failure
- `2`: usage error
- `69`: service unavailable or unreachable before a valid service response
- `70`: malformed service response or protocol mismatch
- `78`: missing runtime configuration

## Local Checks

From this directory:

```bash
mise run fmt:check
mise run mod:check
mise run test
mise run check
mise run image:test
mise run skills:check
```

For direct host Go debugging, run `mise run skills:stage` first so the ignored
`SKILL.md` needed by `go:embed` exists in this package directory.

## Builds

The canonical build is containerized for reproducibility and multi-architecture
image support. Do not use host-local `go build` for normal workflows.

Container checks and builds:

```bash
mise run image:test
mise run image:build
mise run release:check
mise run release:snapshot
mise run release:npm:check
mise run release:plugins:check
mise run skills:check
```

Release assets are built with GoReleaser from `.goreleaser.yml`. Release builds
stamp `version`, `commit`, and `date` into the CLI and attach raw binaries plus
`checksums.txt` to the GitHub Release.

## Direct Install

Install the latest GitHub Release binary directly:

```bash
curl -fsSL https://raw.githubusercontent.com/agentteamhq/agentteam-email/main/apps/at-email-cli/install.sh | sh
```

Install a specific release or target directory:

```bash
curl -fsSL https://raw.githubusercontent.com/agentteamhq/agentteam-email/main/apps/at-email-cli/install.sh | sh -s -- --version v0.1.0
curl -fsSL https://raw.githubusercontent.com/agentteamhq/agentteam-email/main/apps/at-email-cli/install.sh | sh -s -- --bin-dir PATH
```

## npm Distribution

The release workflow generates npm packages from GoReleaser output under
`dist/npm/`, packs them under `dist/npm-packages/`, and publishes platform
packages before the root package.

The user-facing package is:

```bash
npx @agentteamhq/email
```

It exposes `at-email`, `atemail`, `agentteam-email`, and `email` command aliases
that all run the same CLI wrapper. It depends on platform packages such as
`@agentteamhq/email-linux-x64-gnu`, `@agentteamhq/email-linux-x64-musl`,
`@agentteamhq/email-darwin-arm64`, and `@agentteamhq/email-win32-x64`. The Linux
glibc and musl packages contain the same static Go binary, but publish separate
npm package metadata so package managers can install the exact platform target.

## Plugin Bundle Distribution

The release workflow also generates version-stamped Claude Code and Codex plugin
bundles from the canonical skill at `skills/at-email-cli/SKILL.md`.

Generated bundle directories are written under `dist/plugins/`, and packed
release tarballs are written under `dist/plugin-bundles/`:

```text
at-email_X.Y.Z_claude-plugin.tar.gz
at-email_X.Y.Z_codex-plugin.tar.gz
```

Each bundle contains one plugin root named `at-email`, a host-specific plugin
manifest, `skills/at-email-cli/SKILL.md`, and `LICENSE`. Marketplace JSON files
are intentionally handled separately from this release bundle generator.

## Skill Marketplace Discovery

The root skill at `skills/at-email-cli/SKILL.md` is canonical for the Go binary,
plugin bundles, and marketplace/tap discovery. Do not commit an app-local skill
copy under this directory. Host release builds stage an ignored copy with
`mise run skills:stage`.

Validate the skill discovery setup with:

```bash
mise run skills:check
```

Direct install paths:

```bash
npx skills add https://github.com/agentteamhq/agentteam-email/tree/main/skills/at-email-cli
hermes skills install agentteamhq/agentteam-email/skills/at-email-cli
```

Repository tap discovery:

```bash
hermes skills tap add agentteamhq/agentteam-email
```

Skill marketplace publishing is manual. See the root
`SKILL-PUBLISHING.md` runbook for skills.sh, Hermes, ClawHub/OpenClaw, and
LobeHub update steps. The ClawHub publish shape is:

```bash
npx --yes clawhub@latest skill publish skills/at-email-cli --owner agentteamhq --dry-run
npx --yes clawhub@latest skill publish skills/at-email-cli --owner agentteamhq
```
