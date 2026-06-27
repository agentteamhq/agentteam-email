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

: "${CLOUDFLARE_TUNNEL:?CLOUDFLARE_TUNNEL is required}"
cloudflare_tunnel_hostname="${CLOUDFLARE_TUNNEL_HOSTNAME:-${TAILSCALE_FUNNEL_HOSTNAME:-}}"
: "${cloudflare_tunnel_hostname:?CLOUDFLARE_TUNNEL_HOSTNAME or TAILSCALE_FUNNEL_HOSTNAME is required}"
: "${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID:?AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID is required}"

container_engine="${CONTAINER_ENGINE:-podman}"
: "${WT:?WT is required; set it in the repo-root .env per SETUP.md}"
wt="${WT}"
image="${PROBE_IMAGE:-atemail.${wt}.cloudflare-oauth-prod-probe:stage}"
cloudflared_image="${CLOUDFLARED_IMAGE:-docker.io/cloudflare/cloudflared:2026.6.1}"
pod_name="atemail.${wt}.cf-oauth-prod-probe"
server_name="atemail.${wt}.cf-oauth-prod-probe-server"
cloudflared_name="atemail.${wt}.cf-oauth-prod-probe-cloudflared"
legacy_tailscale_name="atemail.${wt}.cf-oauth-prod-probe-tailscale"
oauth_token_store_volume="atemail.${wt}.cf-oauth-prod-probe-oauth-token-store"
oauth_token_store_path="/oauth-token-store/refresh-token.json"
listen_addr="${PROBE_LISTEN_ADDR:-127.0.0.1:9003}"
callback_path="${PROBE_CALLBACK_PATH:-/oauth/callback/cloudflare}"
redirect_uri="https://${cloudflare_tunnel_hostname}${callback_path}"
connect_url="https://${cloudflare_tunnel_hostname}/"
cloudflare_api_base_url="${AT_EMAIL_ADMIN_CF_API_BASE_URL:-https://api.cloudflare.com/client/v4}"
cloudflare_oauth_authorization_url="${AT_EMAIL_ADMIN_CF_OAUTH_AUTHORIZATION_URL:-https://dash.cloudflare.com/oauth2/auth}"
cloudflare_oauth_scopes="${AT_EMAIL_ADMIN_CF_OAUTH_SCOPES:-workers-r2.read workers-r2.write workers-scripts.read workers-scripts.write dns.read dns.write zone.read cloud-email-security.read email-routing-address.read email-routing-address.write email-routing-rule.read email-routing-rule.write email-routing-suppression.read email-security-dmarcreports.read email-sending.read email-sending.write offline_access}"
cloudflare_oauth_token_auth_method="${AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_AUTH_METHOD:-client_secret_basic}"
cloudflare_oauth_token_url="${AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_URL:-https://dash.cloudflare.com/oauth2/token}"
if [ "${cloudflare_oauth_token_auth_method}" != "none" ]; then
  : "${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_SECRET:?AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_SECRET is required unless AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_AUTH_METHOD is none}"
fi

run_id="${TEST_RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
run_dir="${root_dir}/tmp/run-${run_id}"
current_run_file="${root_dir}/tmp/current-run"

mkdir -p \
  "${run_dir}/containers" \
  "${run_dir}/diagnostics" \
  "${run_dir}/generated-inputs" \
  "${run_dir}/subprocess"
printf '%s\n' "${run_id}" >"${current_run_file}"

write_summary() {
  local status="$1"
  cat >"${run_dir}/result-summary.json" <<JSON
{
  "run_id": "${run_id}",
  "status": "${status}",
  "connect_url": "${connect_url}",
  "callback_uri": "${redirect_uri}",
  "token_auth_method": "${cloudflare_oauth_token_auth_method}",
  "server_container": "${server_name}",
  "cloudflared_container": "${cloudflared_name}",
  "oauth_token_store_volume": "${oauth_token_store_volume}"
}
JSON
}

collect_container_logs() {
  "${container_engine}" ps -a --filter "name=atemail.${wt}.cf-oauth-prod-probe" >"${run_dir}/diagnostics/podman-ps.txt" 2>&1 || true
  "${container_engine}" logs "${server_name}" >"${run_dir}/containers/server.log" 2>&1 || true
  "${container_engine}" logs "${cloudflared_name}" >"${run_dir}/containers/cloudflared.log" 2>&1 || true
}

