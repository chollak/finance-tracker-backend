#!/usr/bin/env bash
# Backs up the live instance's database (FT-157): an online copy of data/database.sqlite checked with
# PRAGMA integrity_check, plus data/patterns.json and data/learning-data.json, into BACKUP_DIR — a plain folder on
# drive C: that Google Drive for desktop uploads. Keeps the newest 30 copies. kapelka-backup.timer runs it once a day;
# by hand, in the live copy on the PC (~/dev/projects/kapelka-live):
#
#   scripts/backup-db.sh
#
# BACKUP_DIR comes from the environment, else from .env.local of this copy, and must already exist: the script never
# creates it, so a missing /mnt/c fails loudly instead of quietly filling a folder on WSL's own disk.
# Names: kapelka-YYYYMMDD-HHMMSS.sqlite, with .patterns.json and .learning-data.json of the same run beside it; the
# time is in TZ from .env.local. Each file is written under a temporary name in BACKUP_DIR and renamed once complete,
# so Google Drive never uploads half a file. Only files named like that are ever deleted, and never this run's.
# One run at a time (flock). Warns, without failing, when the clock is behind the newest copy or the new copy has far
# fewer records than it. Restore and the rest: docs/knowledge-base/08-development/live-instance.md, «Бэкап»
#
# Override (for a test only):
#   BACKUP_ALLOW_SAME_DISK=1  accept a BACKUP_DIR on the same disk as data/; a copy there dies with that disk
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATABASE="data/database.sqlite"
SIDECARS="patterns learning-data"
KEEP=30
PREFIX="kapelka-"
STAMP_RE="[0-9]{8}-[0-9]{6}"
DOC="docs/knowledge-base/08-development/live-instance.md"
# How long sqlite3 waits for a lock that the app holds while it writes
BUSY_TIMEOUT_MS=30000
# A JSON file read in the middle of the app's write is cut short: it is read again after a pause
JSON_ATTEMPTS=3
# Windows may hold a new file for a moment (antivirus, Google Drive): the rename is retried
RENAME_ATTEMPTS=3

BACKUP_FOLDER=""
STAGING=""
PARTIALS=()
REMOVED=0

say() { printf 'backup-db: %s\n' "$*"; }
warn() { printf 'backup-db: WARNING: %s\n' "$*"; }
fail() {
  printf 'backup-db: %s\n' "$*" >&2
  exit 1
}

# sqlite3 without the user's ~/.sqliterc (headers or a box mode there would break every check) and without a
# terminal on stdin, where it announces the init file it loads
sqlite() {
  sqlite3 -init /dev/null "$@" </dev/null
}

# The number of records in a database file, or nothing when it cannot be read. immutable=1: no locks, so a copy on
# the Windows drive is read the same way as one in WSL
count_records() {
  local uri="${1//%/%25}"
  uri="${uri// /%20}"
  uri="${uri//\?/%3F}"
  uri="${uri//#/%23}"
  sqlite "file:$uri?immutable=1" 'SELECT count(*) FROM transactions;' 2>/dev/null || true
}

# Only one backup at a time: a run by hand and the timer's in the same second would share temporary names. The lock
# lives with this copy's data, on WSL's own disk (locks on /mnt/c are not to be trusted); without flock (a Mac, for the
# tests) there is no lock
take_lock() {
  local lock="data/backups/.backup-db.lock"
  if ! command -v flock >/dev/null; then
    return 0
  fi
  mkdir -p data/backups
  exec 9>"$lock"
  flock -n 9 || fail "another backup is running (it holds $APP_DIR/$lock); this run did nothing"
}

cleanup() {
  if [ -n "$STAGING" ]; then
    rm -rf "$STAGING"
  fi
  local partial
  for partial in ${PARTIALS[@]+"${PARTIALS[@]}"}; do
    rm -f "$partial" 2>/dev/null || true
  done
}
trap cleanup EXIT

# The value of KEY in .env.local, without quotes and trailing spaces; empty when it is not there
env_value() {
  if [ -f .env.local ]; then
    sed -n "s/^$1=//p" .env.local | tail -n 1 | tr -d "\"'\r" | sed 's/[[:space:]]*$//'
  fi
}

# The device a path lives on: GNU stat in WSL, BSD stat on a Mac (the tests)
device_of() {
  stat -c %d "$1" 2>/dev/null || stat -f %d "$1"
}

