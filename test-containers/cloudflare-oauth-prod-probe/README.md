# Cloudflare OAuth Prod Probe

This dev-only harness validates the production Cloudflare credential path in an
isolated local setup. It proves whether a real Cloudflare OAuth grant can be
exchanged, refreshed, used to discover Cloudflare accounts, and then used with
Cloudflare Email Sending `send` and `send_raw` after selecting one discovered
account.

It is intentionally separate from the app runtime. It starts two local Podman
containers:

- a Go callback/probe server on pod loopback
- a cloudflared container exposing only that callback server through Cloudflare
  Tunnel

It also creates and preserves a local Podman volume named
`atemail.<WT>.cf-oauth-prod-probe-oauth-token-store`. The server stores the
latest Cloudflare OAuth refresh token there after the callback exchange and
after the immediate refresh-token exchange. The volume is worktree-scoped and is
not removed by `stop`.

The probe follows the production OAuth shape closely: the Tunnel URL serves a
connect page, the connect button starts Cloudflare OAuth, the callback exchanges
the authorization code, verifies whether Cloudflare returned a refresh token,
immediately tests `grant_type=refresh_token` when it can, saves the latest
refresh token in the worktree-scoped local volume for offline validation, lists
Cloudflare accounts through the OAuth access token, stores a short-lived
in-memory probe session, asks you to select an account, runs invalid-body
requests against the account-scoped Email Sending endpoints with the freshest
access token available, classifies the result, and never sends email.

The same binary also owns the follow-up procedures validated by this harness:

- `serve`: browser OAuth callback flow, Authorization Code + PKCE when
  `AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_AUTH_METHOD=none`, refresh-token persistence,
  immediate refresh-token exchange, account discovery, and non-sending
  invalid-body `send`/`send_raw` auth probes.
- `offline-refresh`: reads the persisted refresh token, exchanges it for a new
  access token, persists a rotated refresh token when Cloudflare returns one,
  lists Cloudflare accounts, and runs the same non-sending Email Sending auth
  probes with the new access token.
- `validate-email-sending`: gated real Email Sending validation. It refreshes
  from the persisted token, persists rotation, discovers the account, sends one
  structured `send` message, then sends one raw RFC 5322 `send_raw` message.

The implementation is in
`cmd/cloudflare-oauth-prod-probe/main.go`. The important entry points are
`exchangeCode`, `refreshAccessTokenFromStore`,
`runOfflineRefreshCommand`, `runEmailSendingValidationCommand`,
`buildStructuredSendPayload`, and `buildRawMIMEMessage`.

## Setup

Copy the example env file and fill in local values:

```bash
cp test-containers/cloudflare-oauth-prod-probe/.env.example test-containers/cloudflare-oauth-prod-probe/.env
```

Required values:

- `CLOUDFLARE_TUNNEL`
- `CLOUDFLARE_TUNNEL_HOSTNAME`
- `AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID`
- `AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_SECRET` only when
  `AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_AUTH_METHOD` is not `none`

The `.env` file is sourced by shell scripts. Quote values that contain spaces,
`#`, `$`, quotes, or other shell-significant characters.

Do not set `WT` in this harness `.env`. The repo-root `.env` owns the worktree
namespace and mise loads it for the task.

Configure the Cloudflare Tunnel public hostname service to
`http://127.0.0.1:9003`. The `cloudflared` sidecar runs in the same Podman pod
as the probe server, so pod loopback reaches the callback server.

The Cloudflare OAuth client should be public for this production-parity probe.
Production needs users outside the admin Cloudflare account to authorize the
app, so a private client only validates a parent-account-only debug path.
Configure the public client with:

- grant types: `authorization_code` and refresh-token support if Cloudflare
  exposes it in the UI/API. The probe requests `offline_access` and validates
  `grant_type=refresh_token`.
- response type: `code`
- token endpoint auth method: `none` for the validated probe path. This still
  uses Authorization Code with PKCE and keeps `response_type=code`. If the
  Cloudflare client is intentionally configured as `client_secret_basic` or
  `client_secret_post` for diagnostics, set
  `AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_AUTH_METHOD` to match the OAuth client record.
- OAuth client type: server-side web app / backend-service client. The browser
  only follows redirects. The probe server exchanges the returned authorization
  code from the backend boundary. In the validated `none` path, that exchange
  sends the PKCE verifier and no client secret; client-secret modes are retained
  only for targeted diagnostics.
