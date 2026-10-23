#!/usr/bin/env bash
set -euo pipefail
INFRA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_ENV="${VIBEKIDDING_STACK_ENV:-$INFRA_ROOT/infra/local/stack.env}"
COMPOSE=(docker compose --project-directory "$INFRA_ROOT" --env-file "$STACK_ENV" -f "$INFRA_ROOT/compose.yaml")
require_config() {
  if [[ ! -f "$STACK_ENV" ]]; then
    printf '%s\n' "Missing $STACK_ENV. Run infra/scripts/bootstrap.sh first." >&2
    exit 1
  fi
}
require_docker() {
  command -v docker >/dev/null || { printf '%s\n' 'Install Docker with the Compose plugin first.' >&2; exit 1; }
  python3 - <<'PY'
import subprocess, sys
try:
    result = subprocess.run(['docker', 'info', '--format', '{{.ServerVersion}}'], timeout=15, check=True, capture_output=True, text=True)
    if not result.stdout.strip():
        sys.exit('Docker engine did not report a server version. Start or recover Docker Desktop and retry.')
except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
    sys.exit('Docker engine is unavailable. Start Docker Desktop or the Docker service and retry.')
PY
}
require_build_space() {
  python3 - "$INFRA_ROOT" <<'PY'
import os, shutil, sys
minimum = float(os.environ.get('VIBEKIDDING_MIN_FREE_GB', '10')) * 1024**3
free = shutil.disk_usage(sys.argv[1]).free
if free < minimum:
    sys.exit(f'Only {free / 1024**3:.2f} GiB free on the project filesystem. Free at least {minimum / 1024**3:g} GiB before building Docker images. No data was removed.')
PY
}
