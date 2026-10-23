#!/usr/bin/env bash
# Stop writers briefly so SQLite databases and uploads form a consistent backup.
set -euo pipefail
source "$(dirname "$0")/common.sh"
require_config
require_docker
destination="${1:-$INFRA_ROOT/infra/backups/$(date -u +%Y%m%dT%H%M%SZ)}"
if [[ ! -d "$destination" ]]; then mkdir -p "$destination"; chmod 700 "$destination"; fi
destination="$(cd "$destination" && pwd)"
if [[ -e "$destination/manifest.json" ]]; then printf '%s\n' 'Backup destination already contains a manifest.' >&2; exit 1; fi
docker pull alpine:3.21 >/dev/null
running_apps="$(docker ps -q --filter label=vibekidding.managed=true)"
running_services="$("${COMPOSE[@]}" ps --services --status running)"
restart() {
  if [[ -n "$running_apps" ]]; then printf '%s\n' "$running_apps" | xargs docker start >/dev/null; fi
  if [[ -n "$running_services" ]]; then
    while IFS= read -r service; do "${COMPOSE[@]}" start "$service" >/dev/null; done <<< "$running_services"
  fi
}
trap restart EXIT
"${COMPOSE[@]}" stop
if [[ -n "$running_apps" ]]; then printf '%s\n' "$running_apps" | xargs docker stop >/dev/null; fi
volumes="$(docker volume ls --format '{{.Name}}' --filter label=vibekidding.managed=true)"
printf '%s\n' vibekidding-projects "$volumes" | sort -u | while IFS= read -r volume; do
  [[ -z "$volume" ]] && continue
  [[ "$volume" == vibekidding-projects || "$volume" == vibekidding-data-* ]] || continue
  docker run --rm --network none -v "$volume:/source:ro" -v "$destination:/backup" alpine:3.21 sh -c 'umask 077; tar czf "$1" -C /source . && chown "$2" "$1"' sh "/backup/$volume.tgz" "$(id -u):$(id -g)"
done
python3 - "$destination" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in root.glob('*.tgz')}
(root / 'manifest.json').write_text(json.dumps({'format': 1, 'volumes': files}, indent=2) + '\n')
PY
printf '%s\n' "Backup written to $destination" 'This private backup includes app environment settings. Keep platform stack.env separately; it and Docker images are not included.'
