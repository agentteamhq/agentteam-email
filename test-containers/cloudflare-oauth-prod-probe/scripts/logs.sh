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
server_name="atemail.${wt}.cf-oauth-prod-probe-server"
cloudflared_name="atemail.${wt}.cf-oauth-prod-probe-cloudflared"
current_run_file="${root_dir}/tmp/current-run"

if [ ! -f "${current_run_file}" ]; then
  echo "[cloudflare-oauth-prod-probe] no current run id; start the probe first" >&2
  exit 1
fi

run_id="$(tr -d '\n' <"${current_run_file}")"
run_dir="${root_dir}/tmp/run-${run_id}"
mkdir -p "${run_dir}/containers"

echo "[cloudflare-oauth-prod-probe] run id: ${run_id}"
echo "[cloudflare-oauth-prod-probe] retaining live logs under ${run_dir}/containers"

("${container_engine}" logs -f "${server_name}" 2>&1 | sed -u 's/^/[server] /' | tee -a "${run_dir}/containers/server.follow.log") &
server_pid=$!
("${container_engine}" logs -f "${cloudflared_name}" 2>&1 | sed -u 's/^/[cloudflared] /' | tee -a "${run_dir}/containers/cloudflared.follow.log") &
cloudflared_pid=$!

trap 'kill "${server_pid}" "${cloudflared_pid}" >/dev/null 2>&1 || true' INT TERM EXIT
wait
