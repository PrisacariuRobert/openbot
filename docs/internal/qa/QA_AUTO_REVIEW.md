# QA: Auto Review rules

Working-tree increment: owner-authored rules decides when OpenBot stops
matching work for review or skips one of its own review prompts, Grok Bot
"Auto Review"-style. This version is fully deterministic — rule matching, not a
model-based reviewer. The model-based variant remains an explicit future
upgrade.

## What was built

- `src/server/auto-review.ts`: case-insensitive pattern matching (`*` any run,
  `?` any character; plain patterns are substrings), scoped decisions for
  commands, task prompts and browser actions, and Require-Approval precedence —
  when both kinds match, Require-Approval wins; specificity (longer pattern)
  decides within the same effect.
- Storage and owner API: `auto_review_rules` table, `GET/POST/DELETE
  /api/auto-review`, and an editor in the studio Settings drawer.
- Enforcement points: task creation (`/api/messages`), event-triggered
  routines, `code_run` and `isolated_bash` commands, and browser click/type.

## Guarantee shape

- Require-Approval works by making approval unavoidable where the base
  detector would have let the action through.
- Always-Allow exists only for commands executed in the owner's isolated
  Docker computer: it can skip OpenBot's generic terminal-review prompts, and
  save rules may never match deleting/system-changing prefixes (`rm`, `sudo`,
  `chmod`…). It does not waive a detector reason that remains matched by a
  different rule, and it cannot touch browser actions, prompts or connected-app
  writes.
- Unmatched prompts and commands behave exactly as before.

## Evidence

- `auto-review.test.ts` (6 tests): pattern semantics and case-insensitivity;
  Require-Approval beating Always-Allow on the same command; specificity
  (longest pattern decides within an effect); command waiving with the
  detector standing firm on unmatched commands; prompts forced into review
  while never silently waived by an allow rule; browser rules only adding
  review and command-scope rules having no effect on browser decisions.
- Live local run: a `require_approval` prompt rule sent "Please reconcile the
  ledger for September" into `awaiting_approval` with the rule's reason
  attached to the run and approval; an unrelated prompt queued normally; an
  always-allow `"git status*"` rule saved; an `always_allow "rm"` rule was
  refused with guidance; CRUD round-tripped and cleanup left zero rules.

## Remaining limits

- Patterns are text matching. They can contain contrived commands; Always-Allow
  remains limited to isolated commands for this reason.
- No per-bot or per-project scoping yet; rules are owner-wide.
- The model-based pre-review (Grok Bot's Auto Review conversation) is not
  implemented; no claim of model-judged equivalency.
