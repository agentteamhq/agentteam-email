# Tailscale Tunnel

This guide defines the target Tailscale option for AgentTeam Email public web
traffic and Worker fast-path ingest.

Use example values below:

- application hostname: `mail.company.example`
- tunnel hostname: `mail-ingress.company.example`
- web service listener: `http://atemail-web-server`
- fast-path route: `/agent-mail/ingest/v1`
- fast-path backend: the mail-control-service `fastpath-gate` path

## Purpose

The tunnel exists to expose the authenticated web app and the public fast-path
ingest route that must be reachable by Cloudflare Email Workers.

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

The tunnel must not expose WildDuck, MongoDB, Redis, Haraka, ZoneMTA, or the
internal control API.

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

For Tailscale, also provide:

```text
TAILSCALE_AUTHKEY=
TAILSCALE_HOSTNAME=mail-ingress
```

## Helm Values

Enable Tailscale through Helm values:

```yaml
tunnel:
  provider: tailscale
  listenUrl:
    value: http://0.0.0.0:8080
  externalUrl:
    value: https://mail-ingress.company.example/agent-mail/ingest/v1
  hmacSecret:
    valueFrom:
      secretKeyRef:
        name: mail-secrets
        key: AGENT_MAIL_CF_TUNNEL_HMAC_SECRET

tailscale:
  hostname: mail-ingress
  certDomain: mail-ingress.company.example
  authKey:
    valueFrom:
      secretKeyRef:
        name: mail-secrets
        key: AGENT_MAIL_TAILSCALE_AUTH_KEY
```

## Setup Flow

1. Create a Tailscale auth key for this service.
2. Configure the Tailscale service hostname.
3. Configure HTTPS serving for `mail-ingress.company.example`.
4. Set `AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL`.
5. Set `AGENT_MAIL_CF_TUNNEL_HMAC_SECRET`.
6. Apply the Helm release.
7. Confirm the frontend and fast-path routes are reachable through Tailscale.
8. Deploy or update the Cloudflare Worker with the same external URL and HMAC
   secret.
9. Send a test email and confirm fast-path delivery.

## Verification

Expected public route:

```bash
curl -i https://mail-ingress.company.example/agent-mail/ingest/v1
```

An unsigned request should not enqueue mail. A signed Worker request should
return success and create a delivery record.
