#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
suite_root="${repo_root}/test-containers/kind-e2e"
: "${WT:?missing WT}"

run_id="${TEST_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
run_dir="${TEST_RUN_DIR:-${suite_root}/tmp/run-${run_id}}"
kubeconfig="${run_dir}/kubeconfig"
image_tag="${AGENTTEAM_EMAIL_KIND_IMAGE_TAG:-stage}"
configured_mail_control_service_image_repository="${AGENTTEAM_EMAIL_KIND_MAIL_CONTROL_SERVICE_IMAGE_REPOSITORY:-atemail.${WT}.mail-control-service}"
configured_web_server_image_repository="${AGENTTEAM_EMAIL_KIND_WEB_SERVER_IMAGE_REPOSITORY:-atemail.${WT}.web-server}"
kind_local_repository() {
  case "$1" in
    */*) printf '%s\n' "$1" ;;
    *) printf 'localhost/%s\n' "$1" ;;
  esac
}
mail_control_service_image_repository="$(kind_local_repository "${configured_mail_control_service_image_repository}")"
web_server_image_repository="$(kind_local_repository "${configured_web_server_image_repository}")"
mail_control_service_image="${mail_control_service_image_repository}:${image_tag}"
web_server_image="${web_server_image_repository}:${image_tag}"
cluster_name="${AGENTTEAM_EMAIL_KIND_CLUSTER:-atemail-${WT}-e2e}"
namespace="${AGENTTEAM_EMAIL_KIND_NAMESPACE:-atemail-${WT}}"
release_name="${AGENTTEAM_EMAIL_KIND_RELEASE:-atemail-${WT}}"
web_server_port="${AGENTTEAM_EMAIL_KIND_WEB_SERVER_PORT:-23100}"
keep_cluster="${AGENTTEAM_EMAIL_KIND_E2E_KEEP_CLUSTER:-0}"
created_cluster=0
helm_value_args=(
  --set-string "namespace.name=${namespace}"
  --set-string "publicHostname=http://127.0.0.1:${web_server_port}"
  --set-string "images.mailControlService.repository=${mail_control_service_image_repository}"
  --set-string "images.mailControlService.tag=${image_tag}"
  --set-string "images.webServer.repository=${web_server_image_repository}"
  --set-string "images.webServer.tag=${image_tag}"
)

mkdir -p "${run_dir}/logs" "${run_dir}/rendered" "${run_dir}/diagnostics" "${run_dir}/images"
log_file="${run_dir}/logs/harness.log"
export KUBECONFIG="${kubeconfig}"

log() {
  printf '[kind-e2e] %s\n' "$*" | tee -a "${log_file}"
}

run() {
  log "+ $*"
  "$@" 2>&1 | tee -a "${log_file}"
}

collect_rendered_images() {
  node --input-type=module - "$1" <<'NODE'
import { readFileSync } from 'node:fs'
import { parseAllDocuments } from 'yaml'

const manifestPath = process.argv[2]
const images = new Set()

function collectImageValues(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageValues(item)
    }
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'image' && typeof child === 'string' && child.trim() !== '') {
      images.add(child)
    } else {
      collectImageValues(child)
    }
  }
}

const documents = parseAllDocuments(readFileSync(manifestPath, 'utf8'))
for (const document of documents) {
  if (document.errors.length > 0) {
    throw new Error(`failed to parse rendered Helm manifest: ${document.errors[0].message}`)
  }
  collectImageValues(document.toJS())
}
for (const image of [...images].sort()) {
  console.log(image)
}
NODE
}

image_archive_name() {
  printf '%s' "$1" | sed -E 's#[/:]#-#g; s#[^A-Za-z0-9_.-]#-#g' | cut -c1-120
}

is_local_kind_image() {
  [[ "$1" == localhost/* ]]
}

save_and_load_image() {
  local name="$1"
  local image="$2"
  local archive_path="${run_dir}/images/${name}.tar"
  run "${CONTAINER_ENGINE}" save -o "${archive_path}" "${image}"
  run kind load image-archive "${archive_path}" --name "${cluster_name}"
}

pull_save_and_load_image() {
  local name="$1"
  local image="$2"
  run "${CONTAINER_ENGINE}" pull "${image}"
  save_and_load_image "${name}" "${image}"
}

load_rendered_images() {
  local rendered_manifest_path="$1"
  local image
  while IFS= read -r image; do
    [[ -n "${image}" ]] || continue
    log "loading image into kind: ${image}"
    if is_local_kind_image "${image}"; then
      save_and_load_image "$(image_archive_name "${image}")" "${image}"
    else
      pull_save_and_load_image "$(image_archive_name "${image}")" "${image}"
    fi
  done < <(collect_rendered_images "${rendered_manifest_path}")
}

collect_diagnostics() {
  set +e
  log "collecting Kubernetes diagnostics"
  kubectl get all,pvc,configmap,secret -n "${namespace}" -o wide >"${run_dir}/diagnostics/resources.txt" 2>&1
  kubectl describe pods -n "${namespace}" >"${run_dir}/diagnostics/pods.txt" 2>&1
  kubectl get pods -n "${namespace}" -o name | while read -r pod; do
    pod_name="${pod#pod/}"
    kubectl logs -n "${namespace}" "${pod_name}" --all-containers=true >"${run_dir}/diagnostics/${pod_name}.log" 2>&1
  done
  set -e
}

cleanup() {
  status=$?
  if [[ -n "${port_forward_pid:-}" ]]; then
    kill "${port_forward_pid}" >/dev/null 2>&1 || true
  fi
  if [[ "${status}" -ne 0 ]]; then
    collect_diagnostics
  fi
  if [[ "${created_cluster}" == "1" && "${keep_cluster}" != "1" ]]; then
    kind delete cluster --name "${cluster_name}" >>"${log_file}" 2>&1 || true
  elif [[ "${created_cluster}" == "1" ]]; then
    log "keeping kind cluster ${cluster_name}"
  fi
  exit "${status}"
}
trap cleanup EXIT

log "run directory: ${run_dir}"
log "kubeconfig: ${kubeconfig}"
log "WT: ${WT}"
log "local images: ${mail_control_service_image}, ${web_server_image}"
log "+ helm template ${release_name} ${repo_root}/charts/agentteam-email --namespace ${namespace} -f ${suite_root}/values-kind.yaml <worktree overrides> > ${run_dir}/rendered/agentteam-email.yaml"
helm template "${release_name}" "${repo_root}/charts/agentteam-email" \
  --namespace "${namespace}" \
  -f "${suite_root}/values-kind.yaml" \
  "${helm_value_args[@]}" \
  >"${run_dir}/rendered/agentteam-email.yaml" \
  2>>"${log_file}"

if kind get clusters | grep -Fxq "${cluster_name}"; then
  log "using existing kind cluster ${cluster_name}"
else
  run kind create cluster --name "${cluster_name}" --wait 120s
  created_cluster=1
fi
run kind export kubeconfig --name "${cluster_name}" --kubeconfig "${kubeconfig}"
run kubectl config use-context "kind-${cluster_name}"

load_rendered_images "${run_dir}/rendered/agentteam-email.yaml"

run helm upgrade --install "${release_name}" "${repo_root}/charts/agentteam-email" \
  --namespace "${namespace}" \
  --create-namespace \
  -f "${suite_root}/values-kind.yaml" \
  "${helm_value_args[@]}" \
  --wait \
  --timeout 10m

for deployment in \
  mongodb \
  redis \
  rspamd \
  wildduck \
  haraka \
  zonemta \
  atemail-mail-control-service \
  atemail-web-server
do
  run kubectl rollout status "deployment/${deployment}" -n "${namespace}" --timeout=180s
done

non_cluster_ip_services="$(
  kubectl get svc -n "${namespace}" \
    -o jsonpath='{range .items[?(@.spec.type!="ClusterIP")]}{.metadata.name}{"\n"}{end}'
)"
if [[ -n "${non_cluster_ip_services}" ]]; then
  printf '%s\n' "${non_cluster_ip_services}" >"${run_dir}/diagnostics/external-services.txt"
  log "unexpected externally published services:"
  tee -a "${log_file}" <"${run_dir}/diagnostics/external-services.txt"
  exit 1
fi

log "+ kubectl port-forward -n ${namespace} service/atemail-web-server ${web_server_port}:80"
kubectl port-forward -n "${namespace}" "service/atemail-web-server" "${web_server_port}:80" \
  >"${run_dir}/logs/web-server-port-forward.log" 2>&1 &
port_forward_pid=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${web_server_port}/health" >"${run_dir}/diagnostics/web-server-health.txt" 2>&1; then
    log "web server health check passed"
    exit 0
  fi
  sleep 1
done

log "web server health check did not pass"
exit 1
