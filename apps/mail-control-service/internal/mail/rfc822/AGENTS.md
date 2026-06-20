# RFC822 Mail Rules

These rules apply to everything under `apps/mail-control-service/internal/mail/rfc822/`.

- Cloudflare boundary authentication and trace headers from inbound archived
  raw mail must not remain active when replayed through Haraka/WildDuck. The
  exact original Cloudflare header lines must remain available through the
  verified archived `raw.eml`; replay namespacing is only an inactive final-copy
  projection. Preserve Cloudflare `Authentication-Results`, `ARC-*`,
  `Received-SPF`, and Cloudflare `Received` evidence under
  `X-ATMCF-Cloudflare-*` replay headers before injecting Agent Mail replay
  provenance.
- Replay code must not silently drop any original header line that it deactivates
  or renames. Every deactivated Cloudflare boundary header line must be copied
  into the replayed message with an `X-ATMCF-Cloudflare-<Original-Header-Name>`
  header name and the original unfolded value. Do not replace this with a
  partial allowlist that preserves only selected Cloudflare headers.