- client URL / `client_uri`: a stable HTTPS app/publisher URL on a domain you
  control and can verify in DNS
- redirect URI: `https://${CLOUDFLARE_TUNNEL_HOSTNAME}${PROBE_CALLBACK_PATH}`
- scopes from `AT_EMAIL_ADMIN_CF_OAUTH_SCOPES`, including `offline_access` and
  `email-sending.write`

Complete Cloudflare's required public-client setup: logo, client URL, scopes,
and client URL domain verification. Cloudflare will not promote the client to
public until the Client URL host is verified with the
`cloudflare_oauth_client_publisher=...` TXT record it provides.

The Cloudflare Tunnel hostname is the local callback for this probe; it is not
the client URL unless you can complete Cloudflare's Client URL domain
verification for that hostname. Register the Cloudflare Tunnel callback exactly
as a redirect URI. If Cloudflare rejects redirect URIs outside the verified
Client URL host, use a callback path on the verified app domain and forward only
that path to this local probe for the live validation run.

The Cloudflare dashboard scope picker shows permission checkbox labels. The
canonical permission-to-scope mapping is documented in
`docs/reference/environment-variables.mdx#cloudflare-oauth`.

Do not configure a Cloudflare account id in the harness env. Production does not
take that as an admin setup variable; it discovers accounts through the user's
OAuth grant and stores the selected account on the Cloudflare connection. This
probe does the same thing in-memory.

For the currently validated Cloudflare OAuth client shape, use
`AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_AUTH_METHOD=none`. The harness sends
Authorization Code + PKCE for the browser flow and sends `grant_type=refresh_token`,
`refresh_token`, and `client_id` for refresh. It does not send a client secret
or Basic auth in this mode. In the validation run that established this harness,
Cloudflare consistently rejected `client_secret_basic` and
`client_secret_post`; `none` + PKCE is the validated path.

## Run

Start the probe:

```bash
mise run //test-containers/cloudflare-oauth-prod-probe:start
```

The task prints:

- the run id and run directory
- the HTTPS Tunnel URL to open in a browser
- the log command to watch progress

Open the printed Tunnel URL and click `Connect Cloudflare`. Do not open a raw
Cloudflare authorization URL manually.

If clicking `Connect Cloudflare` shows a Cloudflare dashboard error before this
probe receives a callback, capture the provider-side start diagnostic:

```bash
mise run //test-containers/cloudflare-oauth-prod-probe:diagnose-oauth-start
```

That writes sanitized local redirect headers, Cloudflare provider headers, and a
small JSON summary under the current run directory.

If Cloudflare reports `invalid_client` or shows a dashboard 404/error page, also
inspect the OAuth client record through the owning account API:

```bash
mise run //test-containers/cloudflare-oauth-prod-probe:inspect-oauth-client
```

That optional setup check requires `AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ACCOUNT_ID`
and `AT_EMAIL_ADMIN_CF_OAUTH_CLIENTS_API_TOKEN` in the harness `.env`. The token
only needs `Account -> OAuth Client Read` on the account that owns the OAuth
client. The inspection output records whether the client exists, its visibility,
client URI verification status, exact redirect URIs, grant types, token endpoint
auth method, and whether the currently requested scopes are configured.

Tail logs:

```bash
mise run //test-containers/cloudflare-oauth-prod-probe:logs
```

Stop the harness:

```bash
mise run //test-containers/cloudflare-oauth-prod-probe:stop
```

Inspect the running containers and refresh-token store:

```bash
mise run //test-containers/cloudflare-oauth-prod-probe:status
```

The status task reports whether the OAuth token-store volume exists and whether
the refresh-token file is present. It does not print the token.

Validate offline access from the persisted refresh token:

```bash
mise run //test-containers/cloudflare-oauth-prod-probe:offline-refresh
```

This command refreshes from the volume, rewrites the volume if Cloudflare
rotates the refresh token, lists the discovered Cloudflare accounts, and then
posts `{}` to `send_raw` and `send`. A `400` response with
`email.sending.error.invalid_request_schema` means the OAuth token reached the
Email Sending request-validation layer; it is not an auth rejection and it does
not send mail. Treat these empty-body calls as non-sending diagnostics only:
Cloudflare can also return a generic `401` for `{}` even when a valid
Email Sending request made with the same refreshed OAuth token succeeds. Use
`validate-email-sending` for the decisive API validation.

Run gated real Email Sending validation only with a generated test recipient:

