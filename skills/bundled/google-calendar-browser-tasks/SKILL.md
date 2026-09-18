---
name: google-calendar-browser-tasks
description: "Manage Google Calendar events through the teammate's signed-in browser: create, reschedule and delete with readback verification."
license: MIT
---
# Google Calendar in the teammate browser

Use the teammate's own persistent browser profile at calendar.google.com. This method performs real calendar changes, so every write below still needs its normal exact approval first. Single-session discipline: never copy this profile into a second browser in parallel — Google invalidates sessions that appear on two clients at once.

1. Verify the signed-in Google account matches the connected owner before acting. On any login wall, "browser may not be secure" rejection, 2FA or unexpected account, stop and request private headed sign-in. Headless automation cannot sign into Google; only reuse an existing headed sign-in.
2. Create at the event editor (`/calendar/u/0/r/eventedit`): title field, start/end date fields, then Save. Read the new event chip back under its day before claiming success.
3. Reschedule by opening the event chip, Edit event, changing the date fields, Save. The chip must appear under the new day and be absent under the old day. Same title elsewhere never receives the edit.
4. Delete with the detail dialog's Delete control. Guestless events delete immediately; the Undo toast plus the event's absence is the proof. With guests, a cancellation dialog appears: Back to editing, Don't send, or Send the cancellation. The Send choice notifies the approved guests.
5. Guests: add addresses through the Guests tab autocomplete and confirm each chip before saving. Saving with guests raises a "send invitation" review: only Send for approved guest lists. Open overlays and invisible suggestion listboxes can swallow the Save click (success response, no effect): press Escape to clear them and retry, and always read back instead of assuming. Verify the guest tree on the saved event. Delivery of invitation and cancellation emails is confirmed by the recipient, not by Calendar.
6. State account, event title, date change and guest list in each proposal. Touch only approved events. A toast alone is not proof — day readback is.

## Provenance

OpenBot maintained built-in method. Proven in a signed-in teammate browser: private probe event created on Sep 19 and read back, rescheduled to Sep 20 and read back on the new day, deleted and verified absent. Guest flow proven separately: private event with one approved guest, invitation dialog Send, guest present on the saved event, then delete with cancellation Send and verified absent. Instructions are bundled with OpenBot and do not grant tool or account permissions.
