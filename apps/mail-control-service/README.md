# Agent Mail

Managed mail service for agent and company mailboxes.

Core service scope:

- `mongodb` for WildDuck mailbox storage and the Mail Control Service queue/state
  database
- `redis` for WildDuck tokens, counters, notifications, and Haraka coordination
- `rspamd` for spam scoring
- `wildduck` for IMAP and HTTP API
- `haraka` for canonical inbound SMTP ingest into WildDuck
- `zonemta` for canonical outbound queueing, retries, and bounce generation
- `mail-control-service` for service coordination, inbound replay, the fast-path
  ingest listener, the internal SMTP relay listener, outbound provider
  handling, and feedback processing
- `fastpath-gate` for the signed inbound fast path when a tunnel is enabled
- `atemail-web-server` from `apps/web-server` for the authenticated
  product surface

Additional service-owned components:

- `../cloudflare-email-worker/` for the Cloudflare Email Routing ingress worker
  and catch-all routing tasks

Required runtime configuration is provided by the selected deployment target.
Self-hosted deployments should use the Compose and Helm guides under
`docs/guides/self-host/` and inject secrets through explicit environment values
or referenced secret objects.

Provider-specific configuration for outbound provider handling:

- Cloudflare API credentials are required when
  `AGENT_MAIL_OUTBOUND_PROVIDER=cloudflare`
- `AGENT_MAIL_AWS_REGION`, `AGENT_MAIL_AWS_ACCESS_KEY_ID`, and
  `AGENT_MAIL_AWS_SECRET_ACCESS_KEY` when `AGENT_MAIL_OUTBOUND_PROVIDER=ses`

The runtime includes upstream WildDuck, Haraka, and ZoneMTA plus two repo-owned
app surfaces: the internal control service and the authenticated web server.

The control service exposes internal runtime surfaces inside one deployment:
the fast-path ingest HTTP listener on `8080`, the internal ZoneMTA-only SMTP
relay listener on `2587`, provider feedback mailbox processing for addresses
such as `bounces@<sender-domain>`, and the Huma-backed control API on `8081`.
Control API requests use `AGENT_MAIL_CONTROL_API_TOKEN` as an internal service
credential and expose OpenAPI at `/openapi.json` and `/openapi.yaml`.

The control API scope is domain add, domain modify, domain remove, full
provision apply, status, and read-only message provenance, safe view, and
security evidence. Ordinary mailbox, forwarding, alias, filter, and
mailbox-token management remains WildDuck API behavior used directly by the
owning frontend or controller. Domain desired state is service-owned control
state, not repo-edited domain files. The status response is diagnostic: it
includes top-level readiness and issues, control-state storage, module health,
dependency health, provisioning summary, and per-domain
Cloudflare/WildDuck feedback readiness.

WildDuck config is mounted directly from repo-owned files. Dynamic inputs must
come from explicit runtime configuration owned by the deployment target.

The Cloudflare ingress worker is managed from
`../cloudflare-email-worker/`. Its Worker script name, R2 bucket binding, and R2
bucket name are deployment configuration. Worker deployment is handled by the
worker app's tasks. Control API provision apply coordinates domain changes.
Repo-tracked domain files are test fixtures, not the production domain
management surface. Production routing is catch-all per enabled domain zone to
the configured Worker.

After `edge.json` is committed, the Worker sends a metadata-only fast-path
notification to `AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL`. In self-hosted deployments,
the configured ingress route forwards raw HTTP to the service-owned
`fastpath-gate`; the gate allows only `POST /agent-mail/ingest/v1` before
proxying to the control service fast-path listener. That listener verifies
`AGENT_MAIL_CF_TUNNEL_HMAC_SECRET`, enqueues the committed bundle into the
Mongo-backed control queue, wakes the normal due-work loop, and the R2 sweep
remains the authoritative backstop. The same Mail Control Service binary owns inbound
replay, outbound provider handling, and feedback processing; production domain
data is provided through service-owned control state and its runtime registry
projection.

For the service architecture and required mail archive contracts, see
`ARCHITECTURE.md`, `R2-BUCKET-LAYOUT.md`, and `PROVENANCE.md`.

## Bounce and Feedback Routing

Provider feedback must land on the built-in structural feedback address for the
sender domain, such as `bounces@<sender-domain>`. Mailbox-delivered feedback is
processed by the same mail control service deployment that owns replay, outbound
provider handling, and status reporting. See `ARCHITECTURE.md` for the
provider-specific feedback model.

Use the repo setup guide for current local validation commands. The
mail-control-service check is:

```bash
mise run //apps/mail-control-service:check
```

The Helm/kind runtime boundary check is:

```bash
mise run //test-containers/kind-e2e:test
```
