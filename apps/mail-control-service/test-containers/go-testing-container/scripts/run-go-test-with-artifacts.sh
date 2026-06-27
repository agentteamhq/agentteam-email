#!/usr/bin/env bash
# shellcheck disable=SC2016
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "usage: $0 <namespace> <suite> <go-workdir> <runner-image> [go test args...]" >&2
  exit 2
fi

suite_namespace="$1"
suite_name="$2"
go_workdir="$3"
runner_image="$4"
shift 4

if [ "$#" -eq 0 ]; then
  set -- -v -count=1 .
else
  has_output_mode=0
  has_count=0
  for arg in "$@"; do
    case "${arg}" in
      -v|-v=*|-json|-json=*) has_output_mode=1 ;;
      -count|-count=*) has_count=1 ;;
    esac
  done
  if [ "${has_output_mode}" -eq 0 ]; then
    set -- -v "$@"
  fi
  if [ "${has_count}" -eq 0 ]; then
    set -- -count=1 "$@"
  fi
fi

repo_root="$(git rev-parse --show-toplevel)"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

container_engine="${CONTAINER_ENGINE:-${CONTAINER_BUILD_ENGINE:-podman}}"
case "${container_engine}" in
  podman|docker) ;;
  *)
    echo "[go-testing-container] CONTAINER_BUILD_ENGINE must be podman or docker: ${container_engine}" >&2
    exit 2
    ;;
esac

if [ "${container_engine}" = "docker" ]; then
  container_sock="${DOCKER_HOST:-unix:///var/run/docker.sock}"
else
  container_sock="${PODMAN_SOCK:-unix://${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock}"
fi

case "${container_sock}" in
  unix://*) socket_path="${container_sock#unix://}" ;;
  *)
    echo "[go-testing-container] container socket must use unix:// syntax: ${container_sock}" >&2
    exit 1
    ;;
esac

if [ ! -S "${socket_path}" ]; then
  echo "[go-testing-container] ${container_engine} socket not available: ${socket_path}" >&2
  exit 1
fi

sanitize() {
  printf '%s' "$1" | tr '/:.' '---' | tr -cd '[:alnum:]_-'
}

ensure_volume() {
  local volume="$1"
  if [ "${container_engine}" = "docker" ]; then
    docker volume inspect "${volume}" >/dev/null 2>&1 || docker volume create "${volume}" >/dev/null
  else
    podman volume exists "${volume}" || podman volume create "${volume}" >/dev/null
  fi
}

run_id="$(date +%Y%m%d-%H%M%S)"
module_tmp="${go_workdir}/tmp"
host_run_dir="${module_tmp}/run-${run_id}"
harness_log="${host_run_dir}/harness.log"
cache_prefix="$(sanitize "${suite_namespace}-${suite_name}")"
go_mod_cache_volume="${cache_prefix}-go-mod-cache"
go_build_cache_volume="${cache_prefix}-go-build-cache"
submit_status=0
test_status=1

mkdir -p \
  "${host_run_dir}/containers" \
  "${host_run_dir}/reports" \
  "${host_run_dir}/scenarios" \
  "${host_run_dir}/screenshots"

export TEST_RUN_ID="${run_id}"
export TEST_RUN_DIR="${host_run_dir}"
export TEST_ARTIFACTS_DIR="${host_run_dir}"

touch "${harness_log}"
exec > >(tee -a "${harness_log}") 2>&1

cleanup() {
  run_status="$?"
  set +e

  printf '[%s:test:%s] finalizing run directory %s\n' "${suite_name}" "$(date +%Y-%m-%dT%H:%M:%S%z)" "${TEST_RUN_DIR}"
  if [ -z "${TEST_ARTIFACT_SUBMIT_SKIP:-}" ]; then
    printf '[%s:test:%s] submit run directory with artifact submitter image\n' "${suite_name}" "$(date +%Y-%m-%dT%H:%M:%S%z)"
  else
    printf '[%s:test:%s] skip artifact submission\n' "${suite_name}" "$(date +%Y-%m-%dT%H:%M:%S%z)"
  fi
  bash "${script_dir}/submit-run-artifacts.sh" \
    "${suite_namespace}" \
    "${suite_name}" || submit_status="$?"

  if [ "${run_status}" -ne 0 ]; then
    exit "${run_status}"
  fi
  if [ "${test_status}" -ne 0 ]; then
    exit "${test_status}"
  fi
  exit "${submit_status}"
}

trap cleanup EXIT

ensure_volume "${go_mod_cache_volume}"
ensure_volume "${go_build_cache_volume}"

extra_runner_env=()
for key in AT_EMAIL_ADMIN_DEV_MONGO_IMAGE AT_EMAIL_ADMIN_SMOKE_MINIO_IMAGE EXTRA_SCENARIO_IMAGE GOPROXY; do
  if [ -n "${!key:-}" ]; then
    extra_runner_env+=(--env "${key}=${!key}")
  fi
done

printf '[%s:test:%s] run directory: %s\n' "${suite_name}" "$(date +%Y-%m-%dT%H:%M:%S%z)" "${TEST_RUN_DIR}"

container_run_args=(run --rm)
if [ "${container_engine}" = "podman" ]; then
  container_run_args+=(--security-opt label=disable)
fi
container_run_args+=(
  --network host
  --env "DOCKER_HOST=${container_sock}"
  --env "GOCACHE=/root/.cache/go-build"
  --env "TEST_RUN_ID=${TEST_RUN_ID}"
  --env "TEST_RUN_DIR=${TEST_RUN_DIR}"
  --env "TEST_ARTIFACTS_DIR=${TEST_ARTIFACTS_DIR}"
  --env "TESTCONTAINERS_RYUK_DISABLED=true"
  "${extra_runner_env[@]}"
  --volume "${socket_path}:${socket_path}"
  --volume "${go_mod_cache_volume}:/go/pkg/mod"
  --volume "${go_build_cache_volume}:/root/.cache/go-build"
  --volume "${repo_root}:${repo_root}"
  --workdir "${go_workdir}"
  "${runner_image}"
  /bin/bash -euo pipefail -c '
    go test "$@" 2>&1 | tee \
      "${TEST_RUN_DIR}/reports/go-test.log" \
      >(go tool test2json -t > "${TEST_RUN_DIR}/reports/go-test.jsonl")
  ' go-test-runner "$@"
)

"${container_engine}" "${container_run_args[@]}"
test_status=0
