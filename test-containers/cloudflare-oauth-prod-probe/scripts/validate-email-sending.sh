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

container_engine="${CONTAINER_ENGINE:-podman}"
: "${WT:?WT is required; set it in the repo-root .env per SETUP.md}"
wt="${WT}"
image="${PROBE_IMAGE:-atemail.${wt}.cloudflare-oauth-prod-probe:stage}"
oauth_token_store_volume="atemail.${wt}.cf-oauth-prod-probe-oauth-token-store"
oauth_token_store_path="/oauth-token-store/refresh-token.json"
cloudflare_tunnel_hostname="${CLOUDFLARE_TUNNEL_HOSTNAME:-${TAILSCALE_FUNNEL_HOSTNAME:-localhost}}"
callback_path="${PROBE_CALLBACK_PATH:-/oauth/callback/cloudflare}"
redirect_uri="https://${cloudflare_tunnel_hostname}${callback_path}"
cloudflare_api_base_url="${AT_EMAIL_ADMIN_CF_API_BASE_URL:-https://api.cloudflare.com/client/v4}"
cloudflare_oauth_authorization_url="${AT_EMAIL_ADMIN_CF_OAUTH_AUTHORIZATION_URL:-https://dash.cloudflare.com/oauth2/auth}"
cloudflare_oauth_scopes="${AT_EMAIL_ADMIN_CF_OAUTH_SCOPES:-workers-r2.read workers-r2.write workers-scripts.read workers-scripts.write dns.read dns.write zone.read cloud-email-security.read email-routing-address.read email-routing-address.write email-routing-rule.read email-routing-rule.write email-routing-suppression.read email-security-dmarcreports.read email-sending.read email-sending.write offline_access}"
cloudflare_oauth_token_url="${AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_URL:-https://dash.cloudflare.com/oauth2/token}"

: "${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID:?AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID is required}"
: "${PROBE_EMAIL_FROM:?PROBE_EMAIL_FROM is required for real Email Sending validation}"
: "${PROBE_EMAIL_TO:?PROBE_EMAIL_TO is required for real Email Sending validation}"
: "${PROBE_REAL_EMAIL_SEND_CONFIRM:?PROBE_REAL_EMAIL_SEND_CONFIRM=send-real-email is required for real Email Sending validation}"
if [ "${PROBE_REAL_EMAIL_SEND_CONFIRM}" != "send-real-email" ]; then
  echo "[cloudflare-oauth-prod-probe] PROBE_REAL_EMAIL_SEND_CONFIRM must be send-real-email" >&2
  exit 1
fi

if ! "${container_engine}" volume exists "${oauth_token_store_volume}" >/dev/null 2>&1; then
  echo "[cloudflare-oauth-prod-probe] OAuth token store volume missing: ${oauth_token_store_volume}" >&2
  exit 1
fi

if ! "${container_engine}" image exists "${image}" >/dev/null 2>&1; then
  bash scripts/build.sh
fi

run_id="${TEST_RUN_ID:-}"
if [ -z "${run_id}" ] && [ -f tmp/current-run ]; then
  run_id="$(tr -d '\n' <tmp/current-run)"
fi
if [ -z "${run_id}" ]; then
  run_id="$(date +%Y%m%d-%H%M%S)"
  mkdir -p tmp
  printf '%s\n' "${run_id}" >tmp/current-run
fi
run_dir="${root_dir}/tmp/run-${run_id}"
mkdir -p "${run_dir}/diagnostics"

echo "[cloudflare-oauth-prod-probe] run id: ${run_id}"
echo "[cloudflare-oauth-prod-probe] run dir: ${run_dir}"
echo "[cloudflare-oauth-prod-probe] running real Email Sending validation"

"${container_engine}" run --rm \
  --user 0:0 \
  -e PROBE_REDIRECT_URI="${redirect_uri}" \
  -e PROBE_REFRESH_TOKEN_STORE_PATH="${oauth_token_store_path}" \
  -e PROBE_EVENTS_PATH=/test-run/email-sending-validation-events.jsonl \
  -e CLOUDFLARE_OAUTH_CLIENT_ID="${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID}" \
  -e CLOUDFLARE_OAUTH_AUTHORIZATION_URL="${cloudflare_oauth_authorization_url}" \
  -e CLOUDFLARE_OAUTH_TOKEN_URL="${cloudflare_oauth_token_url}" \
  -e CLOUDFLARE_API_BASE_URL="${cloudflare_api_base_url}" \
  -e CLOUDFLARE_OAUTH_SCOPES="${cloudflare_oauth_scopes}" \
  -e PROBE_CLOUDFLARE_ACCOUNT_ID="${PROBE_CLOUDFLARE_ACCOUNT_ID:-}" \
  -e PROBE_REAL_EMAIL_SEND_CONFIRM="${PROBE_REAL_EMAIL_SEND_CONFIRM}" \
  -e PROBE_EMAIL_FROM="${PROBE_EMAIL_FROM}" \
  -e PROBE_EMAIL_TO="${PROBE_EMAIL_TO}" \
  -v "${oauth_token_store_volume}:/oauth-token-store:Z" \
  -v "${run_dir}:/test-run:Z" \
  "${image}" validate-email-sending | tee "${run_dir}/diagnostics/email-sending-validation-result.json"
