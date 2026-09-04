#!/usr/bin/env bash
set -euo pipefail

if [[ "${OPENBOT_UPDATE_SCRIPT_COPY:-0}" != "1" ]]; then
  update_script_copy="$(mktemp)"
  cp "${BASH_SOURCE[0]}" "${update_script_copy}"
  chmod 0700 "${update_script_copy}"
  trap 'rm -f "${update_script_copy}"' EXIT
  OPENBOT_UPDATE_SCRIPT_COPY=1 OPENBOT_UPDATE_RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" bash "${update_script_copy}" "$@"
  exit $?
fi

runner_dir="${OPENBOT_UPDATE_RUNNER_DIR}"
repo_root="$(cd "${runner_dir}/../.." && pwd)"
env_file="${runner_dir}/.env"
target_ref="${1:-origin/main}"

if [[ ! "${target_ref}" =~ ^(origin/main|v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?)$ ]]; then
  echo "Use origin/main or a release tag such as v0.27.0."
  exit 1
fi
if [[ ! -f "${env_file}" ]]; then
  echo "Run ./deploy/private-runner/setup.sh first."
  exit 1
fi
if [[ -n "$(git -C "${repo_root}" status --porcelain)" ]]; then
  echo "OpenBot has uncommitted source changes. Review or commit them before updating."
  exit 1
fi
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Engine with the Compose plugin is required."
  exit 1
fi

host_root="$(sed -n 's/^OPENBOT_HOST_ROOT=//p' "${env_file}" | tail -n 1)"
host_root="${host_root:-/srv/openbot}"
if [[ ! "${host_root}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "OPENBOT_HOST_ROOT in ${env_file} must be a simple absolute path."
  exit 1
fi

compose=(docker compose --env-file "${env_file}" -f "${runner_dir}/docker-compose.yml")
current_container="$("${compose[@]}" ps -q openbot)"
if [[ -z "${current_container}" ]]; then
  echo "The private runner is not started. Run setup before updating."
  exit 1
fi
previous_image="$(docker inspect -f '{{.Image}}' "${current_container}")"
previous_image_name="$(docker inspect -f '{{.Config.Image}}' "${current_container}")"
current_revision="$(git -C "${repo_root}" rev-parse HEAD)"
current_version="$(sed -n 's/^[[:space:]]*"version": "\([^"]*\)",/\1/p' "${repo_root}/package.json" | head -n 1)"
if [[ ! "${current_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ || -z "${previous_image}" || -z "${previous_image_name}" ]]; then
  echo "The running release or recovery image could not be identified safely. No files were changed."
  exit 1
fi

git -C "${repo_root}" fetch --prune --tags origin
target_revision="$(git -C "${repo_root}" rev-parse --verify "${target_ref}^{commit}")"
update_record="${host_root}/data/runner-update.json"
last_successful_revision="$(sed -n 's/^.*"revision":"\([a-f0-9]*\)".*$/\1/p' "${update_record}" 2>/dev/null | head -n 1 || true)"
if [[ "${target_revision}" == "${current_revision}" ]]; then
  if [[ "${last_successful_revision}" == "${target_revision}" ]]; then
    echo "OpenBot ${current_version} is already current."
    exit 0
  fi
  echo "The source is current, but this release was not recorded as healthy. Rebuilding it safely…"
fi
if ! git -C "${repo_root}" merge-base --is-ancestor "${current_revision}" "${target_revision}"; then
  echo "The requested release does not move cleanly forward from this checkout. No files were changed."
  exit 1
fi

echo "Creating a private backup before changing OpenBot…"
"${runner_dir}/backup.sh"
if [[ "${target_revision}" != "${current_revision}" ]]; then
  git -C "${repo_root}" merge --ff-only "${target_revision}"
fi
next_version="$(sed -n 's/^[[:space:]]*"version": "\([^"]*\)",/\1/p' "${repo_root}/package.json" | head -n 1)"
if [[ ! "${next_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo "The selected release does not contain a valid OpenBot version. The existing service is still running."
  exit 1
fi

echo "Building OpenBot ${next_version} while the current service keeps running…"
"${compose[@]}" build openbot
"${compose[@]}" up -d --no-deps openbot

wait_for_healthy() {
  local container_id="$1"
  for _attempt in {1..30}; do
    if [[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

next_container="$("${compose[@]}" ps -q openbot)"
if [[ -z "${next_container}" ]] || ! wait_for_healthy "${next_container}"; then
  echo "The new release did not become healthy. Restoring the previous container image…"
  docker tag "${previous_image}" "${previous_image_name}"
  "${compose[@]}" up -d --no-deps --force-recreate --no-build openbot
  restored_container="$("${compose[@]}" ps -q openbot)"
  if [[ -z "${restored_container}" ]] || ! wait_for_healthy "${restored_container}"; then
    echo "Automatic recovery also needs attention. Restore the latest archive in ${host_root}/backups."
  else
    echo "The previous OpenBot service is healthy again. Source remains at ${next_version}; review the failed container logs before retrying."
  fi
  exit 1
fi

"${compose[@]}" up -d caddy
updated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
record="${update_record}"
record_tmp="${record}.tmp.$$"
printf '{"lastUpdateAt":"%s","fromVersion":"%s","toVersion":"%s","revision":"%s"}\n' "${updated_at}" "${current_version}" "${next_version}" "${target_revision}" > "${record_tmp}"
chmod 0600 "${record_tmp}"
mv "${record_tmp}" "${record}"
echo "OpenBot ${next_version} is healthy. The backup-first update is complete."
