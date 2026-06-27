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
image="${PROBE_IMAGE:-atemail.${wt}.cloudflare-oauth-prod-probe:stage}"
current_run_file="${root_dir}/tmp/current-run"
legacy_tailscale_state_volume="atemail.${wt}.cf-oauth-prod-probe-tailscale-state"
oauth_token_store_volume="atemail.${wt}.cf-oauth-prod-probe-oauth-token-store"
oauth_token_store_path="/oauth-token-store/refresh-token.json"

if [ -f "${current_run_file}" ]; then
  run_id="$(tr -d '\n' <"${current_run_file}")"
  echo "[cloudflare-oauth-prod-probe] current run id: ${run_id}"
  echo "[cloudflare-oauth-prod-probe] current run dir: ${root_dir}/tmp/run-${run_id}"
else
  echo "[cloudflare-oauth-prod-probe] no current run id"
fi

"${container_engine}" ps -a --filter "name=atemail.${wt}.cf-oauth-prod-probe"

if "${container_engine}" volume exists "${legacy_tailscale_state_volume}" >/dev/null 2>&1; then
  echo "[cloudflare-oauth-prod-probe] legacy tailscale state volume: ${legacy_tailscale_state_volume}"
else
  echo "[cloudflare-oauth-prod-probe] legacy tailscale state volume missing: ${legacy_tailscale_state_volume}"
fi

if "${container_engine}" volume exists "${oauth_token_store_volume}" >/dev/null 2>&1; then
  echo "[cloudflare-oauth-prod-probe] OAuth token store volume: ${oauth_token_store_volume}"
  if "${container_engine}" image exists "${image}" >/dev/null 2>&1; then
    if "${container_engine}" run --rm --user 0:0 --entrypoint /bin/sh \
      -v "${oauth_token_store_volume}:/oauth-token-store:Z" \
      "${image}" -c "test -s '${oauth_token_store_path}'"; then
      echo "[cloudflare-oauth-prod-probe] OAuth refresh token file: present"
    else
      echo "[cloudflare-oauth-prod-probe] OAuth refresh token file: missing"
    fi
  else
    echo "[cloudflare-oauth-prod-probe] OAuth refresh token file: not checked because image is missing: ${image}"
  fi
else
  echo "[cloudflare-oauth-prod-probe] OAuth token store volume missing: ${oauth_token_store_volume}"
fi
