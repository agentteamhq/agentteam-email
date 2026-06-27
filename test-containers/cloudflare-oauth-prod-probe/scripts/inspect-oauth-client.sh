#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd -- "${script_dir}/.." && pwd)"
cd "${root_dir}"

if [ ! -f .env ]; then
  echo "[cloudflare-oauth-prod-probe] missing .env; copy .env.example to .env and fill in local values" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID:?AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID is required}"
: "${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ACCOUNT_ID:?AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ACCOUNT_ID is required for client inspection}"
: "${AT_EMAIL_ADMIN_CF_OAUTH_CLIENTS_API_TOKEN:?AT_EMAIL_ADMIN_CF_OAUTH_CLIENTS_API_TOKEN is required for client inspection}"

api_base_url="${AT_EMAIL_ADMIN_CF_API_BASE_URL:-https://api.cloudflare.com/client/v4}"
requested_scopes="${AT_EMAIL_ADMIN_CF_OAUTH_SCOPES:-}"
callback_path="${PROBE_CALLBACK_PATH:-/oauth/callback/cloudflare}"
: "${CLOUDFLARE_TUNNEL_HOSTNAME:?CLOUDFLARE_TUNNEL_HOSTNAME is required}"
redirect_uri="https://${CLOUDFLARE_TUNNEL_HOSTNAME}${callback_path}"

if [ -f "${root_dir}/tmp/current-run" ]; then
  run_id="$(cat "${root_dir}/tmp/current-run")"
else
  run_id="$(date +%Y%m%d-%H%M%S)"
fi
run_dir="${root_dir}/tmp/run-${run_id}"
diagnostics_dir="${run_dir}/diagnostics"
mkdir -p "${diagnostics_dir}"

response_path="${diagnostics_dir}/oauth-client-api-response.json"
summary_path="${diagnostics_dir}/oauth-client-inspection.json"

status="$("${CURL:-curl}" -fsS \
  -o "${response_path}" \
  -w '%{http_code}' \
  -H "authorization: Bearer ${AT_EMAIL_ADMIN_CF_OAUTH_CLIENTS_API_TOKEN}" \
  -H "accept: application/json" \
  "${api_base_url%/}/accounts/${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ACCOUNT_ID}/oauth_clients" || true)"

if [ "${status}" != "200" ]; then
  cat >"${summary_path}" <<JSON
{
  "run_id": "${run_id}",
  "status": "cloudflare_api_failed",
  "http_status": "${status}"
}
JSON
  echo "[cloudflare-oauth-prod-probe] OAuth client API inspection failed with HTTP ${status}; see ${response_path}" >&2
  exit 1
fi

jq \
  --arg client_id "${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID}" \
  --arg redirect_uri "${redirect_uri}" \
  --arg requested_scopes "${requested_scopes}" \
  --arg run_id "${run_id}" \
  '
  def requested_scope_list:
    ($requested_scopes | split(" ") | map(select(. != "")));

  def protocol_scopes:
    ["openid", "offline_access", "offline"];

  def client:
    .result[]? | select(.client_id == $client_id);

  def client_id_hash:
    "unavailable";

  (client) as $client |
  if $client == null then
    {
      run_id: $run_id,
      status: "client_not_found",
      client_id_length: ($client_id | length),
      client_id_prefix: ($client_id[0:5])
    }
  else
    (requested_scope_list) as $requested |
    ($client.scopes // []) as $allowed |
    ($requested - $allowed - protocol_scopes) as $missing_scopes |
    {
      run_id: $run_id,
      status: "client_found",
      client_id_length: ($client_id | length),
      client_id_prefix: ($client_id[0:5]),
      visibility: $client.visibility,
      client_name_present: (($client.client_name // "") != ""),
      client_uri: $client.client_uri,
      client_uri_verification_status: ($client.client_uri_verification.status // null),
      grant_types: ($client.grant_types // []),
      response_types: ($client.response_types // []),
      token_endpoint_auth_method: $client.token_endpoint_auth_method,
      redirect_uri_configured: (($client.redirect_uris // []) | index($redirect_uri) != null),
      expected_redirect_uri: $redirect_uri,
      redirect_uris: ($client.redirect_uris // []),
      requested_scopes: $requested,
      configured_scopes: $allowed,
      requested_scopes_missing_from_client: $missing_scopes,
      offline_access_requested: ($requested | index("offline_access") != null),
      refresh_grant_configured: (($client.grant_types // []) | index("refresh_token") != null)
    }
  end
  ' "${response_path}" >"${summary_path}"

echo "[cloudflare-oauth-prod-probe] OAuth client inspection:"
jq -r '
  "  status: " + .status,
  "  visibility: " + (.visibility // "n/a"),
  "  client_uri_verification_status: " + (.client_uri_verification_status // "n/a"),
  "  redirect_uri_configured: " + ((.redirect_uri_configured // false) | tostring),
  "  token_endpoint_auth_method: " + (.token_endpoint_auth_method // "n/a"),
  "  grant_types: " + ((.grant_types // []) | join(", ")),
  "  missing_requested_scopes: " + ((.requested_scopes_missing_from_client // []) | join(", ")),
  "  refresh_grant_configured: " + ((.refresh_grant_configured // false) | tostring)
' "${summary_path}"
echo "  artifacts: ${summary_path}"
