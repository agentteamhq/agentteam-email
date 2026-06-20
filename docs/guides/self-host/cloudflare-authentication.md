# Cloudflare Authentication And Routing

This guide defines the target Cloudflare setup for a self-hosted install.

Use example values below:

- application domain: `mail.company.example`
- inbound mail domain: `company.example`
- Worker script name: `agent-mail-ingress`
- archive bucket: `company-agent-mail-archive`
- tunnel hostname: `mail-ingress.company.example`

## What Cloudflare Does

Cloudflare owns four separate concerns:

- DNS for the mail domain
- Email Routing for inbound mail delivery to the Worker
- Worker deployment for archiving inbound mail and sending fast-path
  notifications
- R2 bucket storage for raw inbound message archives

The Worker must archive each inbound message to R2 and then call:

```text
https://mail-ingress.company.example/agent-mail/ingest/v1
```

The call is signed with `AGENT_MAIL_CF_TUNNEL_HMAC_SECRET`. Public Worker
traffic must enter through the fast-path ingress/gate backed by the
mail-control-service fastpath gate path. The control API remains internal.

## Token Model

For self-hosting, use a Cloudflare API token scoped to one account and the zones
that receive mail.

The token must allow the setup workflow to:

- read account and zone metadata
- create or update the Worker script
- bind the Worker to the R2 bucket
- bind Worker secrets
- read and update Email Routing settings
- create or update Email Routing catch-all routes
- read and update DNS records required by Email Routing

The token must not be exposed to browsers. It belongs only in server-side
environment variables or referenced Secrets.

## Cloudflare Resources

Create or select:

- Cloudflare account ID
- zone for `company.example`
- R2 bucket named `company-agent-mail-archive`
- Email Routing destination address controlled by the Worker
- Worker script named `agent-mail-ingress`
- tunnel hostname `mail-ingress.company.example`

The Worker receives these bindings:

```text
ARCHIVE_BUCKET=company-agent-mail-archive
AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL=https://mail-ingress.company.example/agent-mail/ingest/v1
AGENT_MAIL_CF_TUNNEL_HMAC_SECRET=<shared-fast-path-secret>
EMAIL=<Cloudflare send_email binding>
```

The Worker posts to the configured fast-path URL:

```text
https://mail-ingress.company.example/agent-mail/ingest/v1
```

## Routing Shape

Email Routing should use one enabled catch-all route per inbound mail zone.

For `company.example`, route all inbound mail to the Worker. Domain-specific
mailbox handling happens after the message reaches WildDuck and the web app's
mail permissions model.

The route config should be explicit data, for example:

```json
{
  "zones": [
    {
      "zone_name": "company.example"
    }
  ],
  "routes": [
    {
      "enabled": true,
      "mode": "catch-all",
      "zone_name": "company.example",
      "address": "inbound@company.example"
    }
  ]
}
```

## Environment Contract

Self-host Cloudflare setup must support these variables:

```text
AGENT_MAIL_CLOUDFLARE_API_TOKEN=
AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID=
AGENT_MAIL_CLOUDFLARE_API_BASE_URL=https://api.cloudflare.com/client/v4
AGENT_MAIL_CLOUDFLARE_WORKER_SCRIPT_NAME=agent-mail-ingress
AGENT_MAIL_CLOUDFLARE_ROUTE_CONFIG=./config/email-routing.json

AGENT_MAIL_R2_ENDPOINT=
AGENT_MAIL_R2_REGION=auto
AGENT_MAIL_R2_BUCKET=company-agent-mail-archive
AGENT_MAIL_R2_ACCESS_KEY_ID=
AGENT_MAIL_R2_SECRET_ACCESS_KEY=

AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL=https://mail-ingress.company.example/agent-mail/ingest/v1
AGENT_MAIL_CF_TUNNEL_HMAC_SECRET=
```

## Setup Flow

1. Create the R2 bucket.
2. Create the Cloudflare API token with the scopes above.
3. Configure the tunnel endpoint using either Tailscale or Cloudflare Tunnel.
4. Set `AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL` to the full public HTTPS ingest URL.
5. Set the same `AGENT_MAIL_CF_TUNNEL_HMAC_SECRET` in the Worker and service
   environment.
6. Deploy the Worker.
7. Apply the Email Routing catch-all route for each inbound zone.
8. Send a test email to the domain.
9. Verify the R2 archive contains `raw.eml`, `edge.json`, and `result.json`.
10. Verify the fast-path gate accepted the notification and the message was
    processed internally.
