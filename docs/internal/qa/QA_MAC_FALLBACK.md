# Mac application fallback — 0.35 development follow-up

Date: 5 September 2026. Functionality work; no visual redesign or parity claim.

## Delivered behavior

Morning Brief, Meeting Prep and Inbox Follow-ups can use the built-in Mail/Calendar applications on the runner's Mac when a cloud source is absent or fails. Working online connectors are preferred. A fixed read-only JavaScript-for-Automation bridge uses Apple's installed app dictionaries; no arbitrary script supplied by a model is executed. User content is passed as JSON arguments, not code. Reads have time, output and per-source bounds.

Studio-wide Mac access and macOS Automation consent are required. A connected-account per-teammate denial is not bypassed. Access is checked again before fallback starts, after collection and before saving. Non-Mac runners do not advertise this capability. The bridge does not activate windows, type, send, create or delete messages/events, mark messages read, or use hidden database/password access. Generic app controls remain separately approval-gated.

Reports use `apple-mail` / `apple-calendar` provenance, never invented Gmail/Calendar web links. Calendar fallback always reports partial coverage: at most 20 calendars and 20 returned events; recurring occurrences and globally earliest-event coverage are not guaranteed by the scripting bridge. Mail inspects at most 100 inbox headers and reads at most eight matching messages. Local synchronization, attachments and sent-thread history are not verified. Apple Mail sources therefore cannot produce automatically recipient-bound reply drafts through this path. The report explains these limits instead of presenting a complete inbox or guaranteed next meeting.

Web/Mac/iPhone work starters accept enabled local sources without pretending Google is connected. Calendar is essential for Meeting Prep; Drive and related mail are optional context with visible gaps. An auto-picked starter selects an eligible teammate before spending model tokens. An explicitly selected teammate is not silently replaced. Missing essential access stops before creating a model run.

## Evidence

- Full regression: `npm run verify` passes **197 tests**, TypeScript, release/native source checks and the production build. **16 macOS XCTest tests** pass; native Mac Release and iOS Simulator builds also pass.

- Twelve dedicated tests pass: source provenance, connector preference/failure, permission denial/revocation, no-Google reports, unavailable hosts/apps, missing Drive, unsafe reply rejection, bounded script behavior and argument/output validation.
- Both fixed scripts compile using Apple's actual automation compiler, without executing app reads.
- Actual installed OpenCode against a scripted local model endpoint completes a disconnected-Google morning workflow through the injected Mac reader and saves an Apple-labelled report. Only the two report tools are exposed. This proves integration, not live Mail/Calendar access or model quality.
- Native XCTest covers fallback decoding and distinguishes an attempted local read from a connected account. Mac/iPhone source selection uses the same model.
- The packaged app passes isolated startup/health/UI/shutdown checks. The updated source runner was restarted only after confirming zero active/queued/waiting jobs, preserving the existing data home and network configuration. `/Users/robert/Applications/OpenBot Preview.app` was rebuilt and strict-signature verified; the original installed app was not replaced. No GitHub push or merge occurred.

## Not verified

The Mac was locked during the live Calendar availability check. No attempt was made to bypass that lock, approve OS consent, or read personal Mail/Calendar data. The real app read and first-consent user experience still require an unlocked Mac and the owner's macOS permission. No Outlook, third-party mail app, EventKit recurrence expansion, unattended consent, physical iPhone, cloud relay to a sleeping Mac, or new competitor benchmark is claimed.

This is a practical fallback, not universal desktop autonomy. Apple's [Calendar scripting documentation](https://developer.apple.com/library/archive/documentation/AppleApplications/Conceptual/CalendarScriptingGuide/) documents the app scripting interface; OS permission remains an independent requirement.
