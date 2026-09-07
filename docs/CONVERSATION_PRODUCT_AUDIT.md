# OpenBot: correct the product loop, not the feature count

Independent audit, 6 September 2026, with implementation follow-through updated during the same redesign. Scope: source inspection, the user's four interface references, current official documentation, and selected first-hand reports. This is not a hands-on competitor benchmark or a release certification. Original observations below are explicitly historical; current integration is described separately. Line numbers describe the initial inspection and may move.

## Verdict

The concern is justified: OpenBot drifted toward a control centre for agent infrastructure. The desired experience is a personal roster of useful, persistent teammates. The backend investment is largely useful; exposing its modules as equally important destinations is the mismatch. More connector cards, scheduling options or mascot decoration will not solve that mismatch.

The Studio preview now moves back toward that model: conversation is the main workspace, text and attachment drafts are integrated, supported decisions can be reviewed in chat, and the optional context pane reads real teammate computer/work/routine state. The final combined browser/API suite and 357-test verification pass are green; [the QA record](QA_CONVERSATION_WORKFLOW.md) states precisely what they cover. That is meaningful progress, not evidence that the entire product or native clients have reached parity.

Use one ordinary loop:

**Choose a teammate → ask for an outcome → let it work → review the result or decision → continue the same conversation.**

Computer, files, routines, permissions and consultations belong to that conversation's context. Keep a global activity/schedule view available for cross-team oversight, but not as compulsory navigation for everyday work. A quiet interface must not hide an unresolved approval or a failed task.

## What the references actually establish

