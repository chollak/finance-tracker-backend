#!/usr/bin/env bash
# Updates the live instance (FT-156) to the latest main: pull, install, build, restart the service, check health.
# Run it in the live copy on the PC (~/dev/projects/kapelka-live):
#
#   scripts/live-update.sh
#
# The app applies pending migrations itself on start, after copying the database to data/backups/. While the build
# runs the old version keeps serving from memory; the bot is silent only for the restart. After a healthy restart the
# local tag `live-good` moves to the new commit: it is the commit to roll back to. Rollback and everything else:
# docs/knowledge-base/08-development/live-instance.md
#
# Overrides (for a test on a scratch clone):
#   LIVE_SERVICE      the systemd unit (default kapelka.service)
#   LIVE_RESTART_CMD  the restart command, run by bash (default: sudo systemctl reset-failed + restart of LIVE_SERVICE)
#   LIVE_HEALTH_URL   what to poll after the restart; empty skips it and leaves `live-good` where it was
#                     (default http://127.0.0.1:<PORT from .env.local, else 3000>/api/health)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NVM_EXEC="$APP_DIR/scripts/nvm-exec.sh"
SERVICE="${LIVE_SERVICE:-kapelka.service}"
GOOD_TAG="live-good"
DOC="docs/knowledge-base/08-development/live-instance.md"
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

# The last commit that answered healthy after an update; empty before the first one
last_good_commit() {
  git rev-parse --quiet --verify --short "refs/tags/$GOOD_TAG^{commit}" 2>/dev/null || true
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
  local marker
  marker="$(mktemp)"
  # npm ci also builds the web app: the root package's postinstall runs install:webapp and build:webapp.
  # --include=dev: the builds need TypeScript and Vite even when the shell has NODE_ENV=production
  say "installing dependencies; npm ci also builds the web app"
  if ! "$NVM_EXEC" npm ci --include=dev; then
    rm -f "$marker"
    return 1
  fi
  if [ ! public/webapp/index.html -nt "$marker" ]; then
    rm -f "$marker"
    printf 'live-update: npm ci did not rebuild public/webapp — is the postinstall build gone from package.json?\n' >&2
    return 1
  fi
  rm -f "$marker"
  # npm ci exits 0 even when the native sqlite3 it downloaded cannot load here (sqlite3 6 needs glibc 2.38+, FT-048);
  # the restarted service would then fail on start. Load it now, while the old version still runs
  if ! "$NVM_EXEC" node -e "require('sqlite3')"; then
    printf 'live-update: the native sqlite3 module does not load (above). See «live-update.sh Refuses to Run» in %s\n' \
      "docs/knowledge-base/08-development/troubleshooting.md" >&2
    return 1
  fi
  say "building the server"
  "$NVM_EXEC" npm run build
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

  local before after ahead good rollback_hint port health_url
  before="$(git rev-parse --short HEAD)"
  good="$(last_good_commit)"
  if [ -n "$good" ]; then
    rollback_hint="roll back to $good, the last commit that answered healthy (tag $GOOD_TAG): $DOC, «Откат»"
  else
    rollback_hint="no tag $GOOD_TAG yet; the commit before this run was $before, not checked: $DOC, «Откат»"
  fi

  # Ask for the sudo password now, not after minutes of building
  if [ -z "${LIVE_RESTART_CMD:-}" ]; then
    sudo -v || fail "sudo is needed to restart $SERVICE at the end; nothing was changed"
  fi

  say "pulling main (now at $before, last good ${good:-none})"
  git pull --ff-only origin main ||
    fail "git pull failed (above); nothing was changed. See «Live Instance on the PC» in docs/knowledge-base/08-development/troubleshooting.md"
  # A commit made in the live copy itself is clean and fast-forwards, but it is not main as it is in GitHub
  ahead="$(git rev-list --count origin/main..HEAD)"
  if [ "$ahead" != "0" ]; then
    fail "the live copy has $ahead commit(s) that are not in origin/main: git log --oneline origin/main..HEAD." \
      "Move them to a PR, then git reset --hard origin/main"
  fi
  after="$(git rev-parse --short HEAD)"
  if [ "$before" = "$after" ]; then
    say "no new commits; rebuilding $after anyway"
  else
    git --no-pager log --oneline "$before..$after"
  fi

  # A new .nvmrc names a Node that nvm may not have yet; nvm-exec.sh then exits without a word
  "$NVM_EXEC" node --version >/dev/null ||
    fail "Node $(cat .nvmrc) from .nvmrc is not installed: . ~/.nvm/nvm.sh && nvm install, then run this again." \
      "HEAD is already at $after, not built; the service still runs the previous build from memory, but its next" \
      "start (a manual restart, a reboot) fails until nvm install"

  build || fail "the build of $after failed. The service still runs the previous version from memory, but its next
start (a crash, a reboot) would use this broken build: fix it and run this again, or $rollback_hint"

  say "restarting $SERVICE"
  restart_service || fail "the restart failed: systemctl status $SERVICE; journalctl -u $SERVICE -n 50. Or $rollback_hint"

  port="$(env_value PORT)"
  health_url="${LIVE_HEALTH_URL-http://127.0.0.1:${port:-3000}/api/health}"
  if [ -z "$health_url" ]; then
    say "done: $before -> $after; health not checked (LIVE_HEALTH_URL is empty), so $GOOD_TAG stays at ${good:-none}"
    return
  fi
  wait_until_healthy "$health_url" ||
    fail "no healthy answer from $health_url in $((HEALTH_ATTEMPTS * HEALTH_PAUSE_SECONDS)) s:" \
      "journalctl -u $SERVICE -n 50 --no-pager. Or $rollback_hint"

  git tag --force "$GOOD_TAG" HEAD >/dev/null
  say "done: $before -> $after, healthy; $GOOD_TAG -> $after"
}

# Everything runs from main, which bash has read in full: `git pull` may replace this file while it runs
main "$@"
exit
