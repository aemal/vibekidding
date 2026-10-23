#!/usr/bin/env bash
# Restore into empty volumes only. Never silently overwrite existing app data.
set -euo pipefail
source "$(dirname "$0")/common.sh"
require_config
require_docker
[[ $# == 1 ]] || { printf '%s\n' 'Usage: infra/scripts/restore.sh /absolute/path/to/backup' >&2; exit 1; }
backup="$(cd "$1" && pwd)"
python3 - "$backup" <<'PY'
import hashlib, json, pathlib, re, sys, tarfile
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / 'manifest.json').read_text())
if manifest.get('format') != 1: sys.exit('Unsupported backup format')
if 'vibekidding-projects.tgz' not in manifest.get('volumes', {}): sys.exit('Project source archive is missing')
if set(manifest['volumes']) != {p.name for p in root.glob('*.tgz')}: sys.exit('Archive list does not match manifest')
for filename, checksum in manifest['volumes'].items():
    if not re.fullmatch(r'vibekidding-(?:projects|data-[a-z0-9_-]+)\.tgz', filename): sys.exit('Invalid archive name')
    archive = root / filename
    if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum: sys.exit('Backup checksum mismatch: ' + filename)
    with tarfile.open(archive) as file:
        for entry in file:
            if entry.name.startswith('/') or '..' in pathlib.PurePosixPath(entry.name).parts or entry.issym() or entry.islnk():
                sys.exit('Unsafe archive entry: ' + entry.name)
PY
if [[ -n "$(docker ps -q --filter label=com.docker.compose.project=vibekidding)$(docker ps -q --filter label=vibekidding.managed=true)" ]]; then
  printf '%s\n' 'Stop this VibeKidding stack and its generated app containers before restoring.' >&2
  exit 1
fi
docker pull alpine:3.21 >/dev/null
docker pull node:22-bookworm-slim >/dev/null
for archive in "$backup"/vibekidding-*.tgz; do
  volume="$(basename "$archive" .tgz)"
  docker volume create --label vibekidding.managed=true "$volume" >/dev/null
  if ! docker run --rm --network none -v "$volume:/target" alpine:3.21 sh -c 'test -z "$(ls -A /target)"'; then
    printf '%s\n' "Refusing to overwrite nonempty volume $volume. Use a fresh host or explicitly archive/remove old data first." >&2
    exit 1
  fi
done
for archive in "$backup"/vibekidding-*.tgz; do
  volume="$(basename "$archive" .tgz)"
  docker run --rm --network none -v "$volume:/target" -v "$backup:/backup:ro" alpine:3.21 tar xzf "/backup/$(basename "$archive")" -C /target
done
# Saved routes point to containers on the old machine. Preserve the desired
# versions separately, and recreate them from source after platform startup.
docker run --rm --network none -v vibekidding-projects:/data node:22-bookworm-slim node -e '
const fs=require("fs"); const p="/data/controller/state.json";
if(fs.existsSync(p)){const s=JSON.parse(fs.readFileSync(p)); const plan=Object.values(s.routes).map(r=>s.deployments[r.deploymentId]).filter(Boolean).map(d=>({projectId:d.projectId,versionId:d.versionId,preservePrefix:d.preservePrefix})); fs.writeFileSync("/data/controller/restore-plan.json",JSON.stringify(plan)); s.routes={}; fs.writeFileSync(p,JSON.stringify(s));}
'
printf '%s\n' 'Restore completed. Start with infra/scripts/deploy.sh --rebuild-restored-apps to rebuild the published app versions.'
