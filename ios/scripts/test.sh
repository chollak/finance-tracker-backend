#!/usr/bin/env bash
# Builds Kapelka and runs its tests on an iPhone simulator. Picks the first available iPhone unless one is named:
#
#   ios/scripts/test.sh
#   KAPELKA_SIMULATOR="iPhone 17 Pro" ios/scripts/test.sh
#
# Exit code: 0 — the tests are green; 1 — the project holds a Team ID; 2 — the tests did not run: no Xcode or no such
# simulator; anything else is xcodebuild's own (65 — red tests or a failed build).
set -euo pipefail

cd "$(dirname "$0")/.."

# Picking a team in Xcode writes the Team ID into the project; it belongs in Config/Signing.local.xcconfig
if grep -Eq 'DEVELOPMENT_TEAM = [A-Z0-9]{10};' Kapelka.xcodeproj/project.pbxproj; then
  echo "project.pbxproj holds a Team ID: put it into Config/Signing.local.xcconfig," \
    "then git checkout ios/Kapelka.xcodeproj/project.pbxproj" >&2
  exit 1
fi

did_not_run() {
  echo "$1" >&2
  echo "ios/scripts/test.sh: the tests did not run (exit 2)." >&2
  exit 2
}

if ! listing="$(xcrun simctl list devices available)"; then
  did_not_run "Xcode cannot list simulators: install Xcode and point xcode-select at it."
fi
# "    iPhone 17 Pro (75096F81-…) (Shutdown)" → "75096F81-…<tab>iPhone 17 Pro"
iphones="$(printf '%s\n' "$listing" | sed -n 's/^ *\(iPhone[^(]*[^( ]\) *(\([0-9A-F-]\{36\}\)).*/\2	\1/p')"
if [ -z "$iphones" ]; then
  did_not_run "No iPhone simulator. Xcode → Settings → Components: install the iOS simulator."
fi

device="${KAPELKA_SIMULATOR:-}"
if [ -z "$device" ]; then
  device="$(printf '%s\n' "$iphones" | head -n 1 | cut -f 1)"
elif ! printf '%s\n' "$iphones" | tr '\t' '\n' | grep -Fxq -- "$device"; then
  did_not_run "No simulator \"$device\" (KAPELKA_SIMULATOR). Available:
$(printf '%s\n' "$iphones" | awk -F '\t' '{ print "  " $2 " (" $1 ")" }')"
fi

case "$device" in
  *-*-*-*-*) destination="platform=iOS Simulator,id=$device" ;;
  *) destination="platform=iOS Simulator,name=$device" ;;
esac

# After a red run xcodebuild would spend minutes on `simctl diagnose`, which looks like a hang (#339): never collect it
exec xcodebuild test \
  -project Kapelka.xcodeproj \
  -scheme Kapelka \
  -destination "$destination" \
  -derivedDataPath DerivedData \
  -collect-test-diagnostics never \
  "$@"
