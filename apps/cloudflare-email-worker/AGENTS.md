# Cloudflare Worker Rules

## Inbound Edge Evidence

Inbound email Worker changes must preserve exact raw message bytes and persist
every Cloudflare-exposed email event property and header needed for provenance
and security evidence in R2 `edge.json`.

Original SMTP peer IP and Cloudflare SPF, DKIM, ARC, DMARC, or BIMI verdicts
must be persisted only from a trusted source that actually exposes those
values. Do not put synthetic per-field unavailable verdict records in
`edge.json`. The Worker must not query Cloudflare Analytics or GraphQL during
the receive path for auth verdicts; downstream security views derive
Cloudflare verdicts from the verified archived `raw.eml` Cloudflare-added
headers. Downstream security views must not infer original internet auth
results from Haraka replay, Rspamd scores, or untrusted message headers.

Worker header snapshots are provenance evidence. Preserve the runtime
`message.headers.entries()` iteration order and include an explicit index;
classification may use lowercase helper fields, but capture must not sort away
the observed order.
