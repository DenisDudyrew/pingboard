#!/bin/bash
set -eu
cd "$(dirname "$0")/../.."
root=$(mktemp -d)
app="$root/PingboardReminderTest.app"
mkdir -p "$app/Contents/MacOS"
exe="$app/Contents/MacOS/ReminderTest"
trap 'rm -rf "$root"' EXIT
cat > "$app/Contents/Info.plist" <<'PLIST'
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.pingboard.reminder-test</string>
<key>CFBundleExecutable</key><string>ReminderTest</string>
<key>CFBundleName</key><string>Pingboard Reminder Test</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
swiftc -module-cache-path "$root/cache" src-tauri/Reminder.swift tests/macos/main.swift -o "$exe"
codesign --force --sign - "$app"
run() { echo "macOS: $1"; "$exe" "$1"; }
run clean
run schedule
run pending
run cancel
run empty
sleep 7
run silent
run schedule
run move
run pending
sleep 7
run silent
sleep 14
run delivered
run clean
echo 'macOS delivered the rescheduled notification after process exit.'
