# Review of the owner’s changes — 8 September 2026

Review only, as requested. No product source was changed by this review. This covers the current dirty checkout, not a published release or every historical capability. Files were still changing during review; rerun checks after the final edits.

Later, the owner authorized fixes. See [verified fixes and remaining limits](QA_BUG_FIXES_2026-09-08.md) for the follow-up; the findings below retain the original review evidence.

## Overall assessment

The shared desktop shell is a substantial improvement: conversation navigation is recognizable, the Library is a quiet list instead of a dashboard of controls, and mascot color has a clear purpose. Keep this direction. The main remaining risk is promising reliable account access and installation before the new implementation has realistic coverage.

## Corrections before release

### P1 — Chrome session import does not implement Chrome’s encryption format

`src/server/own-browser-bridge.ts`, `readChromeSafeStorageKey`, `decryptChromeCookie` and `loadOwnerCookies`.

The Keychain password is passed directly to AES, truncated to 16 bytes. Chromium derives an AES key from that password using PBKDF2, salt `saltysalt`, 1,003 iterations. Modern cookie databases also prepend a SHA-256 domain digest to the plaintext before encryption; the importer neither verifies nor removes it. Real imports can fail decryption or produce invalid cookie values. The tests use the same raw-key encryption as the implementation, so a passing round-trip is not an independent compatibility test.

Confirmed with a separate synthetic fixture: importing with the synthetic Keychain password fails; passing the correctly derived AES key still leaves the domain digest in the returned value. This reproduction used no real account or cookie data.

Correct with independently generated legacy/current-format fixtures, schema-aware digest validation, exact host-only versus domain-cookie handling, and a manually approved real-account test. Do not record or publish real cookie values. Do not call the import proven until that test succeeds.

Sources: [Chromium macOS encryption](https://chromium.googlesource.com/chromium/chromium/+/trunk/components/os_crypt/os_crypt_mac.mm), [Chromium cookie schema and domain digest](https://chromium.googlesource.com/chromium/src/+/main/net/extras/sqlite/sqlite_persistent_cookie_store.cc).

### P1 — Sensitive cookie copies can survive an error

`src/server/own-browser-bridge.ts`, `collectOwnerSessionCookies`.

The main database and WAL are copied before entering `try/finally`. If the WAL copy fails (including a concurrent Chrome exit), the already-copied database is never cleaned up. The implementation also selects every cookie row before filtering, contrary to its “anything else ... stays unread” comment.

Use a restrictive temporary directory, put every copy/open operation inside the cleanup boundary, clean the complete temporary directory including SQLite sidecars, and query only the intended host/domain candidates. Test injected copy/open failures with synthetic data.

### P1 — Release signing and publishing cannot complete in the intended order

`.github/workflows/release.yml`, `publish` and `sign-notarize`.

The signing job references `secrets` in its job-level `if`, which is not a supported context there. Separately, the signer uploads to a release that is only created by `publish`, but `publish` waits for the signer. Even after correcting the conditional, the first release therefore cannot follow this path successfully. The signer does not return its signed archive to the artifact stage consumed by publishing; the original archive remains there. Skipping the optional signing job also needs explicit handling in the dependent publish job.

Use a build → sign/notarize → upload signed artifact → create draft release pipeline. Fail closed when a signed release was requested but signing failed. Exercise unsigned preview and signed release paths independently before tagging anything.

Source: [GitHub’s secrets and conditional rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

### P2 — Desktop external navigation needs an explicit trust boundary

`desktop/main.mjs`, `setWindowOpenHandler`, `will-navigate`, `sameOrigin`.

Every nonlocal URL is forwarded to `shell.openExternal` without a scheme allowlist. The local comparison checks host, not full origin. The renderer is appropriately sandboxed, but the main-process navigation policy should independently allow only intended web schemes/origins; model output and websites are not trusted instructions to launch arbitrary OS protocol handlers. Handle rejected `openExternal` promises too.

Source: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-shellopenexternal-with-untrusted-content).

### P2 — The documented version fails the release gate

The package is `0.37.0-beta.1`, but README’s version heading and “What’s new” heading do not match. `npm run verify` stops at `check:release`. Align release metadata intentionally, then run the full gate; do not just remove the check.

## Product/design feedback

- Keep the current conversation-first shell and restrained Library rows. This is more coherent than the previous oversized settings cards.
- The current desktop has very small navigation/status text and faint secondary labels. Increase legibility before adding decoration; test at actual laptop size, not only enlarged screenshots.
- “Workspace” hides several major destinations. Ensure a new user can find routines, apps and their files in one predictable place without learning the architecture.
- Explain account access in ordinary language: which teammate, which account, what is shared, and how to revoke it. A successful import is not proof that the expected account/page is active.
- Untracked `* 2.tsx`, `* 2.ts` and `* 2.css` duplicates look like editor/merge copies. Decide which are intentional before committing. They were not deleted by this review.
- Do not use personal conversations or account screenshots in the film or website. Marketing examples must be fictional.

## Evidence and limits

- TypeScript: passed (`npm run check`).
- Production frontend build and acceptance TypeScript check: passed. Build reported a large-chunk warning, not a failure.
- Unit tests: 541 passed, zero failed in this run.
- Full verification: blocked by the README/version check before the remaining gates.
- Rendered Electron app: inspected Library and conversation screens.
- GitHub: no published release assets found at review time. A source link is available; a consumer Mac download is not yet verified.
- No owner Chrome cookies were decrypted, no sign-in import was triggered, no messages were sent, and no release was published.

This is not a complete security audit or end-to-end release certification. In particular, signing, clean-machine installation, real-account import, away access and a full iPhone journey still require their own proof.