# BACKUP_FOLDER: BACKUP_DIR checked — set, absolute, an existing writable folder, not on the database's disk
resolve_backup_dir() {
  local dir="${BACKUP_DIR:-}"
  if [ -z "$dir" ]; then
    dir="$(env_value BACKUP_DIR)"
  fi
  if [ -z "$dir" ]; then
    fail "BACKUP_DIR is not set: add BACKUP_DIR=/mnt/c/KapelkaBackup to $APP_DIR/.env.local — the folder Google" \
      "Drive syncs. Nothing was backed up. Steps: $DOC, «Бэкап»"
  fi
  case "$dir" in
    /*) ;;
    *) fail "BACKUP_DIR=$dir is not an absolute path; nothing was backed up" ;;
  esac
  if [ ! -d "$dir" ]; then
    fail "BACKUP_DIR=$dir does not exist or is not a folder; nothing was backed up. The script does not create it:" \
      "create it in Windows (C:\\KapelkaBackup is /mnt/c/KapelkaBackup). Is drive C: mounted in WSL (ls /mnt/c)?"
  fi
  if [ ! -w "$dir" ]; then
    fail "BACKUP_DIR=$dir is not writable for $(id -un); nothing was backed up"
  fi
  if [ "${BACKUP_ALLOW_SAME_DISK:-}" != "1" ] && [ "$(device_of "$dir")" = "$(device_of data)" ]; then
    fail "BACKUP_DIR=$dir is on the same disk as $APP_DIR/data, and a copy there is lost with the database." \
      "Point it at a folder on drive C: (/mnt/c/...) that Google Drive syncs; nothing was backed up"
  fi
  BACKUP_FOLDER="$dir"
}

# An online copy of the database, then PRAGMA integrity_check on the copy
copy_database() {
  local copy="$1" result
  # .backup is SQLite's online backup, safe while the app writes. Not -readonly: after a power cut the file may come
  # with a hot journal, and only a connection that may write rolls it back — what the app itself does on start. The
  # file exists (checked in main), so sqlite3 never creates one
  sqlite -bail "$DATABASE" ".timeout $BUSY_TIMEOUT_MS" ".backup '$copy'" ||
    fail "sqlite3 .backup of $APP_DIR/$DATABASE failed (above); nothing was written to the backup folder"
  result="$(sqlite -readonly "$copy" 'PRAGMA integrity_check;' 2>&1 || true)"
  if [ "$result" != "ok" ]; then
    printf '%s\n' "$result" | head -n 5 >&2
    fail "the copy fails PRAGMA integrity_check (above); nothing was written to the backup folder." \
      "Check the live file: sqlite3 -readonly $DATABASE 'PRAGMA integrity_check;'"
  fi
}

# Copies data/<name>.json once it reads as whole JSON; returns 1 when it never does
copy_json() {
  local name="$1" copy="$2" attempt valid
  for attempt in $(seq 1 "$JSON_ATTEMPTS"); do
    cp "data/$name.json" "$copy"
    valid="$(sqlite :memory: "SELECT json_valid(CAST(readfile('$copy') AS TEXT));" 2>/dev/null || true)"
    if [ "$valid" = "1" ]; then
      return 0
    fi
    if [ "$attempt" -lt "$JSON_ATTEMPTS" ]; then
      sleep 1
    fi
  done
  rm -f "$copy"
  return 1
}

# Moves a finished temporary file to its name, retrying while Windows holds it
rename_into_place() {
  local from="$1" to="$2" attempt
  for attempt in $(seq 1 "$RENAME_ATTEMPTS"); do
    if mv "$from" "$to" 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  mv "$from" "$to" || fail "cannot rename $from to $to (above)"
}

# Copies the staged files to the backup folder under temporary names, compares each with the checked copy, then
# renames them — the database last, so a .sqlite in the folder means its JSON files are there too
publish() {
  local name partial
  for name in "$@"; do
    partial="$BACKUP_FOLDER/.$name.partial"
    PARTIALS+=("$partial")
    cp "$STAGING/$name" "$partial" || fail "cannot write $partial (above); nothing new is in the backup folder"
    cmp -s "$STAGING/$name" "$partial" ||
      fail "$partial differs from the checked copy after writing — is drive C: full? Nothing new is in the folder"
  done
  for name in "$@"; do
    rename_into_place "$BACKUP_FOLDER/.$name.partial" "$BACKUP_FOLDER/$name"
  done
  PARTIALS=()
}

# Deletes the copies older than the newest $KEEP databases, never those of this run (stamp $1) — with a clock far
# behind, the new copy itself would be the oldest. Only kapelka-<date>-<time>.<one of our suffixes> counts
prune() {
  local current="$1" cutoff file stamp
  cutoff="$(
    find "$BACKUP_FOLDER" -maxdepth 1 -type f -name "$PREFIX*.sqlite" |
      sed -n -E "s#^.*/$PREFIX($STAMP_RE)\\.sqlite\$#\\1#p" |
      sort -r | sed -n "${KEEP}p"
  )"
  if [ -n "$cutoff" ]; then
    while IFS= read -r file; do
      stamp="$(printf '%s' "$file" |
        sed -n -E "s#^.*/$PREFIX($STAMP_RE)\\.(sqlite|patterns\\.json|learning-data\\.json)\$#\\1#p")"
      if [ -n "$stamp" ] && [ "$stamp" != "$current" ] && [[ "$stamp" < "$cutoff" ]]; then
        rm -f -- "$file" || fail "cannot delete the old copy $file (above); the new copy is in place"
        REMOVED=$((REMOVED + 1))
      fi
    done < <(find "$BACKUP_FOLDER" -maxdepth 1 -type f -name "$PREFIX*")
  fi
  # Temporary files of a run that was killed before its cleanup
  find "$BACKUP_FOLDER" -maxdepth 1 -type f -name ".$PREFIX*.partial" -mmin +60 -exec rm -f {} + 2>/dev/null || true
}

