# General Mac app reading — 0.35 follow-up

5 September 2026. Functional implementation; no redesign or universal compatibility claim.

`mac_app_read` gathers up to 20,000 characters / 100 blocks from at most 600 Accessibility nodes in one existing non-minimized window. It does not focus, open, click or type. Text, messages, headings and cells are included when exposed by the app. Empty/inaccessible windows fail honestly and suggest a connector, supported browser or export. It does not read hidden databases, expand virtualized/off-screen content, perform OCR or verify a whole document/table/account.

Every successful read has an encrypted database receipt with app identity, window, timestamp, coverage and block references. Authenticated Markdown download keeps the original source reviewable across restart. The model is told to cite the receipt and treat source content as untrusted. Permission, task ownership/status and the 20-read-per-run cap are checked before and after reading; revoked results are not saved. Password/authenticator apps, secure controls, protected attributes and recognized credential labels are excluded, but arbitrary plaintext secret recognition is not guaranteed. The old control inspector also avoids recognized secure values. Generic key-based navigation now requires approval because arrow keys can change controls in some apps.

## Validation

- Seven focused tests pass, including app-shaped document/message/table fixtures, recognized protected fields, bounds, encrypted persistence, revocation/cross-bot denial, tool exposure and actual Apple automation compilation without app execution.
- The actual OpenCode integration fixture completes a two-app digest using synthetic Notes/Slack readers, saves both receipts, and cites both URLs in its final answer. This proves transport/storage integration, not real Notes/Slack compatibility or reasoning quality.
- Full regression: **204 tests passed**, release/native source contracts, TypeScript check and production build passed. The existing native app source did not change in this follow-up; its prior 16-test/native-build results are not new UI verification.
- Real app verification is still blocked by the locked Mac and required OS consent. No personal app content or secret was read in these tests.

The original installed Mac app is preserved. The separate OpenBot Preview app packages the same backend as the local development runner. No GitHub push/merge, live marketplace authentication, new paid model usage or usage reset occurred in this follow-up.
