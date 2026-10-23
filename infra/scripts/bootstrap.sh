#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
command -v python3 >/dev/null || { printf '%s\n' 'Python 3 is required for configuration and backup scripts.' >&2; exit 1; }
if [[ ! -d "$(dirname "$STACK_ENV")" ]]; then
  mkdir -p "$(dirname "$STACK_ENV")"
  chmod 700 "$(dirname "$STACK_ENV")"
fi
if [[ ! -f "$STACK_ENV" ]]; then
  python3 - "$INFRA_ROOT/infra/stack.env.example" "$STACK_ENV" <<'PY'
import os, secrets, sys
source, destination = sys.argv[1:]
text = open(source).read()
for key in ('VIBEKIDDING_CONTROLLER_TOKEN',):
    text = text.replace(key + '=\n', key + '=' + secrets.token_hex(24) + '\n')
fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    output.write(text)
PY
  printf '%s\n' "Created private configuration: $STACK_ENV" 'Set your provider key there; create the initial username/password in the studio setup screen. Credentials are never printed by this script.'
else
  printf '%s\n' "Keeping existing configuration: $STACK_ENV"
fi
if [[ "${1:-}" == '--configure-only' ]]; then exit 0; fi
require_docker
"${COMPOSE[@]}" config --quiet
printf '%s\n' 'Configuration is valid. Run infra/scripts/deploy.sh when ready.'
