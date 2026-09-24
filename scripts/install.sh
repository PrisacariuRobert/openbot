#!/bin/sh
# OpenBot installer for macOS.
#   curl -fsSL https://openbots.foundation/install.sh | sh
#
# What it does, in plain terms:
#   1. downloads the OpenBot bundle for this Mac and checks its fingerprint,
#   2. puts it in ~/Library/Application Support/OpenBot,
#   3. runs it in the background (it restarts itself and starts at login),
#   4. adds an OpenBot app to ~/Applications and the Dock,
#   5. opens your studio in the browser.
# Nothing needs an administrator password. Remove everything any time with:
#   "~/Library/Application Support/OpenBot/uninstall.sh"
#
# Overrides (for testing or custom setups): OPENBOT_INSTALL_FROM (URL or
# folder holding the bundle), OPENBOT_INSTALL_DIR, OPENBOT_INSTALL_PORT,
# OPENBOT_INSTALL_LABEL, OPENBOT_INSTALL_APP (path of the .app),
# OPENBOT_INSTALL_NO_DOCK=1, OPENBOT_INSTALL_NO_OPEN=1.
set -eu

FROM="${OPENBOT_INSTALL_FROM:-https://github.com/PrisacariuRobert/openbot/releases/latest/download}"
DIR="${OPENBOT_INSTALL_DIR:-$HOME/Library/Application Support/OpenBot}"
PORT="${OPENBOT_INSTALL_PORT:-4311}"
LABEL="${OPENBOT_INSTALL_LABEL:-foundation.openbots.studio}"
APP="${OPENBOT_INSTALL_APP:-$HOME/Applications/OpenBot.app}"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
URL="http://127.0.0.1:$PORT"

if [ -t 1 ]; then BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"; RESET="$(printf '\033[0m')"; else BOLD=""; DIM=""; RESET=""; fi
say() { printf '%s\n' "$*"; }
step() { printf '%s•%s %s\n' "$BOLD" "$RESET" "$*"; }
fail() { printf '\n%sOpenBot could not be installed:%s %s\n' "$BOLD" "$RESET" "$*" >&2; exit 1; }

say ""
say "${BOLD}Installing OpenBot${RESET} ${DIM}— your team of AI teammates, on your Mac.${RESET}"
say ""

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS."
case "$(uname -m)" in
  arm64) PLATFORM="darwin-arm64" ;;
  x86_64) PLATFORM="darwin-x64" ;;
  *) fail "this Mac's processor ($(uname -m)) isn't supported yet." ;;
esac
ASSET="openbot-$PLATFORM.tar.gz"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/openbot-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT INT TERM

fetch() { # source-name destination
  case "$FROM" in
    http://*|https://*) curl -fsSL --retry 3 --connect-timeout 15 -o "$2" "$FROM/$1" ;;
    *) cp "$FROM/$1" "$2" ;;
  esac
}

step "Downloading OpenBot for this Mac…"
fetch "$ASSET" "$WORK/$ASSET" || fail "the download didn't finish. Check your internet connection and try again."
fetch "$ASSET.sha256" "$WORK/$ASSET.sha256" || fail "the download's fingerprint couldn't be fetched."
EXPECTED="$(awk '{print $1}' "$WORK/$ASSET.sha256")"
ACTUAL="$(shasum -a 256 "$WORK/$ASSET" | awk '{print $1}')"
[ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ] || fail "the download didn't match its fingerprint, so nothing was installed. Please try again."

step "Unpacking…"
mkdir -p "$DIR/versions" "$DIR/data" "$DIR/logs"
tar -xzf "$WORK/$ASSET" -C "$WORK"
BUNDLE="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d -name 'openbot-*' | head -n 1)"
[ -n "$BUNDLE" ] && [ -x "$BUNDLE/openbot.sh" ] || fail "the bundle is missing its launcher."
NAME="$(basename "$BUNDLE")"
rm -rf "$DIR/versions/$NAME"
mv "$BUNDLE" "$DIR/versions/$NAME"
ln -sfn "$DIR/versions/$NAME" "$DIR/current"

step "Starting OpenBot in the background…"
mkdir -p "$HOME/Library/LaunchAgents"
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$(xml "$LABEL")</string>
  <key>ProgramArguments</key><array><string>$(xml "$DIR/current/openbot.sh")</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENBOT_DATA_DIR</key><string>$(xml "$DIR/data")</string>
    <key>OPENBOT_PORT</key><string>$(xml "$PORT")</string>
    <key>OPENBOT_HOST</key><string>127.0.0.1</string>
    <key>OPENBOT_APP_URL</key><string>$(xml "$URL")</string>
    <key>OPENBOT_DEPLOYMENT_MODE</key><string>local</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>WorkingDirectory</key><string>$(xml "$DIR/current")</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$(xml "$DIR/logs/openbot.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$DIR/logs/openbot-error.log")</string>
</dict>
</plist>
EOF
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "$DOMAIN" "$PLIST" || fail "macOS didn't let OpenBot start in the background."

printf '%s•%s Opening your studio' "$BOLD" "$RESET"
READY=""
i=0
while [ $i -lt 90 ]; do
  if curl -fsS -o /dev/null --max-time 2 "$URL/api/healthz" 2>/dev/null; then READY=1; break; fi
  printf '.'; sleep 1; i=$((i + 1))
done
printf '\n'
[ -n "$READY" ] || fail "OpenBot didn't start. Details are in \"$DIR/logs/openbot-error.log\"."

step "Adding OpenBot to your Applications and Dock…"
mkdir -p "$(dirname "$APP")"
rm -rf "$APP"
osacompile -o "$APP" -e "open location \"$URL\"" >/dev/null 2>&1 || fail "the OpenBot app couldn't be created."
ICON_SRC="$DIR/current/app/public/icon-512.png"
if [ -f "$ICON_SRC" ]; then
  ICONSET="$WORK/OpenBot.iconset"; mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1 || true
    double=$((size * 2)); [ $double -le 512 ] && sips -z $double $double "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1 || true
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/applet.icns" >/dev/null 2>&1 || true
fi
/usr/libexec/PlistBuddy -c "Set :CFBundleName OpenBot" "$APP/Contents/Info.plist" >/dev/null 2>&1 || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $LABEL.app" "$APP/Contents/Info.plist" >/dev/null 2>&1 || true
touch "$APP"
if [ -z "${OPENBOT_INSTALL_NO_DOCK:-}" ] && ! defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "$(basename "$APP")"; then
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://$APP/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>" && killall Dock >/dev/null 2>&1 || true
fi

cat > "$DIR/uninstall.sh" <<EOF
#!/bin/sh
# Removes OpenBot from this Mac. Your data folder is kept unless you add --delete-data.
launchctl bootout "gui/\$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST"
rm -rf "$APP" "$DIR/versions" "$DIR/current" "$DIR/logs"
if [ "\${1:-}" = "--delete-data" ]; then rm -rf "$DIR"; echo "OpenBot and its data were removed."; else echo "OpenBot was removed. Your data is still in: $DIR/data"; fi
EOF
chmod +x "$DIR/uninstall.sh"

say ""
say "${BOLD}OpenBot is installed.${RESET} It's opening in your browser now."
say "${DIM}Open it any time from the Dock or Applications. It keeps working in the background.${RESET}"
say ""
[ -n "${OPENBOT_INSTALL_NO_OPEN:-}" ] || open "$URL/?welcome=installed" >/dev/null 2>&1 || true
