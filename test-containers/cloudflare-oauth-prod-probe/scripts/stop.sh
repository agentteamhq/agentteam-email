#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd -- "${script_dir}/.." && pwd)"
cd "${root_dir}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

container_engine="${CONTAINER_ENGINE:-podman}"
: "${WT:?WT is required; set it in the repo-root .env per SETUP.md}"
wt="${WT}"
pod_name="atemail.${wt}.cf-oauth-prod-probe"
server_name="atemail.${wt}.cf-oauth-prod-probe-server"
cloudflared_name="atemail.${wt}.cf-oauth-prod-probe-cloudflared"
legacy_tailscale_name="atemail.${wt}.cf-oauth-prod-probe-tailscale"
oauth_token_store_volume="atemail.${wt}.cf-oauth-prod-probe-oauth-token-store"
current_run_file="${root_dir}/tmp/current-run"

run_id=""
run_dir=""
if [ -f "${current_run_file}" ]; then
  run_id="$(tr -d '\n' <"${current_run_file}")"
  run_dir="${root_dir}/tmp/run-${run_id}"
  mkdir -p "${run_dir}/containers" "${run_dir}/diagnostics"

  "${container_engine}" ps -a --filter "name=atemail.${wt}.cf-oauth-prod-probe" >"${run_dir}/diagnostics/podman-ps-before-stop.txt" 2>&1 || true
  "${container_engine}" logs "${server_name}" >"${run_dir}/containers/server.final.log" 2>&1 || true
  "${container_engine}" logs "${cloudflared_name}" >"${run_dir}/containers/cloudflared.final.log" 2>&1 || true
  "${container_engine}" logs "${legacy_tailscale_name}" >"${run_dir}/containers/tailscale.final.log" 2>&1 || true
fi

"${container_engine}" rm -f "${server_name}" "${cloudflared_name}" "${legacy_tailscale_name}" >/dev/null 2>&1 || true
"${container_engine}" pod rm -f "${pod_name}" >/dev/null 2>&1 || true

if [ -n "${run_id}" ]; then
  cat >"${run_dir}/result-summary.json" <<JSON
{
  "run_id": "${run_id}",
  "status": "stopped",
  "server_container": "${server_name}",
  "cloudflared_container": "${cloudflared_name}",
  "oauth_token_store_volume": "${oauth_token_store_volume}"
}
JSON
  bash scripts/submit-artifacts.sh "${run_id}"
fi

echo "[cloudflare-oauth-prod-probe] stopped"
