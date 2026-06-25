# AgentTeam Email

Paperclip plugin package for connecting a Paperclip instance to the AgentTeam
Email provisioning service.

The current package is a scaffolded connector with:

- a Paperclip manifest and worker entrypoint
- an operator config schema for advanced service URL and API key secret
  reference setup
- a custom settings page with a branded AgentTeam Email connect handoff and
  advanced self-hosting fields
- a dashboard widget backed by worker data/action handlers
- Vite, esbuild, declaration emit, and API Extractor build wiring

The worker does not resolve secrets, store OAuth tokens, or call the upstream
service directly. The connect action returns an AgentTeam Email-owned URL so
OAuth clients, callbacks, tokens, grants, and mailbox policy remain server-side.
Runtime email tool execution currently shells out to `at-email paperclip-tool`
and uses local Agent Auth credentials to call the AgentTeam Email webserver.
See `OAUTH_AND_PERMISSION_TODO.md` for the remaining credential and per-agent
provisioning work.

## Development

```bash
pnpm --filter @agentteam/paperclip-email-plugin build
pnpm --filter @agentteam/paperclip-email-plugin typecheck
mise run //test-containers/paperclip-plugin-e2e:test
```

`pnpm dev` rebuilds the Paperclip worker, manifest, and UI bundles into `dist/`.
When this package is installed from a local path, Paperclip watches the rebuilt
output and reloads the plugin worker.

## Try In Paperclip

Use the isolated sandbox when you want a running Paperclip instance with this
local plugin installed:

The sandbox and LAN preview are containerized workflows. Set the repo-local
`WT` value described in `SETUP.md` before running them.

```bash
mise run paperclip-plugin:start
```

Paperclip will be available at `http://127.0.0.1:4179`. On first start, the
sandbox seeds an example workspace when no companies exist, so the UI opens
with demo agents, a goal, a project, and issues for trying the local plugin.

For LAN preview access through the test proxy:

```bash
mise run paperclip-plugin:preview:start
```

The preview status command prints the detected LAN URLs:

```bash
mise run paperclip-plugin:preview:status
```

After code changes, reinstall the rebuilt local plugin into the running
sandbox:

```bash
mise run paperclip-plugin:install
```

To rerun the first-start seed check against a running sandbox:

```bash
mise run paperclip-plugin:seed
```

Stop the sandbox when finished:

```bash
mise run paperclip-plugin:stop
```

## Install Into Paperclip

Build first, then install the package folder into a running local Paperclip
instance:

```bash
pnpm --filter @agentteam/paperclip-email-plugin build
paperclipai plugin install ./packages/paperclip-email-plugin --local
```