- The supplied desktop/phone composite shows a chat list, selected teammate conversation, attachments, and an optional computer/routines pane. The phone roster is not a dashboard of technical modules. It is a supplied promotional composition, not proof those displayed tasks succeeded.
- The supplied dark screenshot shows substantive delegation alongside collapsed groups of bot messages. It supports a compact collaboration presentation; it does not prove reliable coordination or low usage.
- App-store screenshots establish the visual presentation supplied by the user. Their developer names, availability and version labels are not independently validated here.
- Official documentation describes durable roles, natural messaging, inline tool activity/results/approvals, asynchronous handoffs, and making a successful task reusable. Crucially, the documented computer is **shared per account**, with separate bot screens—not a completely isolated cloud machine per teammate. Local command approval is a separate policy. [Work with Grok Bot](https://cursor.com/docs/grok-bot/work).
- Cloud execution surviving a closed laptop is part of the documented product promise. OpenBot on a sleeping local Mac cannot honestly claim that behavior without an awake separate host. [Grok Bot overview](https://cursor.com/docs/grok-bot).

The design lesson is not to copy shapes or spacing. It is to make the teammate the stable object and completed work the outcome.

## What users value, and what should not be copied

A recent first-hand user describes useful multi-inbox/calendar management and prioritization, but also rapidly exhausting usage. That supports testing everyday secretary work and making cost predictable; it does not establish typical cost or universal reliability. [User report: useful but expensive](https://www.reddit.com/r/cursor/comments/1w7j1ue/grok_bot_is_expensive/).

Another business user reports expired approvals, forgotten scheduled work, duplicate messages and destructive rewrites. This is anecdotal, not a measured failure rate. Keep durable approvals, inspectable receipts and scoped changes rather than relaxing controls merely to look effortless. [Business-workflow report](https://www.reddit.com/r/cursor/comments/1vxjipg/grok_bot_review/).

There is stronger corroboration for a specific scheduling failure mode: a Cursor staff reply distinguishes queued starts delayed 10–37 minutes from completed runs that posted no chat message. The product must communicate queued, running and delivered separately. Do not describe an old report as an ongoing universal bug. [Routine delay support thread](https://forum.cursor.com/t/grok-bot-routines-dont-auto-run-on-schedule/170358).

## Existing work to retain

| Foundation inspected | Product value | Boundary |
| --- | --- | --- |
| `database.ts` production seeding, `CreateTeammate.tsx` | Fresh accounts create their own first teammate; existing teams survive; provider/model selection is explicit. | Creating a profile is not proof its provider can complete work. |
| `opencode.ts:132` (`shouldPublishRunMessage`), `:260` (`resumeConsultation`) | Child runs stay private; the coordinator resumes after child completion and owns the public answer. | Need repeated model-backed quality checks; do not replace this with a fake “consulting” animation. |
| `index.ts:1365` approval decisions, `:1384` uncertain-action resolution | Durable, explicit decisions and recovery rather than pretending an uncertain write succeeded. | UI must show enough action detail before approval; arbitrary terminal programs are not a complete external-write sandbox. |
| `index.ts:997` attachments, `:1673` computer, `:1687` browser snapshot, takeover routes | Real existing building blocks for a chat-centric workspace. | A browser preview is not unrestricted control of every Mac application. |
| `index.ts:401`, `database.ts:1164` drafts; Studio draft hooks | Server-backed text drafts and attachment selections are now integrated into Studio conversations. | Text persistence remains last-write-wins across devices; native/live handoff needs proof. |

## Three priorities: original gaps and current progress

### 1. Finish the decision/result loop inside the conversation

**Original gap:** the `Studio.tsx` run drawer redirected pending approvals and task control to `/?panel=live`, breaking the conversation at the moment a user needed to trust it.

**Integrated now:** `RunControls` appears inline for pending approvals and active work, and inside the result drawer. It uses the actual approval/cancel endpoints, requires inspectable supported action details before approval, and handles stale or uncertain responses conservatively. Unsupported actions still open full review; that is an explicit safety boundary, not a completed migration of every action type.

**Verify:** pending decision survives refresh/restart; approve/deny reaches the right ID; double-click issues one request; a 409 refreshes state without inventing success; failed request remains actionable; consultant approvals remain visible without publishing consultant chatter; uncertain writes are not replayed automatically. Use a disposable action fixture before any real external-write test.

### 2. Restore ordinary messaging continuity, not just text submission

**Original gap:** `Studio.tsx` sent no attachment IDs and held one session-only text draft, despite existing backend draft and upload APIs.

**Integrated now:** `useConversationDraft` and `useConversationAttachments` are mounted in Studio; sending includes captured attachment IDs, retains failed sends, and clears only the captured text/files after success. Text drafts surface observed remote conflicts; attachment selections use the draft API. **Still open:** reply-to-result remains unset in the new send payload, atomic text-draft conflict control is not implemented, and actual native/phone handoff needs testing. Voice/mentions should follow complete ordinary messaging rather than more backend feature breadth.

**Verify:** two conversations retain separate drafts; refresh restores the correct draft; stale save responses cannot replace newer text; phone/desktop divergence is visible; successful send clears only the captured draft; failures retain text/files; attached IDs belong to the intended request; no real model is invoked by UI tests.

### 3. Make tools and computer contextual, with recoverable setup

**Original gap:** the selected teammate had no contextual computer/work pane, while secondary sheets repeatedly handed users to the old interface.

**Integrated now:** optional `ConversationContext` reads the selected teammate's actual computer endpoint and shows a snapshot, recent work and routines beside the conversation, with a focused small-screen presentation. It resets and checks bot identity when selection changes; viewing does not grant access or start work. **Still open:** direct takeover remains in the complete app; this is not a live video feed, integrated file browser or finished contextual connector-login/resume flow. Snapshot freshness, setup recovery and native navigation remain acceptance gates.

**Verify:** switching teammates never leaks the previous bot's preview; stale/failed snapshots are labeled; closing the pane does not stop the task; reopening returns to the same conversation; permission denial remains a useful next action; setup cancellation preserves the request; an expired sign-in does not show “Ready”; native phone has equivalent return/navigation behavior.

## Personality and differentiation

OpenBot should feel like **your little team, using your tools on your terms**. Keep original animated vector characters, restrained neutral surfaces, conversational copy and user-defined names. Do not reuse competitor artwork or manufacture a preset staff roster.

Useful differences to prove: explicit provider choice, portable data, scoped per-teammate access, one public answer after private collaboration, and understandable recovery when work fails. These are more defensible than an extra marketplace tile. Do not promise every subscription works, complete sandbox isolation, or lower cost without evidence.

## What remains outside a redesign

Hosted always-on execution, real away-network continuity, native-client parity, live connector authentication and repeated provider-backed outcomes are separate evidence gates. Existing audit documents list runtime/egress isolation limitations. A new shell cannot close them, and this audit did not rerun the entire benchmark suite.

With these interaction foundations integrated, the next proof is one whole task each: an inbox/calendar brief with linked sources; an attached-document comparison yielding a real downloadable artifact; a teammate consultation with one final answer; a scheduled result delivered into the correct conversation after host restart; and a phone review of an already-pending action. Record completed outcome, interventions, elapsed time and reported usage. Compare reproducible outcomes—not screenshots or counts of tools.

## Follow-through in this audit pass

The integrated `src/studio/useConversationDraft.ts` hook and testable `conversation-drafts.ts` controller provide per-thread draft restoration, debounced serialized saves, stale-response protection, captured-send clearing and explicit handling of observed remote conflicts. `conversation-drafts.test.ts` exercises those behaviors without a model call or owner data; the combined browser suite also verifies restoration, files and delayed-send navigation. Actual phone handoff remains a separate gate. The text-draft server remains last-write-wins: unobserved concurrent updates cannot be prevented atomically without a server-side revision contract. Draft autosave is not a guarantee that a browser killed before its request completes will persist every keystroke.

`src/studio/RunControls.tsx` adds contextual task cancellation and approval decisions using the existing execution endpoints. A new authenticated, non-cached approval-preview endpoint projects only reviewed fields; it never serializes raw stored action objects. Supported compact reviews are initial task prompts, Gmail messages, Drive text files, Calendar events, Slack messages and GitHub issues. External action review requires a known connected account. Calendar review includes invitees, invitation sending, primary-calendar destination and Meet creation; ambiguous offset-free times cannot be approved here. Gmail's executor currently supports To/Cc/subject/plain-text body, not Bcc/attachments/reply headers. Common credential patterns are masked and disable compact approval; this is not a universal secret detector. Unsupported, masked, malformed or oversized actions remain decline/stop/full-review only.

Projection tests execute the real helper and compare the supported executor argument sets to the review contract. `npx tsx src/studio/RunControls.browser.ts` uses actual rendered controls and helper-produced intercepted endpoint responses to test review gating, one request on double click, unsupported/stale approval handling, conflicts, uncertain-response retry gating and cancellation. Accepted approval text deliberately does not claim the external action completed. These tests do not perform real sends, validate a production sign-in, prove phone delivery, or certify an end-to-end task result. Account/permission state is rechecked by the existing execution layer; the preview itself is not an immutable account-identity transaction.

The remaining route wiring was separately checked with `npx tsx --test src/server/approval-preview-route.test.ts`: an actual isolated `index.ts` host, only pending/denied jobs, no configured bot model, GET-only requests. It verifies the full prompt and IDs, `no-store`, unsupported secret-bearing action projection, missing-ID 404, resolved-decision gating and unauthenticated proxy rejection. After shutdown the pending approvals are still pending and the task has no start time or input-token usage. This closes the route integration gap, not live external-action or production authentication proof.
