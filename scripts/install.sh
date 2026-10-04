#!/bin/sh
# Sidemates installer for macOS.
#   curl -fsSL https://sidemates.app/install.sh | sh
#
# What it does, in plain terms:
#   1. downloads the Sidemates bundle for this Mac and checks its fingerprint,
#   2. puts it in ~/Library/Application Support/Sidemates,
#   3. runs it in the background (it restarts itself and starts at login),
#   4. adds a Sidemates app to ~/Applications and the Dock,
#   5. opens your studio in the browser.
# Nothing needs an administrator password. Remove everything any time with:
#   "~/Library/Application Support/Sidemates/uninstall.sh"
#
# Overrides (for testing or custom setups): OPENBOT_INSTALL_FROM (URL or
# folder holding the bundle), OPENBOT_INSTALL_DIR, OPENBOT_INSTALL_PORT,
# OPENBOT_INSTALL_LABEL, OPENBOT_INSTALL_APP (path of the .app),
# OPENBOT_INSTALL_NO_DOCK=1, OPENBOT_INSTALL_NO_OPEN=1.
# Coming from OpenBot (the old name), the installer moves its data folder across; tests can point at
# a copy with OPENBOT_INSTALL_OLD_DIR, OPENBOT_INSTALL_OLD_LABEL and OPENBOT_INSTALL_OLD_APP.
set -eu

# The bundle is served through sidemates.app (fast, cached at Cloudflare); GitHub is the fallback.
MIRROR="https://sidemates.app/download/latest"
GITHUB="https://github.com/PrisacariuRobert/sidemates/releases/latest/download"
FROM="${OPENBOT_INSTALL_FROM:-$MIRROR}"
DIR="${OPENBOT_INSTALL_DIR:-$HOME/Library/Application Support/Sidemates}"
PORT="${OPENBOT_INSTALL_PORT:-4311}"
LABEL="${OPENBOT_INSTALL_LABEL:-app.sidemates.studio}"
APP="${OPENBOT_INSTALL_APP:-$HOME/Applications/Sidemates.app}"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
URL="http://127.0.0.1:$PORT"

if [ -t 1 ]; then BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"; RESET="$(printf '\033[0m')"; else BOLD=""; DIM=""; RESET=""; fi
say() { printf '%s\n' "$*"; }
step() { printf '%s•%s %s\n' "$BOLD" "$RESET" "$*"; }
fail() { printf '\n%sSidemates could not be installed:%s %s\n' "$BOLD" "$RESET" "$*" >&2; exit 1; }

say ""
say "${BOLD}Installing Sidemates${RESET} ${DIM}— your team of AI teammates, on your Mac.${RESET}"
say ""

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS."
case "$(uname -m)" in
  arm64) PLATFORM="darwin-arm64" ;;
  x86_64) PLATFORM="darwin-x64" ;;
  *) fail "this Mac's processor ($(uname -m)) isn't supported yet." ;;
esac
ASSET="sidemates-$PLATFORM.tar.gz"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/sidemates-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT INT TERM

fetch() { # source-name destination
  case "$FROM" in
    http://*|https://*) curl -fsSL --retry 3 --connect-timeout 15 -o "$2" "$FROM/$1" ;;
    *) cp "$FROM/$1" "$2" ;;
  esac
}

# The bundle is large (it carries its own runtime), so show a progress bar when a person is watching.
fetch_with_progress() { # source-name destination
  case "$FROM" in
    http://*|https://*)
      if [ -t 2 ]; then curl -fL --retry 3 --connect-timeout 15 --progress-bar -o "$2" "$FROM/$1"
      else curl -fsSL --retry 3 --connect-timeout 15 -o "$2" "$FROM/$1"; fi ;;
    *) cp "$FROM/$1" "$2" ;;
  esac
}

# Fetch the bundle and its fingerprint from one place and check they match.
download_bundle() { # base-url
  FROM="$1"
  fetch_with_progress "$ASSET" "$WORK/$ASSET" || return 1
  fetch "$ASSET.sha256" "$WORK/$ASSET.sha256" || return 1
  EXPECTED="$(awk '{print $1}' "$WORK/$ASSET.sha256")"
  ACTUAL="$(shasum -a 256 "$WORK/$ASSET" | awk '{print $1}')"
  [ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ]
}

step "Downloading Sidemates for this Mac (about 140 MB: a minute or less on most connections)…"
if ! download_bundle "$FROM"; then
  [ -z "${OPENBOT_INSTALL_FROM:-}" ] || fail "the download didn't finish or didn't match its fingerprint, so nothing was installed. Please try again."
  step "That route didn't work. Trying GitHub directly (this can be slower)…"
  download_bundle "$GITHUB" || fail "the download didn't finish or didn't match its fingerprint, so nothing was installed. Check your internet connection and try again."