```bash
PROBE_EMAIL_FROM=welcome@example.com \
PROBE_EMAIL_TO=test-generated@example.test \
PROBE_REAL_EMAIL_SEND_CONFIRM=send-real-email \
mise run //test-containers/cloudflare-oauth-prod-probe:validate-email-sending
```

Use `mail-tester.net` or another controlled test mailbox for
`PROBE_EMAIL_TO`. The command sends one structured REST `send` payload and one
`send_raw` payload. Both calls use an access token obtained from the persisted
refresh token; any rotated refresh token is written back to the volume before
the sends.

Stopping the harness collects final container logs into the current run
directory and submits that directory through
`system.registry.test/agentteam/test-artifact-ctl:latest` unless
`TEST_ARTIFACT_SUBMIT_SKIP` is non-empty.

## Result Meanings

- `oauth_accepted_validation_failed`: OAuth token reached request validation.
- `oauth_rejected_bad_token_type`: Cloudflare rejected OAuth token type.
- `oauth_rejected_unauthorized`: Cloudflare returned another 401.
- `oauth_accepted_forbidden`: OAuth token type was accepted, but scope,
  entitlement, or account permission failed.
- `oauth_accepted_account_or_resource_mismatch`: OAuth token type was accepted,
  but the account/resource did not match.
- `unknown_response`: manual inspection needed.

The OAuth lifecycle table on the result page shows whether Cloudflare returned a
refresh token and whether the immediate refresh-token grant succeeded. It does
not show raw tokens. When the start task enables token storage, the server
writes the latest refresh token to the worktree-scoped token-store volume. The
sanitized event stream records storage success or failure without logging token
values.

After the OAuth callback succeeds, the next page lists the accounts discovered
through the OAuth token. Selecting one account runs the account-scoped Email
Sending probe.

The probe uses `{}` as the request body for both `send` and `send_raw`, so it
does not send mail. This is useful as a quick, non-sending signal when
Cloudflare returns a schema error, but it is not the final Email Sending API
proof. The gated `validate-email-sending` task is the validated end-to-end
procedure for `send` and `send_raw`.

Real `send` validation uses this JSON shape:

```json
{
  "to": "recipient@example.com",
  "from": "welcome@example.com",
  "subject": "Cloudflare OAuth send validation <run-id>",
  "html": "<h1>Cloudflare OAuth send validation</h1><p>Structured send API probe <run-id>.</p>",
  "text": "Cloudflare OAuth send validation. Structured send API probe <run-id>."
}
```

Real `send_raw` validation uses this JSON shape:

```json
{
  "from": "welcome@example.com",
  "recipients": ["recipient@example.com"],
  "mime_message": "From: welcome@example.com\r\nTo: recipient@example.com\r\nSubject: Cloudflare OAuth send_raw validation <run-id>\r\nMessage-ID: <cf-oauth-send-raw-<run-id>@example.com>\r\nDate: <rfc1123z>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\nCloudflare OAuth send_raw validation. Raw MIME probe <run-id>.\r\n"
}
```

The MIME value must be built with actual CRLF characters before JSON encoding.
The JSON encoder will represent those characters as `\r\n` in the request
body. Do not build the MIME value from literal backslash sequences such as
`\\r\\n`; Cloudflare returns `email.sending.error.email.invalid` for that
payload. `buildRawMIMEMessage` validates the message with Go's `net/mail`
parser before the request is sent.

## HTTP Behavior

The callback returns HTTP `200` for provider errors, state rejection, missing
codes, token exchange errors, account discovery errors, and token persistence
errors so the operator can see the probe-rendered diagnostic page through the
Tunnel. Do not use application `5xx` responses for expected OAuth/provider
diagnostics in this harness; Cloudflare Tunnel can surface those as generic
gateway failures instead of the useful probe page. Request-method errors still
use normal HTTP method semantics.

## Logging

Each `start` invocation creates one run directory:

```text
test-containers/cloudflare-oauth-prod-probe/tmp/run-<id>/
```

Sanitized JSONL events are written live to `events.jsonl` in that directory.
Container logs, diagnostics, and `artifact-submit.json` also stay under that
same run directory.

The server logs progress to stdout with sanitized JSON attributes and writes the
same sanitized event stream to the JSONL file. It must not log OAuth access
tokens, refresh tokens, auth codes, client secrets, raw `Authorization` headers,
or Cloudflare Tunnel tokens.
