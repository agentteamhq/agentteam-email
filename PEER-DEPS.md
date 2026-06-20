# Peer Dependency Resolution Guide

This monorepo uses pnpm strict peer dependencies with workspace injection. All
library packages are compiled with Vite, which externalizes all dependencies.
The compiled output contains bare import specifiers — at runtime, Node.js
resolves them from the consumer's `node_modules`. This means library packages
need zero `dependencies`; everything is either `devDependencies` (build-time) or
`peerDependencies` (runtime contract).

The production Node entrypoint package is the package deployed into the runtime
container. It provides the concrete runtime dependencies for imported workspace
packages.

## Workspace Settings

```yaml
# pnpm-workspace.yaml
catalogMode: strict # Workspace packages MUST use catalog: protocol
injectWorkspacePackages: true # Required for pnpm deploy — copies packages instead of symlinking
strictPeerDependencies: true # Missing peers are errors, not warnings
autoInstallPeers: false # Peers are never auto-installed — must be explicit
resolvePeersFromWorkspaceRoot: false # Each package must satisfy its own peers
```

- `resolvePeersFromWorkspaceRoot: false` ensures `pnpm install` catches missing peers immediately, not just at deploy time.
- `autoInstallPeers: false` + `strictPeerDependencies: true` together mean peers won't silently appear — every peer must be explicitly declared.
- `injectWorkspacePackages: true` is required for `pnpm deploy` to work. It also means `pnpm fetch` needs all `package.json` files present.
- `frozenLockfile` is NOT a valid `pnpm-workspace.yaml` setting. Use the
  `--frozen-lockfile` CLI flag in canonical install workflows.

## Library Package Rules

All package-local modules under `packages/` follow these rules unless a package
has a documented exception in this file. This includes shared backend packages,
shared utility packages, and any Vite/TanStack frontend application package
created under `packages/`.

1. **`dependencies: {}`** — always empty. Vite externalizes everything, so nothing is bundled. The compiled output relies on the consumer to provide all imports at runtime.
2. **`devDependencies`** — `"catalog:"` for npm packages, `"workspace:*"` for workspace packages. Needed for building and typechecking.
3. **`peerDependencies`** — `"*"` for npm packages, `"workspace:*"` for workspace packages. Declares the runtime contract.
4. **Transitive propagation** — if package A peers on B, and B peers on C, then A must also declare C in both devDeps and peerDeps.

### Dependency chain example

```
package-a                     → runtime-lib in devDeps (catalog:) + peerDeps (*)
  ↓ (package-b peers on package-a)
package-b                     → runtime-lib in devDeps (catalog:) + peerDeps (*)
  ↓ (entrypoint package depends on package-b)
entrypoint package            → runtime-lib in dependencies (catalog:)
```

### Frozen versions

All versions are **exact** — no caret (`^`), no tilde (`~`), no range operators. This ensures `pnpm install` never changes resolved versions. Upgrades are done manually by editing the exact version number in the catalog or root `package.json`.

- **Catalog entries:** `x.y.z` (not `^x.y.z`)
- **Root `package.json`:** `x.y.z` (not `^x.y.z`)
- **`peerDependencies`:** `*` or `workspace:*` (unchanged — peers are version-agnostic contracts)

When upgrading a dependency, update the exact version in the catalog. All workspace packages using `catalog:` will pick up the new version on the next `pnpm install`.

### Where versions live

| Section                                  | Version value               | Purpose                                  |
| ---------------------------------------- | --------------------------- | ---------------------------------------- |
| `catalog:` entry                         | `x.y.z`                     | Single source of truth — exact version   |
| `devDependencies`                        | `catalog:`                  | Build/typecheck resolution               |
| `peerDependencies`                       | `*` or `workspace:*`        | Runtime contract — consumer provides     |
| `dependencies` (entrypoint package only) | `catalog:` or `workspace:*` | Actually provides the package at runtime |

## App Packages

| Package type                                  | Role                                         | Dependency style                                                                                                                    |
| --------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Production Node entrypoint package            | Deploy wrapper and runtime package provider  | Real `dependencies` — provides every runtime package needed by imported workspace packages                                          |
| Frontend or SSR app package under `packages/` | Vite/TanStack source and build package       | Library package rules — `devDependencies` + `peerDependencies`, with runtime packages provided by the production entrypoint package |

The production entrypoint package is not a normal package-local development server.
Routine frontend development may run package-local Vite/TanStack dev servers
as needed, and those package-local dev scripts resolve through their
`devDependencies`. Production and production-like validation must build and
deploy the standalone entrypoint graph.

Do not add concrete `dependencies` to a package under `packages/` just because
it has a Vite dev server, an SSR build entry, or server-side source files. If
deployed code imports a runtime package, declare that package in the originating
package's `devDependencies` and `peerDependencies`, propagate the peer up the
workspace dependency chain, and provide the concrete package from
the production entrypoint package.

