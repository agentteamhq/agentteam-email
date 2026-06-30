#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

compose_files=("compose.yaml" "compose.dev.yaml")
support_services=(mongodb redis rspamd wildduck haraka zonemta mailpit minio)
wt="${WT:-main}"
project="atemail-${wt}-dev"
run_root="tmp"

fail() {
  printf 'dev-stack: %s\n' "$*" >&2
  exit 1
}

compose_command() {
  if [[ -n "${AT_EMAIL_ADMIN_COMPOSE_COMMAND:-}" ]]; then
    # shellcheck disable=SC2206
    local command_parts=(${AT_EMAIL_ADMIN_COMPOSE_COMMAND})
    printf '%s\n' "${command_parts[@]}"
    return
  fi

  if command -v podman-compose >/dev/null 2>&1; then
    printf '%s\n' podman-compose
    return
  fi

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    printf '%s\n' docker compose
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    printf '%s\n' docker-compose
    return
  fi

  fail 'missing Compose CLI; install podman-compose, docker compose, or docker-compose'
}

read_compose_command() {
  mapfile -t compose_cmd < <(compose_command)
}

first_env() {
  local fallback="$1"
  shift
  local name
  for name in "$@"; do
    if [[ -n "${!name:-}" ]]; then
      printf '%s\n' "${!name}"
      return
    fi
  done
  printf '%s\n' "${fallback}"
}

default_env() {
  local name="$1"
  local value="$2"
  if [[ -z "${!name:-}" ]]; then
    export "${name}=${value}"
  fi
}

prepare_compose_env() {
  default_env AT_EMAIL_ADMIN_PULL_POLICY 'missing'
  default_env AT_EMAIL_ADMIN_PUBLIC_HOSTNAME "$(first_env 'http://127.0.0.1:4321' PUBLIC_HOSTNAME AT_EMAIL_ADMIN_PUBLIC_HOSTNAME)"
  default_env AT_EMAIL_ADMIN_BETTER_AUTH_SECRET "$(first_env 'local-dev-better-auth-secret' BETTER_AUTH_SECRET AT_EMAIL_ADMIN_BETTER_AUTH_SECRET)"
  default_env AT_EMAIL_ADMIN_ENCRYPT_SECRET_KEY "$(first_env 'local-dev-encrypt-secret-key' ENCRYPT_SECRET_KEY AT_EMAIL_ADMIN_ENCRYPT_SECRET_KEY)"
  default_env AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN 'local-dev-control-to-web-token'
  default_env AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN 'local-dev-wildduck-admin-token'
  default_env AT_EMAIL_ADMIN_WILDDUCK_ACCESS_CONTROL_SECRET 'local-dev-wildduck-access-control-secret'
  default_env AT_EMAIL_ADMIN_MAIL_LOOP_SECRET 'local-dev-mail-loop-secret'
  default_env AT_EMAIL_ADMIN_ZONEMTA_RELAY_PASSWORD 'local-dev-zonemta-relay-password'
  default_env AT_EMAIL_ADMIN_FEEDBACK_MAILBOX_PASSWORD 'local-dev-feedback-mailbox-password'
  default_env AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID "$(first_env 'local-dev-cloudflare-client-id' AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID CLOUDFLARE_OAUTH_CLIENT_ID)"
  default_env AT_EMAIL_ADMIN_R2_ACCOUNT_ID 'local-dev-r2-account'
  default_env AT_EMAIL_ADMIN_R2_API_TOKEN 'local-dev-r2-api-token'
  default_env AT_EMAIL_ADMIN_R2_ENDPOINT 'http://127.0.0.1:9000'
  default_env AT_EMAIL_ADMIN_R2_REGION 'us-east-1'
  default_env AT_EMAIL_ADMIN_R2_BUCKET 'agent-mail-dev-archive'
  default_env AT_EMAIL_ADMIN_R2_ACCESS_KEY_ID 'local-dev-r2-access-key'
  default_env AT_EMAIL_ADMIN_R2_SECRET_ACCESS_KEY 'local-dev-r2-secret-key'

  export AT_EMAIL_ADMIN_DEV_NETWORK="${AT_EMAIL_ADMIN_DEV_NETWORK:-${project}-network}"
  export AT_EMAIL_ADMIN_MONGODB_REPLICA_SET_NAME="${AT_EMAIL_ADMIN_MONGODB_REPLICA_SET_NAME:-rs0}"
  export AT_EMAIL_ADMIN_REDIS_URL='redis://redis:6379/3'
  export AT_EMAIL_ADMIN_WILDDUCK_MONGODB_URI="mongodb://mongodb:27017/wildduck?replicaSet=${AT_EMAIL_ADMIN_MONGODB_REPLICA_SET_NAME}&maxPoolSize=${AT_EMAIL_ADMIN_WILDDUCK_MONGODB_MAX_POOL_SIZE:-4}&minPoolSize=${AT_EMAIL_ADMIN_WILDDUCK_MONGODB_MIN_POOL_SIZE:-0}&maxIdleTimeMS=${AT_EMAIL_ADMIN_WILDDUCK_MONGODB_MAX_IDLE_TIME_MS:-60000}"
  export AT_EMAIL_ADMIN_CONTROL_MONGODB_URI="mongodb://mongodb:27017/agent_mail_control?replicaSet=${AT_EMAIL_ADMIN_MONGODB_REPLICA_SET_NAME}&maxPoolSize=${AT_EMAIL_ADMIN_CONTROL_MONGODB_MAX_POOL_SIZE:-4}&minPoolSize=${AT_EMAIL_ADMIN_CONTROL_MONGODB_MIN_POOL_SIZE:-0}&maxIdleTimeMS=${AT_EMAIL_ADMIN_CONTROL_MONGODB_MAX_IDLE_TIME_MS:-60000}"
  export AT_EMAIL_ADMIN_APP_MONGODB_URI="mongodb://mongodb:27017/agentteam_email?replicaSet=${AT_EMAIL_ADMIN_MONGODB_REPLICA_SET_NAME}"
  export AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL='http://wildduck:8080'
  export AT_EMAIL_ADMIN_WILDDUCK_IMAP_ADDRESS='wildduck:10143'
  export AT_EMAIL_ADMIN_HARAKA_SMTP_ADDRESS='haraka:10025'
  export AT_EMAIL_ADMIN_ZONEMTA_DSN_ADDRESS='zonemta:2526'
  export AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_BASE_URL='http://host.containers.internal:4321'
  export AT_EMAIL_ADMIN_ZONEMTA_RELAY_HOST='host.containers.internal'
}

