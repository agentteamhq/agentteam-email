# Mail Control Service Command Rules

These rules apply to `cmd/agent-mail-control-service/`.

## Command Boundary

- The command package must stay a thin dispatcher for Mail Control Service startup
  and the `fastpath-gate` subcommand.
- The command package must not contain business logic for polling, SMTP relay,
  feedback routing, provisioning, Cloudflare, WildDuck, R2, persistence, or
  Control API behavior.
- New runtime behavior must be implemented in the owning internal package and
  wired through `internal/control/controlservice`.

## Module Boundaries

- `internal/control/controlservice` owns composition only. It may start and stop
  modules, bind shared configuration, expose aggregate readiness, and coordinate
  shutdown. It must not implement provider-specific, protocol-specific, or
  persistence-specific logic.
- `internal/control/controlapi` must stay Huma/OpenAPI-backed. It may validate
  API request shape and call service interfaces, but it must not directly mutate
  Cloudflare, WildDuck, R2, SMTP, or deployment storage.
- Provisioning modules must expose narrow interfaces with explicit inputs and
  outputs so idempotency, status reporting, and tests can be isolated by
  responsibility.
- Internal mail-control modules for inbound replay, the SMTP relay listener,
  and feedback processing must be reused as the implementation boundaries. Do
  not copy their logic into the control service command or another control
  package.

## Runtime Requirements

- The Mail Control Service command is the runtime entrypoint for inbound
  replay, the fast-path ingest listener, the internal SMTP relay listener,
  outbound provider handling, and feedback processing.
- Inbound replay/queue processing, SMTP relay listener, and feedback processing
  must be wired as internal modules through `internal/control/controlservice`.
- Each runtime concern must keep an explicit listener and port boundary. The
  fast-path/health HTTP listener, internal SMTP relay listener, and
  admin/provisioning HTTP API listener are separate surfaces with separate
  ports, routes, auth policy, readiness semantics, and tests.
- The inbound replay queue/state store belongs in the `agent_mail_control`
  MongoDB database. That database is the only replay queue, lease, retry, and
  cursor store.
- Module runtime wiring must come from typed Mail Control Service configuration and
  service-owned domain registry/control state.

## API Requirements

- The admin/provisioning API must expose a strict OpenAPI contract for every
  supported operation. Do not add undocumented JSON handlers or out-of-band
  admin endpoints.
- The status operation must return top-level readiness and issue strings plus
  control-state, module, dependency, provisioning, and per-domain readiness
  details sufficient to identify the failing boundary before reading logs.
- The supported admin/provisioning API operation list belongs in
  `ARCHITECTURE.md`. `agentMail.provision.apply` is the only public apply
  operation and must coordinate Worker rollout, Cloudflare routing, WildDuck
  service-owned feedback setup, runtime registry projection, status recording,
  and logging in one idempotent run.
- Cloudflare, WildDuck, registry, and Worker rollout work are internal steps
  behind the public provision apply operation.
- The admin/provisioning API must not accept outbound provider selection or
  feedback address configuration. Provider selection comes from
  `AGENT_MAIL_OUTBOUND_PROVIDER`; feedback address setup is built-in
  service-owned behavior derived from the domain.
- The admin/provisioning API must not add ordinary agent mailbox, shared
  mailbox, alias, forwarding, filter, or mailbox-token provisioning endpoints.
  Those are WildDuck API primitives owned by the calling application or
  controller.
