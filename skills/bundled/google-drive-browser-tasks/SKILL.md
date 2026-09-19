---
name: google-drive-browser-tasks
description: "Manage Google Drive files through the teammate's signed-in browser: create, rename, edit, read back and delete with verification."
license: MIT
---
# Google Drive in the teammate browser

Use the teammate's own persistent browser profile at drive.google.com. This method performs real file changes, so every write below still needs its normal exact approval first. Single-session discipline: never copy this profile into a second browser in parallel — providers invalidate sessions that appear on two clients at once.

1. Verify the signed-in Google account matches the connected owner before acting. On any login wall, "browser may not be secure" rejection, 2FA or unexpected account, stop and request private headed sign-in. Each Google service needs its own first headed visit.
2. Create with the docs.new deep link, which opens a fresh document. Rename through the title input plus Enter and read the title back. The New button has no stable selector; do not fight it.
3. Edit Docs canvas text by clicking into the page and typing, one settled pass. Canvas content is invisible to accessibility snapshots: verify with screenshots, never with text readback. Reload and screenshot again for the persistence proof.
4. Delete through File menu, Move to bin, then the row menu, Delete forever, confirming the dialog that names the exact file. Verify absence from My Drive search and from the Bin. Bin-only removal auto-deletes in 30 days; Delete forever is immediate and needs its own explicit approval.
5. State account, file name and exact action in each proposal. Touch only approved files. Screenshots are the readback for canvas content; list presence is the readback for Drive rows.

## Provenance

OpenBot maintained built-in method. Proven in a signed-in teammate browser: document created, renamed, body typed, persistence proven across reload by screenshot, moved to bin, deleted forever with exact-name confirmation, Drive verified clean. Instructions are bundled with OpenBot and do not grant tool or account permissions.