ensure_runtime_config_env() {
  if [[ -n "${AT_EMAIL_ADMIN_DEV_CONFIG_DIR:-}" ]]; then
    return
  fi

  export AT_EMAIL_ADMIN_DEV_CONFIG_DIR="${repo_root}/${run_root}/run-uninitialized/config"
}

run_compose() {
  prepare_compose_env
  ensure_runtime_config_env
  read_compose_command
  local args=()
  local file
  for file in "${compose_files[@]}"; do
    args+=(-f "${file}")
  done
  "${compose_cmd[@]}" -p "${project}" "${args[@]}" "$@"
}

kill_log_tails() {
  local pid_file pid
  shopt -s nullglob
  for pid_file in "${run_root}"/run-*/logs/containers.pid; do
    pid="$(cat "${pid_file}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      kill "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" >/dev/null 2>&1 || true
    fi
  done
  shopt -u nullglob
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
  mkdir -p "${run_dir}/logs" "${run_dir}/config"
}

render_runtime_configs() {
  local run_dir="$1"
  prepare_compose_env
  export AT_EMAIL_ADMIN_DEV_CONFIG_DIR="${repo_root}/${run_dir}/config"
  local rendered_compose="${AT_EMAIL_ADMIN_DEV_CONFIG_DIR}/compose.rendered.yaml"
  run_compose config >"${rendered_compose}"
  node scripts/dev-render-compose-configs.mjs "${rendered_compose}" "${AT_EMAIL_ADMIN_DEV_CONFIG_DIR}"
}

start_log_tail() {
  local run_dir="$1"
  run_compose logs -f --no-color "${support_services[@]}" >"${run_dir}/logs/containers.log" 2>&1 &
  printf '%s\n' "$!" >"${run_dir}/logs/containers.pid"
}

