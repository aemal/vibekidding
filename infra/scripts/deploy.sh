#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
require_config
require_build_space
require_docker
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" up -d --build --wait --wait-timeout 180
"${COMPOSE[@]}" ps
if [[ "${1:-}" == '--rebuild-restored-apps' ]]; then
  "${COMPOSE[@]}" exec -T controller node restore.mjs
fi
printf '%s\n' 'Platform started. Open PUBLIC_ORIGIN from your stack.env.' 'Project databases and uploads remain in Docker volumes across updates.'
