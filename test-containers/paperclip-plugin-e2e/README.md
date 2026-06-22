# Paperclip Plugin E2E And Sandbox

This harness owns two workflows for the AgentTeam Email Paperclip plugin.

These are containerized workflows. Set the repo-local `WT` value described in
`SETUP.md` before running them. Default containers are named from that slug:
`atemail.${WT}.paperclip-plugin` and
`atemail.${WT}.paperclip-plugin-preview`.

## Smoke E2E

The normal test path builds the plugin, validates the generated Paperclip
manifest, checks the worker and UI bundle entrypoints, and writes a synthetic
install record under `tmp/run-*`.

```bash
mise run //test-containers/paperclip-plugin-e2e:test
```

This task is part of the root `test:e2e` aggregate.

## Tryable Sandbox

The sandbox path starts a long-lived Paperclip instance in an isolated
container, mounts this repository read-only, builds the local plugin, installs
it into Paperclip, and persists Paperclip runtime data in named container
volumes. Generated config, status, seed, and smoke artifacts are written under
ignored `test-containers/paperclip-plugin-e2e/tmp/sandbox/`.

Start it from the repository root:

```bash
mise run paperclip-plugin:start
```

Open Paperclip at:

```text
http://127.0.0.1:4179
```

Useful commands:

```bash
mise run paperclip-plugin:status
mise run paperclip-plugin:smoke
mise run paperclip-plugin:install
mise run paperclip-plugin:seed
mise run paperclip-plugin:logs
mise run paperclip-plugin:stop
```

`paperclip-plugin:start` is idempotent: if the sandbox is already running and
the plugin is ready, it leaves the existing install alone.

`paperclip-plugin:install` rebuilds the local plugin, purges the existing
sandbox plugin install, and installs the local package again after code
changes.

On first start, the sandbox seeds an example Paperclip workspace when no
companies exist. The seed creates the `AgentTeam Email Preview` company,
example CEO and email-ops agents, a goal, a project, and two issues so the UI
opens into useful demo data without browser signup.

`paperclip-plugin:seed` reruns that first-start seed check against the running
sandbox. It is a no-op when any company already exists.

`paperclip-plugin:stop` removes the container but preserves sandbox volumes.
`paperclip-plugin:reset` removes the container, sandbox volumes, and ignored
artifacts.

The sandbox defaults are overrideable:

```bash
PAPERCLIP_SANDBOX_PORT=4180 mise run paperclip-plugin:start
PAPERCLIP_SANDBOX_DB_PORT=54180 mise run paperclip-plugin:start
PAPERCLIP_SANDBOX_SEED=false mise run paperclip-plugin:start
```

If overriding `PAPERCLIP_SANDBOX_CONTAINER`, keep the value scoped to the
worktree `WT` from `SETUP.md`.

The default sandbox volumes are `atemail.${WT}.paperclip-plugin.data` and
`atemail.${WT}.paperclip-plugin.home`. Override them with
`PAPERCLIP_SANDBOX_DATA_VOLUME` and `PAPERCLIP_SANDBOX_HOME_VOLUME` only when
the names remain scoped to the worktree `WT` from `SETUP.md`.

The sandbox uses `CONTAINER_ENGINE`, defaulting to `podman`. It runs Paperclip
in local-trusted mode with host networking so Paperclip can bind the host
loopback interface required by that mode. The container runs as the current
host UID/GID because embedded Postgres refuses to run as root. With Podman,
the harness also uses `--userns keep-id` so ignored sandbox files stay writable
inside the container.

## LAN Preview

The preview path starts the normal local-trusted sandbox, then starts a Caddy
container that listens on the LAN and reverse-proxies to the sandbox loopback
port. This is a test/demo proxy with no auth layer. Caddy runtime data is
persisted in named container volumes, while generated Caddyfile, status, and
smoke artifacts are written under ignored
`test-containers/paperclip-plugin-e2e/tmp/preview/`.

Start the preview from the repository root:

```bash
mise run paperclip-plugin:preview:start
```

The local preview URL is:

```text
http://127.0.0.1:4180
```

The status command prints detected LAN URLs:

```bash
mise run paperclip-plugin:preview:status
```

Useful commands:

```bash
mise run paperclip-plugin:preview:smoke
mise run paperclip-plugin:preview:logs
mise run paperclip-plugin:preview:stop
mise run paperclip-plugin:preview:reset
```

`paperclip-plugin:preview:start` is idempotent and depends on
`paperclip-plugin:start`, so the local plugin is built and installed before the
LAN proxy starts.

The preview defaults are overrideable:

```bash
PAPERCLIP_PREVIEW_PORT=4181 mise run paperclip-plugin:preview:start
PAPERCLIP_PREVIEW_BIND=0.0.0.0 mise run paperclip-plugin:preview:start
```

If overriding `PAPERCLIP_PREVIEW_CONTAINER`, keep the value scoped to the
worktree `WT` from `SETUP.md`.

The default preview volumes are `atemail.${WT}.paperclip-plugin-preview.data`
and `atemail.${WT}.paperclip-plugin-preview.config`. Override them with
`PAPERCLIP_PREVIEW_DATA_VOLUME` and `PAPERCLIP_PREVIEW_CONFIG_VOLUME` only when
the names remain scoped to the worktree `WT` from `SETUP.md`.
