# See it work

The owner rejected the Pulse edit because motion and feature headings did not explain the product. The new brief is a demo-led introduction, still without voice. One persistent application window, one owner, one teammate and one client-review task carry the story. The camera follows the interface rather than replacing it with feature slides.

## What a first-time viewer should understand

OpenBot is an open-source home for AI teammates. Choose the AI connection, ask for useful work, let teammates gather context and consult each other, review actions that need permission, and receive usable files. A missing capability can become a proposed tool-building task. The tool is tested, improved, used to finish the original job and retained for reuse. The depicted loop is self-extension of tools, not training the underlying model or removing permission boundaries.

## The specific example

“Get Friday’s client review ready. Pull together the notes, timeline and costs.”

- The owner creates Nova and chooses an AI connection.
- Nova asks for manual sign-in, then uses meeting/project context and expense exports.
- Milo prepares the deck; Fern checks the costs. Nova remains the one conversation owner.
- Different expense formats expose a missing importer. Nova proposes a bounded plan and waits for approval.
- The same task continues using the configured coding model. A first parser fails two checks. An improved parser passes four checks and normalizes the three receipts to **€1,749.50**.
- The budget and deck open inside the app. The draft email waits for an exact destination/content review.
- A Friday routine reuses the saved importer and format. The conversation continues on the phone.

## Timeline

| Time | Visible action |
| --- | --- |
| 0–7 s | Definition of OpenBot; create Nova and choose an AI connection. |
| 7–15 s | Type and send the actual request; Nova takes responsibility. |
| 15–23 s | Ask for sign-in, owner continuation, sources appear. |
| 23–29 s | Private teammate consultation surfaces the missing importer. |
| 29–37 s | Review the capability, file effect and coding-model choice; approve. |
| 37–49 s | Build → test → improve → re-test → use. |
| 49–59 s | Open the budget and deck from the shared results. |
| 59–67 s | Inspect account, recipient, body and attachments; approve the email. |
| 67–74 s | Make it a routine, then show the next Friday reusing the tool. |
| 74–82 s | The same conversation and review pack on desktop and phone. |

The instrumental is locally synthesized using the Pulse sound palette, re-arranged to this picture. No speech or voice-generation service is used.

## Demonstration, not runtime evidence

All messages, accounts, files, approvals and device events are staged product illustrations. `src/demo/expense-fixture.ts` is a real, bounded local parsing fixture used to keep the displayed failures, successes and total consistent. It is not an autonomous model generating or repairing production code. No email was sent, routine scheduled, real-account source read, or phone task executed by this production work.

Current production self-extension has proposal approval and same-task coding-model routing. The fully automatic build/test/repair/use/reuse loop shown here is a product-direction illustration and must pass live-model verification before public promotion as working behavior. See `CAPABILITY_REVIEW.md`. There are no unfinished-feature badges in the picture; scope and publication gates live here and in the review notes.
