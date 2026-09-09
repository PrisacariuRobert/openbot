# Phone conversation and task recovery — 9 September 2026

## Reported problems and corrections

- **Recent phone messages/progress appeared missing.** The native conversation appended all historical failed runs below current messages and active work. Failures now appear at their original system-message position. Only recent unplaced failures use the fallback position; older failures remain in Activity.
- **Phone state could stall after returning to the app.** Foreground entry and network recovery restart synchronization. Reconnection refreshes the conversation, with a five-second foreground refresh backstop when the event stream silently stalls. Backgrounding cancels both loops.
- **Composer controls were misaligned.** Text, attachment, microphone and send controls share a centered 44-point row. Sending commits keyboard composition before capturing the draft and prevents double taps during that handoff.
- **The selected model rejected a PDF conversation.** The real failures contained HTTP 400 `MessageContent`/`json_parse_error` errors. Extracted PDF text now supplies the model context instead of raw PDF message parts. The OpenCode native read permission also prevents reopening PDF binaries into that context. Changed capability fingerprints start a fresh context for subsequent requests, without replaying old actions or changing the selected provider/model.
- **Fresh contexts lost the uploaded document.** Bounded, same-conversation extracted file text now survives beyond the last six chat messages. User uploads take precedence over generated usage artifacts. Excerpts are untrusted reference material, not authorization or proof.
- **Provider failures were too generic.** Usage, authentication, incompatible content and temporary provider errors now have actionable messages without echoing private error payloads.
- **Connector/activity/away-access layouts were inconsistent.** Scoped row/grid styles restore spacing and responsive controls. A Google Send control no longer inherits the circular chat-send button style. Permissions and disabled states are preserved.

## Verification

- `npm test`: **622 passed, 0 failed**.
- Final focused conversation-context tests after file-priority refinement: **7 passed**.
- TypeScript checking, production build, iOS source-contract checks and `git diff --check`: passed. The production build retains the existing large-chunk warning.
- Signed simulator tests: **31 unit tests and 1 UI workflow test passed**. The unit suite includes decoding the current local host's Pixel conversation.
- Native UI workflow explicitly checks composer alignment, the full sent message, working activity, background/foreground recovery and the completed reply with a deliberately silent event stream. It also exercises draft continuity, conversation navigation, settings, provider choice, routines and details.
- Exported and visually reviewed the native sent-message/progress and resumed-result screenshots. Connector and away-access layouts were also inspected at desktop and 390-pixel phone widths.
- Live task using the configured `opencode-go/glm-5.3-flash` model successfully reviewed a synthetic PDF in **QA · Phone and PDF recovery**. This used the actual upload/extraction/model path, not the native UI fixture's simulated task.
- The first attempt to recover the original CV request exposed the missing extracted-file context and correctly declined to invent a review. After fixing continuity, run `4b881b2f-ad1d-46cc-83a2-758d810ebd87` completed a specific CV review in Pixel's original conversation. Old failures were retained as history.
- The final host source was loaded by restarting the idle background runner. Runner online, no queued/running tasks, no reported runner error; away access reports ready.
- The updated development build was successfully installed on the paired physical iPhone without resetting its pairing. A subsequent attempt to launch it remotely failed with Apple's CoreDevice/XPC connection error; this is not a verified physical-phone playback result.

## Remaining boundaries

- The owner still needs to open the updated iPhone app and check a new message with Wi-Fi off. Simulator lifecycle recovery and a ready relay are **not** proof of a real cellular handoff.
- PDF reviews use extracted text. This does not verify visual layout, scan-only content or OCR. Missing extraction must be reported rather than guessed.
- These changes fix the observed execution failures; they do not establish that every provider or every external workflow works.
- No prior email/calendar actions were automatically replayed. The CV review did not send messages externally or modify personal files.
- The QA conversation and synthetic PDF remain as test evidence. The disposable native fixture uses in-memory data and calls no real model or external service.
- This is a tested development update, not a new signed public release or full market-readiness claim.
