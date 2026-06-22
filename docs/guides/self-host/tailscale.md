# Tailscale Funnel

The web server receives Cloudflare Worker ingress at
`/agent-mail/ingest/v1`. Tailscale Funnel can expose that route by forwarding
the full Worker request to the web server.

HMAC-signed Worker notifications are valid. Unknown requests and requests with
missing or invalid signatures are rejected.

Example values:

- Tailscale hostname: `mail-ingress`
- Tailnet DNS name: `example.ts.net`
- Public ingest URL:
  `https://mail-ingress.example.ts.net/agent-mail/ingest/v1`
- Compose web server listener: `http://127.0.0.1:4321`
- Kubernetes web server service: `http://atemail-web-server:80`

## Environment

Configure AgentTeam Email with the public web origin served by Funnel. Product
Worker provisioning derives the ingest URL by appending `/agent-mail/ingest/v1`
and stores the per-connection Worker HMAC secret in the web database.

```dotenv
PUBLIC_HOSTNAME=https://mail-ingress.example.ts.net
AGENT_MAIL_CONTROL_API_TOKEN=<random-control-token>
ENCRYPT_SECRET_KEY=<base64url-32-byte-key>
```

## Docker Compose

The Tailscale container is configured with `TS_SERVE_CONFIG`. There is no
env-only Funnel declaration; `TS_SERVE_CONFIG` points at a JSON file.

```yaml
services:
  tailscale:
    image: ghcr.io/tailscale/tailscale:v1.96.5
    network_mode: 'service:atemail-web-server'
    environment:
      TS_AUTHKEY: '${TS_AUTHKEY:?missing TS_AUTHKEY}'
      TS_HOSTNAME: '${TS_HOSTNAME:-mail-ingress}'
      TS_STATE_DIR: /var/lib/tailscale
      TS_SERVE_CONFIG: /etc/tailscale/serve/serve.json
      TS_USERSPACE: 'true'
      TS_AUTH_ONCE: 'true'
    volumes:
      - tailscale-state:/var/lib/tailscale
      - ./tailscale:/etc/tailscale/serve:ro
    depends_on:
      - atemail-web-server
    restart: unless-stopped

volumes:
  tailscale-state:
```

Create `./tailscale/serve.json`:

```json
{
  "TCP": {
    "443": {
      "TCPForward": "127.0.0.1:4321",
      "TerminateTLS": "mail-ingress.example.ts.net"
    }
  },
  "AllowFunnel": {
    "mail-ingress.example.ts.net:443": true
  }
}
```

Because the Tailscale service uses
`network_mode: "service:atemail-web-server"`, `127.0.0.1:4321` is the
web server listener.

## Kubernetes

The Helm chart does not install or configure Tailscale. Run Tailscale as
operator-owned infrastructure and point Funnel at the web server service in the
release namespace:

```text
http://atemail-web-server:80
```

If the Tailscale workload runs outside the release namespace, use the fully
qualified Kubernetes service DNS name for `atemail-web-server`.

## Verify

```bash
docker compose exec tailscale tailscale serve status --json
```

Expected Compose shape:

```json
{
  "TCP": {
    "443": {
      "TCPForward": "127.0.0.1:4321",
      "TerminateTLS": "mail-ingress.example.ts.net"
    }
  },
  "AllowFunnel": {
    "mail-ingress.example.ts.net:443": true
  }
}
```

Expected Kubernetes shape:

```json
{
  "TCP": {
    "443": {
      "TCPForward": "atemail-web-server:80",
      "TerminateTLS": "mail-ingress.example.ts.net"
    }
  },
  "AllowFunnel": {
    "mail-ingress.example.ts.net:443": true
  }
}
```

An unsigned request to the ingest path should be rejected. Signed Worker
notifications should be accepted.
