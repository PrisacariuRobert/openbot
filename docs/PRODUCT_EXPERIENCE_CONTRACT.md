# OpenBot: useful work through conversation

Product direction, 12 September 2026. This is a release contract, not a claim that every behavior below is implemented.

## The promise

Your work, taken care of. Your models. Your say.

OpenBot should feel like messaging dependable teammates, not operating an AI console. The distinction must come from complete, understandable work—not from copying a competitor's roster, layout, or feature list. Mascots remain personal, customizable identities; they are not a fixed team users must adopt.

## What the owner experiences

1. Describe an outcome in ordinary language. The conversation stays the primary surface.
2. See a quiet, meaningful working state. Open detailed steps only when useful.
3. Answer a specific question or review a clearly described change when needed. Ordinary navigation should not become an approval ceremony; sensitive changes retain exact-action review.
4. Receive the actual result, with its destination or attachment and any important limitation visible beside it.
5. Correct it in the same conversation. Repeated work should retain context without repeating completed external actions.

One accountable teammate brings the answer back. Consultations are available to inspect; several bots should not deliver duplicate final answers. Power-user controls belong in contextual details and settings, without becoming a second-class or removed capability.

## Messaging and design rules

- Default replies are natural, concise, and specific. Short drafts and answers stay inline; substantial editable work gets an attachment. Explicit requests for technical depth override the concise default.
- “Drafted,” “waiting for you,” “sent,” and “couldn't verify” have different meanings. Pleasant copy must never blur them.
- Show concerns where the result is, not behind a generic success badge. A completed model process is not proof of a correct result.
- Use the existing monochrome surfaces, restrained typography, spacing, and familiar controls. Color belongs primarily to personal mascots. Do not add decorative panels to announce technical capabilities.
- Every screen needs a clear next action, understandable empty/loading/error states, keyboard access, and a usable phone layout. Review the actual running interface, not only a mockup.
- Keep the owner's chosen models. Judge the product by achievable outcomes and disclose model-dependent limits; a paid model is not a substitute for good workflow design.
- Default to the answer and its usable result. Supporting checks and reviews use short, labelled disclosures; avoid repeated author names, file excerpts and paragraphs of status. Icons support labels, never replace the meaning. Current concerns, older unbound concerns and work in progress must remain distinguishable before opening details.
- Routine lists show identity, schedule and state first. Testing, editing and maintenance belong under Manage; failures and approval needs remain visible. A successfully queued catch-up must not be described as a failed run or encourage a duplicate retry.

## Evidence-led release gates

Hold the broad release until the following journeys pass on a frozen candidate. Announcing a roadmap is not evidence of completion.

| Journey | Acceptance evidence | Current audit gap |
| --- | --- | --- |
| Make, review, correct | Exact delivered revision reaches a second teammate; concerns appear beside the result; correction is checked again | Version-bound fix and corrected-file live rerun passed; repeat on a frozen candidate with pilot users |
| Arrange and follow through | An approved calendar change is read back; a separately approved message uses its real details; retries do not duplicate either action | Repeatable real-account sequence still needs proving |
| Turn discussion into work | Read permitted discussion, propose an accurate destination-bound task or draft, approve once, reopen the result | Empty test accounts and navigation approvals limited the audit |
| Return to regular work | Routine runs and recovers without cluttering chat; important exceptions are noticed | Heartbeat noise and recovery need focused validation |
| Start and return from another device | Clean Mac install, understandable model/login setup, phone send/progress/approval continuity on cellular | Frozen build and physical-device pilot still required |

For each journey, record outcome accuracy, unnecessary questions/approvals, elapsed time, usage, recovery behavior, and whether a new user could finish without founder assistance. Use observed pilot baselines to set targets; don't invent a completion percentage.

## Order of work

1. **Trust the result:** exact artifact review, visible findings, honest partial outcomes. This implementation starts here.
2. **Remove friction:** semantic navigation approvals, usable sign-in handoff, stable account/context identity, recovery without repetition. Never solve friction by enabling blanket approval.
3. **Make conversation coherent:** quiet routine progress, one accountable reply, corrections linked to the right version, contextual controls, consistent mobile composer and states.
4. **Prove usefulness:** repeat the journeys with occupied accounts and consenting pilot users, then run installation/recovery/device checks on one fixed candidate.

