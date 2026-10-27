#!/usr/bin/env bash
# Runs a command on the Node version from .nvmrc. Shells that do not load nvm — the app's preview servers, agent
# shells — find an older system node first in PATH (on Shukur's Mac: /usr/local/bin/node 16), and the project needs 22.
#
#   scripts/nvm-exec.sh npm run verify
#   scripts/nvm-exec.sh env PORT=3100 npm run dev
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm not found in $NVM_DIR; install nvm or run the command on Node $(cat "$(dirname "$0")/../.nvmrc") yourself" >&2
  exit 1
fi

# nvm.sh reads unset variables; it cannot run under `set -u`
set +u
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use --silent "$(cat "$(dirname "$0")/../.nvmrc")" >/dev/null
set -u

exec "$@"
