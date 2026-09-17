# Messages interaction migration

This branch starts from main, not the previous visual-exploration PR. The
approved Messages-style HTML supplies the interaction direction, not mock data
or simulated backend behavior.

## Implemented in this slice

- The shipped conversation renders an anchored message-action popover. Reply,
  copy and the existing five reactions are available via pointer, keyboard and
  touch gestures. API reaction values are unchanged; visible symbols are SVGs.
- Replies have thread-local drafts and request-bound clearing. The real send
  API receives `replyToId`; the backend remains authoritative about thread
  ownership and consequential-action review.
- The original MCP `send_message` tool accepts the same optional reply ID.
- Mascot effects observe actual status attributes and stop when reduced motion
  is requested or the page is not visible. Animation never completes a task.
- The browser-access disclosure loads actual per-teammate access, rejects stale
  responses and offers retry without granting permissions or restarting work.
- Ordinary prose containing “joined” is not classified as a group system event.

## Validation

`node --import tsx scripts/test-messages-mcp.ts` starts the real application and
its bundled `mcp/openbot.ts` stdio server against a disposable fixture. It uses
`tester_action`, `tester_snapshot`, `tester_screenshot`, `tester_wait` and
`tester_session` for the UI, and `messages_list` / `studio_state` for independent
backend evidence. The only submitted task is intentionally approval-gated and
then denied. It does not use owner credentials or a live model.

The dedicated **Messages MCP acceptance** workflow uses the unchanged npm lock
file and uploads screenshots, a report and the MCP call inventory. Existing
Verify and browser-acceptance workflows are retained, not weakened.

A screenshot of a Settings route is a review aid, not evidence that every
control on that page was exercised. Native Mac trackpad and Safari testing are
separate release gates.

## Still required for the complete approved design

This slice does not claim the whole migration is complete. The attachment
popover, inline document editor, full browser side-by-side experience, richer
mascot stickers and every advanced settings flow need their own integration
and acceptance review. Do not copy the prototype's timers, fake sign-ins or
approval success into production. Keep connection grants, exact reviews,
uncertain-outcome recovery and model isolation authoritative.
