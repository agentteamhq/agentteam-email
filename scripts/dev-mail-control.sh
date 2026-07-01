#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

if [[ -n "${TEST_RUN_DIR:-}" ]]; then
  run_dir="${TEST_RUN_DIR}"
  base_name="$(basename "${run_dir}")"
  run_id="${TEST_RUN_ID:-${base_name#run-}}"
else
  run_id="${TEST_RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
  run_dir="tmp/run-${run_id}"
fi

mkdir -p "${run_dir}/logs"
run_dir_abs="$(readlink -f "${run_dir}")"
log_dir="${run_dir_abs}/logs"
log_file="${log_dir}/mail-control.log"
log_file_display="${run_dir}/logs/mail-control.log"
listen_address="${AT_EMAIL_ADMIN_CONTROL_LISTEN_ADDRESS:-:8081}"
: "${PUBLIC_HOSTNAME:?PUBLIC_HOSTNAME is required for dev mail-control}"
export AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_BASE_URL="${PUBLIC_HOSTNAME}"

printf 'Starting mail-control service from source on %s\n' "${listen_address}"
printf 'Run id: %s\n' "${run_id}"
printf 'Run directory: %s\n' "${run_dir}"
printf 'Mail-control log: %s\n' "${log_file_display}"
printf 'Control-to-web API base URL: %s\n' "${AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_BASE_URL}"

cd apps/mail-control-service
go run ./cmd/agent-mail-control-service -admin-listen-address "${listen_address}" 2>&1 | tee -a "${log_file}"
