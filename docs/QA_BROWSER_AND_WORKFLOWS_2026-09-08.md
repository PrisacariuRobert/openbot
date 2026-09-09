# Workflow reliability checks — 8 September 2026

This is evidence for specific repaired workflows, not a competitor-parity or release certification.

## Failures reproduced in the owner's app

- A Google Calendar Create button was presented as `addCreatearrow_drop_down`. The host could pause the action, but its review schema did not support browser clicks, leaving only Decline/Stop.
- An approved email action had a completed host receipt, but the model then exhausted the shared job allowance before publishing a final answer. The failure and the completed action were not independently visible in the conversation. A later answer overstated sent-mail evidence as recipient delivery.
- The Calendar API path was unavailable, while Pixel's permitted browser route was still usable. The prompt did not clearly direct the model to continue through that route.
- Opening a second live viewer could wait forever on an idle page. Watching and taking control also needed clearer separation, and page titles could remain stuck on Loading after navigation.
- Rendered workflow testing additionally exposed ordinary browser approvals automatically opening the private sign-in panel. A browser action and an authentication handoff are different operations.

## Implemented changes

### Browser work and review

Browser click/type proposals now carry a bounded, host-observed review of the website, readable control label and visible form values. Approval is bound to this target and the teammate's capability/session fingerprint. The executor re-reads the target immediately before execution; changed form values or revoked access prevent the action. Private or incomplete field reviews remain blocked. Each new action requires its own acknowledgment.

Icon ligature text is removed from control labels. A public `requiresSignIn` hint identifies genuine sign-in handoffs without serializing the stored action or credentials. Generic browser actions no longer open a broken authentication panel.

Old proposals without a saved target review are **not** silently upgraded or approved. The app explains that they must be declined and proposed again. The owner's existing pending Calendar action was preserved; this work did not approve it or create an event.

### Completion and limits

The host saves completed-action acknowledgments directly in the conversation, independently of a model's next response. The receipt and acknowledgment are committed atomically. A storage failure cannot permit another external attempt. Failed root tasks receive an idempotent, visible host event with their actual stop reason; budget shutdown no longer overwrites that reason with “Stopped by the user.” Historical runs are not backfilled or rewritten.

New-message budget checks occur before consuming uploads, appending history or dispatching any selected teammate. A blocked team request is not partially dispatched. The client retains the draft and links to the affected teammate's budget setting. OpenBot's configured allowance is explicitly distinguished from provider limits; no provider/model or owner budget is silently changed. Saving a deterministic routine does not require model tokens.

Sending acknowledgment now says the email service accepted the message, not that the recipient received or read it.

### Existing website sessions

Every runtime prompt receives current browser-route guidance. It should try an already-permitted private browser when an API connector is unavailable, verify the displayed account and request manual sign-in only if actually necessary. Explicit service denials still block browser fallback. Google products may share a session within the same private profile, but an account index or a login in another teammate's profile is not proof of the intended identity.

For combined email/calendar tasks, the prompt tracks both outcomes, requires evidence for each and forbids resending a completed email merely to finish an outstanding calendar step. This is a routing and honesty improvement; model compliance still needs live-pilot evidence.

### More useful file work

`table_reconcile` compares two supplied CSV sources deterministically before the model explains the result. It preserves exact keys, compares decimal strings without floating-point rounding, flags missing/mismatched/duplicate/empty keys, records source hashes and row references, and applies bounded explicit filters. Ambiguous currency or numeric data does not become a guessed match. Original inputs are read-only.

Two runtime fixtures exercise actual HTTP uploads, workspace staging, reconciliation, summary tools, XLSX export and artifact download. Both produce an editable four-sheet workbook (original expenses, original receipts, totals, exceptions) plus JSON evidence. Independent ZIP/XML inspection checks numeric cells, leading-zero IDs, inert formula-looking text, row counts and currency-separated totals. Hash checks confirm uploaded and staged originals were unchanged.

## Verification

