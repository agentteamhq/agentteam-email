#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd -- "${script_dir}/.." && pwd)"
cd "${root_dir}"

if [ ! -f .env ]; then
  echo "[cloudflare-oauth-prod-probe] missing .env; copy .env.example to .env and fill in local values" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${CLOUDFLARE_TUNNEL_HOSTNAME:?CLOUDFLARE_TUNNEL_HOSTNAME is required}"

current_run_file="${root_dir}/tmp/current-run"
if [ ! -f "${current_run_file}" ]; then
  echo "[cloudflare-oauth-prod-probe] no current run; start the probe first" >&2
  exit 1
fi

run_id="$(cat "${current_run_file}")"
run_dir="${root_dir}/tmp/run-${run_id}"
diagnostics_dir="${run_dir}/diagnostics"
mkdir -p "${diagnostics_dir}"

sanitize_headers() {
  sed -E \
    -e 's/(client_id=)[^&[:space:]]+/\1[redacted]/g' \
    -e 's/(state=)[^&[:space:]]+/\1[redacted]/g' \
    -e 's/(code=)[^&[:space:]]+/\1[redacted]/g' \
    -e 's/(redirect_uri=)[^&[:space:]]+/\1[redacted]/g'
}

connect_url="https://${CLOUDFLARE_TUNNEL_HOSTNAME}/connect/cloudflare"
start_headers="$("${CURL:-curl}" -ksS -o /dev/null -D - -w '\n__HTTP_STATUS__:%{http_code}\n' "${connect_url}")"
printf '%s\n' "${start_headers}" | sanitize_headers >"${diagnostics_dir}/oauth-start-local-redirect.headers"

start_status="$(printf '%s\n' "${start_headers}" | sed -n 's/^__HTTP_STATUS__://p' | tail -n 1)"
authorization_url="$(printf '%s\n' "${start_headers}" | tr -d '\r' | sed -n 's/^location: //Ip' | tail -n 1)"

if [ -z "${authorization_url}" ]; then
  cat >"${diagnostics_dir}/oauth-start-diagnostic.json" <<JSON
{
  "run_id": "${run_id}",
  "status": "local_connect_missing_location",
  "local_status": "${start_status}"
}
JSON
  echo "[cloudflare-oauth-prod-probe] local connect did not return a Cloudflare redirect; see ${diagnostics_dir}/oauth-start-local-redirect.headers"
  exit 1
fi

provider_headers="$("${CURL:-curl}" -ksS -o "${diagnostics_dir}/oauth-start-provider-body.html" -D - -w '\n__HTTP_STATUS__:%{http_code}\n' "${authorization_url}")"
printf '%s\n' "${provider_headers}" | sanitize_headers >"${diagnostics_dir}/oauth-start-provider.headers"

provider_status="$(printf '%s\n' "${provider_headers}" | sed -n 's/^__HTTP_STATUS__://p' | tail -n 1)"
provider_location="$(printf '%s\n' "${provider_headers}" | tr -d '\r' | sed -n 's/^location: //Ip' | tail -n 1)"

provider_error=""
provider_error_description=""
provider_error_path=""
if [ -n "${provider_location}" ]; then
  provider_error_path="$(node -e 'const u = new URL(process.argv[1]); process.stdout.write(u.pathname)' "${provider_location}")"
  provider_error="$(node -e 'const u = new URL(process.argv[1]); process.stdout.write(u.searchParams.get("error") || "")' "${provider_location}")"
  provider_error_description="$(node -e 'const u = new URL(process.argv[1]); process.stdout.write(u.searchParams.get("error_description") || "")' "${provider_location}")"
fi

follow_output="$("${CURL:-curl}" -ksSL \
  --max-time 30 \
  -o "${diagnostics_dir}/oauth-start-provider-followed-body.html" \
  -D "${diagnostics_dir}/oauth-start-provider-followed.headers.raw" \
  -w 'final_status=%{http_code}\nfinal_host=%{url.host}\nfinal_path=%{url.path}\nredirect_count=%{num_redirects}\n' \
  "${authorization_url}")"
sanitize_headers <"${diagnostics_dir}/oauth-start-provider-followed.headers.raw" >"${diagnostics_dir}/oauth-start-provider-followed.headers"
rm -f "${diagnostics_dir}/oauth-start-provider-followed.headers.raw"
provider_final_status="$(printf '%s\n' "${follow_output}" | sed -n 's/^final_status=//p')"
provider_final_host="$(printf '%s\n' "${follow_output}" | sed -n 's/^final_host=//p')"
provider_final_path="$(printf '%s\n' "${follow_output}" | sed -n 's/^final_path=//p')"
provider_redirect_count="$(printf '%s\n' "${follow_output}" | sed -n 's/^redirect_count=//p')"

cat >"${diagnostics_dir}/oauth-start-diagnostic.json" <<JSON
{
  "run_id": "${run_id}",
  "status": "checked",
  "connect_url": "${connect_url}",
  "local_status": "${start_status}",
  "provider_status": "${provider_status}",
  "provider_redirect_path": "${provider_error_path}",
  "provider_error": "${provider_error}",
  "provider_error_description": "${provider_error_description}",
  "provider_final_status": "${provider_final_status}",
  "provider_final_host": "${provider_final_host}",
  "provider_final_path": "${provider_final_path}",
  "provider_redirect_count": "${provider_redirect_count}"
}
JSON

echo "[cloudflare-oauth-prod-probe] OAuth start diagnostic:"
echo "  local status: ${start_status}"
echo "  provider status: ${provider_status}"
if [ -n "${provider_error}" ]; then
  echo "  provider error: ${provider_error}"
  echo "  provider error description: ${provider_error_description}"
fi
echo "  provider final status: ${provider_final_status}"
echo "  provider final path: ${provider_final_path}"
echo "  artifacts: ${diagnostics_dir}/oauth-start-diagnostic.json"
