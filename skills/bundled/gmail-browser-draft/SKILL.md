---
name: gmail-browser-draft
description: "Prepare Gmail drafts through the teammate's signed-in browser, and send approved messages with Sent readback. Never sends without a separate exact approval."
license: MIT
---
# Gmail drafts in the teammate browser

Use the teammate's own persistent browser profile at mail.google.com. Draft preparation and sending are two separate approvals: a draft approval never authorizes Send. Single-session discipline: never copy this profile into a second browser in parallel.

1. Verify the signed-in Google account matches the connected owner before acting. On any login wall, "browser may not be secure" rejection, 2FA or unexpected account, stop and request private headed sign-in. Each Google service needs its own first visit; Calendar being signed in does not imply Gmail is.
2. Compose a new message: fill To, Subject and Message Body. Confirm the recipient chip before anything else. Never press Send and never use keyboard send shortcuts in this flow.
3. Gmail auto-saves within seconds. Open Drafts and read the draft row back; reopen it and read To, Subject and Body values back. A row alone without reopened values is not proof.
4. Discard the draft when done and verify the Drafts count drops back and the subject is gone. Verify Sent contains nothing from this flow.
5. State account, recipient, subject and draft-only intent in each proposal. Touch only approved drafts. Test drafts stay private and are always discarded.
6. Sending needs its own exact approval naming recipient, subject and body. Confirm the recipient chip and the filled values first. Banner overlays (for example desktop-notification prompts) can cover Send: dismiss the banner, re-snapshot for a fresh Send selector, and never click a stale one. A click that times out may still have dispatched: always read back (Sent row plus Drafts count) instead of clicking again blindly. Verify the Sent row with recipient, subject and time; delivery to the recipient inbox is confirmed by the recipient, not by Gmail.

## Provenance

OpenBot maintained built-in method. Proven in a signed-in teammate browser: private self-draft composed, auto-saved (Drafts 40 to 41), reopened with all values read back, discarded (Drafts back to 40), Sent verified clean. Sending proven separately: approved message to an approved address, Sent row with recipient, subject and time read back. Instructions are bundled with OpenBot and do not grant tool or account permissions.