| Check | Evidence |
| --- | --- |
| `npm run verify` | 589 application tests, 9 packaging tests, 5 desktop tests; release/source checks, application and acceptance TypeScript, production build passed. Existing large-bundle warning remains. |
| `src/server/browser-workflow.test.ts` | Real private Chrome and host routes: Create → fill title/time → review → Save → read back; one write. Changed post-review title prevents Save and requires a fresh review. Deterministic CLI, synthetic calendar only. |
| `npm run test:browser-workflow-ui` | Shipped application at 1280px and 390px: actual approval buttons, exact fields, per-action acknowledgment reset, no spurious sign-in pane, visible completion and weekly stop, preserved rejected draft, correct budget setting, no page errors. |
| `src/server/reconciliation-workflow.test.ts` | Two changed receipt/source sets; upload-to-download path; original and staged file hashes unchanged; editable workbook inspected independently. |
| `src/server/approved-actions.test.ts` | One completed-action event, one failure event, no duplicate dispatch and atomic rollback if message persistence fails. |
| Live-view regressions | Ten focused source/hub tests plus TypeScript passed after the final metadata fix: late-viewer replay, lifecycle/race guards, no browser launch by watching, revoked/stopped frames cleared, title/URL refresh without restarting CDP. |
| `npm run test:live-computer-ui` | Actual React stream/takeover components: two viewers share an idle source, all controls require explicit arming, private input clears, stopped frames disappear; desktop and 390px passed. |
| `npm run test:customer-workflow-ui` | Existing combined calendar → threaded reply workflow rechecked through the app: separately reviewed actions, one synthetic write each, desktop/390px, no horizontal overflow or page errors. No real email or Calendar mutation. |

UI screenshots are generated in `/tmp/openbot-browser-workflow-qa` and `/tmp/openbot-live-computer-qa`, not committed as private account captures. The focused host tests do not use a live model or owner accounts.

## Earlier app observation

The running local service was reloaded only while no tasks were running or queued. Saved data, permissions, chosen models and the pending owner approval were preserved. Through OpenBot's actual Agent Computer controls, Calendar opened in Pixel's existing private browser without another login. The live screen showed Google Calendar. Watching was returned to unarmed mode. This verifies session reuse and the viewer, **not** that the intended dinner exists or was created.

No new real email was sent, no Calendar event was created, and no private credentials were requested. A supervised real-account combined task still needs a fresh exact review, destination read-back, no-duplicate checks and model-usage measurement. A browser click receipt proves that control executed; it does not by itself prove a calendar event, message or other business outcome was saved.

## Follow-up: real Calendar save and independent read-back

Later on 8 September, the owner asked to finish the missing Calendar step. The obsolete incomplete Create approval was declined through the app. A fresh task used Pixel's existing Google browser session and the owner's selected `opencode-go/glm-5.3-flash` model, without changing any provider, access or budget setting.

- The task checked the requested day before creation and reported no matching event.
- The new Save approval displayed the actual title, start/end date and time, empty guests, and other editor fields. The exact reviewed Save was approved once through OpenBot.
- The host recorded one completed Save. Pixel's next page read found exactly one matching event on the intended personal calendar.
- Pixel then hit the shared job cap before its final response. Its recorded usage was 114,488 input/output/reasoning tokens across three provider attempts; cached-input reporting was separate and was not added to this cap. The limit was **not** raised or bypassed. The cap/stop and completed-action messages remained visible in the conversation.
- Independently of Pixel's text, the saved event was reopened through OpenBot's Agent Computer. Google Calendar visibly showed the requested dinner, Wednesday 9 September, 9–10 PM, on the owner's personal calendar. The earlier day view showed GMT+02. There were no guests, no additional email and no repeated Save. Take control was returned to off.

This proves this particular real-account Calendar save and saved-destination inspection. It does **not** prove a smooth autonomous completion: the model's final confirmation still failed at the job limit, and workflow context/token efficiency remains a gap. This was a Calendar-only recovery, not a fresh combined email-and-calendar pilot. No private screenshots, account addresses or event identifiers are committed here.

### Browser inspection correction from the pilot

The old page reader listed labels but omitted live input values when a field had an accessible name. It also cut off active editors behind a long background page. Snapshots now prioritize the active editor and controls, include live values and observed unique selectors, use associated labels, remove icon ligatures, and explicitly flag truncation. Password/token/verification fields remain redacted, including when nested in an ancestor label. A real private-Chrome fixture checks a long page, changed time values, selected calendar, empty guests, and hidden/private fields. These fixtures do not use the owner's accounts or a model.

Follow-up verification: `npm run verify` passed with 590 application tests, 9 packaging tests, 5 desktop tests, TypeScript/source/release checks and production build. After the final associated-label and nested-private-field hardening, the three focused browser snapshot/workflow tests and application TypeScript passed again. The existing large-bundle warning remains.

The local background service was restarted only after checking that no work was running or queued and no approvals remained. It returned online, retained the single completed Save receipt, and reopened Calendar through the app in the same signed-in browser profile. This refresh did not replay the failed task or repeat the external action.
