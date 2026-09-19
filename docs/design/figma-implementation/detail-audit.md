# Spacing, conversation actions and motion

Follow-up to the Memory & skills and archived-chat screenshots.

- Conversation row actions now have an explicit More button, accessible by pointer, keyboard and touch. Controls retain pointer/focus visibility through activation. The main conversation target remains unobscured until actions are opened. Protected studio-wide chat no longer offers a pin that its backend rejects.
- Pin, archive and restore now check HTTP responses, prevent overlapping saves for the same thread, update from the returned server record, and display failures. Failed archive does not navigate away. Existing two-step reversible archive remains.
- Archived conversations use compact aligned rows with readable truncated titles and a consistent restore action. Seven archived rooms are exercised in the fixture.
- Applied shared spacing between notices, owner selectors, headings, segmented controls, forms and section actions across the workspace. Notices no longer collide with the following heading or stop at an arbitrary narrow width.
- Added short, subtle page/document entrances and press feedback; removed exaggerated action-button overshoot. No interaction waits for an animation. Reduced-motion disables the new movement. Existing interruptible swipe springs remain.

The acceptance harness now exercises mouse pin, reload persistence, keyboard unpin, archive/restore through the real host, and a deliberately rejected save. It also checks compact archived rows, internal content clipping at desktop and 320px, and the normal/reduced-motion CSS modes. Existing draft, file, memory and route checks remain.

Validation: `npm run verify` passed all 857 application tests, 13 packaging tests, 5 desktop tests, build and both TypeScript checks. The final unsigned packaged Electron harness passed all 14 desktop/390px/320px pages, internal clipping checks, normal/reduced motion assertions, real-host conversation actions, persistence and the existing draft/document/memory/import checks. Ten longer settings pages were also captured at their lower sections and visually reviewed. Updated evidence: `actual/archived-chats.png`, `actual/workspace-teach.png`, `settings-details.png`, and `workspace-contact-sheet.png`. Raw logs are `detail-verify.log` and `detail-packaged.log` under the ignored logs directory.

No live account action or model dispatch was performed. Phone coverage is Chromium emulation, not a physical-device claim. Nothing was merged or released.
