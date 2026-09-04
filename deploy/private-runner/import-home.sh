#!/usr/bin/env bash
set -euo pipefail

runner_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${runner_dir}/.env"
host_root="$(sed -n 's/^OPENBOT_HOST_ROOT=//p' "${env_file}" 2>/dev/null | tail -n 1)"
host_root="${host_root:-/srv/openbot}"
name="${1:-}"
if [[ ! -f "${env_file}" ]]; then echo "Run setup.sh first on the new host."; exit 1; fi
if [[ ! "${host_root}" =~ ^/[A-Za-z0-9._/-]+$ || ! "${name}" =~ ^[A-Za-z0-9._-]+\.openbot-home$ || ! -f "${host_root}/transfers/${name}" ]]; then
  echo "Place one .openbot-home file in ${host_root}/transfers and pass its filename."
  exit 1
fi
read -r -s -p "Transfer passphrase: " transfer_password; echo
if [[ ${#transfer_password} -lt 12 ]]; then unset transfer_password; echo "That passphrase is too short."; exit 1; fi
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
stage="${host_root}/transfers/import-stage-${stamp}"
recovery="${host_root}/transfers/pre-import-${stamp}"
failed="${host_root}/transfers/failed-import-${stamp}"
compose=(docker compose --env-file "${env_file}" -f "${runner_dir}/docker-compose.yml")
printf '%s\n' "${transfer_password}" | "${compose[@]}" run --rm --no-deps -T openbot node /app/deploy/private-runner/home-transfer.mjs import "/srv/openbot/transfers/${name}" "/srv/openbot/transfers/import-stage-${stamp}"
unset transfer_password
"${runner_dir}/backup.sh"
"${compose[@]}" stop openbot
mkdir -p -m 0700 "${recovery}"

swap_active=1
rollback_import() {
  if [[ "${swap_active:-0}" != "1" ]]; then return; fi
  echo "Restoring the previous private home…"
  "${compose[@]}" stop openbot >/dev/null 2>&1 || true
  mkdir -p -m 0700 "${failed}"
  for folder in data home projects; do
    if [[ -e "${recovery}/${folder}" && -e "${host_root}/${folder}" ]]; then mv "${host_root}/${folder}" "${failed}/${folder}"; fi
    if [[ -e "${recovery}/${folder}" ]]; then mv "${recovery}/${folder}" "${host_root}/${folder}"; fi
  done
  rmdir "${recovery}" 2>/dev/null || true
  "${compose[@]}" up -d --no-deps openbot >/dev/null 2>&1 || true
}
trap rollback_import EXIT
for folder in data home projects; do mv "${host_root}/${folder}" "${recovery}/${folder}"; mv "${stage}/${folder}" "${host_root}/${folder}"; done
rmdir "${stage}"
"${compose[@]}" up -d --no-deps openbot

wait_for_healthy() {
  local container_id="$1"
  for _attempt in {1..30}; do
    if [[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)" == "healthy" ]]; then return 0; fi
    sleep 2
  done
  return 1
}

restored_container="$("${compose[@]}" ps -q openbot)"
if [[ -z "${restored_container}" ]] || ! wait_for_healthy "${restored_container}"; then
  echo "The imported home did not become healthy."
  exit 1
fi
"${compose[@]}" up -d caddy
swap_active=0
trap - EXIT
echo "The encrypted home is healthy. The previous home remains at ${recovery} until you remove it."
