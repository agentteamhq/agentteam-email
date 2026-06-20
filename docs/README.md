# Self-Hosting Guides

These guides describe the intended public self-host interface for this mail
stack. They are written as the target operator experience: every hostname,
secret, image, tunnel, and Cloudflare value must be supplied by the self-hosting
operator through explicit configuration.

Public repository: `https://github.com/agentteamhq/agentteam-email`

Canonical public URLs:

- Website: `https://www.agentteam.email`
- App: `https://app.agentteam.email`
- Docs: `https://agentteamemail.mintlify.com`

Guides:

- [Cloudflare Authentication And Routing](guides/self-host/cloudflare-authentication.md)
- [Docker Compose](guides/self-host/docker-compose.md)
- [Helm](guides/self-host/helm.md)
- [Tailscale Tunnel](guides/self-host/tailscale.md)
- [Cloudflare Tunnel](guides/self-host/cloudflared.md)

## Target Architecture

The self-hosted stack has these runtime parts:

- web server from `apps/web-server`
- mail control service deployment `atemail-mail-control-service` from `apps/mail-control-service`
- Cloudflare Email Worker from `apps/cloudflare-email-worker`
- MongoDB
- Redis
- WildDuck
- Haraka
- Rspamd
- ZoneMTA
- R2-compatible archive storage
- optional fast-path notification URL for Cloudflare Email Worker notifications

The public self-host target does not expose a separate operator UI or control
API. Mail administration and message review belong behind the authenticated web
app. The web server talks to the mail control service over the internal
network. The browser talks only to the web server.

## Required Operator Inputs

Every self-host install must provide:

- public web app URL, for example `https://mail.company.example`
- inbound fast-path notification URL, for example
  `https://mail-ingress.company.example/agent-mail/ingest/v1`
- MongoDB connection URLs for the web app, WildDuck, and control databases
- Redis URL for the mail stack
- R2-compatible archive endpoint, bucket, access key, and secret
- WildDuck admin access token and access-control secret
- mail control API token
- fast-path HMAC secret shared by the Worker and control service
- outbound provider selection: `cloudflare` or `ses`
- Cloudflare account, zone, token, Worker, R2, DNS, and Email Routing settings
- production auth and encryption secrets for the web app

## Supported Setup Paths

The supported simple self-host path is root `compose.yaml`. The supported
Kubernetes path is the Helm chart in `charts/agentteam-email`. Raw Kubernetes
manifests are not a supported interface.

Published releases use the GHCR Helm OCI artifact:

```text
oci://ghcr.io/agentteamhq/agentteam-email
```
