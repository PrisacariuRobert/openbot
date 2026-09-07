# Studio, rebuilt from the entry point

Status: **the only web application interface** in the 0.37.0 development checkout. Native apps still require their own build/install and visual checks; this is not a public-release claim.

Open `/` on the running host. `/studio.html` is a compatible alias for the same entry. Older `?panel=` links open the corresponding feature inside Studio, without loading another shell. [Migration evidence](QA_UI_UNIFICATION.md).

## What starts from zero

`studio.html` → `src/studio/main.tsx` → `Studio.tsx` and `studio.css`.

The retired `App.tsx`, `styles.css` and `studio-design.css` are removed. Functional feature panels were separated into `CapabilityPanels.tsx`, hosted inside Studio's accessible drawer and styled with its semantic palette. Setup is loaded on demand. The frontend reuses host APIs, shared data types, date arithmetic and vector service logos; changing the interface does not migrate private data.

The visual system uses white, near-black, neutral gray, system fonts, quiet separators and restrained rounded controls. Color belongs only to the characters, including grayscale service logos in the chrome. Characters are recolorable SVGs with name-dependent blink/float timings, hover response and reduced-motion support—not flattened images.

The latest polish adds saved light/dark/system appearance, keyboard-operable top-layer menus and six distinct editable character shapes. Native Mac/iPhone source now shares a Canvas character renderer, adaptive conversation colors, searchable message previews and full supported approval review. It remains native SwiftUI, not an embedded copy of this page. See the [design contract](DESIGN_LANGUAGE.md) and [current verification record](QA_APP_POLISH.md); compilation does not update previously installed apps.

The teammate list is the primary navigation, with real last-message previews and a compact composer. Activity, Schedule, Library and settings sit inside a secondary Workspace menu, not four competing primary destinations. An optional desktop pane keeps a teammate's computer snapshot, work and routines beside the chat; phones use a focused detail sheet.

The secondary views are organized around everyday intent:

- **Chats:** pick up an existing conversation or create a new teammate. The app opens directly into conversation, not a promotional team dashboard.
- **Activity:** see current work, results and decisions. Pending approvals, uncertain external actions and unresolved routine alerts must not disappear behind a clean empty state.
- **Schedule:** select a date in a real month grid and inspect upcoming work. Dots currently represent each routine's *next* run, not every future recurrence. Time zone is shown explicitly.
- **Library:** searchable apps and included skills; status, capabilities, granted teammates and source instructions stay inspectable.
- **Conversations:** readable Markdown, real messages and attachment links, selected-team messaging and live progress. Private consultation runs are not presented as a second public answer.

## Real connections and deliberate boundaries

The preview reads `/api/state`, `/api/connectors`, `/api/extensions`, and listens to the existing event stream with a polling fallback. Sending uses the existing `/api/messages` contract and backend authorization. A selected teammate needs an explicit provider/model assignment; this is not a new provider-access certification. Routine starters only draft text. Failed sends retain the draft and its error. Draft text is now server-backed and per conversation: serialized saves, stale-response protection, observed cross-device conflict choices and safe clearing after send preserve newer typing. The server remains last-write-wins; this is not atomic collaborative text editing.

Pending approvals are visible in conversation, including decisions needed by consultants. Supported full-action previews can be approved or declined there; unsupported or incompletely inspectable actions retain the full-review route. Account identity is shown when required, credential-like content is masked and any masking disables compact approval. A decision being recorded is not reported as an external action succeeding. Active work has a Stop control using the existing cancellation contract. Closing a context pane does not stop work.

Selected draft files now have explicit server-backed bindings separate from text. Refreshing or visiting setup preserves them, and successfully sending removes the bindings atomically. The composer accepts up to six files, including attachment-only messages. Unselected orphan uploads are not silently recovered into drafts; removal of a selection does not delete the original upload. Failed binding/removal stays visible and blocks sending until resolved. Incoming uploads and delayed send responses cannot move files or navigation into a different conversation.

### A team that belongs to the user

Production databases no longer seed Nova, Pixel and Scout. An empty studio has a focused first-teammate invitation; existing databases retain their bots and history. Creation uses the actual `/api/bots` endpoint, with name, job, instructions, animated shape/color previews and explicit provider/model selection. Connection setup opens separately, and Refresh connections preserves the draft.

Creating a teammate starts no model job and inserts no fabricated greeting. Existing Google grants are not inherited. Browser/private-computer access starts off in this new form; the user's existing studio-wide Mac access policy still applies. Connecting Google later retains the current complete app's account-connection behavior; this change does not redesign that consent flow. Advanced permissions remain in the complete app.

Tests and safe recipe demonstrations opt into a separate seeded fixture roster. This must not become a production default again.

The following now open inside the shared Studio drawer:

- Provider/account sign-in, advanced permissions and usage.
- Connector setup, skill assignment/editing and teaching.
- Full routine creation/editing and trigger configuration. The new routine starter opens a conversation draft; it does not silently create a schedule.
- Approval types without a complete compact preview, resolving uncertain receipts, and restarting work.
- Phone pairing and away access.

Sidebar search matches visible conversation titles and their latest public message; the full archive search remains at `?panel=search`. Recent work reflects the host's bounded recent-run response, not an all-time archive. Attachments have contained previews and downloads. Delivery receipts distinguish host checks from teammate reports. Full computer controls are available inside Studio. Browser voice and reaction editing remain polish gaps; do not claim complete cross-platform feature parity.

No owner data, providers, routines or permissions are changed merely by viewing the preview. No sample results are inserted into the user's studio. The screenshots use a disposable fixture host.

## Verification

The [conversation-workflow QA record](QA_CONVERSATION_WORKFLOW.md) separates actual browser/API evidence from native and live-model work still outstanding.

Run:

```sh
npm run verify
npm run test:new-studio
npm run test:first-teammate
npm run test:run-controls
npm run test:draft-attachments
npm run test:studio-design
```

The new browser check uses disposable local data and headless Chrome, with synthetic work/routine/status fixtures and intercepted sends. It covers 1440px desktop, 390px phone and 320px narrow phone:

- Independent stylesheet and absence of legacy UI components.
- No horizontal overflow in pages, chat or detail sheets.
- Pixel checks: color only inside the characters.
- All five destinations; real Markdown rendering and included skill instructions.
- App search, empty results and connection status visible on phones.
- Month navigation, date selection and next-run agenda.
- Modal focus containment, Escape and focus restoration.
- Visible pending approval, uncertain action and missed-routine states.
- Explicit selected-provider gate, correct message routing, failed-send draft retention.
- Server-backed draft restoration across navigation/reload, selected-file persistence and actual fixture-file upload/attached-message submission.
- Contextual computer status, work and routine navigation.
- Animated vectors and reduced motion.

Screenshots are written to `/tmp/openbot-new-studio-qa`; these are test data, not evidence of live mail access, successful model work, native visual parity or away-access deployment. The browser suite makes no model calls.

## Remaining validation

Review this direction on real Mac and phone displays. Keep the SwiftUI clients native. Test larger text, VoiceOver, keyboard/viewport changes, supervised signed-in account flows, voice handling and cross-device drafts. The old web entry is no longer retained: fixes belong in Studio, not a second theme.

This preview does not claim that those migration or public-release gates are complete.

## Product direction

See [the independent product-loop audit](CONVERSATION_PRODUCT_AUDIT.md). The benchmark is a durable teammate completing useful work, not a connector count. Keep OpenBot's provider choice, owner-controlled storage, permission boundaries and inspectable results. Prove attached-document work, source-backed daily assistance, single-owner team consultation and scheduled delivery before claiming competitor parity.
