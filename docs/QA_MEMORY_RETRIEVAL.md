# QA: Memory retrieval that ranks instead of filters

Working-tree increment closes part of the persistent-context gap: saved memory
and past conversation are now retrieved by relevance instead of a brittle
all-words filter, with consolidation pressure that respects owner control.

## What was built

- `src/server/memory-retrieval.ts`: deterministic local ranking (stopword-free
  tokenisation, rarity weighting, phrase bonus, deterministic ordering),
  memory ranking, and a near-duplicate detector. No model, no embeddings, no
  network.
- `searchMemories` returns ranked notes (limit 18) instead of requiring every
  query word to literally appear.
- `relatedHistory` seeds up to three bounded background snippets into a task
  prompt — this bot's own answers anywhere plus owner messages in the task's
  thread, from the most recent 400 qualifying bodies (≥60 characters).
- `remember` for task sources refuses content that nearly duplicates an owner
  note under a different name, telling the model to ask the owner to
  consolidate. Owner notes and protected preferences are unchanged; nothing is
  merged or rewritten automatically.

## Evidence

- `memory-retrieval.test.ts` (6 tests): rarity weighting beats filler repetition,
  a partial match can outrank a sparser one, irrelevant notes are dropped with
  deterministic ordering (score then position), junk queries return nothing,
  phrase matches beat scattered terms, and near-duplicate detection proposes —
  never performs — consolidation.
- `private-memory.test.ts` additions: ranked `memory_search` on a partial match
  with empty results for unrelated/junk queries; `relatedHistory` picks up the
  bot's answer plus the thread's owner message while excluding another bot's
  unrelated message; a near-duplicate task save is refused with consolidation
  guidance and nothing is written; an unrelated task note saves normally.
- Typecheck passes; full unit suite 446/447 (one pre-existing environment
  failure: ripgrep missing on this Mac).

## Remaining limits

- Keyword-ranked retrieval is not semantic search: paraphrases without shared
  terms will not match. An owner-chosen embeddings connection is a future
  upgrade, kept explicit because model access is always owner-provided.
- Prompt seeding is bounded (three snippets, 240 characters each) and labeled
  as background; the model must still verify against current state.
- The 30-day task-note expiry and owner protection boundaries are unchanged;
  no embedding index is stored, so nothing new can leak or expire incorrectly.
