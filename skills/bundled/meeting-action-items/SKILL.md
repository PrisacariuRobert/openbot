---
name: meeting-action-items
description: Turn meeting notes or transcripts into source-linked decisions, actions, owners and unresolved questions.
license: MIT
---
# Meeting notes → actions

Use this method for meeting transcripts, notes and handover summaries. It does not record meetings or grant calendar access.

1. Read the supplied notes or authorized transcript. Identify the meeting date and source sections if present. Do not invent attendance or use calendar titles as proof of what was discussed.
2. Separate explicit decisions, tentative proposals, commitments and unanswered questions. Preserve qualifications such as “if approved.”
3. For each action capture the concrete result, explicitly named owner, explicitly stated deadline, dependency, completion criterion if given, and source quote or section. Use “Not assigned” / “Not set” when missing. A speaker suggesting work is not automatically its owner.
4. Combine duplicates without dropping disagreements. Flag conflicting dates, owners or decisions for resolution. Resolve relative dates only when the meeting date/time zone is known; otherwise keep the original wording.
5. Produce a concise summary plus an action table and short questions-to-resolve list. Link the source or quote the relevant supplied sentence. Never add commitments to make the table look complete.
6. If asked to publish tasks or send a recap, search the destination for existing items first. Prepare exact changes, use the available approval-gated tool, and verify its returned result. A draft or queued approval is not a sent message.
7. For a requested file, save the result and use task_verify with workspace_file evidence before claiming it is ready.

No account is necessary for notes pasted into chat. If attachment text is unavailable, explain which file needs a readable export; do not fabricate its content.

## Provenance

Reviewed OpenBot adaptation of [meeting-action-items](https://github.com/NousResearch/hermes-agent/blob/622883bad7f55f56a6393cd994e36c65fbdff253/skills/productivity/meeting-action-items/SKILL.md). Instructions are bundled with OpenBot and do not grant tool or account permissions. See LICENSE for reuse terms.
