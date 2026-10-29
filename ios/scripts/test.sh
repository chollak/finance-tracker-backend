#!/usr/bin/env bash
# Builds Kapelka and runs its tests on an iPhone simulator. Picks the first available iPhone unless one is named:
#
#   ios/scripts/test.sh
#   KAPELKA_SIMULATOR="iPhone 17 Pro" ios/scripts/test.sh
set -euo pipefail

cd "$(dirname "$0")/.."

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