The first release should be deliberately narrow and genuinely useful. Broader integrations and more features come after people can trust the core loop.

## First implementation evidence

- Owner-requested reviews now carry the delivered attachment IDs and revision/hash binding, as well as original inputs. The existing private consultation handoff copies the bound bytes into the reviewer's workspace and refuses changed or missing versions.
- Findings appear beside the delivered file, with failed/unverifiable states and supporting detail. Earlier reviews explicitly retain their lack of exact-version binding; they are not retroactively certified.
- Teammate guidance distinguishes short inline answers from substantial file deliverables, permits requested technical depth, and uses plain-language draft/sent/blocked states.
- 22 focused tests passed across review handoff, attachment processing, receipts, and finding presentation. Type checking and the production build passed (existing large-bundle warning remains).
- The updated frontend was inspected in the actual Scout conversation, including opening the earlier review. On the next implementation pass, the managed runner was reloaded while idle and the version-bound review was rerun through OpenBot's UI: Pixel read the current v2 copy and agreed with C at EUR 490 / 2 days. The supplied file hash was recorded by the host. This proves that handoff in this case, not every review or the historical source facts; the reviewer explicitly noted limits.

## Integrated conversation pass

### Activity and approval follow-through

- Activity now distinguishes pending decisions from failures and other updates. Compact status pills replace equal-width dashboard counters; approved-action history is disclosed on demand. Additional attention groups remain accessible.
- Failure grouping preserves different causes instead of combining everything from one teammate. Separate approval runs stay independently actionable and sort before failures.
- Explicit coordinated prohibitions such as “do not create, complete, edit, send, post, invite or buy anything” no longer produce a false spending warning. Positive later spending/publishing instructions and unknown browser controls still require review. This does not solve the separate observed navigation-approval gap.
- Luna implemented the UI and Sol implemented the behaviour tests, with parent diff review and rendered-app correction. Ten focused safety/grouping tests and type checking passed; the production build passed. No external account actions or saved-routine changes were made for these checks.

- Working state is a compact mascot/status row, with different queued, working, checking, and consulting states. Work details and stop controls remain accessible. Streaming work text is available in details instead of growing into a second answer in the chat.
- The temporary review-request notice now follows child-run updates, so “is checking” does not remain after the review has ended.
- Older delivered file cards offer an explicit link to a newer known revision. Ancestry comes from attachment IDs, never matching filenames. Original links and reviews remain tied to their original version; history is not overwritten.
- A phone-width live run (390 × 844 CSS pixels, no page overflow) produced `cost-sheet-ux-0912.csv` through Scout. Independent readback of the served file confirmed line totals EUR 21.60, 24.30, 75.00; total EUR 120.90; remaining budget EUR 29.10. The answer was two natural sentences with a file link. OpenBot's automatic task verification remained partial; do not relabel it as fully host-verified.
- Live evidence IDs: corrected-version review `ec998d55-601e-4acc-8372-1e7fac336421`; coffee sheet task `e3419fe6-d705-458f-b565-567377990f04`. These were local fictional workflows with the owner's existing models and normal approvals. No external messages, purchases, sign-in changes or account writes were made.
- Pixel's second live review (`3d4814a8-9bcd-4297-9611-57deb87bccf2`) agreed with the coffee sheet arithmetic. Its finding replaced the pending-review notice without a page reload. This remains a model review, not an automatic verification certificate.
- Historical reviews now load delivered files by run identity even when newer messages push that run outside the chat's loaded history window. A regression test covers 125 newer messages.
- An idle runner restart exposed an opening-screen recovery problem. The opening screen now retries unavailable connections automatically with bounded backoff and a request timeout. Expired access stops at sign-in; stale requests cannot reopen a locked studio. These recovery and locking cases have unit coverage; the new retry behavior has not yet had a live outage simulation.
- Final integrated checks: 30 focused tests, type checking, production build, and diff whitespace validation passed. Live browser inspection at 390 × 844 and 1280 × 800 showed no page overflow, a visible sent message and result, aligned composer controls, and the completed review finding. The corrected-file link points to v2 while the original v1 link remains intact. These are browser-size checks, not physical iPhone or cellular certification.
