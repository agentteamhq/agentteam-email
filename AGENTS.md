# Agent Requirements

## Documentation

Agents must keep `AGENTS.md` limited to durable workflows and read or update the
owning documentation before changing documented behavior.

Agents must not edit any `AGENTS.md` file without explicit current-task approval
for that specific file.

Before work involving authentication, authorization, Better Auth, credentials,
encryption, sessions, cookies, API keys, tokens, JWT, OAuth, JWKS, secret
storage, security-sensitive routes, or anything that could be security related,
agents must stop, read [SECURITY.md](SECURITY.md), and follow it.

## Open Source Boundary

This repository is open source. Repository files must not contain secrets,
private operational context, private hostnames, private repository names,
credentials, tokens, absolute paths, or paths that resolve outside the
repository root.

Every path written into a repository file must be relative to the repository
root.

Agents must not write developer-machine, worktree-specific, temporary-checkout,
or local-clone paths into repository files. Do not include the output of
`git rev-parse --show-toplevel` in committed content.

When the repository root is unclear, agents must run
`git rev-parse --show-toplevel` to identify it, verify the target path is inside
that root, and write only the repository-root-relative path.

## Standards And Structured Formats

Standard, protocol, common-format, and syntax-governed functionality must use
purpose-built structured APIs from well-supported canonical packages.

## Type Ownership

Agents must preserve strict types from their owning source instead of redefining
or weakening them locally.

Code must import upstream package types, generated contract types, or exported
workspace types from the owning package.

## Generated Contracts

Generated database, API, OpenAPI, RPC, DTO, route, and protocol artifacts must be
changed by updating the owning source contract and running the canonical
generator.

## Definitions And Defaults

Definitions must have one owner.

Consumers must read, reference, derive from, or generate from the owning
definition.

Required inputs must fail fast with clear errors when missing or invalid.

Defaults must live only in the owning configuration surface.

## Build And Tasks

Agents must use [SETUP.md](SETUP.md) for checkout setup, `WT` worktree identity,
repo-managed tool installation, and validation command selection.

Before adding or changing containerized workflows, agents must follow
[SETUP.md](SETUP.md) instructions.

Node and frontend workflows must use Corepack-managed `pnpm` scripts from the
relevant package.

Root `mise.toml` owns shared tool pins, repo-wide workflows, and broad aggregate
tasks; scoped app, chart, docs, and test-container workflows are owned by the
nearest relevant `mise.toml` and invoked with explicit monorepo task paths.

Root `package.json` owns workspace-wide Node workflows; app-specific and
test-container-specific Node commands live in the owning package and are invoked
through package filters or the owning `mise` task.

Canonical formatting, build, test, typecheck, lint, dependency, and runtime
failures must be triaged through the failing workflow.

Direct tool invocations are allowed for debugging, diagnosis, or workflows that
are not owned by a package script or `mise` task.

## Database

Database schema changes must start in the owning schema package.

Migration or schema generation must be run only through the canonical package
workflow and only when the current task authorizes generation.

## Dependencies

Dependency changes must follow `PEER-DEPS.md`.

Installing a package requires current-task approval for that specific package.

The root `pnpm-workspace.yaml` owns workspace package boundaries, catalogs, peer
rules, package-manager strictness, and minimum release age.

DO NOT EDIT `.pnpmfile.cjs` WITHOUT EXPLICIT CURRENT-TASK APPROVAL.

Dependency versions must be exact except where `PEER-DEPS.md` defines a peer or
workspace protocol.

`pnpm-lock.yaml` and install artifacts must be maintained by normal `pnpm
install` from the repo root.

Cross-package imports must use the referenced package's declared public exports.

## Runtime And Environment

Shared code must receive environment-specific origins, ports, credentials,
storage paths, providers, and debug behavior through explicit configuration.

Local database, mail, container, deploy, and service runtime workflows must use
the repo-owned task or script that owns that lifecycle.

## Testing

Tests must protect externally meaningful behavior, integration points,
contractual service behavior, realistic failures, and regressions.

Regression fixes must start with a failing behavior-level reproduction and end
with that reproduction passing.

End-to-end tests must exercise the real service boundary with repo-owned runtime
configuration and controlled external-provider mocks.

Frontend changes must include visual validation for changed screens,
components, and interactive workflows.

## Logging

Application logs must be structured, safe to emit, and recorded at the boundary
that owns the failure.

Logs must include stable correlation fields when available and must not expose
secrets, cookies, raw credentials, or broad payload dumps.

## Frontend

Frontend UI must use the repo's shadcn/ui primitives from the configured
`components/ui` package path.

Frontend product icons must use `@phosphor-icons/react`.

New or substantially changed app screens, workflows, and reusable frontend
components must include Storybook coverage for meaningful UI states.

Product UI copy and fixtures must describe current product behavior with
realistic data.

Screen components must keep route, auth, API, mutation, navigation, and global
event wiring in the owning route or controller layer.

## Exceptions

Exceptions to these rules must be explicitly approved by the human operator.

Approved exceptions must be documented in the relevant code or project
documentation with the approval context.