fi

# Coming from OpenBot (this app's old name)? Do this only after the download worked, so a failed
# download leaves the old install untouched. The data folder is renamed on the same disk (nothing is
# copied) and the old background job is retired. Custom setups (OPENBOT_INSTALL_DIR) are left alone
# unless OPENBOT_INSTALL_OLD_DIR says where the old folder is.
OLD_DIR="${OPENBOT_INSTALL_OLD_DIR:-}"
OLD_LABEL="${OPENBOT_INSTALL_OLD_LABEL:-foundation.openbots.studio}"
OLD_APP="${OPENBOT_INSTALL_OLD_APP:-$HOME/Applications/OpenBot.app}"
[ -n "$OLD_DIR" ] || [ -n "${OPENBOT_INSTALL_DIR:-}" ] || OLD_DIR="$HOME/Library/Application Support/OpenBot"
MIGRATED=""
if [ -n "$OLD_DIR" ] && [ "$OLD_DIR" != "$DIR" ] && [ -d "$OLD_DIR/data" ] && [ ! -e "$DIR" ]; then
  step "Moving your teammates and data from OpenBot to Sidemates…"
  if [ "$OLD_LABEL" != "$LABEL" ]; then
    launchctl bootout "gui/$(id -u)/$OLD_LABEL" >/dev/null 2>&1 || true
    i=0; while [ $i -lt 20 ] && launchctl print "gui/$(id -u)/$OLD_LABEL" >/dev/null 2>&1; do sleep 0.5; i=$((i + 1)); done
    rm -f "$HOME/Library/LaunchAgents/$OLD_LABEL.plist"
  fi
  mkdir -p "$(dirname "$DIR")"
  mv "$OLD_DIR" "$DIR" || fail "your data couldn't be moved to $DIR. Nothing was deleted; your old folder is still at $OLD_DIR."
  rm -f "$DIR/current"
  [ "$OLD_APP" = "$APP" ] || rm -rf "$OLD_APP"
  MIGRATED=1
fi

step "Unpacking…"
mkdir -p "$DIR/versions" "$DIR/data" "$DIR/logs"
tar -xzf "$WORK/$ASSET" -C "$WORK"
BUNDLE="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d -name 'sidemates-*' | head -n 1)"
[ -n "$BUNDLE" ] && [ -x "$BUNDLE/sidemates.sh" ] || fail "the bundle is missing its launcher."
NAME="$(basename "$BUNDLE")"
rm -rf "$DIR/versions/$NAME"
mv "$BUNDLE" "$DIR/versions/$NAME"
ln -sfn "$DIR/versions/$NAME" "$DIR/current"

# Sidemates.app runs the service, so macOS lists permissions as "Sidemates".
SERVE="$DIR/current/sidemates.sh"
if [ -x "$DIR/current/mac-app/build-app.sh" ]; then
  mkdir -p "$(dirname "$APP")"
  LAUNCH="$WORK/sidemates-launch"
  cat > "$LAUNCH" <<LAUNCH_EOF
#!/bin/sh
if [ "\${1:-}" = "--serve" ]; then exec "$DIR/current/sidemates.sh"; fi
# Double-clicked: wake the background service if it stopped, then open.
if ! /usr/bin/curl -fs -o /dev/null --max-time 2 "$URL/"; then
  /bin/launchctl kickstart "gui/\$(/usr/bin/id -u)/$LABEL" >/dev/null 2>&1 || true
  i=0; while [ \$i -lt 30 ] && ! /usr/bin/curl -fs -o /dev/null --max-time 2 "$URL/"; do sleep 0.5; i=\$((i + 1)); done
fi
open "$URL/"
LAUNCH_EOF
  LAUNCHER=""; [ -f "$DIR/current/mac-app/Sidemates-launcher" ] && LAUNCHER="$DIR/current/mac-app/Sidemates-launcher"
  if "$DIR/current/mac-app/build-app.sh" "$APP" "$LAUNCH" "$DIR/current/mac-app/icon.png" $LAUNCHER >/dev/null 2>&1; then SERVE="$APP/Contents/MacOS/Sidemates"; fi
fi

step "Starting Sidemates in the background…"
mkdir -p "$HOME/Library/LaunchAgents"
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$(xml "$LABEL")</string>
  <key>ProgramArguments</key><array><string>$(xml "$SERVE")</string>$( [ "$SERVE" = "$DIR/current/sidemates.sh" ] || printf '<string>--serve</string>' )</array>
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
  <key>StandardOutPath</key><string>$(xml "$DIR/logs/sidemates.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$DIR/logs/sidemates-error.log")</string>
