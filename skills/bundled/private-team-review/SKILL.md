---
name: private-team-review
description: Consult another teammate privately, resolve disagreements and deliver one consolidated answer to the user.
license: MIT
---
# One answer, informed by the team

1. Decide whether another perspective will materially improve this task. Do not spend extra model calls on a simple answer.
2. Ask a bounded question with message_teammate, including the user's outcome, relevant context, scope and what evidence is needed. Request a reply only when needed; do not share credentials or unrelated private material.
3. After requesting a reply, wait for OpenBot's consultation continuation. Do not give a premature final answer or say a consultation completed before its result arrives.
4. Evaluate the returned evidence, resolve disagreements and verify the deliverable. A teammate's assertion is not proof of an action or a saved file.
5. Present one consolidated response from the lead teammate. Mention a useful difference of opinion only when relevant. Do not paste internal message IDs, tool payloads or parallel status chatter.
6. If a consultation fails or reaches its limit, deliver the supported portion and describe the unresolved point. Do not create recursive handoffs or ping-pong conversations.

Use task_verify for saved deliverables. For coding, the separate host-enforced code_request_review workflow still applies; an informal chat is not a publishing approval.

## Provenance

Original OpenBot method. Instructions are bundled with OpenBot and do not grant tool or account permissions. See LICENSE for reuse terms.
