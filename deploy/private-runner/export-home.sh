#!/usr/bin/env bash
set -euo pipefail

runner_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${runner_dir}/.env"
host_root="$(sed -n 's/^OPENBOT_HOST_ROOT=//p' "${env_file}" 2>/dev/null | tail -n 1)"
host_root="${host_root:-/srv/openbot}"
name="${1:-openbot-home-$(date -u +%Y%m%dT%H%M%SZ).openbot-home}"
if [[ ! "${host_root}" =~ ^/[A-Za-z0-9._/-]+$ || ! "${name}" =~ ^[A-Za-z0-9._-]+\.openbot-home$ ]]; then
  echo "Use a simple .openbot-home filename."
  exit 1
fi
if [[ ! -f "${env_file}" ]]; then echo "Run setup.sh first."; exit 1; fi
install_command=(install -d -m 0700 -o 1000 -g 1000 "${host_root}/transfers")
if [[ "${EUID}" -eq 0 ]]; then "${install_command[@]}"; else sudo "${install_command[@]}"; fi
read -r -s -p "Transfer passphrase (12+ characters): " transfer_password; echo
read -r -s -p "Repeat the passphrase: " transfer_password_again; echo
if [[ "${transfer_password}" != "${transfer_password_again}" || ${#transfer_password} -lt 12 ]]; then
  unset transfer_password transfer_password_again
  echo "The passphrases must match and contain at least 12 characters."
  exit 1
fi
compose=(docker compose --env-file "${env_file}" -f "${runner_dir}/docker-compose.yml")
"${compose[@]}" stop openbot
trap '"${compose[@]}" start openbot >/dev/null; unset transfer_password transfer_password_again' EXIT
printf '%s\n' "${transfer_password}" | "${compose[@]}" run --rm --no-deps -T openbot node /app/deploy/private-runner/home-transfer.mjs export /srv/openbot "/srv/openbot/transfers/${name}"
"${compose[@]}" start openbot
trap - EXIT
unset transfer_password transfer_password_again
echo "Move ${host_root}/transfers/${name} to the new host. Keep its passphrase separately."
