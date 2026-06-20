# Message Provenance Rules

- Message provenance startup must receive the WildDuck API base URL through the
  Mail Control Service runtime wiring. Module runtime wiring belongs to typed
  Mail Control Service configuration and service-owned control state.
- Message view generation must preserve message HTML outside the approved
  security mutations for external-link mediation and remote-image blocking.
  Do not strip styles, non-link/non-image attributes, or layout markup from the
  body; iframe sandbox/CSP enforcement belongs to the rendering client.
- Cloudflare SPF, DKIM, DMARC, ARC, BIMI, and original peer-IP evidence must be
  derived only from verified R2 archived `raw.eml` Cloudflare-added headers
  after `edge.json` schema, key, envelope, timestamp, and raw SHA-256 binding
  succeeds. Do not derive Cloudflare verdicts from WildDuck source headers,
  Haraka replay results, Rspamd scores, Worker request headers, or Cloudflare
  Analytics.
- Message source/provenance APIs that support View Original must expose complete
  ordered header lists for every source they present, including verified R2
  archived `raw.eml` headers and final WildDuck source headers. They must not
  hide, drop, collapse, or filter headers for display convenience. Grouping and
  labeling are allowed only when every original header line remains visible in
  one of the rendered groups.