</dict>
</plist>
EOF
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
# Stopping the old copy finishes in the background; wait for it before starting
# the new one (this is the update path too).
i=0; while [ $i -lt 20 ] && launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; do sleep 0.5; i=$((i + 1)); done
STARTED=""
for attempt in 1 2 3 4 5; do
  if launchctl bootstrap "$DOMAIN" "$PLIST" >/dev/null 2>&1; then STARTED=1; break; fi
  sleep 1
done
[ -n "$STARTED" ] || fail "macOS didn't let Sidemates start in the background."

printf '%s•%s Opening your studio' "$BOLD" "$RESET"
READY=""
i=0
# The first start prepares the bundled tools and can take a few minutes on a
# busy Mac; later starts take seconds.
while [ $i -lt 300 ]; do
  if curl -fsS -o /dev/null --max-time 2 "$URL/api/healthz" 2>/dev/null; then READY=1; break; fi
  [ $i -eq 45 ] && printf '\n  %sThe first start can take a couple of minutes…%s ' "$DIM" "$RESET"
  printf '.'; sleep 1; i=$((i + 1))
done
printf '\n'
[ -n "$READY" ] || fail "Sidemates didn't start. Details are in \"$DIR/logs/sidemates-error.log\"."

step "Adding Sidemates to your Applications and Dock…"
if [ "$SERVE" = "$DIR/current/sidemates.sh" ]; then
mkdir -p "$(dirname "$APP")"
rm -rf "$APP"
osacompile -o "$APP" -e "open location \"$URL\"" >/dev/null 2>&1 || fail "the Sidemates app couldn't be created."
ICON_SRC="$DIR/current/app/public/icon-512.png"
if [ -f "$ICON_SRC" ]; then
  ICONSET="$WORK/Sidemates.iconset"; mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1 || true
    double=$((size * 2)); [ $double -le 512 ] && sips -z $double $double "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1 || true
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/applet.icns" >/dev/null 2>&1 || true
fi
/usr/libexec/PlistBuddy -c "Set :CFBundleName Sidemates" "$APP/Contents/Info.plist" >/dev/null 2>&1 || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $LABEL.app" "$APP/Contents/Info.plist" >/dev/null 2>&1 || true
touch "$APP"
fi
# After a move from OpenBot, point its old Dock icon at Sidemates (a removed app would leave a "?").
# Only for a real default install; it edits a copy of the Dock settings and reloads them.
if [ -n "$MIGRATED" ] && [ -z "${OPENBOT_INSTALL_OLD_DIR:-}" ] && [ -z "${OPENBOT_INSTALL_DIR:-}" ]; then
  DOCK="$WORK/dock.plist"
  if defaults export com.apple.dock "$DOCK" >/dev/null 2>&1; then
    n=0; RETARGETED=""
    while TILE="$(/usr/libexec/PlistBuddy -c "Print :persistent-apps:$n:tile-data:file-data:_CFURLString" "$DOCK" 2>/dev/null)"; do
      case "$TILE" in
        */OpenBot.app|*/OpenBot.app/)
          /usr/libexec/PlistBuddy -c "Set :persistent-apps:$n:tile-data:file-data:_CFURLString file://$APP/" "$DOCK" >/dev/null 2>&1 \
            && { /usr/libexec/PlistBuddy -c "Set :persistent-apps:$n:tile-data:file-label Sidemates" "$DOCK" >/dev/null 2>&1 || true; RETARGETED=1; } ;;
      esac
      n=$((n + 1))
    done
    [ -z "$RETARGETED" ] || { defaults import com.apple.dock "$DOCK" >/dev/null 2>&1 && killall Dock >/dev/null 2>&1 || true; }
  fi
fi
if [ -z "${OPENBOT_INSTALL_NO_DOCK:-}" ] && ! defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "$(basename "$APP")"; then
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://$APP/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>" && killall Dock >/dev/null 2>&1 || true
fi

cat > "$DIR/uninstall.sh" <<EOF
#!/bin/sh
# Removes Sidemates from this Mac. Your data folder is kept unless you add --delete-data.
launchctl bootout "gui/\$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST"
rm -rf "$APP" "$DIR/versions" "$DIR/current" "$DIR/logs"
if [ "\${1:-}" = "--delete-data" ]; then rm -rf "$DIR"; echo "Sidemates and its data were removed."; else echo "Sidemates was removed. Your data is still in: $DIR/data"; fi
EOF
chmod +x "$DIR/uninstall.sh"

say ""
say "${BOLD}Sidemates is installed.${RESET} It's opening in your browser now."
say "${DIM}Open it any time from the Dock or Applications. It keeps working in the background.${RESET}"
say ""
[ -n "${OPENBOT_INSTALL_NO_OPEN:-}" ] || open "$URL/?welcome=installed" >/dev/null 2>&1 || true
