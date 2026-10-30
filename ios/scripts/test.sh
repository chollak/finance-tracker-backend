#!/usr/bin/env bash
# Builds Kapelka and runs its tests on an iPhone simulator. Picks the first available iPhone unless one is named:
#
#   ios/scripts/test.sh
#   KAPELKA_SIMULATOR="iPhone 17 Pro" ios/scripts/test.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Picking a team in Xcode writes the Team ID into the project; it belongs in Config/Signing.local.xcconfig
if grep -Eq 'DEVELOPMENT_TEAM = [A-Z0-9]{10};' Kapelka.xcodeproj/project.pbxproj; then
  echo "project.pbxproj holds a Team ID: put it into Config/Signing.local.xcconfig," \
    "then git checkout ios/Kapelka.xcodeproj/project.pbxproj" >&2
  exit 1
fi

device="${KAPELKA_SIMULATOR:-}"
if [ -z "$device" ]; then
  device="$(xcrun simctl list devices available | sed -n 's/^ *\(iPhone[^(]*\) (\([0-9A-F-]\{36\}\)).*/\2/p' | head -n 1)"
fi
if [ -z "$device" ]; then
  echo "No iPhone simulator. Xcode → Settings → Components: install the iOS simulator." >&2
  exit 1
fi

case "$device" in
  *-*-*-*-*) destination="platform=iOS Simulator,id=$device" ;;
  *) destination="platform=iOS Simulator,name=$device" ;;
esac

exec xcodebuild test \
  -project Kapelka.xcodeproj \
  -scheme Kapelka \
  -destination "$destination" \
  -derivedDataPath DerivedData \
  "$@"