on_start_failure() {
  local status="$?"
  if [ "${status}" -ne 0 ]; then
    echo "[cloudflare-oauth-prod-probe] start failed; collecting artifacts in ${run_dir}" >&2
    collect_container_logs
    write_summary "start_failed"
    bash scripts/submit-artifacts.sh "${run_id}" || true
  fi
  exit "${status}"
}
trap on_start_failure EXIT

echo "[cloudflare-oauth-prod-probe] run id: ${run_id}"
echo "[cloudflare-oauth-prod-probe] run dir: ${run_dir}"

bash scripts/build.sh 2>&1 | tee "${run_dir}/subprocess/build.log"

if ! "${container_engine}" pod exists "${pod_name}" >/dev/null 2>&1; then
  "${container_engine}" pod create --name "${pod_name}" >/dev/null
fi

"${container_engine}" rm -f "${server_name}" >/dev/null 2>&1 || true
"${container_engine}" rm -f "${cloudflared_name}" >/dev/null 2>&1 || true
"${container_engine}" rm -f "${legacy_tailscale_name}" >/dev/null 2>&1 || true
if ! "${container_engine}" volume exists "${oauth_token_store_volume}" >/dev/null 2>&1; then
  "${container_engine}" volume create "${oauth_token_store_volume}" >/dev/null
fi

"${container_engine}" run -d \
  --name "${server_name}" \
  --pod "${pod_name}" \
  --user 0:0 \
  -e PROBE_LISTEN_ADDR="${listen_addr}" \
  -e PROBE_CALLBACK_PATH="${callback_path}" \
  -e PROBE_REDIRECT_URI="${redirect_uri}" \
  -e PROBE_EVENTS_PATH=/test-run/events.jsonl \
  -e PROBE_REFRESH_TOKEN_STORE_PATH="${oauth_token_store_path}" \
  -e TEST_ARTIFACTS_DIR=/test-run \
  -e TEST_RUN_ID="${run_id}" \
  -e CLOUDFLARE_OAUTH_CLIENT_ID="${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID}" \
  -e CLOUDFLARE_OAUTH_CLIENT_SECRET="${AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_SECRET:-}" \
  -e CLOUDFLARE_OAUTH_AUTHORIZATION_URL="${cloudflare_oauth_authorization_url}" \
  -e CLOUDFLARE_OAUTH_TOKEN_AUTH_METHOD="${cloudflare_oauth_token_auth_method}" \
  -e CLOUDFLARE_OAUTH_TOKEN_URL="${cloudflare_oauth_token_url}" \
  -e CLOUDFLARE_API_BASE_URL="${cloudflare_api_base_url}" \
  -e CLOUDFLARE_OAUTH_SCOPES="${cloudflare_oauth_scopes}" \
  -v "${run_dir}:/test-run:Z" \
  -v "${oauth_token_store_volume}:/oauth-token-store:Z" \
  "${image}" >/dev/null

"${container_engine}" run -d \
  --name "${cloudflared_name}" \
  --pod "${pod_name}" \
  -e TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL}" \
  "${cloudflared_image}" \
  tunnel --no-autoupdate run >/dev/null

for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 1
  collect_container_logs

  if [ "$("${container_engine}" inspect -f '{{.State.Running}}' "${server_name}" 2>/dev/null || echo false)" != "true" ]; then
    echo "[cloudflare-oauth-prod-probe] server container failed to stay running" >&2
    tail -n 80 "${run_dir}/containers/server.log" >&2 || true
    exit 1
  fi

  if [ "$("${container_engine}" inspect -f '{{.State.Running}}' "${cloudflared_name}" 2>/dev/null || echo false)" != "true" ]; then
    echo "[cloudflare-oauth-prod-probe] cloudflared container failed to stay running" >&2
    tail -n 120 "${run_dir}/containers/cloudflared.log" >&2 || true
    exit 1
  fi
done

write_summary "running"
trap - EXIT

echo "[cloudflare-oauth-prod-probe] started"
echo "[cloudflare-oauth-prod-probe] run id: ${run_id}"
echo "[cloudflare-oauth-prod-probe] run dir: ${run_dir}"
echo "[cloudflare-oauth-prod-probe] open: ${connect_url}"
echo "[cloudflare-oauth-prod-probe] logs: mise run //test-containers/cloudflare-oauth-prod-probe:logs"
