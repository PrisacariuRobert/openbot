# Included skills and physical iPhone preview — 5 September 2026

Development version 0.35.0. This records actual checks, not a marketplace or competitor-parity certification.

## Delivered

- Seven included methods, five reviewed adaptations from Hermes at pinned commit `622883bad7f55f56a6393cd994e36c65fbdff253`, plus two original OpenBot methods. MIT notices credit NousResearch, Ben Barclay and the superpowers debugging origin (Jesse Vincent).
- Existing and future teammates receive method access automatically. Per-teammate opt-outs and studio-wide disabling are durable. Disabling does not delete distributed source; re-enabling for an individual remains possible. No account, software or tool permission is granted by a skill.
- Web Skill Library and native Mac/iPhone managers show included methods without importing. Custom teaching controls remain available but collapsed on the web library. Current task prompts surface three relevant descriptions; full methods and references load only on demand. Bounded report workflows retain their narrower tool policy.
- Skill reads receive a host-recorded name, source and content fingerprint. The tool gateway accepts stable bundled IDs as well as imported UUIDs. Future sessions invalidate on catalog/access changes.
- A nine-category local security-guidance adapter runs on shared-project `code_write` and `code_replace` results. It identifies potential risky textual patterns with line numbers. It is advisory, does not execute third-party Python or make another model call, and is not a repository security audit. Apache license and attribution ship inside the packaged runtime.

## Verification

- `npm run verify`: **248 tests passed**, release/source contracts, application and acceptance TypeScript checks, production build.
- Native macOS Debug build passed. A packaged cold start with isolated data and system-only PATH served all seven included skills without user imports, returned real JSON API responses, and exited cleanly with an open event stream. Runtime includes skill sources/licenses.
- The macOS XCTest suite passed **17 tests** after the installed-app local-pairing correction, including the loopback-versus-remote credential-storage regression. The updated `/Users/robert/Applications/OpenBot Preview.app` was reopened and reached “Studio connected — Runner on this Mac” without entering a key or falling back to plain-text storage. Its code signature verified; the previous preview is retained as `OpenBot Preview before included skills 2026-09-05.app`.
- Native Mac Skill Library was opened and visually checked: seven included skills, selected teammate, enabled states, source disclosures and disable controls. Web library inspected at the live browser viewport; cards wrap within their panel and custom workflow controls are collapsed.
- Real iPhone Air on iOS 27: signed with the owner's Apple Personal Team, installed successfully through Apple's device tooling. Signed entitlements were inspected: no APS or app-group entitlement in this personal preview. The normal release entitlements are unchanged. The app labels unavailable push/Share-sheet delivery and does not request a push permission that this build cannot use.
- iPhone automatic launch was blocked by the **locked device**, not an installation error. User unlock, pairing, attachment/approval interaction and cellular/background acceptance are still pending. The host's Tailscale is running; no iPhone peer was online at the check. No claim of off-Wi-Fi success is made.

## Live Spark 1.3 outcomes

No fallback model; isolated studios, synthetic data and fresh sessions. These are OpenBot acceptance tests, not an authenticated head-to-head Grok Bot test.

| Natural request | Result checked | Time |
|---|---|---|
| Turn meeting notes into an action register | Host confirmed `meeting-action-items` was read without an import request. File distinguished private-beta decision from conditional launch proposal, retained Mira's explicit deadline, left accessibility ownership/date unresolved and cited N1–N5. One final bot response. | 30.210 s |
| Extract a project policy action register | Host confirmed `document-to-action-items` was read. File distinguished must/should/may, retained source clauses and missing owners/dates, and disclosed absent Appendix B. One final bot response. | 24.148 s |

Both files were manually inspected after automated checks. The fixture connector recorded no reads or writes in these text-only tasks; no connector was configured. Workspace files were verified by OpenBot's task gateway.

Reported usage: meeting case 11 model steps, 17,660 input / 1,544 output tokens; document case 7 steps, 15,812 input / 1,274 output tokens. Both reported model cost 0 on the explicitly chosen free Spark connection. These are provider-reported counters, not an account billing guarantee or a general cost benchmark.

Reproduce:

```sh
OPENBOT_BENCHMARK_MODEL=opencode/muse-spark-1.3-contributor-free \
OPENBOT_BENCHMARK_MODE=bundled npm run benchmark:extensions
OPENBOT_BENCHMARK_MODEL=opencode/muse-spark-1.3-contributor-free \
OPENBOT_BENCHMARK_MODE=bundled-documents npm run benchmark:extensions
```

Evidence paths printed by these runs: `openbot-extension-acceptance-8VnN0z` and `openbot-extension-acceptance-FODPrw` in the host's temporary directory, including `run.json`, `evidence.json` and workspace `brief.md`. These temporary files are not a durable CI archive; rerun the script for independent evidence.

## Failures found, not hidden

1. The existing internal reader validated only UUIDs. New built-in IDs would have failed. Fixed the boundary before acceptance.
2. The first meeting check used raw tool names in its assertion, but public activity labels intentionally hide those names. Added a host skill-read receipt instead of treating a generic activity label as proof.
3. The first document outcome was correct but skipped its method. That failed the stricter auto-use acceptance check. Added bounded, relevant method descriptions next to the current request instead of relying only on a long workspace profile. The next document run loaded the right method and passed. This improves discovery, not a guarantee every model always chooses correctly.
4. Personal Team signing rejected push/app-group capabilities. A separate entitlement override and visible preview limits allow device testing without weakening release capabilities or claiming unsupported features work.
5. Launching the installed desktop preview (not only the build-folder app) exposed a Keychain save failure during automatic local pairing. Local loopback pairing now retains its key only in memory and reacquires it from the local runner each launch. Remote addresses, including Tailscale, still require Keychain. No credential is written to a plain-text fallback. A native regression distinguishes loopback from remote key storage.

## Remaining product gaps, in priority order

1. **Connector onboarding:** real MCP OAuth consent/refresh/revocation, reviewed service presets and isolated local-process servers. Current HTTP MCP support does not inherit Hermes/Grok accounts or make arbitrary Python plugins portable.
2. **Document completion:** richer workbook/document preservation, reliable OCR and rendered inspection, measured against source-grounded outcomes. Instructions alone do not install these capabilities.
3. **Dependable remote use:** physical phone pairing/cellular/reconnect/approval tests, then paid-team APNs/share acceptance, signed distribution and updates. Private hosting exists; managed always-on provisioning and powered-off-laptop equivalence are not proven.
4. **Quality across providers:** repeat the existing checked workflows over representative providers and interruption scenarios, with whole-job usage and failure rates. Two successful new synthetic tasks do not establish general superiority.

User testing instructions: [iPhone preview checklist](../ios/README.md#phone-test-checklist). Connector and plugin boundary: [compatibility matrix](PLUGIN_INTEROPERABILITY.md).
