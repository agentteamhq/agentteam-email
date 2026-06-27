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

"${container_engine}" build -t "${image}" .
echo "[cloudflare-oauth-prod-probe] built ${image}"
