# Teach a teammate through conversation

Ask your teammate to **learn this workflow**, or start a message with `/learn`:

> /learn Turn our invoice reconciliation process into a reusable skill. Ask for the invoice folder and currency each time; keep originals unchanged and verify the totals in the saved workbook.

You can refer to the current conversation, attach permitted source material, or ask the teammate to inspect an accessible source. If the procedure or essential context is unclear, it should ask a focused question. It uses the model already selected for that teammate; OpenBot does not switch providers to learn a skill.

## Review, then reuse

1. The teammate proposes a name, when to use the skill, and the complete reusable instructions. These should include inputs, steps, the expected output, verification and when to stop for help.
2. Open **Review the full action** in the conversation. Approve only instructions you want the teammate to retain. This review is manual even with YOLO mode on. Declining saves nothing.
3. Approval saves a new draft skill for that teammate. It does not replace existing skills, run the workflow, install executable code, grant permissions or create a routine.
4. Use the returned slash command with new inputs, for example `/invoice-reconciliation` followed by the folder and currency. Skills & recipes → Your learned workflows contains editing, export, checks, history and deletion controls.

File, project and general reasoning workflows do **not** need a starting website. Browser workflows may specify one. The same saved instructions are written to the OpenCode and Claude skill directories, and changed skills invalidate the teammate's cached runtime context.

An existing owner-created skill named `/learn` takes precedence over the built-in command. In that case, use an ordinary request such as “Save this process as a reusable skill.”

## What saving does not prove

Instructions written by a model may be incomplete or wrong. Saving a skill is not evidence it works. The existing workflow checks require two distinct owner-supplied inputs, actual tool activity and owner review before a routine referencing the skill can be enabled. Editing the skill invalidates old checks. These checks are not a formal proof of general reliability.

Keep credentials out of skills and chat; use the private sign-in handoff when needed. Known secret patterns and unsafe starting addresses are rejected, but automated detection cannot identify every sensitive value. Review source-derived instructions yourself; imported material never expands permissions.

## Evidence in this checkout

- Unit tests cover schema/secret rejection, both saved runtime files, portable export/import, optional websites, cached-context invalidation and two-input scheduling checks.
- A deterministic child process exercises the real runner, scoped internal tool requests, exact approval preview, manual review under YOLO, denial, stale fingerprints, concurrent approval and cancellation. It makes no live model or account requests.
- `npm run test:skill-authoring-ui` exercises the actual conversation review and skill editor at desktop and 390px widths using disposable data.
- Claude's stdio bridge is exercised with a local fixture endpoint. Both runtimes expose the new tool, but live-model learning quality and native-client interaction still need separate pilots.

Nothing in these fixture results establishes parity with Grok Bot or Hermes. They demonstrate one working foundation for an independently implemented learning loop.
