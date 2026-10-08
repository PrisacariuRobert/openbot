#!/bin/sh
# Installs Sidemates from this disk image, with the same installer as the one-line
# install (install.sh, kept with the bundle and its fingerprint in .bundle next to this file).
# Nothing needs an administrator password. Remove it any time with
# "~/Library/Application Support/Sidemates/uninstall.sh".
HERE="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="$HERE/.bundle"
case "$(uname -m)" in arm64) MAC="darwin-arm64" ;; x86_64) MAC="darwin-x64" ;; *) MAC="unknown" ;; esac
if [ ! -f "$BUNDLE/sidemates-$MAC.tar.gz" ]; then
  if [ -f "$BUNDLE/sidemates-darwin-arm64.tar.gz" ]; then FOR="Macs with Apple silicon (M1 or later)"; OTHER="Sidemates-mac-x64.dmg, for Intel Macs"
  else FOR="Intel Macs"; OTHER="Sidemates-mac-arm64.dmg, for Macs with Apple silicon"; fi
  printf '\nThis disk image is for %s, and this Mac is different.\nDownload %s, from https://sidemates.app/mac-download/\n\n' "$FOR" "$OTHER" >&2
  exit 1
fi
OPENBOT_INSTALL_FROM="$BUNDLE" OPENBOT_INSTALL_METHOD="disk-image" sh "$BUNDLE/install.sh"
status=$?
[ $status -eq 0 ] && printf '\nDone. You can close this window and eject the Sidemates disk.\n\n'
exit $status
