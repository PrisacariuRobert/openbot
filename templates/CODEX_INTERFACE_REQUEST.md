# Interface request to Codex — backend/computer-use slice (no blocking request)

This is not authorization for OpenCode to edit UI or create a new design.
Codex owns the existing interface. No blocking client change is required by
this backend slice: all new capabilities are gated behind existing contracts
and remain unavailable to normal users until a reviewed integration exists.

Related backend task and owner: backend/computer-use-gaps-20260919 (OpenCode).
Backend baseline/candidate SHA: base origin/main 4a01381c4c79320cd5674aecc8aa8f3904922b9f.
Existing Codex client SHA/version: same base (Electron unified client, #72).
Read-only client paths inspected (not edited): src/studio/*, desktop/*,
public/*, index.html, studio.html, src/shared/* (contract only).

## Missing contract or consumer behavior

None blocking. This slice preserves every current consumer schema, state
meaning, action review input, request ID, event ordering, error, artifact
and progress identity. New backend reason codes (AMBIGUOUS_TARGET,
STALE_OBSERVATION, VISION_UNAVAILABLE, SENSITIVE_REGION, NEEDS_SIGN_IN,
USER_TAKEOVER, PERMISSION_DENIED, OUTCOME_UNCERTAIN, BUDGET_REACHED) are
returned through existing host error channels, never as new required UI
states. Unknown/uncertain states are never suppressed to fake success.

## Proposed contract (advisory, future — NOT required now)

If Robert later wants the client to surface permission-bounded native mode
(B05) distinctly from ordinary browser use, the backend proposes these
backward-compatible optional additions (default: absent = current behavior):

Current: ComputerStatus { botId, container, browser, currentUrl, title, screenshot, updatedAt }.
Proposed optional additions: nativePermissions?: Array<{ permission: "screen-capture" | "accessibility" | "file-dialog"; granted: boolean }>;
nativeMode?: { enabled: boolean; taskId: string; allowedApps: string[] } | null.

Synthetic example: { "botId": "bot-pixel", "browser": "ready", "nativePermissions": [{ "permission": "screen-capture", "granted": false }], "nativeMode": null }.
Old/current client behavior: ignores unknown optional fields; native tasks
stay gated with the existing handoff message until Codex ships a consumer.
Capability negotiation/feature flag: native mode default off; no new enum
sent unless the backend explicitly includes the optional block.
Safe outcome while client support is unavailable: native file/dialog tasks
return a typed owner-setup/handoff state through the current error channel.
Independent backend work that can continue: all fixture/transport/journal
tests proceed unchanged.

## Reproduction and acceptance

Disposable setup: fresh worktree at origin/main, isolated OPENBOT_DATA_DIR,
synthetic secrets only. Exact test: npx tsx --test
src/server/computer-use-gaps.test.ts src/server/message-admission-replay.test.ts.
Expected: all pass; protected-source diff empty; current client regression
suite unchanged. Integration-ready backend commit: branch
backend/computer-use-gaps-20260919 (no merge without owner approval).

Codex/owner acceptance: NOT_GRANTED_BY_THIS_TEMPLATE
