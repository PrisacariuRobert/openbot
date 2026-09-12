# Everyday experience: release gate

12 September 2026. Working audit, not release certification.

The release promise is not "many agent settings." It is: tell a teammate what
you need, see what is happening, review the consequential step, and receive an
inspectable result you can correct. Mascots give identity; they do not replace
clear controls or dependable work.

## Rules for every component

- Lead with the user's task and one primary action. Put optional setup behind
  named disclosures; never hide a required field or a blocking error there.
- Everyday actions belong beside their subject: edit/remove in a teammate's
  conversation menu, group actions in the group menu, file actions by the file.
  Do not route ordinary actions through a hierarchy of settings subpages.
- Messaging comes first: a quiet chat list, identity header, conversation and
  composer. Context and configuration reveal on demand. Borrow interaction
  clarity from messaging apps, not their branding or decorative wallpapers.
- Motion explains a reveal or focus change. Keep it brief, do not replay
  history animations on refresh, and respect reduced-motion preferences.
- Use short labels and one-line status. Keep full evidence, permissions and
  failure details available without flooding the conversation.
- Preserve deliberate choices of model, account and access. Simplicity must
  not silently spend money or broaden access.
- Every action needs loading, success, failure and keyboard behavior. A visible
  button with no useful result is a release defect, not a polish issue.
- Removal must say what is removed, what is retained and how to recover it.
  Archiving a teammate is not erasing its files or logged-in accounts.
- Check normal width and 390px, long names, empty state, populated state,
  pending work, and errors. Responsive web is not physical-iPhone proof.

## Component-by-component acceptance

| Surface | Simple default | Required proof before release |
| --- | --- | --- |
| Create teammate | Name, job, explicit AI choice; optional personality/look/import | Create one; no surprise model or access; useful validation; draft survives errors |
| Edit teammate | Name/job/look, clear Save; advanced model/instructions/budget/access | Reopen exact saved values; failed save stays editable; no unintended settings changed |
| Remove/restore | Discoverable Remove teammate; retained-history explanation | Cancel removal; remove disposable teammate; verify work stops and seat clears; restore it |
| Conversations | Request, quiet progress, answer, expandable evidence | Send/edit/correct; reconnect; pending and cancelled work visible; no duplicate final replies |
| Groups | Name and members | Create/rename/change members; running work semantics explained; removed bots not silently invited |
| AI connections | Current connection and Add connection | Connect, select, switch, expired login, limit reached; no false connected state |
| Apps and browser | Account and available access; sign-in only when needed | Saved login, wrong account, expired session, opt-in navigation, exact final save |
| Routines | What should happen and when; one next-run summary | Create/edit/pause/resume/remove; timezone; missed run; restart; no duplicate effects |
| Activity | Needs attention first; completed history secondary | Each pending item leads to actionable review; resolved items stop demanding attention |
| Files/results | Useful title, preview/open, exact version | Download/open/revise; old link stays immutable; current review matches delivered version |
| Permissions | Plain-language scope and current state | Change only named access; denial/revocation takes effect; recovery path remains available |
| Phone/away access | Connected status and clear next step | Physical phone on cellular: send, receive progress, review, reconnect; Mac-off explanation |
| Advanced workspace | Projects, skills, imports and diagnostics secondary | Discoverable for power users; safe errors; no fake or dead actions |

## Current observed blockers

- Teammate creation competes with import, detailed instructions, connection
  management and starter-team setup before the basic task is complete.
- Removal exists as `retire` but is buried under advanced management. The
  everyday user cannot reasonably be expected to discover that terminology.
- Full teammate editing and the lighter appearance sheet are separate paths;
  the transition needs an explicit Edit teammate label.
- Navigation permission improvements have source/tests but not a live opt-in
  consumption test. Do not claim the interruption problem solved universally.
- Broad release still lacks a frozen-candidate pass for new-user installation,
  recovery, physical phone/away access, and repeatable occupied-account work.

## Go/no-go

### This batch's evidence

- Create, rename/job edit, recoverable remove, restore and cancel-removal were
  exercised through the actual app with `ui-lifecycle-test-4f698` on 12 September.
  Basic creation left advanced instructions empty and used the job as intended.
  No model task ran; browser/private-computer access remained off. Pixel and its
  accounts were untouched. The test teammate is finally removed/recoverable.
- Native confirmation caused browser-control timeouts. Replaced it with an
  inline two-step confirmation; Cancel and final removal then worked through
  a fresh app tab. Old tab 5 was unresponsive; new tab 6 was used.
- Edit/removal spacing was inspected at 390px. This is responsive-web evidence,
  not a physical-phone lifecycle test or a full-app visual sign-off.
- Three focused tests passed, including HTTP provider-less profile edits and
  retire/restore/seat limits. Final production build and diff check passed.
- Remaining lifecycle work: unsaved-change/partial-save failure scenarios,
  active-work removal with routines, keyboard focus and new-user discovery.

First finish the teammate lifecycle and its rendered tests. Then work through
the table, one complete journey per surface, recording defects rather than
redesigning everything at once. No public release while a basic action silently
fails, state is lost, or an external result is claimed without evidence.

A small invited pilot can precede a broad launch only after the basic lifecycle,
one useful end-to-end workflow, consequential review and recovery are proven on
the same candidate. Keep platform and provider limits explicit. Do not use a
percentage or calendar estimate as a substitute for those checks.

## Conversation-first follow-through

Design reference: https://developer.apple.com/design/human-interface-guidelines/design-principles
(reviewed 12 September 2026). Apply familiar controls, clear feedback, recovery,
consistent hierarchy, and meaningful motion. Simplicity is not removing useful
controls: normal instructions and mascot personalization remain visible in setup.
Judge each surface by the user's task, not its resemblance to an Apple screenshot.

The WhatsApp reference is an interaction reference, not a skin to copy. Keep
mascot identity, an uncluttered conversation list, messages and the composer as
the primary surface. Everyday edit/remove actions belong at the conversation.
Reveal work details, files and settings on demand; never hide an approval or a
failure merely to make the screen quieter. Respect reduced-motion preferences.

Next response-design acceptance: a completed task should lead with a brief
human-readable outcome and its useful result link. Keep verification detail
available without duplicating the entire answer beneath it. Do not rewrite
historical messages or truncate uncertainty to manufacture a cleaner demo.