## Root Package

Root `devDependencies` contain project-wide tooling: eslint, typescript, prettier, api-extractor, vitest, turbo, rimraf. These are available to all packages via root `node_modules/.bin` without per-package installation.

**Exception: vite** must be in each package's `devDependencies` individually (via `catalog:`) because Vite plugins may require specific versions, and version conflicts can occur.

Root-only tooling (eslint plugins, prettier plugins, etc.) should NOT have catalog entries. The catalog is only for packages referenced with `catalog:` in workspace `package.json` files. Root `package.json` can use direct version strings for its own deps.

## Ignoring Optional Peers

Third-party packages may declare peers we don't use. Handle unused peer entry
points in `pnpm-workspace.yaml`:

```yaml
peerDependencyRules:
  ignoreMissing:
    - '@daveyplate/better-auth-tanstack'
    - '@instantdb/react'
    - '@tanstack/react-query'
    - '@triplit/client'
    - '@triplit/react'
    - '@types/node'
```

**Important:** Only ignore peers that are in **separate unused entry points** of
the third-party package. If a peer is statically imported by the entry point the
app consumes, it must be provided because Rollup/Vite will fail to resolve it
during builds. If a UI/auth package is consumed through checked-in generated
components, keep peer handling in the consuming packages; do not introduce an
alternate local package solely to satisfy peer metadata.

**DO NOT EDIT `.pnpmfile.cjs` WITHOUT EXPLICIT CURRENT-TASK APPROVAL.**
Peer exceptions belong in `pnpm-workspace.yaml` unless the human operator
explicitly approves a pnpmfile change for the current task. Do not mutate
third-party package metadata in `.pnpmfile.cjs` as a peer-dependency workaround.

## Selective Type Packages

### `@types/node`

Only add to packages that actually use Node.js APIs (`node:os`, `node:path`,
`node:fs`, etc.). List it in `ignoreMissing` so packages without it do not error
when a transitive dependency peers on it.

## Commands

### Verify dependency resolution

```bash
# Use this after changing package.json, pnpm-workspace.yaml, or lockfile inputs.
pnpm install
```

Agents must not run `pnpm i --resolution-only` or
`pnpm install --resolution-only`. Dependency validation must use a normal
`pnpm install` from the workspace root so the lockfile, install
artifacts, `.pnpmfile.cjs`, and strict workspace policy are exercised together.

### Test deploy resolution

```bash
# Creates a standalone production install — the real test
pnpm --filter-prod <entrypoint-package> --prod deploy /tmp/pnpmdeploy
```

### Inspect dependencies

```bash
# See why a package is installed
pnpm why <package-name>

# List direct deps of a specific package
pnpm ls --filter=<workspace-package> --depth=1
```

## When Adding a New Dependency to a Library Package

1. Add the version to `catalog:` in `pnpm-workspace.yaml` (if not already there)
2. In the package that uses it:
   - `devDependencies`: `"package": "catalog:"`
   - `peerDependencies`: `"package": "*"`
3. Walk up the dependency chain — every package that peers on yours must also declare the new peer in both devDeps and peerDeps
4. Add to the production entrypoint package `dependencies` as `"catalog:"` or
   `"workspace:*"` so production provides the runtime package.
5. Add to any app/build package that directly consumes it, following that
   package's dependency style.
6. Run `pnpm install` from the workspace root to verify dependency
   resolution and update pnpm-managed artifacts

## When Removing a Dependency

1. Remove from the originating package's devDeps + peerDeps
2. Remove from all packages up the dependency chain (devDeps + peerDeps)
3. Remove from the production entrypoint package dependencies and from any
   app/build package that directly consumed it
4. If no workspace package references it via `catalog:`, remove from catalog
5. If it's an unwanted third-party peer, add to `peerDependencyRules.ignoreMissing`
6. Run `pnpm install` from the workspace root to verify dependency
   resolution and update pnpm-managed artifacts

## When Upgrading Dependencies

The workspace enforces `minimumReleaseAge: 14400` (10 days). Packages published less than 10 days ago will be rejected by `pnpm install`.

```bash
# Check for available updates across the workspace
pnpm taze major -r -l

# The rightmost time column shows how old the NEW version is
# Only upgrade packages where the new version is at least 10 days old
```

1. Run `pnpm taze major -r -l` to list available updates
2. Update exact versions in the catalog (`pnpm-workspace.yaml`) and/or root `package.json` — no `^` or `~`
3. Skip any package where the new version is under 10 days old (will fail `minimumReleaseAge`)
4. For non-catalog deps, update directly in the package's `package.json`
5. Run `pnpm install` — if a package fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, revert that specific version and re-run
6. The `trustPolicyIgnoreAfter: 10080` (1 week) setting skips trust checks for packages older than 1 week — if a trust downgrade error occurs for a very recent package, wait or revert
