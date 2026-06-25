# Cloudflare Authentication And Routing

This guide defines the target Cloudflare setup for a self-hosted install.

Use example values below:

- application domain: `mail.company.example`
- inbound mail domain: `company.example`
- Worker script name: `agent-mail-ingress`
- archive bucket: `company-agent-mail-archive`
- public web hostname: `mail.company.example`

## What Cloudflare Does

Cloudflare owns four separate concerns:

- DNS for the mail domain
- Email Routing for inbound mail delivery to the Worker
- Worker deployment for archiving inbound mail and sending worker notifications
- R2 bucket storage for raw inbound message archives

The Worker must archive each inbound message to R2 and then call:

```text
https://mail.company.example/rpc/agent-mail/ingest/v1
```

The call is signed with a per-connection `AGENTTEAM_WORKER_HMAC_SECRET` and
includes `X-Agent-Mail-Connection-Id`. Public Worker traffic must enter through
operator-owned ingress that forwards the request to the web server. The control API
remains internal.

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
- public web hostname `mail.company.example`

Product provisioning creates the Worker with these bindings:

```text
AGENTTEAM_ORGANIZATION_ID=<web-owned-organization-id>
AGENTTEAM_ORG_PUBLIC_ID=<web-owned-organization-public-id>
AGENTTEAM_CONNECTION_ID=<web-owned-connection-id>
AGENTTEAM_DOMAIN_ID=<web-owned-domain-id>
AGENTTEAM_DOMAIN=company.example
AGENTTEAM_ARCHIVE_PREFIX=orgs/<org-public-id>/domains/company.example/mail/inbound
AGENTTEAM_R2_ENDPOINT=<r2-endpoint>
AGENTTEAM_R2_BUCKET=company-agent-mail-archive
AGENTTEAM_R2_REGION=auto
AGENTTEAM_R2_ACCESS_KEY_ID=<temporary-r2-access-key>
AGENTTEAM_R2_SECRET_ACCESS_KEY=<temporary-r2-secret-key>
AGENTTEAM_R2_SESSION_TOKEN=<temporary-r2-session-token>
AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT=<iso-timestamp>
AGENTTEAM_INGEST_URL=https://mail.company.example/rpc/agent-mail/ingest/v1
AGENTTEAM_WORKER_HMAC_SECRET=<per-connection-worker-secret>
EMAIL=<Cloudflare send_email binding>
```

The Worker posts to the configured ingest URL:

```text
https://mail.company.example/rpc/agent-mail/ingest/v1
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

PUBLIC_HOSTNAME=https://mail.company.example
AGENT_MAIL_CONTROL_API_TOKEN=
ENCRYPT_SECRET_KEY=
```

## Setup Flow

1. Create the R2 bucket.
2. Create the Cloudflare API token with the scopes above.
3. Configure operator-owned ingress so
   `https://mail.company.example/rpc/agent-mail/ingest/v1` reaches the web server.
4. Set `PUBLIC_HOSTNAME` to the public web server origin.
5. Set `AGENT_MAIL_CONTROL_API_TOKEN` for the internal web-to-control API
   boundary and `ENCRYPT_SECRET_KEY` so web can store Worker secrets.
6. Provision the Cloudflare connection through the authenticated web surface.
7. Apply the Email Routing catch-all route for each inbound zone.
8. Send a test email to the domain.
9. Verify the R2 archive contains `raw.eml`, `edge.json`, and `result.json`.
10. Verify the signed Worker notification was accepted and the message was
    processed internally.
