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

Before changing existing product concepts, architecture boundaries, route
surfaces, authentication terms, integration terms, account/domain ownership, or
settings semantics, agents must read [ARCHITECTURE.md](ARCHITECTURE.md) and
preserve the vocabulary and ownership model defined there.

## Fixes And Failures

When fixing a bug, test failure, CI failure, or broken workflow, agents must
restore the intended system contract at the layer that owns it. Agents must not
infer the contract from the error message or current broken code alone; they must
investigate the relevant requirements and architecture first. If the intended
contract is unclear, agents must ask before editing. Agents must not use
workarounds or weakened paths unless explicitly requested. Agents must verify
through the canonical workflow that proves the contract.

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

This applies to all repository code and workflows, including application code,
tests, scripts, probes, diagnostics, harnesses, generators, containers, and
tooling.

Agents must not hand-roll behavior covered by this rule. If the required package
is unavailable, agents must stop and request approval to add it or request an
explicit exception.

## Type Ownership

Agents must preserve strict types from their owning source instead of redefining
or weakening them locally.

Code must import upstream package types, generated contract types, or exported
workspace types from the owning package.

## Authorization

Permissions must be modeled as strict backend-owned TypeScript/Zod contracts and
enforced through CASL Ability.

Each protected domain object must have its own typed permission schema, CASL
subject, ability builder, and helper surface when its authorization semantics
differ.

Frontend labels, Storybook fixtures, OAuth scopes, and ad hoc booleans must not
define or enforce permission semantics.

## Generated Outputs

Generated outputs must not be manually edited. Agents must update the owning
source, configuration, or inputs and rerun the process that generates them.

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

Runtime code must be diagnostically instrumented by default.

Agents must add or preserve safe structured logging when changing application
behavior. Code paths that fail, branch on meaningful decisions, mutate durable
state, cross process, service, or provider boundaries, enqueue or run work, or
affect user-visible outcomes must emit logs sufficient to diagnose what happened.

Absence of logging in changed runtime code must be intentional and limited to
purely declarative, generated, type-only, or otherwise diagnostically empty code.

Application logs must be structured, safe to emit, and recorded at the boundary
that owns the behavior or failure.

Logs must include stable correlation fields when available and must not expose
secrets, cookies, raw credentials, or broad payload dumps.

Node runtime diagnostics must use the `debug` package with the existing package
and domain namespace pattern. Application diagnostics must not use ad hoc
`console` logging.

## Frontend

Frontend UI must use the repo's shadcn/ui primitives from the configured
`components/ui` package path.

Frontend product icons must use `@phosphor-icons/react`.

New or substantially changed app screens, workflows, and reusable frontend
components must include Storybook coverage for meaningful UI states.

Every production-reachable user-visible screen state must be represented in
Storybook. Production frontend code must not render user-visible UI states,
status messages, empty states, success states, error states, loading states,
gated states, or workflow steps that are absent from the owning Storybook screen
catalog.

Storybook screen stories and production routes must render the same route,
page, controller, or canonical component contract. Storybook may mock loader,
RPC, API, or service data at the boundary, but must pass that data into the same
owner used by the app instead of recreating layout, component hierarchy, state
transitions, or product behavior separately.

Product UI copy and fixtures must describe current product behavior with
realistic data.

Screen components must keep route, auth, API, mutation, navigation, and global
event wiring in the owning route or controller layer.

## Exceptions

Exceptions to these rules must be explicitly approved by the human operator.

Approved exceptions must be documented in the relevant code or project
documentation with the approval context.
