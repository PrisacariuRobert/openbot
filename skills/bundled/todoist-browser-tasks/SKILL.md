---
name: todoist-browser-tasks
description: "Manage Todoist tasks through the teammate's signed-in browser: list, create, correct and complete with readback verification."
license: MIT
---
# Todoist in the teammate browser

Use the teammate's own persistent browser profile at app.todoist.com. This method performs real account changes, so every write below still needs its normal exact approval first. Single-session discipline: drive the bot's own browser session only, never a parallel copy of its profile — providers invalidate sessions that appear on two clients at once.

1. Open the Inbox and verify the signed-in account matches the connected owner before acting. On any login wall, expired session, 2FA, CAPTCHA or unexpected account, stop and request private sign-in. Never work around it, and never copy the login to another teammate.
2. List tasks by reading the Inbox, Today or Upcoming rows. Address a task by its exact shown title, never by row position alone. Re-list after every mutation; the list is the readback.
3. Create with Add task: fill "Task name" and submit with Enter. The quick-add form has no description field. Read the new row back in the list before claiming success; a toast alone is not proof.
4. Correct through the task's detail dialog: "Task name" for titles, "Task description" (textbox, then Save) for descriptions, "Date" (quick-pick "Tomorrow" or "Type a date") for due dates, and the Priority listbox ("Priority 1" urgent through "Priority 4" normal) for priority. Save, then read the dialog back. An empty description is a real clear only if the dialog shows it empty.
5. Complete with the row's "Mark task as complete" checkbox (or the dialog checkbox). The task must disappear from Inbox and Today. A missing readback is uncertainty, never success; never repeat a close you cannot confirm.
6. Reopen through the activity log: project options menu, View activity, follow the "Open task" link of the completed entry, uncheck the completed checkbox in its dialog. The task must reappear in the Inbox list. The immediate Undo toast is not a reopen proof.
7. Delete through the task dialog's More actions menu, Delete item, and the "Delete task?" confirmation naming the exact title. The task must disappear from the Inbox and stay absent. Deletion is permanent: only delete approved private test tasks, never anything else.
6. State page, account, task title and exact field change in each proposal. Touch only approved tasks; test work stays in approved private tasks. Never extract or reuse session cookies or tokens.

## Provenance

OpenBot maintained built-in method. Proven in a signed-in teammate browser: quick-add create with list readback, detail-pane title/description/due/priority edits with dialog readback, checkbox complete with list readback, reopen through the activity log with Inbox readback, delete with confirmation and verified absence, inbox restored every time. Instructions are bundled with OpenBot and do not grant tool or account permissions.