wait_http() {
  local label="$1"
  local url="$2"
  shift 2
  local headers=("$@")
  for _ in {1..120}; do
    if curl -fsS "${headers[@]}" "${url}" >/dev/null 2>&1; then
      printf '%s ready: %s\n' "${label}" "${url}"
      return
    fi
    sleep 1
  done
  fail "${label} did not become ready at ${url}"
}

wait_tcp() {
  local label="$1"
  local host="$2"
  local port="$3"
  for _ in {1..120}; do
    if (: >"/dev/tcp/${host}/${port}") >/dev/null 2>&1; then
      printf '%s ready: %s:%s\n' "${label}" "${host}" "${port}"
      return
    fi
    sleep 1
  done
  fail "${label} did not become ready at ${host}:${port}"
}

ensure_r2_bucket() {
  local alias_name="local-dev"
  local endpoint="http://127.0.0.1:9000"
  run_compose exec -T minio mc alias set "${alias_name}" "${endpoint}" \
    "${AT_EMAIL_ADMIN_R2_ACCESS_KEY_ID:?missing AT_EMAIL_ADMIN_R2_ACCESS_KEY_ID}" \
    "${AT_EMAIL_ADMIN_R2_SECRET_ACCESS_KEY:?missing AT_EMAIL_ADMIN_R2_SECRET_ACCESS_KEY}" >/dev/null
  run_compose exec -T minio mc mb --ignore-existing --with-lock=false \
    "${alias_name}/${AT_EMAIL_ADMIN_R2_BUCKET:?missing AT_EMAIL_ADMIN_R2_BUCKET}" >/dev/null
  printf 'R2 archive bucket ready: %s\n' "${AT_EMAIL_ADMIN_R2_BUCKET}"
}

start_stack() {
  : "${WT:?missing WT}"
  local run_id run_dir
  kill_log_tails
  create_run_dir

  printf 'Starting dev support stack: %s\n' "${project}"
  printf 'Run id: %s\n' "${run_id}"
  printf 'Run directory: %s\n' "${run_dir}"
  render_runtime_configs "${run_dir}"
  run_compose up -d --no-deps --remove-orphans "${support_services[@]}"
  start_log_tail "${run_dir}"

  wait_http 'Mailpit' "http://127.0.0.1:${AT_EMAIL_ADMIN_DEV_MAILPIT_HTTP_PORT:-8025}/api/v1/info"
  wait_http 'MinIO' "http://127.0.0.1:${AT_EMAIL_ADMIN_DEV_MINIO_PORT:-9000}/minio/health/ready"
  ensure_r2_bucket
  wait_http 'WildDuck' "http://127.0.0.1:${AT_EMAIL_ADMIN_DEV_WILDDUCK_API_PORT:-8080}/health" \
    -H "X-Access-Token: ${AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN:?missing AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN}"
  wait_tcp 'Haraka SMTP' 127.0.0.1 "${AT_EMAIL_ADMIN_DEV_HARAKA_SMTP_PORT:-10025}"
  wait_tcp 'ZoneMTA DSN SMTP' 127.0.0.1 "${AT_EMAIL_ADMIN_DEV_ZONEMTA_DSN_PORT:-2526}"

  printf 'Dev support stack ready. Logs: %s/logs/containers.log\n' "${run_dir}"
}

stop_stack() {
  kill_log_tails
  read_compose_command
  if [[ "${compose_cmd[0]}" == "podman-compose" ]]; then
    prepare_compose_env
    local service
    for service in "${support_services[@]}"; do
      podman rm -f "${project}_${service}_1" >/dev/null 2>&1 || true
    done
    podman network rm "${AT_EMAIL_ADMIN_DEV_NETWORK}" >/dev/null 2>&1 || true
    return
  fi

  run_compose rm -sf "${support_services[@]}"
}

status_stack() {
  run_compose ps
}

logs_stack() {
  run_compose logs -f "${support_services[@]}"
}

case "${1:-}" in
  start)
    start_stack
    ;;
  stop)
    stop_stack
    ;;
  status)
    status_stack
    ;;
  logs)
    logs_stack
    ;;
  *)
    fail 'usage: scripts/dev-stack.sh {start|stop|status|logs}'
    ;;
esac
