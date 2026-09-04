#!/usr/bin/env bash
set -euo pipefail

runner_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${runner_dir}/.env"
backup_dir="${runner_dir}/backups"
host_root="${OPENBOT_HOST_ROOT:-/srv/openbot}"

if [[ -f "${env_file}" ]]; then
  configured_host_root="$(sed -n 's/^OPENBOT_HOST_ROOT=//p' "${env_file}" | tail -n 1)"
  if [[ -n "${configured_host_root}" ]]; then
    if [[ ! "${configured_host_root}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
      echo "OPENBOT_HOST_ROOT in ${env_file} must be a simple absolute path."
      exit 1
    fi
    host_root="${configured_host_root}"
  fi
fi

mkdir -p "${backup_dir}"
archive="${backup_dir}/openbot-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
compose=(docker compose --env-file "${env_file}" -f "${runner_dir}/docker-compose.yml")

"${compose[@]}" stop openbot
trap '"${compose[@]}" start openbot >/dev/null' EXIT
tar -C "${host_root}" -czf "${archive}" data home
"${compose[@]}" start openbot
trap - EXIT
chmod 0600 "${archive}"
echo "Private backup created at ${archive}"
