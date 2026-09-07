# QA: Group chats

Working-tree increment: named, owner-created group rooms with explicit
teammate rosters, in addition to each teammate's direct conversation and the
all-hands team room.

## What was built

- `createGroupThread` / `setGroupMembers` / `renameGroupThread` in the host
  database: one to six existing teammates, short titles, membership visible in
  the thread list (`botIds`), and system messages explaining joins/leaves.
- `POST /api/threads` and `PATCH /api/threads/:id/group`; group threads also
  accept the ordinary pin/section/hide patch, previously limited to direct
  conversations, while the team room stays immutable.
- Studio: a New group pager button in the sidebar, a create/edit drawer with
  member chips, the roster in the conversation context pane with an edit
  entry, and group rows in the conversation list.
- Messaging in a group reuses the production path: candidates are the thread's
  members, `@name`/`@everyone` mentions and explicit picks route the task, and
  ordinary approvals and Auto Review rules apply unchanged.

## Guarantee shape

- Membership changes affect future tasks; started runs keep running for their
  teammate. A removed teammate loses the thread immediately (candidate lists
  are read per task).
- Group threads are rooms: no implicit membership expansion; a hidden member
  cannot be addressed by mention in that room.

## Evidence

- `group-threads.test.ts` (5 tests): creation with deduped membership and
  system history; validation of names, empty rooms, unknown and oversized
  rosters; rename/membership changes explained in-thread while the team room
  refuses rename and member edits; mention routing constrained by current
  membership; pin/section/hide parity.
- Full unit suite 458/459 passes plus typecheck (one pre-existing environment
  failure unrelated to groups: ripgrep missing).
- Live smoke against a dedicated test server: created a three-teammate group,
  edited membership/title, verified members and system messages through
  `/api/state?threadId=…`, verified group pin and the team-room guard.

## Remaining limits

- iPhone shows group threads like other rooms (title, messages, runs) but has
  no member picker yet; creation remains desktop-first.
- Groups reuse the `room` thread kind; a deleted teammate cascades
  membership, and the group remains usable with its remaining members.
- No per-member roles or ownership handoff (Grok Bot's pass-ownership detail)
  in this version.
