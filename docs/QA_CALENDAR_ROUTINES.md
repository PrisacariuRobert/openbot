# Calendar routines: first competitive-plan delivery

Verified 5 September 2026 in the 0.35.0 development checkout. This closes the calendar-time scheduling slice of [delivery A](COMPETITIVE_EXECUTION_PLAN.md), not the whole competitive plan or the seven-day unattended-operation gate.

## Available now

- Daily and selected-weekday schedules with a named time zone and a 24-hour clock time; one-time schedules; existing elapsed intervals remain supported.
- Web and native Mac editors, plus a native iPhone Automations screen, use a shared host preview of the next three occurrences. One-time previews contain one occurrence. Editing an unchanged enabled routine previews its persisted pending occurrence, including catch-up.
- Simple natural requests such as “Every weekday at 8 AM Europe/Brussels, prepare my brief” create a routine without a model call. Web/native chat can supply the device's named zone; explicit wording wins. Ambiguous dates, additional conditions, drafts and questions remain in the normal tool flow instead of being silently simplified.
- OpenCode and Claude tool bridges accept the same schedule contract. The tool response returns the saved label and next-run time. This pass tests schema exposure and host behavior, not fresh live-model reasoning through both paid accounts.
- The saved time zone does not change when a device travels. A repeated local clock time runs at its first occurrence; a missing time runs at the first valid time that day. An entirely skipped civil date is skipped.
- After downtime, one preserved occurrence is queued; the next calendar occurrence is computed after the current time. There is no flood of all missed days. A late-run notice says **queued**, not completed.
- Scheduled event receipt, job, links, notification/attention writes and advancement commit in one SQLite transaction. The saved occurrence is rechecked under the write lock. A failed dispatch rolls back; another host holding a stale occurrence cannot dispatch it again.
- A one-time routine disables after dispatch, not after claiming the work succeeded. Its result and any failure remain in normal run history. Re-enabling a past one-time date is rejected.
- The additive nullable `schedule_json` migration preserves legacy intervals and exact pending dates. Unrelated edits and repeated enable requests do not reset the clock. Older clients omitting the new field do not erase a saved calendar schedule.

The date calculation uses pinned `@js-temporal/polyfill` 0.5.1 and the runtime's time-zone data; see its [implementation](https://github.com/js-temporal/temporal-polyfill) and [Temporal time-zone behavior](https://tc39.es/proposal-temporal/docs/zoneddatetime.html). New library licenses remain in packaged node_modules. The web editor is lazy-loaded so its date library does not inflate the initial conversation bundle.

## Evidence

| Check | Result and boundary |
|---|---|
| Full `npm run verify` | 284 automated tests pass; release/native source contracts, application/acceptance TypeScript and production build pass |
| Calendar unit tests | Weekends; Brussels spring/fall; New York repeated time; Lord Howe half-hour transition; Kathmandu fractional offset; Apia skipped civil date; invalid zones/times/days and one-time expiry |
| Persistence tests | Old schema reopened after dropping the new column in disposable data; exact pending date retained; failures injected after receipt, job and linked writes all roll back and survive reopen; two database connections reject a stale competing claim |
| Downtime test | Seven **virtual** days, not seven elapsed days: one catch-up job, one late notice and return to calendar time |
| Production API/browser | Natural setup, preview/save agreement, invalid-zone and past-date rejection, server restart, real desktop/390px form submission and no horizontal overflow; zero model runs and no real connector calls |
| Mac Xcode build/tests | 19 passed, zero skipped, zero failures |
| iPhone simulator Xcode build/tests | 12 passed, one skipped, zero failures on iPhone 17 Pro / iOS 27 simulator; not physical-device or cellular proof |
| Packaged Mac cold start | Bundled runtime starts with a system-only PATH and disposable data; health, production web UI, extensions and shutdown with an open event stream pass |
| Local preview | Updated installed OpenBot Preview and restarted the existing runner only after confirming zero active/pending jobs; health online and the production preview endpoint returns Monday–Wednesday at 08:00 Brussels; existing routine count remains one |

Browser screenshots were inspected at `/tmp/openbot-calendar-desktop.png` and `/tmp/openbot-calendar-mobile.png`. Inspection exposed clipped preset labels and unstyled clock fields; both were fixed and the browser check rerun. Native views compile and share the server contract; this is not a claim of exhaustive native accessibility/interaction testing.

The first browser test failed because its locator expected “New automation” rather than the actual “Add an automation” button. That failed attempt is not counted as successful UI proof.

Before replacing the local preview, its previous bundle and a consistent SQLite backup were retained in `/Users/robert/Applications/OpenBot-calendar-backup-b8ZAPb/`. No real routines, provider assignments or external messages were created by the acceptance checks. No GitHub push, merge or public release was performed. The preview remains ad-hoc signed, not notarized.

## Reproduce

```sh
npm run verify
npm run test:calendar-routines
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild test -project macos/OpenBotDesktop.xcodeproj -scheme OpenBotDesktop -destination 'platform=macOS,arch=arm64' -derivedDataPath /tmp/OpenBotScheduleMac CODE_SIGNING_ALLOWED=NO -quiet
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild test -project ios/OpenBotMobile.xcodeproj -scheme OpenBotMobile -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath /tmp/OpenBotScheduleIOS CODE_SIGNING_ALLOWED=NO -quiet
```

The API/browser script creates and removes only its own temporary studio. It starts no model runs and does not access the owner's connected accounts. Use an available simulator/device name on the testing machine.

## Still open

Seven-day real-time soak, broader permission/provider-failure recovery evaluation, full authenticated native interaction QA, and the broader cross-source daily brief are not complete. The host still must be awake. A pending approval can delay execution after scheduling; dispatch is not a guarantee of completion. No hosted relay, real-cellular check or competitor head-to-head was added here.
