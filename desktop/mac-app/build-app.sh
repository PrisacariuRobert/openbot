#!/bin/sh
# Builds OpenBot.app around the OpenBot service so macOS lists and grants
# privacy permissions as "OpenBot" (with its icon), not as "node".
#   build-app.sh <output.app> <launch-script> <icon.png> [launcher-binary]
# The launch script receives the app's arguments: `--serve` must run the
# service in the foreground; no arguments should open the studio.
set -eu
APP="$1"; LAUNCH="$2"; ICON="$3"; LAUNCHER="${4:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# macOS ties privacy permissions to the app's exact signature. Rebuilding an
# unchanged app would silently drop Full Disk Access, so leave it alone when
# the launcher, script and icon are the same.
BUILD_ID="$( { cat "${LAUNCHER:-$HERE/launcher.c}" "$LAUNCH" "$ICON" 2>/dev/null; } | shasum -a 256 | awk '{print $1}')"
if [ -f "$APP/Contents/Resources/build-id" ] && [ "$(cat "$APP/Contents/Resources/build-id")" = "$BUILD_ID" ] && [ -x "$APP/Contents/MacOS/OpenBot" ]; then echo "$APP"; exit 0; fi
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
if [ -n "$LAUNCHER" ]; then cp "$LAUNCHER" "$APP/Contents/MacOS/OpenBot"
else clang -O2 -arch arm64 -arch x86_64 -mmacosx-version-min=12.0 -o "$APP/Contents/MacOS/OpenBot" "$HERE/launcher.c"; fi
chmod 755 "$APP/Contents/MacOS/OpenBot"
cp "$LAUNCH" "$APP/Contents/Resources/openbot-launch"
chmod 755 "$APP/Contents/Resources/openbot-launch"
if [ -f "$ICON" ]; then
  SET="$(mktemp -d)/OpenBot.iconset"; mkdir -p "$SET"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$ICON" --out "$SET/icon_${size}x${size}.png" >/dev/null 2>&1 || true
    double=$((size * 2)); [ $double -le 512 ] && sips -z $double $double "$ICON" --out "$SET/icon_${size}x${size}@2x.png" >/dev/null 2>&1 || true
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/OpenBot.icns" >/dev/null 2>&1 || true
fi
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>OpenBot</string>
  <key>CFBundleDisplayName</key><string>OpenBot</string>
  <key>CFBundleIdentifier</key><string>foundation.openbots.studio</string>
  <key>CFBundleExecutable</key><string>OpenBot</string>
  <key>CFBundleIconFile</key><string>OpenBot</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.37</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSAppleEventsUsageDescription</key><string>OpenBot sends your teammates' replies through Messages when you connect iMessage.</string>
</dict>
</plist>
PLIST
# Free ad-hoc signature: gives the app a stable identity for privacy settings.
printf '%s' "$BUILD_ID" > "$APP/Contents/Resources/build-id"
codesign --force --sign - --identifier foundation.openbots.studio "$APP" >/dev/null 2>&1 || true
touch "$APP"
echo "$APP"
