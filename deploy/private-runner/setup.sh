#!/usr/bin/env bash
set -euo pipefail

runner_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
domain="${1:-}"
env_file="${runner_dir}/.env"
host_root="/srv/openbot"

if [[ -z "${domain}" || ! "${domain}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Usage: ./deploy/private-runner/setup.sh studio.example.com"
  exit 1
fi
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Install Docker Engine with the Compose plugin first."
  exit 1
fi
if [[ ! -S /var/run/docker.sock ]]; then
  echo "Docker is not running or /var/run/docker.sock is unavailable."
  exit 1
fi

docker_gid="$(stat -c '%g' /var/run/docker.sock)"
install_command=(install -d -m 0700 -o 1000 -g 1000 "${host_root}/data" "${host_root}/home" "${host_root}/projects" "${host_root}/backups" "${host_root}/transfers")
if [[ "${EUID}" -eq 0 ]]; then "${install_command[@]}"; else sudo "${install_command[@]}"; fi

if [[ ! -e "${env_file}" ]]; then
  umask 077
  {
    echo "OPENBOT_DOMAIN=${domain}"
    echo "OPENBOT_HOST_ROOT=${host_root}"
    echo "DOCKER_GID=${docker_gid}"
    echo "OPENCODE_VERSION=1.18.28"
  } > "${env_file}"
else
  echo "Keeping the existing ${env_file}."
  configured_domain="$(sed -n 's/^OPENBOT_DOMAIN=//p' "${env_file}" | tail -n 1)"
  if [[ -z "${configured_domain}" || ! "${configured_domain}" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "OPENBOT_DOMAIN in ${env_file} is missing or invalid."
    exit 1
  fi
  domain="${configured_domain}"
fi

docker compose --env-file "${env_file}" -f "${runner_dir}/docker-compose.yml" up -d --build
echo "OpenBot is starting at https://${domain}/"
echo "After the health check passes, read the private key with:"
echo "  sudo cat ${host_root}/data/access.token"
echo "Future releases can be applied safely with:"
echo "  ./deploy/private-runner/update.sh"
