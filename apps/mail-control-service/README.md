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
- `mail-control-service` for service coordination, inbound replay, internal
  ingest enqueue handling, the internal SMTP relay listener, outbound
  provider handling, and feedback processing
- `atemail-web-server` from `apps/web-server` for the authenticated
  product surface

Additional repo-owned components:

- `packages/cloudflare-email-worker` for the Cloudflare Email Routing ingress
  Worker source

Required runtime configuration is provided by the selected deployment target.
Self-hosted deployments should use the Compose and Helm guides under
`docs/guides/self-host/` and inject secrets through explicit environment values
or referenced secret objects.

Self-hosted operator configuration is documented through the public Compose and
Helm surfaces. Admin Cloudflare OAuth credentials are owned by the web server,
admin R2 archive credentials are owned by the deployment, and user-domain
Cloudflare credentials are stored as server-side OAuth grants after the user
connects a domain in the web UI.

The runtime includes upstream WildDuck, Haraka, and ZoneMTA plus two repo-owned
app surfaces: the internal control service and the public web server.

The control service exposes internal runtime surfaces inside one deployment:
the internal ZoneMTA-only SMTP relay listener on `2587`, provider feedback
mailbox processing for addresses such as `bounces@<sender-domain>`, and the
Huma-backed control API on `8081`. Production Worker ingest terminates at the
public web server.
The control API is internal-only and exposes OpenAPI at `/openapi.json` and
`/openapi.yaml`.

The control API scope is runtime sync from web-owned state, ingest enqueue from
the web Worker boundary, archive credential issuance, internal send submission,
status, and read-only message provenance, safe view, and security evidence.
Ordinary mailbox, forwarding, alias, filter, and mailbox-token management
remains WildDuck API behavior used directly by the owning frontend or
controller. Domain desired state is web-owned application state, not
mail-control state or repo-edited domain files. The status response is
diagnostic: it includes top-level readiness and issues, runtime projection
health, module health, dependency health, and per-domain WildDuck feedback
readiness.

WildDuck config is mounted directly from repo-owned files. Dynamic inputs must
come from explicit runtime configuration owned by the deployment target.

The Cloudflare ingress Worker source is managed from
`packages/cloudflare-email-worker`. Customer-domain Worker deployment and Email
Routing are handled by the web server through the connected user's Cloudflare
OAuth grant. Production routing is catch-all per enabled domain zone to the
configured Worker.

After `edge.json` is committed, the Worker sends a metadata-only Standard
Webhooks-signed notification to the web server at
`/rpc/agent-mail/ingest/v1/{connectionPublicId}`. The web server
verifies the deployment-owned Worker webhook signing secret, resolves the active Cloudflare
connection, and calls `agentMail.ingest.enqueue` over the internal control API.
Accepted notifications enqueue the committed bundle into the Mongo-backed
control queue, wake the normal due-work loop, and the R2 sweep remains the
authoritative backstop. The same Mail Control Service binary owns inbound
replay, outbound relay handling, and feedback processing; production domain
data is provided through the runtime projection synced by the web server.

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
