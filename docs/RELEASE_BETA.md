# OpenBot beta downloads

## What to download

| Platform | File | How to run |
| --- | --- | --- |
| macOS (Apple Silicon) | `openbot-<version>-darwin-arm64.tar.gz` | Unpack OpenBot.app, right-click → Open on first launch (unsigned beta), keep it in /Applications |
| Linux x64 | `openbot-<version>-linux-x64.tar.gz` | `tar -xzf … && cd openbot-* && ./openbot.sh` |
| Windows x64 | `openbot-<version>-win-x64.zip` | Unblock the zip (right-click → Properties), unpack, run `openbot.ps1` in PowerShell |

Verify integrity first: compare `sha256sum` output with the matching `.sha256` file. Each archive carries `runtime-manifest.json` with the exact app, Node and opencode versions plus binary hashes.

## First run (all platforms)

1. The studio opens at http://127.0.0.1:4311. Your data stays in `OPENBOT_DATA_DIR` (`~/.openbot` by default, `%USERPROFILE%\.openbot` on Windows).
2. Follow the three-step checklist: model runtime (bundled), AI connection (your account, key or local model), first teammate.
3. Give the teammate a small job. Sensitive actions pause for your approval unless you enable YOLO mode.

## Requirements and limits

- Bundled: Node 22 and the opencode runtime. Not bundled: any AI account or model costs, Chrome (only for browser takeover), Docker (only for project checks), OAuth consent.
- The host stays awake while teammates work; there is no managed cloud in this beta and no auto-update. Back up your data directory (database plus vault key) before upgrading.
- Linux needs glibc 2.28+ (any recent distro). Windows needs PowerShell 5.1+; run `openbot.ps1`, not the `.sh` launcher.
- Ports: the studio binds loopback port 4311 by default. Phone pairing needs both devices on the same network.

## Beta scope

This is an owner-hosted beta: you operate the studio, you pick the provider, you review consequential actions. Known beta limits: unsigned builds, no automatic updates, no Windows/macOS native clients beyond the Mac app, community skill files install only after your explicit review, and newly written self-extended tools are only as sandboxed as the bot workspace. Report issues privately per SECURITY.md.

## Distributing from your own site (no App Store, no fees)

The Mac App Store requires a paid Apple Developer Program membership. Direct download from your own website does not — and these beta builds are made for exactly that:

- Publish the three files per platform (archive plus `.sha256`, plus the macOS `.manifest.json`) on your site with the version number.
- Mac: visitors unpack OpenBot.app, then **right-click → Open** on first launch. That is Apple's sanctioned path for unsigned apps; after the first open it launches normally. No terminal command needed.
- Optional paid upgrade path later: a Developer ID Application certificate (same paid membership) plus the repo's `sign-notarize` CI job produces Gatekeeper-clean downloads with no workflow change.
- Windows: unsigned builds trigger SmartScreen ("Windows protected your PC" → More info → Run anyway). A paid code-signing certificate removes it; until then the `.sha256` file is your tamper evidence — tell users to check it.
- Never ask users to disable Gatekeeper or SmartScreen. Right-click Open / More-info-run-anyway keeps their protection on.
