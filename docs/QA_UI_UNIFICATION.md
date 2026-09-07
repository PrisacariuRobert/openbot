# One Studio — 2026-09-06

Scope: development checkout 0.37.0, web application. This does not install a native app, certify public release readiness or prove live-account workflows.

## What changed

- Both `/` and `/studio.html` boot `src/studio/main.tsx`. No old shell is shipped as a fallback.
- Retired `src/App.tsx`, `src/styles.css`, `src/studio-design.css` and the old approval component were removed. Reusable providers, permissions, connectors, automation, computer, files, project, skill and phone controls open inside Studio's shared drawer.
- Setup is lazy-loaded. Light/dark tokens, contained service icons, a shared animated character picker and responsive forms replace the retired stylesheet stack.
- Private sign-in uses actual application typography and spacing, including in test captures. Keyboard controls are disclosed on demand; the owner still explicitly confirms sign-in. No input goes into chat.
- Result receipts and attachment previews retain host-versus-teammate verification, partial-preview notices and original downloads.
- Owner-key login and connection recovery use StudioAccess. Cache activation deletes only older OpenBot caches, retaining push delivery and unrelated caches.
- No existing bots, conversations, attachments, providers, permissions or routines were deleted. Before removal, a recoverable local copy of the retired shell/style files was saved at `/tmp/openbot-retired-ui-Ilkxkd` (temporary, not a distributed artifact).

## Checks

Final local result: **438 application tests, 5 packaging tests, 62 unified-interface checks, 30 full-app approval checks and 10 focused task-control checks passed.** First-teammate and full conversation browser suites passed at 1440/390/320px. Release/native source checks, both TypeScript checks and the production build passed. Test fixtures were cleaned up; the owner's live host remained at 3 teammates, 4 conversations and no active/pending work.

- `npm run verify`: release and native source contracts, packaging tests, application tests, application/acceptance typechecks and production build.
- `npm run test:unified-studio`: a disposable real host; 15 routes × 2 viewports (1440/390) × 2 themes; no old shell nodes, horizontal overflow or browser exceptions. Settings do not start work or change permissions. Additional checks cover preserved drafts across in-app setup navigation and the replacement owner login.
- `npm run test:app-approvals`: 30 complete-app approval checks across `/`, `/studio.html` and Activity. Complete action, duplicate prevention, unsupported/masked/incomplete denial, stale bindings, conflict and uncertain-response recovery. Only intercepted fixture decisions.
- `npm run test:run-controls`: 10 focused browser contracts, including private sign-in input, explicit continuation and re-confirmation after interaction. Fixture styling now imports the production palette; debug controls are excluded from its sign-in capture.
- `src/studio/service-worker-migration.test.ts`: retired OpenBot shell caches removed; unrelated caches and push handlers retained.
- First-teammate and conversation browser suites remain the checks for creation, drafts/files, provider choice, send failures and responsive navigation.

Screenshots: `/tmp/openbot-unified-studio-qa` and `/tmp/openbot-sign-in-ui.png`. Invented local data, not evidence of a Google/Slack sign-in. During visual inspection, oversized connector SVGs, dark provider contrast, native fieldset borders and the old appearance picker were found and corrected.

## Limits

No live-model or external-account actions were performed. Native Mac/iPhone installation, VoiceOver/device testing and browser voice/reaction editing are separate work. The build still reports a large-main-chunk advisory; settings were split from the initial conversation bundle. No repository merge or publication was performed.
