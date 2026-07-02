#!/usr/bin/env bash
set -u -o pipefail

suite_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(git -C "${suite_root}" rev-parse --show-toplevel)"
run_id="${TEST_RUN_ID:-$(date -u +%Y%m%d-%H%M%SZ)}"
run_dir="${TEST_RUN_DIR:-${suite_root}/tmp/run-${run_id}}"
logs_dir="${run_dir}/logs"
reports_dir="${run_dir}/reports"
diagnostics_dir="${run_dir}/diagnostics"
scenarios_dir="${run_dir}/scenarios"
containers_dir="${run_dir}/containers"
generated_inputs_dir="${run_dir}/generated-inputs"
test_run_log="${logs_dir}/test-run.log"
container_engine="${CONTAINER_ENGINE:-podman}"
build_images=false
artifact_submit_skip_value="${TEST_ARTIFACT_SUBMIT_SKIP-1}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-images)
      build_images=true
      shift
      ;;
    *)
      printf 'unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

mkdir -p \
  "${logs_dir}" \
  "${reports_dir}" \
  "${diagnostics_dir}" \
  "${scenarios_dir}" \
  "${containers_dir}" \
  "${generated_inputs_dir}"

exec > >(tee -a "${test_run_log}") 2>&1

log() {
  line="[full-stack-browser-e2e-runner] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  printf '%s\n' "${line}"
  printf '%s\n' "${line}" >>"${logs_dir}/harness.log"
}

write_runner_context() {
  RUNNER_CONTEXT_PATH="${diagnostics_dir}/runner-context.json" \
    RUN_ID="${run_id}" \
    CONTAINER_ENGINE="${container_engine}" \
    BUILD_IMAGES="${build_images}" \
    ARTIFACT_SUBMIT_SKIP="$(should_skip_artifact_submission && printf 'true' || printf 'false')" \
    node <<'NODE'
const { writeFileSync } = require('node:fs')

const payload = {
  runId: process.env.RUN_ID,
  suite: 'full-stack-browser-e2e',
  containerEngine: process.env.CONTAINER_ENGINE,
  buildImages: process.env.BUILD_IMAGES === 'true',
  artifactSubmitSkip: process.env.ARTIFACT_SUBMIT_SKIP === 'true',
  testRunLog: 'logs/test-run.log'
}

writeFileSync(process.env.RUNNER_CONTEXT_PATH, `${JSON.stringify(payload, null, 2)}\n`)
NODE
}

should_skip_artifact_submission() {
  case "${artifact_submit_skip_value}" in
    '' | 0 | false | FALSE | False | no | NO | No | off | OFF | Off)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

submit_artifacts() {
  if should_skip_artifact_submission; then
    log "artifact submission skipped by TEST_ARTIFACT_SUBMIT_SKIP"
    return 0
  fi

  log "submitting run directory"
  "${container_engine}" run --rm \
    --userns keep-id \
    --user "$(id -u):$(id -g)" \
    --env-host \
    -v "${run_dir}:/run-dir:Z" \
    -w /run-dir \
    system.registry.test/agentteam/test-artifact-ctl:latest \
    submit \
    --namespace agentteam-email/full-stack-browser-e2e \
    --suite full-stack-browser-e2e \
    --run-dir /run-dir \
    --event-id "run-${run_id}" \
    > >(tee -a "${logs_dir}/artifact-submit.stdout.log") \
    2> >(tee -a "${logs_dir}/artifact-submit.stderr.log" >&2)
  submit_status=$?

  if [ "${submit_status}" -eq 0 ]; then
    log "artifact submission completed"
  else
    log "artifact submission failed with exit=${submit_status}; preserving test exit status"
  fi
}

run_build_step() {
  label="$1"
  shift
  log "build step start: ${label}"
  (
    cd "${repo_root}" && "$@"
  )
  status=$?
  log "build step finished: ${label} exit=${status}"
  return "${status}"
}

on_exit() {
  status="$1"
  log "test runner exiting status=${status}"
  submit_artifacts || true
  exit "${status}"
}

trap 'on_exit "$?"' EXIT

export TEST_RUN_ID="${run_id}"
export TEST_RUN_DIR="${run_dir}"
export TEST_ARTIFACTS_DIR="${run_dir}"
export TEST_ARTIFACT_SUBMIT_SKIP="${artifact_submit_skip_value}"

write_runner_context

log "run directory: tmp/run-${run_id}"
if [ "${build_images}" = true ]; then
  run_build_step "mail-control-service image" mise run //apps/mail-control-service:image:build || exit "$?"
  run_build_step "web-server image" mise run //apps/web-server:image:build || exit "$?"
fi

log "starting Node harness"
node "${suite_root}/full-stack-browser-e2e.mjs"
status=$?
log "Node harness finished exit=${status}"
exit "${status}"
