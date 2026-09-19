# First conversation checkpoint

Base: `acebd8b9f42fe71e5e13aa7cfc791ceead44b636` fetched from `https://github.com/PrisacariuRobert/openbot.git` on 2026-09-19. Branch: `codex/approved-figma-conversation`, isolated worktree `openbot-figma-conversation`. Original checkout and untracked work untouched. No ZIP, patches or PR #26 used.

Initial plan identified SwiftUI as primary; owner explicitly changed scope during implementation: Electron desktop only, with desktop and phones sharing a web UI. This supersedes the attached plan's native target. SwiftUI client source/build scripts retired; backend compatibility APIs retained. Electron remains the real desktop client; phones use the existing responsive HTTPS web/PWA surface. No app-store wrapper or physical-phone acceptance claimed.

Baseline: Node 26.8.1, npm 11.19.0, Xcode 27 available (unused after scope change). `npm ci` and desktop `npm ci` succeeded. Baseline `npm run build` passed; 5 desktop navigation tests and 14 packaging tests passed. Desktop npm audit reported 2 high vulnerabilities in its existing dependency tree; no force-upgrade applied.

Local Electron 38.8.6 install initially had only LICENSES.chromium.html; package install.js exited without extracting the app. SHA-256-verified cached official archive extracted with ditto for local verification. This is a local environment workaround, not an imported application source.
