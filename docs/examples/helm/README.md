# Helm Examples

These files are raw Helm values examples for the `charts/agentteam-email`
chart.

Use them as starting points:

- `values-basic.yaml`: baseline install without a tunnel.
- `values-existing-secret.yaml`: production shape with an externally managed
  Secret.
- `values-tailscale.yaml`: Tailscale frontend tunnel.
- `values-cloudflared.yaml`: Cloudflare Tunnel frontend tunnel.

Replace all `company.example` and secret placeholders before deploying.
