# Cloudflare Tunnel

The web server receives Cloudflare Worker ingress at
`/rpc/agent-mail/ingest/v1`. Cloudflare Tunnel can expose that route by forwarding
the full Worker request to the web server.

HMAC-signed Worker notifications are valid. Unknown requests and requests with
missing or invalid signatures are rejected.

Example public hostnames:

- Web app: `https://mail.company.example`
- Worker ingest:
  `https://mail.company.example/rpc/agent-mail/ingest/v1`
- Compose web server service: `http://atemail-web-server:4321`
- Kubernetes web server service: `http://atemail-web-server:80`

## Environment

Configure AgentTeam Email with the public web origin. Product Worker
provisioning derives the ingest URL by appending `/rpc/agent-mail/ingest/v1` and
stores the deployment-owned Worker HMAC secret in the web database.

```dotenv
PUBLIC_HOSTNAME=https://mail.company.example
AGENT_MAIL_CONTROL_API_TOKEN=<random-control-token>
ENCRYPT_SECRET_KEY=<base64url-32-byte-key>
```

Cloudflared itself needs the tunnel token:

```dotenv
TUNNEL_TOKEN=<cloudflare-tunnel-token>
```

## Cloudflare Routes

Create a Cloudflare Tunnel and configure public hostname routes in Cloudflare.
Route the ingest path before any broader catch-all rule.

For Docker Compose:

```text
mail.company.example -> http://atemail-web-server:4321
```

For Kubernetes:

```text
mail.company.example -> http://atemail-web-server:80
```

Do not expose WildDuck, MongoDB, Redis, Haraka, ZoneMTA, Rspamd, or the
internal control API.

## Docker Compose

The Compose stack does not configure Cloudflare Tunnel. Run `cloudflared` as
operator-owned infrastructure on the same network as the web server:

```yaml
services:
  cloudflared:
    image: docker.io/cloudflare/cloudflared:2026.6.1
    command:
      - tunnel
      - --no-autoupdate
      - run
    environment:
      TUNNEL_TOKEN: '${TUNNEL_TOKEN:?missing TUNNEL_TOKEN}'
    restart: unless-stopped
```

Cloudflare owns the hostname and path routing for token-run tunnels; the
connector only starts the tunnel.

## Kubernetes

The Helm chart does not install or configure `cloudflared`. Run Cloudflare
Tunnel as operator-owned infrastructure and point the public hostname routes at
the web server service in the release namespace:

```text
http://atemail-web-server:80
```

If the `cloudflared` workload runs outside the release namespace, use the fully
qualified Kubernetes service DNS name for `atemail-web-server`.

## Verify

```bash
curl -i https://mail.company.example/
curl -i -X POST https://mail.company.example/rpc/agent-mail/ingest/v1
```

The web hostname should reach the web app. An unsigned ingest request should be
rejected. Signed Worker notifications should be accepted.
