#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

state_file="tmp/dev-runtime.state"
run_root="tmp"
RUN_ID=""
RUN_DIR=""
MAIL_CONTROL_PID=""
PNPM_DEV_PID=""

fail() {
  printf 'dev-runtime: %s\n' "$*" >&2
  exit 1
}

create_run_dir() {
  local requested_run_dir="${TEST_RUN_DIR:-}"
  if [[ -n "${requested_run_dir}" ]]; then
    run_dir="${requested_run_dir}"
    local base_name
    base_name="$(basename "${run_dir}")"
    run_id="${TEST_RUN_ID:-${base_name#run-}}"
  else
    run_id="${TEST_RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
    run_dir="${run_root}/run-${run_id}"
  fi

  mkdir -p "${run_dir}/logs" "${run_dir}/pids"
}

load_state() {
  if [[ ! -f "${state_file}" ]]; then
    return 1
  fi

  # shellcheck disable=SC1090
  source "${state_file}"
}

pid_is_running() {
  local pid="$1"
  [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1
}

runtime_is_running() {
  load_state || return 1
  pid_is_running "${MAIL_CONTROL_PID:-}" || pid_is_running "${PNPM_DEV_PID:-}"
}

write_state() {
  {
    printf 'RUN_ID=%q\n' "${run_id}"
    printf 'RUN_DIR=%q\n' "${run_dir}"
    printf 'MAIL_CONTROL_PID=%q\n' "${mail_control_pid}"
    printf 'PNPM_DEV_PID=%q\n' "${pnpm_dev_pid}"
  } >"${state_file}"
}

kill_process_group() {
  local pid="$1"
  if ! pid_is_running "${pid}"; then
    return
  fi

  kill -TERM "-${pid}" >/dev/null 2>&1 || kill -TERM "${pid}" >/dev/null 2>&1 || true

  for _ in {1..40}; do
    if ! pid_is_running "${pid}"; then
      return
    fi
    sleep 0.25
  done

  kill -KILL "-${pid}" >/dev/null 2>&1 || kill -KILL "${pid}" >/dev/null 2>&1 || true
}

started_pid=""

start_managed_process() {
  local name="$1"
  local log_file="$2"
  shift 2

  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" >"${log_file}" 2>&1 &
  else
    "$@" >"${log_file}" 2>&1 &
  fi

  started_pid="$!"
  printf '%s\n' "${started_pid}" >"${run_dir}/pids/${name}.pid"

  sleep 0.5
  if ! pid_is_running "${started_pid}"; then
    fail "${name} exited during startup; see ${log_file}"
  fi
}

wait_http() {
  local label="$1"
  local url="$2"
  local watched_pid="$3"
  local log_file="$4"

  for _ in {1..120}; do
    if curl -k -fsS "${url}" >/dev/null 2>&1; then
      printf '%s ready: %s\n' "${label}" "${url}"
      return
    fi

    if ! pid_is_running "${watched_pid}"; then
      fail "${label} process exited before readiness; see ${log_file}"
    fi

    sleep 1
  done

  fail "${label} did not become ready at ${url}; see ${log_file}"
}

control_health_url() {
  local listen_address="${AT_EMAIL_ADMIN_CONTROL_LISTEN_ADDRESS:-:8081}"
  local port="${listen_address##*:}"
  if [[ -z "${port}" || "${port}" == "${listen_address}" ]]; then
    port="8081"
  fi

  printf 'http://127.0.0.1:%s/healthz\n' "${port}"
}

start_runtime() {
  : "${WT:?missing WT}"
  : "${PUBLIC_HOSTNAME:?PUBLIC_HOSTNAME is required for dev runtime}"

  if runtime_is_running; then
    fail "dev runtime already running: run id ${RUN_ID}; run mise run dev:restart or mise run dev:stop"
  fi

  rm -f "${state_file}"
  local run_id run_dir mail_control_pid pnpm_dev_pid
  create_run_dir

  local mail_control_log="${run_dir}/logs/mail-control.log"
  local pnpm_dev_log="${run_dir}/logs/pnpm-dev.log"

  printf 'Starting dev runtime\n'
  printf 'Run id: %s\n' "${run_id}"
  printf 'Run directory: %s\n' "${run_dir}"

  TEST_RUN_ID="${run_id}" TEST_RUN_DIR="${run_dir}" bash scripts/dev-stack.sh start

  local start_committed=0
  local started_pids=()
  cleanup_start_failure() {
    if [[ "${start_committed}" == "1" ]]; then
      return
    fi
    local pid
    for pid in "${started_pids[@]}"; do
      kill_process_group "${pid}"
    done
    rm -f "${state_file}"
  }
  trap cleanup_start_failure ERR

  start_managed_process \
    mail-control \
    "${mail_control_log}" \
    env TEST_RUN_ID="${run_id}" TEST_RUN_DIR="${run_dir}" bash scripts/dev-mail-control.sh
  mail_control_pid="${started_pid}"
  started_pids+=("${mail_control_pid}")

  start_managed_process \
    pnpm-dev \
    "${pnpm_dev_log}" \
    env TEST_RUN_ID="${run_id}" TEST_RUN_DIR="${run_dir}" pnpm dev
  pnpm_dev_pid="${started_pid}"
  started_pids+=("${pnpm_dev_pid}")

  write_state

  wait_http 'Mail control' "$(control_health_url)" "${mail_control_pid}" "${mail_control_log}"
  wait_http 'Frontend' "${PUBLIC_HOSTNAME%/}/health" "${pnpm_dev_pid}" "${pnpm_dev_log}"

  start_committed=1
  trap - ERR

  printf 'Dev runtime ready\n'
  printf 'Current run id: %s\n' "${run_id}"
  printf 'Logs:\n'
  printf '  containers: %s/logs/containers.log\n' "${run_dir}"
  printf '  mail-control: %s\n' "${mail_control_log}"
  printf '  pnpm dev: %s\n' "${pnpm_dev_log}"
}

stop_runtime() {
  local had_state=0
  if load_state; then
    had_state=1
    printf 'Stopping dev runtime: %s\n' "${RUN_ID}"
    kill_process_group "${MAIL_CONTROL_PID:-}"
    kill_process_group "${PNPM_DEV_PID:-}"
    rm -f "${state_file}"
  else
    printf 'No dev runtime marker found\n'
  fi

  bash scripts/dev-stack.sh stop

  if [[ "${had_state}" == "1" ]]; then
    printf 'Stopped dev runtime\n'
  fi
}

status_runtime() {
  if load_state; then
    printf 'Dev runtime marker\n'
    printf '  run id: %s\n' "${RUN_ID}"
    printf '  run directory: %s\n' "${RUN_DIR}"
    printf '  mail-control pid: %s (%s)\n' "${MAIL_CONTROL_PID:-}" "$(pid_is_running "${MAIL_CONTROL_PID:-}" && printf running || printf stopped)"
    printf '  pnpm dev pid: %s (%s)\n' "${PNPM_DEV_PID:-}" "$(pid_is_running "${PNPM_DEV_PID:-}" && printf running || printf stopped)"
  else
    printf 'No dev runtime marker found\n'
  fi

  bash scripts/dev-stack.sh status
}

case "${1:-}" in
  start)
    start_runtime
    ;;
  stop)
    stop_runtime
    ;;
  restart)
    stop_runtime
    start_runtime
    ;;
  status)
    status_runtime
    ;;
  *)
    fail 'usage: scripts/dev-runtime.sh {start|stop|restart|status}'
    ;;
esac
