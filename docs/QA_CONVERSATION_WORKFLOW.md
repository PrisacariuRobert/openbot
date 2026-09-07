# Conversation workflow verification

6 September 2026 · working-tree development preview · OpenBot 0.37.0.

The product target is a persistent teammate completing work in one understandable conversation, not a collection of disconnected tools. See [the independent assessment](CONVERSATION_PRODUCT_AUDIT.md) and [preview scope](STUDIO_REBUILD.md).

## Changes verified

- Conversation-first desktop and phone navigation, actual public-message previews, a quieter composer, original animated/recolorable vector characters, and an optional teammate context pane.
- A fresh studio creates no preset teammates. Actual profile creation requires an explicit provider/model and does not start a model job or fabricate a greeting.
- Per-conversation text drafts survive navigation and refresh. Delayed saves and send responses preserve newer typing and navigation; observed conflicting remote drafts need an explicit choice. Input waits for initial restoration rather than racing a saved draft.
- Selected files persist separately from draft text. The real upload/selection API enforces six files, isolates conversations, preserves originals on deselection, and excludes files already sent. Failed binding or removal remains visible. Attachment-only messages are supported.
- Pending decisions and active-task stopping are accessible in conversation. Compact approval requires the complete supported action preview; unsupported, masked or ambiguous actions require full review. A recorded decision is not described as a completed external action.
- Computer status is read-only. Switching teammates cannot display the previous teammate's screenshot under the new identity. Work and routines are scoped to the selected teammate.

## Automated evidence

| Check | Result and boundary |
| --- | --- |
| `npm run verify` | 357 tests passed; release/source-contract checks, TypeScript, acceptance-script type check and production build passed. Native source checks are not Xcode compilation or device testing. |
| `npm run test:new-studio` | Desktop 1440px, phone 390px and narrow phone 320px; navigation, no horizontal overflow, neutral chrome, animated characters/reduced motion, modal keyboard behavior, actual file upload, draft/file restoration, failed sends and delayed-send navigation. Message submissions are intercepted to avoid model jobs. |
| `npm run test:first-teammate` | Real profile creation against disposable local data, explicit provider choice, customization and persisted access boundaries at all three widths. Provider discovery is fixture data, not proof a live account works. |
| `npm run test:run-controls` | Eight rendered-browser contracts: full review, duplicate-click protection, unsupported/stale previews, conflict and uncertain-response handling, and cancellation. Decision requests are intercepted. |
| `npm run test:draft-attachments` | Actual disposable host API: metadata restoration, idempotent binding/removal, per-thread isolation, six-file limit, sent-file exclusion, original-file and text-draft preservation. |
| Approval-preview host test | Actual authenticated route wiring, no-cache response, ID binding, unsupported secret-bearing action projection, missing-ID handling and unauthenticated proxy rejection; no execution or model usage. Included in the 357 tests. |

Browser QA exposed and fixed a native `fetch` receiver error that unit fixtures had missed, a draft-restoration/input race, and insufficient contrast on outgoing attachment cards. Regression checks cover those cases. Desktop, mobile and context-pane screenshots were visually inspected, not merely generated.

All new acceptance runs use disposable data. No owner messages, real email sends, account grants or model calls were needed. The older `test:studio-design` suite is separate; its previous mascot-mask failure is not claimed resolved by these checks.

## Still not proved

This is an opt-in `/studio.html` preview, not replacement of the native Mac/iPhone clients or complete migration of every older workflow. Live account/provider task quality, hosted always-on execution, deployed relay and real cellular continuity, signed distribution, and repeated whole-task benchmarks remain separate gates. Text drafts use a last-write-wins server with observed-conflict handling, not atomic collaborative editing. Reply targets, voice, full computer takeover and some setup/recovery flows still use or need migration from the complete app.

Do not market these automated checks as competitor parity, live workflow success or public-release certification.
