# Verified bug fixes — 8 September 2026

Scope: the current dirty `codex/calendar-routines` checkout. The owner requested
confirmed code fixes, not more design or film changes. Existing work is preserved;
nothing was committed, pushed, merged, installed over the owner's app or published.

## Fixed

- **Chrome session import:** derive the macOS AES key from the Keychain password;
  verify and remove the schema-24 domain digest before decoding cookie values.
  Host-only cookies no longer match subdomains. SQL selects only matching domain
  candidates; expired and partitioned cookies are omitted rather than widening
  their lifetime or site scope. Unknown encryption and inconsistent data fail
  instead of silently importing incorrect values.
- **Sensitive temporary files:** database, WAL, SHM and journal copies are scoped
  to an owner-only temporary directory, with cleanup covering copy failures as
  well as read failures. Derived keys and the returned Keychain buffer are cleared
  after use. Only synthetic databases were used for testing.
- **Electron navigation:** exact-origin comparison, HTTP/HTTPS-only external links,
  rejection of local files/custom protocols/URL credentials, redirect checks,
  same-window popup routing, and contained OS-handler failures. The navigation
  module is included in the desktop package file list.
- **Release versions:** README now matches `0.37.0-beta.1`. Native marketing
  versions use `0.37.0`; the full beta version stays in package/runtime metadata.
  Native checkers and Mac packaging agree on this mapping; build number 43 is
  retained. The iPhone project's existing numeric version is unchanged.
- **Release workflow ordering:** the signing condition no longer uses an invalid
  job-level secrets context. Signing produces a final artifact before release
  creation; publishing selects that artifact explicitly. Configured signing
  failure blocks the draft rather than falling back to unsigned bytes. Releases
  are prepared as drafts for owner review. The Windows smoke path no longer uses
  `$using:version` outside a remote script; the Mac ZIP uses ZIP extraction.

## Evidence

Before fixes, the existing 541 application tests passed, but the newly added
host-only and modern-cookie regressions failed. The release documentation check
also failed, and `actionlint` rejected the signing job's secrets expression.

After fixes:

- `npm run verify`: passed, including 547 application tests, 9 packaging/version/
  workflow checks, 5 desktop-navigation checks, native source-contract checks,
  TypeScript checks, acceptance typechecks and the production web build.
- Cookie tests include Chromium's independently published known-answer vector,
  modern and legacy synthetic stores, a real uncheckpointed synthetic SQLite WAL,
  a simulated WAL-copy failure, cleanup after read failure, and private file modes.
- `actionlint .github/workflows/release.yml`: passed, including ShellCheck.
- `git diff --check`: passed.
- Fresh native Mac Debug build with Xcode beta and `CODE_SIGNING_ALLOWED=NO`:
  passed. Derived data: `/tmp/openbot-bugfix-build.bmRVZR`. No global Xcode selection
  was changed. This was a compile check, not a signed installer or UI pilot.

## Limits and remaining work

No real cookies, Keychain passwords, provider credentials or accounts were read.
Real-account import still needs an owner-approved compatibility check. This bridge
does not transfer local storage, passkeys or partitioned-cookie bindings and does
not guarantee that a provider accepts a transferred session.

No release job was dispatched. Signing/notarization and clean-machine installation
still require end-to-end evidence with the owner's release credentials. The
separate `desktop.yml` installer workflow remains outside this fix: its dependency
installation, embedded-runtime staging and artifact paths need reconciliation
before it can be treated as working distribution. No iPhone build/UI test was run.
The web build still warns about the existing main chunk exceeding 500 kB.

## Format references checked

- [Chromium macOS key derivation](https://raw.githubusercontent.com/chromium/chromium/main/components/os_crypt/async/browser/keychain_key_provider.mm).
- [Chromium cookie schema and domain digest](https://chromium.googlesource.com/chromium/src/+/main/net/extras/sqlite/sqlite_persistent_cookie_store.cc).
- [Electron navigation and external-link guidance](https://www.electronjs.org/docs/latest/tutorial/security).
- [Apple bundle version format](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring).
- [GitHub Actions secrets and conditional steps](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
