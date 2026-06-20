# AgentTeam Email Helm Chart

Published chart:

```text
oci://ghcr.io/agentteamhq/agentteam-email
```

This chart renders the self-hosted AgentTeam Email stack:

- `atemail-web-server`
- `atemail-mail-control-service`
- MongoDB
- Redis
- WildDuck
- Haraka
- Rspamd
- ZoneMTA
- optional Tailscale or `cloudflared` fast-path tunnel

Render:

```bash
helm template atemail \
  oci://ghcr.io/agentteamhq/agentteam-email \
  --namespace agentteam-email \
  -f docs/examples/helm/values-basic.yaml
```

Install:

```bash
helm upgrade --install atemail \
  oci://ghcr.io/agentteamhq/agentteam-email \
  --namespace agentteam-email \
  --create-namespace \
  -f docs/examples/helm/values-basic.yaml
```

Omitting `--version` installs the latest stable chart. Pin a chart version when
you need a reproducible rollout.

See `docs/guides/self-host/helm.md` for the full self-host guide.
