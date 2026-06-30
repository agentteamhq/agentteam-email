#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

compose_env_file="${AT_EMAIL_ADMIN_LOCAL_COMPOSE_ENV_FILE:-.env.compose}"
compose_example_file="docs/examples/compose/.env.example"
compose_network="agentteam-email-network"
compose_files=(-f compose.yaml -f compose.build.yaml)

fail() {
  printf 'local-compose: %s\n' "$*" >&2
  exit 1
}

compose_command() {
  if [[ -n "${AT_EMAIL_ADMIN_COMPOSE_COMMAND:-}" ]]; then
    # shellcheck disable=SC2206
    local command_parts=(${AT_EMAIL_ADMIN_COMPOSE_COMMAND})
    printf '%s\n' "${command_parts[@]}"
    return
  fi

  local engine
  engine="$(container_engine)"
  if "${engine}" compose version >/dev/null 2>&1; then
    printf '%s\n' "${engine}" compose
    return
  fi

  if command -v "${engine}-compose" >/dev/null 2>&1; then
    printf '%s\n' "${engine}-compose"
    return
  fi

  fail "missing Compose CLI for CONTAINER_ENGINE=${engine}; set AT_EMAIL_ADMIN_COMPOSE_COMMAND"
}

container_engine() {
  printf '%s\n' "${CONTAINER_ENGINE:?missing CONTAINER_ENGINE}"
}

read_compose_command() {
  mapfile -t compose_cmd < <(compose_command)
}

compose_args() {
  printf '%s\n' --env-file "${compose_env_file}" "${compose_files[@]}"
}

ensure_env_file() {
  if [[ -f "${compose_env_file}" ]]; then
    printf 'Compose env already exists: %s\n' "${compose_env_file}"
    return
  fi

  cp "${compose_example_file}" "${compose_env_file}"
  printf 'Created %s from %s\n' "${compose_env_file}" "${compose_example_file}"
  printf 'Review %s before starting the production-like local stack.\n' "${compose_env_file}"
}

require_env_file() {
  if [[ ! -f "${compose_env_file}" ]]; then
    fail "missing ${compose_env_file}; run 'mise run stack:env' first"
  fi
}

ensure_network() {
  local engine
  engine="$(container_engine)"

  if "${engine}" network inspect "${compose_network}" >/dev/null 2>&1; then
    printf 'Compose network already exists: %s\n' "${compose_network}"
    return
  fi

  "${engine}" network create "${compose_network}" >/dev/null
  printf 'Created Compose network: %s\n' "${compose_network}"
}

run_compose() {
  require_env_file
  read_compose_command
  mapfile -t args < <(compose_args)
  "${compose_cmd[@]}" "${args[@]}" "$@"
}

published_base_url() {
  read_compose_command
  mapfile -t args < <(compose_args)

  local port_output
  port_output="$("${compose_cmd[@]}" "${args[@]}" port atemail-web-server 4321 2>/dev/null | tail -n 1 || true)"

  if [[ -n "${port_output}" ]]; then
    printf 'http://%s\n' "${port_output}"
    return
  fi

  printf 'http://localhost:%s\n' "${AT_EMAIL_ADMIN_FRONTEND_PORT:-23100}"
}

smoke_stack() {
  require_env_file

  local base_url
  base_url="$(published_base_url)"
  base_url="${base_url%/}"

  printf 'Checking %s/health\n' "${base_url}"
  curl -fsS "${base_url}/health" >/dev/null

  local manifest_status
  manifest_status="$(curl -sS -o /dev/null -w '%{http_code}' "${base_url}/site.webmanifest?v=local")"
  if [[ "${manifest_status}" != '200' ]]; then
    fail "expected site.webmanifest status 200, got ${manifest_status}"
  fi

  local manifest_content_type
  manifest_content_type="$(curl -fsSI "${base_url}/site.webmanifest?v=local" | tr -d '\r' | awk 'tolower($0) ~ /^content-type:/ { print; exit }')"
  case "${manifest_content_type}" in
    *application/manifest+json*)
      ;;
    *)
      fail "unexpected site.webmanifest ${manifest_content_type:-missing content-type}"
      ;;
  esac

  printf 'Production-like local stack smoke passed: %s\n' "${base_url}"
}

case "${1:-}" in
  env)
    ensure_env_file
    ;;
  config)
    run_compose config
    ;;
  network)
    ensure_network
    ;;
  build)
    run_compose build atemail-mail-control-service atemail-web-server
    ;;
  up)
    ensure_network
    run_compose up -d --build
    ;;
  down)
    run_compose down
    ;;
  status)
    run_compose ps
    ;;
  logs)
    shift
    run_compose logs -f "$@"
    ;;
  smoke)
    smoke_stack
    ;;
  *)
    fail 'usage: scripts/local-compose.sh {env|config|network|build|up|down|status|logs|smoke}'
    ;;
esac
