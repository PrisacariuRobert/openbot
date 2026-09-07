# First-release package checks — 2026-09-06

Scope: the 0.37.0 macOS **development package** and a disposable first-run studio. This is not Developer ID, notarization, clean-hardware or public-distribution certification. No installed owner app, Keychain entry, login service, real connector account or model task was changed.

## Concrete defects repaired

- Packaging previously deleted the existing embedded runtime before copying and signing. The packager now prepares a complete sibling app, signs and verifies that sibling, then publishes it. Copy/signature failures leave the original untouched; a publication error restores the original where safe. A per-target lock prevents concurrent packagers, and symlink destinations are rejected. This is not a crash-proof filesystem transaction: an interrupted publication can leave `previous.app` inside the sibling `.openbot-package-*` directory for recovery. Do not package or replace an app serving active work.
- The bundled runtime, executables and licenses previously used owner-only permissions. Packaged executable code now has normal public read/traverse permissions. Private studio data remains separate and is not included in the app. Actual execution by a second Mac account still needs a clean-machine check.
- OpenBot's MIT `LICENSE` and root `THIRD_PARTY_NOTICES.md` are now included alongside the version-matched Node/OpenCode notices and dependency license files. The complete `skills/bundled` tree retains its upstream MIT license and security-guidance Apache-2.0 license/adaptation notice; the actual package smoke checks all of these. The manifest records the package-lock checksum and pre-signing executable source checksums.
- Packaging rejects mismatched native/Node/OpenCode architectures before touching the app. An Apple Silicon package is not an Intel or universal package.
- The package smoke test still assumed an automatically seeded Nova. It now verifies the real empty first install, then adds a synthetic unconfigured teammate to its disposable database to exercise recipes and protected memory. A message is refused until an explicit provider choice; no model job is created.
- The smoke process now has its own `HOME` and XDG directories as well as its own data directory and system-only `PATH`, rather than potentially discovering the packaging user's account configuration.

## Reproducible commands

Build the production web output and a matching native `.app` first. Use a disposable copy of the native build, not an installed/running app:

```sh
node --test scripts/test-staged-app-package.mjs
node scripts/package-macos-app.mjs /absolute/disposable/path/OpenBot.app
node scripts/test-macos-package.mjs /absolute/disposable/path/OpenBot.app
```

The first command runs cross-platform transaction tests. The latter two require macOS, the matching CPU architecture, the official OpenCode executable on the packaging machine and internet access to retrieve exact-version license notices. They embed the current dependency tree, not a freshly reproduced `npm ci` tree; the release build must begin in a clean checkout with `npm ci` and `npm run verify`.

## Evidence from this checkout

- Five transaction tests passed: publish-after-validation, relative symlink preservation, copy failure, signature failure, concurrent-packager exclusion and symlink destination rejection (the first test covers both publish and link behavior).
- Actual arm64 package creation, ad-hoc signing and strict deep signature verification passed for `/tmp/openbot-release-package-qePtYi/OpenBot.app`.
- Actual bundled launcher started using only its embedded Node/TypeScript loader and system tools. Its private home/data directory began empty.
- Native, manifest, package and live health versions matched 0.37.0. Both production web entry points were served.
- Empty teammate list and zero initial jobs were verified. The synthetic teammate retained no selected model/provider, and a message returned `provider_choice_required` without creating a job.
- Six recipes, seven bundled skills, protected-memory revision rejection, JSON API 404s and a live event stream passed through the packaged server.
- The launcher and its server exited cleanly with the event stream still open; disposable studio data was removed afterward.

Logs: `/tmp/openbot-release-package.log` and `/tmp/openbot-release-package-smoke.log`. The temporary app is retained for inspection; it has not replaced an installed app.

### Final clean-dependency candidate

After the approval-freshness and missing-vault-key fixes, a guarded source-only snapshot at `/tmp/openbot-release-check.OiIi1N/source` received a fresh `npm ci`, the complete 382-test verification run and a new production web build. A fresh native Mac build from those final Swift sources passed with Xcode 27 beta. The packager then embedded that clean dependency tree and production output into the newly built native app; strict signing verification and the isolated packaged-launch smoke both passed again.

Final artifact: `/tmp/openbot-release-check.OiIi1N/native-derived/Build/Products/Debug/OpenBot.app`. Logs under `/tmp/openbot-release-check.OiIi1N`: `npm-ci.log`, `verify-final.log`, `native-build.log`, `package.log`, `package-smoke.log`. This supersedes the earlier working-tree package for this candidate. It proves clean dependency installation on the development Mac, not installation on a second clean Mac, a source commit/tag, Developer ID signing, notarization or public distribution. No installed app was replaced.

## Before a public desktop download

A later 6 September 0.37.0 candidate now includes the conversation-first native Release build, task-attention fixes and outcome-first runner. Its exact artifact and isolated package checks are in [QA_RESULT_FLOW.md](QA_RESULT_FLOW.md). That later package uses the current dependency tree; do not transfer the older clean-`npm ci` claim to it. Both remain ad-hoc development artifacts.

1. Build from a clean locked-dependency checkout for each supported architecture; run the checks against the final copied artifact.
2. Configure paid Apple Developer ID signing, hardened runtime and notarization. Ad-hoc signing is only a local development proof, not a Gatekeeper-ready download.
3. Test on a second clean Mac without source files, Node, OpenCode, saved model accounts or a developer security exception. Verify explicit provider setup, optional browser installation/permissions, quit/reopen, restart, and existing-studio preservation.
4. Establish signed update delivery and a tested consistent database/vault backup and recovery procedure. This package change does not add automatic updates or data rollback.
5. Separately verify live model/provider and connector workflows, cellular away access, actual push delivery and a multi-day user pilot. Passing a local package test does not prove these services or competitor parity.
