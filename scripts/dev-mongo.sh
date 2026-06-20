#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "${repo_root}"

database_url="${MONGODB_URI:-${DATABASE_URL:-mongodb://localhost:27017/agentteam_email}}"
database_name="${MONGODB_DATABASE:-}"
container_name="${AGENTTEAM_EMAIL_DEV_MONGO_CONTAINER_NAME:-agentteam-email-mongo}"
data_dir="${AGENTTEAM_EMAIL_DEV_MONGO_DATA_DIR:-${HOME}/.local/share/agentteam-email/mongo}"
image="${AGENTTEAM_EMAIL_DEV_MONGO_IMAGE:-}"
if [[ -z "${image}" ]]; then
  image="$(
    node -e "
      const text = require('node:fs').readFileSync('mise.toml', 'utf8')
      const match = text.match(/^AGENTTEAM_EMAIL_DEV_MONGO_IMAGE\\s*=\\s*\"([^\"]+)\"/m)
      if (!match) process.exit(1)
      console.log(match[1])
    "
  )"
fi

fail() {
  printf 'dev-mongo: %s\n' "$*" >&2
  exit 1
}

container_running() {
  [[ "$("${CONTAINER_ENGINE}" container inspect -f '{{.State.Running}}' "${container_name}" 2>/dev/null || true)" == "true" ]]
}

container_exists() {
  "${CONTAINER_ENGINE}" container inspect "${container_name}" >/dev/null 2>&1
}

mongo_host() {
  node -e "const url = new URL(process.argv[1]); console.log(url.hostname)" "${database_url}"
}

mongo_port() {
  node -e "const url = new URL(process.argv[1]); console.log(url.port || '27017')" "${database_url}"
}

mongo_database() {
  if [[ -n "${database_name}" ]]; then
    printf '%s\n' "${database_name}"
    return
  fi

  node -e "const url = new URL(process.argv[1]); console.log(url.pathname.replace(/^\\/+/, '').split('/')[0] || 'agentteam_email')" "${database_url}"
}

require_local_url() {
  case "$(mongo_host)" in
    localhost|127.0.0.1|::1)
      ;;
    *)
      fail "db:start can only manage local MongoDB hosts, got $(mongo_host)"
      ;;
  esac
}

wait_ready() {
  for _ in {1..60}; do
    if "${CONTAINER_ENGINE}" exec "${container_name}" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  fail "MongoDB container ${container_name} did not become ready"
}

start_mongo() {
  require_local_url
  if container_running; then
    printf 'MongoDB already running: %s\n' "${container_name}"
  else
    mkdir -p "${data_dir}"
    if container_exists; then
      "${CONTAINER_ENGINE}" rm "${container_name}" >/dev/null
    fi
    "${CONTAINER_ENGINE}" run -d --name "${container_name}" \
      -p "$(mongo_port):27017" \
      -v "${data_dir}:/data/db:Z" \
      "${image}"
    printf 'MongoDB started: %s on localhost:%s\n' "${container_name}" "$(mongo_port)"
  fi

  wait_ready
  printf 'database: %s\n' "$(mongo_database)"
  printf 'MONGODB_URI=%s\n' "${database_url}"
}

stop_mongo() {
  if container_running; then
    "${CONTAINER_ENGINE}" stop "${container_name}"
  fi
  if container_exists; then
    "${CONTAINER_ENGINE}" rm "${container_name}"
  fi
}

status_mongo() {
  printf 'MONGODB_URI=%s\n' "${database_url}"
  "${CONTAINER_ENGINE}" ps -a --filter "name=${container_name}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

case "${1:-}" in
  start)
    start_mongo
    ;;
  stop)
    stop_mongo
    ;;
  status)
    status_mongo
    ;;
  logs)
    "${CONTAINER_ENGINE}" logs -f "${container_name}"
    ;;
  shell)
    "${CONTAINER_ENGINE}" exec -it "${container_name}" mongosh "$(mongo_database)"
    ;;
  *)
    fail "usage: $0 {start|stop|status|logs|shell}"
    ;;
esac
