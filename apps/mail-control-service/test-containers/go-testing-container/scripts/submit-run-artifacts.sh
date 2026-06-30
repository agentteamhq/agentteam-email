#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <namespace> <suite>" >&2
  exit 2
fi

namespace="$1"
suite="$2"

if [ -z "${TEST_RUN_ID:-}" ]; then
  echo "[go-testing-container] missing TEST_RUN_ID" >&2
  exit 1
fi
if [ -z "${TEST_RUN_DIR:-}" ]; then
  echo "[go-testing-container] missing TEST_RUN_DIR" >&2
  exit 1
fi

run_dir_abs="$(cd "${TEST_RUN_DIR}" && pwd)"
run_root_abs="$(cd "${run_dir_abs}/.." && pwd)"
submit_status=0

if [ -z "${TEST_ARTIFACT_SUBMIT_SKIP:-}" ]; then
  "${CONTAINER_ENGINE:?missing CONTAINER_ENGINE}" run --rm \
    --userns keep-id \
    --user "$(id -u):$(id -g)" \
    --env-host \
    -v "${run_root_abs}":/work:Z \
    -w /work \
    system.registry.test/agentteam/test-artifact-ctl:latest \
    submit \
    --namespace "${namespace}" \
    --suite "${suite}" \
    --run-dir "/work/$(basename "${run_dir_abs}")" \
    --event-id "run-${TEST_RUN_ID}" || submit_status=$?
fi

exit "${submit_status}"
