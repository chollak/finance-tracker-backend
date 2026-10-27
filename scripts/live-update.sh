#!/usr/bin/env bash
# Updates the live instance (FT-156) to the latest main: pull, install, build, restart the service, check health.
# Run it in the live copy on the PC (~/daftar-live):
#
#   scripts/live-update.sh
#
# The app applies pending migrations itself on start, after copying the database to data/backups/. While the build
# runs the old version keeps serving from memory; the bot is silent only for the restart. Rollback and everything
# else: docs/knowledge-base/08-development/live-instance.md
#
# Overrides (for a test on a scratch clone):
#   LIVE_SERVICE      the systemd unit (default daftar.service)
#   LIVE_RESTART_CMD  the restart command, run by bash (default: sudo systemctl reset-failed + restart of LIVE_SERVICE)
#   LIVE_HEALTH_URL   what to poll after the restart; empty skips it
#                     (default http://127.0.0.1:<PORT from .env.local, else 3000>/api/health)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NVM_EXEC="$APP_DIR/scripts/nvm-exec.sh"
SERVICE="${LIVE_SERVICE:-daftar.service}"
HEALTH_ATTEMPTS=30
HEALTH_PAUSE_SECONDS=2

say() { printf 'live-update: %s\n' "$*"; }
fail() {
  printf 'live-update: %s\n' "$*" >&2
  exit 1
}

# The value of KEY in .env.local, without quotes; empty when it is not there
env_value() {
  sed -n "s/^$1=//p" .env.local | tail -n 1 | tr -d "\"'\r"
}

check_preconditions() {
  local branch
  branch="$(git symbolic-ref --quiet --short HEAD || true)"
  if [ "$branch" != "main" ]; then
    fail "the live copy is on '${branch:-a detached commit}', not main. Back from a rollback: git switch main, then run this again"
  fi
  if [ -n "$(git status --porcelain)" ]; then
    git status --short >&2
    fail "the working tree has changes (listed above). The live copy runs main as it is: move them elsewhere or remove them"
  fi
  if [ ! -f .env.local ]; then
    fail ".env.local is missing: cp ops/live/env.local.example .env.local, then fill it in"
  fi
}

build() {
  # --include=dev: the build needs TypeScript and Vite even when the shell has NODE_ENV=production
  say "installing dependencies" && "$NVM_EXEC" npm ci --include=dev &&
    say "building the web app" && "$NVM_EXEC" npm run build:webapp &&
    say "building the server" && "$NVM_EXEC" npm run build
}

restart_service() {
  if [ -n "${LIVE_RESTART_CMD:-}" ]; then
    bash -c "$LIVE_RESTART_CMD"
    return
  fi
  # reset-failed first: a unit stopped by its start limit refuses a plain restart
  sudo systemctl reset-failed "$SERVICE" || true
  sudo systemctl restart "$SERVICE"
}

# Polls the health endpoint until it answers 200 and prints the environment and the bot's state from the answer
wait_until_healthy() {
  local url="$1" body attempt
  for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
    if body="$(curl -fsS --max-time 3 "$url" 2>/dev/null)"; then
      say "healthy after ${attempt} attempt(s):" \
        "$(printf '%s' "$body" | grep -o '"environment":"[a-z]*"' || true)" \
        "$(printf '%s' "$body" | grep -o '"state":"[a-z]*"' | head -n 1 || true)"
      if ! printf '%s' "$body" | grep -q '"environment":"production"'; then
        say "WARNING: the service does not run with NODE_ENV=production"
      fi
      return 0
    fi
    sleep "$HEALTH_PAUSE_SECONDS"
  done
  return 1
}

main() {
  cd "$APP_DIR"
  check_preconditions

  local before after rollback_hint port health_url
  before="$(git rev-parse --short HEAD)"
  rollback_hint="rollback: docs/knowledge-base/08-development/live-instance.md («Откат»), previous commit $before"

  say "pulling main (now at $before)"
  git pull --ff-only origin main ||
    fail "git pull failed (above); nothing was changed. See «Обновление» in docs/knowledge-base/08-development/live-instance.md"
  after="$(git rev-parse --short HEAD)"
  if [ "$before" = "$after" ]; then
    say "no new commits; rebuilding $after anyway"
  else
    git --no-pager log --oneline "$before..$after"
  fi

  build || fail "the build of $after failed. The service still runs the previous version from memory, but its next
start (a crash, a reboot) would use this broken build: fix it and run this again, or roll back now — $rollback_hint"

  say "restarting $SERVICE"
  restart_service || fail "the restart failed: systemctl status $SERVICE; journalctl -u $SERVICE -n 50. $rollback_hint"

  port="$(env_value PORT)"
  health_url="${LIVE_HEALTH_URL-http://127.0.0.1:${port:-3000}/api/health}"
  if [ -z "$health_url" ]; then
    say "health check skipped (LIVE_HEALTH_URL is empty)"
  elif ! wait_until_healthy "$health_url"; then
    fail "no healthy answer from $health_url in $((HEALTH_ATTEMPTS * HEALTH_PAUSE_SECONDS)) s:" \
      "journalctl -u $SERVICE -n 50 --no-pager. $rollback_hint"
  fi

  say "done: $before -> $after. If something is wrong, $rollback_hint"
}

# Everything runs from main, which bash has read in full: `git pull` may replace this file while it runs
main "$@"
exit