# Warnings, never a failure, against the newest copy already in the folder: a clock behind it, and far fewer records
# — a fresh empty database after reinstalling WSL, whose copies would push the good ones out. Restore first: the doc
compare_with_previous() {
  local copy="$1" stamp="$2" previous previous_stamp now_count previous_count
  previous="$(find "$BACKUP_FOLDER" -maxdepth 1 -type f -name "$PREFIX*.sqlite" |
    grep -E "/$PREFIX$STAMP_RE\\.sqlite\$" | sort | tail -n 1 || true)"
  if [ -z "$previous" ]; then
    return 0
  fi
  previous_stamp="${previous##*/"$PREFIX"}"
  previous_stamp="${previous_stamp%.sqlite}"
  if [[ "$stamp" < "$previous_stamp" ]]; then
    warn "the clock is behind the newest copy (${previous##*/}; now $stamp): check the time in WSL with date." \
      "This copy is kept, but sorts as older"
  fi
  now_count="$(count_records "$copy")"
  previous_count="$(count_records "$previous")"
  if [[ "$now_count" =~ ^[0-9]+$ ]] && [[ "$previous_count" =~ ^[0-9]+$ ]] &&
    [ $((now_count * 2)) -lt "$previous_count" ]; then
    warn "this copy has $now_count records, the previous one (${previous##*/}) has $previous_count. A fresh" \
      "database after reinstalling WSL? Restore from an older copy before new ones push it out: $DOC, «Восстановление»"
  fi
}

main() {
  cd "$APP_DIR"
  local tz stamp base name kept size attempt
  local -a files=()
  local skipped="" broken=""

  command -v sqlite3 >/dev/null || fail "sqlite3 is not installed: sudo apt-get install -y sqlite3"
  if [ ! -f "$DATABASE" ]; then
    fail "no database at $APP_DIR/$DATABASE — is this the live copy? Nothing was backed up"
  fi
  resolve_backup_dir
  take_lock

  tz="${TZ:-$(env_value TZ)}"
  # A run by hand and one through systemd may meet in the same second: the second one waits for the next
  for attempt in 1 2 3; do
    if [ -n "$tz" ]; then
      stamp="$(TZ="$tz" date +%Y%m%d-%H%M%S)"
    else
      stamp="$(date +%Y%m%d-%H%M%S)"
    fi
    base="$PREFIX$stamp"
    if [ ! -e "$BACKUP_FOLDER/$base.sqlite" ]; then
      break
    fi
    if [ "$attempt" = 3 ]; then
      fail "$BACKUP_FOLDER/$base.sqlite already exists: is another backup running? Nothing was written"
    fi
    sleep 1
  done

  STAGING="$(mktemp -d "${TMPDIR:-/tmp}/kapelka-backup.XXXXXX")"
  copy_database "$STAGING/$base.sqlite"
  compare_with_previous "$STAGING/$base.sqlite" "$stamp"
  for name in $SIDECARS; do
    if [ ! -f "data/$name.json" ]; then
      skipped="$skipped data/$name.json"
    elif copy_json "$name" "$STAGING/$base.$name.json"; then
      files+=("$base.$name.json")
    else
      broken="$broken data/$name.json"
    fi
  done
  files+=("$base.sqlite")
  publish "${files[@]}"

  prune "$stamp"
  kept="$(find "$BACKUP_FOLDER" -maxdepth 1 -type f -name "$PREFIX*.sqlite" | grep -c -E "/$PREFIX$STAMP_RE\\.sqlite\$" || true)"
  size="$(wc -c <"$BACKUP_FOLDER/$base.sqlite" | tr -d ' ')"
  say "done: ${files[*]} in $BACKUP_FOLDER (database $size bytes, integrity ok); copies kept: $kept, old files removed: $REMOVED"
  if [ -n "$skipped" ]; then
    say "not there yet, skipped:$skipped"
  fi
  if [ -n "$broken" ]; then
    fail "the database is backed up, but$broken never read as whole JSON in $JSON_ATTEMPTS attempts and was left" \
      "out; look at it in $APP_DIR"
  fi
}

main "$@"
