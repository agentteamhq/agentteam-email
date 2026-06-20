# Cloudflare Tunnel

This guide defines the target `cloudflared` option for AgentTeam Email public
web traffic and Worker fast-path ingest.

Use example values below:

- application hostname: `mail.company.example`
- tunnel hostname: `mail-ingress.company.example`
- web service listener: `http://atemail-web-server`
- fast-path route: `/agent-mail/ingest/v1`
- fast-path backend: the mail-control-service `fastpath-gate` path

## Purpose

Cloudflare Tunnel is an alternative to Tailscale for browser/web traffic and
Worker fast-path ingest.

Browser/web traffic goes to the web service.

Worker fast-path ingest must use this full public URL:

```text
https://mail-ingress.company.example/agent-mail/ingest/v1
```

The fast-path route must forward to the public fast-path ingress/gate backed by
the mail-control-service fastpath gate path, not to the web service:

```text
http://<fastpath-gate-backend>/agent-mail/ingest/v1
```

It must not expose WildDuck, MongoDB, Redis, Haraka, ZoneMTA, Rspamd, or the
internal control API.

## Cloudflare DNS

Create a tunnel in Cloudflare and route:

```text
mail-ingress.company.example -> cloudflared tunnel
```

The Worker can then call:

```text
https://mail-ingress.company.example/agent-mail/ingest/v1
```

## Environment

Set the external URL to the full public Worker ingest URL. Do not append
`/agent-mail/ingest/v1` anywhere else:

```text
AGENT_MAIL_CF_TUNNEL_LISTEN_URL=http://0.0.0.0:8080
AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL=https://mail-ingress.company.example/agent-mail/ingest/v1
AGENT_MAIL_CF_TUNNEL_HMAC_SECRET=<random-fast-path-secret>
```

Set the same external URL and HMAC secret in the Worker:

```text
AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL=https://mail-ingress.company.example/agent-mail/ingest/v1
AGENT_MAIL_CF_TUNNEL_HMAC_SECRET=<random-fast-path-secret>
```

For `cloudflared`, provide the tunnel token through the selected Secret:

```text
CLOUDFLARED_TUNNEL_TOKEN=
```

## Helm Values

Enable `cloudflared` through Helm values:

```yaml
tunnel:
  provider: cloudflared
  listenUrl:
    value: http://0.0.0.0:8080
  externalUrl:
    value: https://mail-ingress.company.example/agent-mail/ingest/v1
  hmacSecret:
    valueFrom:
      secretKeyRef:
        name: mail-secrets
        key: AGENT_MAIL_CF_TUNNEL_HMAC_SECRET

cloudflared:
  tunnelToken:
    valueFrom:
      secretKeyRef:
        name: mail-secrets
        key: CLOUDFLARED_TUNNEL_TOKEN
```

Browser/web routes forward to the web service.

The Worker fast-path route forwards only `POST /agent-mail/ingest/v1` to the
fast-path ingress/gate backed by the mail-control-service fastpath gate path.

## Setup Flow

1. Create a Cloudflare Tunnel.
2. Create DNS route `mail-ingress.company.example`.
3. Store the tunnel token in the selected Secret.
4. Configure browser/web ingress to target the web service and Worker
   fast-path ingress to target the fast-path gate.
5. Set `AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL`.
6. Set `AGENT_MAIL_CF_TUNNEL_HMAC_SECRET`.
7. Apply the Helm release.
8. Deploy or update the Cloudflare Worker with the same external URL and HMAC
   secret.
9. Send a test email and confirm fast-path delivery.

## Verification

Check that the frontend and fast-path endpoint are reachable through the
configured public routes:

```bash
curl -i https://mail-ingress.company.example/agent-mail/ingest/v1
curl -i https://mail.company.example/
```

The fast-path endpoint should reject unsigned requests and accept signed Worker
requests.
