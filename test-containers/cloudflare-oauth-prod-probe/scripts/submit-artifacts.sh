#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd -- "${script_dir}/.." && pwd)"
cd "${root_dir}"

run_id="${1:-}"
if [ -z "${run_id}" ]; then
  if [ ! -f tmp/current-run ]; then
    echo "[cloudflare-oauth-prod-probe] no current run id; skipping artifact submission" >&2
    exit 0
  fi
  run_id="$(tr -d '\n' <tmp/current-run)"
fi

run_dir="${root_dir}/tmp/run-${run_id}"
if [ ! -d "${run_dir}" ]; then
  echo "[cloudflare-oauth-prod-probe] run directory not found: ${run_dir}" >&2
  exit 1
fi

if [ -n "${TEST_ARTIFACT_SUBMIT_SKIP:-}" ]; then
  echo "[cloudflare-oauth-prod-probe] TEST_ARTIFACT_SUBMIT_SKIP is set; skipping artifact submission"
  exit 0
fi

if [ -f "${run_dir}/artifact-submit.json" ]; then
  echo "[cloudflare-oauth-prod-probe] artifact-submit.json already exists for run ${run_id}; skipping duplicate submission"
  exit 0
fi

container_engine="${CONTAINER_ENGINE:-podman}"

"${container_engine}" run --rm \
  --userns keep-id \
  --user "$(id -u):$(id -g)" \
  --env-host \
  -v "${root_dir}:/work:Z" \
  -w /work \
  system.registry.test/agentteam/test-artifact-ctl:latest \
  submit \
  --namespace agentteam/at-frontend/cloudflare-oauth-prod-probe \
  --suite cloudflare-oauth-prod-probe \
  --run-dir "/work/tmp/run-${run_id}" \
  --event-id "run-${run_id}"
