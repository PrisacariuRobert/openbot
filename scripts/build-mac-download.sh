#!/bin/sh
# Builds the Mac disk image for people who don't use Terminal (task A8):
#   scripts/build-mac-download.sh <darwin-arm64|darwin-x64> <folder with the bundle> <output folder> [--stage-only]
# The folder must hold sidemates-<platform>.tar.gz, its .sha256 and install.sh, as the
# release workflow prepares them for the one-line install. The image holds the same files,
# so both ways install the same thing. --stage-only stops before hdiutil (for tests off a Mac).
set -eu
PLATFORM="$1"; FROM="$2"; OUT="$3"; STAGE_ONLY="${4:-}"
case "$PLATFORM" in darwin-arm64) NAME="Sidemates-mac-arm64" ;; darwin-x64) NAME="Sidemates-mac-x64" ;; *) echo "Unknown platform: $PLATFORM" >&2; exit 1 ;; esac
HERE="$(cd "$(dirname "$0")" && pwd)"
for file in "sidemates-$PLATFORM.tar.gz" "sidemates-$PLATFORM.tar.gz.sha256" install.sh; do
  [ -f "$FROM/$file" ] || { echo "Missing $FROM/$file" >&2; exit 1; }
done
EXPECTED="$(awk '{print $1}' "$FROM/sidemates-$PLATFORM.tar.gz.sha256")"
ACTUAL="$( (shasum -a 256 "$FROM/sidemates-$PLATFORM.tar.gz" 2>/dev/null || sha256sum "$FROM/sidemates-$PLATFORM.tar.gz") | awk '{print $1}')"
[ "$EXPECTED" = "$ACTUAL" ] || { echo "The bundle doesn't match its fingerprint." >&2; exit 1; }
STAGE="$OUT/$NAME"
rm -rf "$STAGE"; mkdir -p "$STAGE/.bundle"
cp "$FROM/sidemates-$PLATFORM.tar.gz" "$FROM/sidemates-$PLATFORM.tar.gz.sha256" "$FROM/install.sh" "$STAGE/.bundle/"
cp "$HERE/mac-download/Install Sidemates.command" "$HERE/mac-download/Read me.txt" "$STAGE/"
chmod +x "$STAGE/Install Sidemates.command" "$STAGE/.bundle/install.sh"
[ "$STAGE_ONLY" = "--stage-only" ] && { echo "$STAGE"; exit 0; }
rm -f "$OUT/$NAME.dmg"
hdiutil create -volname "Sidemates" -srcfolder "$STAGE" -ov -format UDZO "$OUT/$NAME.dmg" >/dev/null
rm -rf "$STAGE"
( cd "$OUT" && shasum -a 256 "$NAME.dmg" > "$NAME.dmg.sha256" )
echo "$OUT/$NAME.dmg"
