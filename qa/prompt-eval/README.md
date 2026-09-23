# Live teammate prompt eval

`scripts/prompt-eval.ts` starts a throwaway OpenBot on a fresh data folder, sends six fixed requests to one teammate through the real API and model runtime, and checks the outcome (greeting, per-currency CSV totals, weekday routine, saved preference, no false "email sent" claim, saved 5-item checklist). It records time, model steps and context tokens (input + cache reads, summed over steps).

```sh
node --import tsx scripts/prompt-eval.ts --repeat 2 --label my-change
```

It uses the owner's own OpenCode model access and never touches the real studio. Run the baseline from a clean checkout of the base commit so a server started mid-run cannot pick up edited code.

Context per model step (input + cache reads ÷ steps) is the stable comparison: the number of steps a model takes varies widely between attempts, especially on Muse Spark.

| Label | Code | Model | Passed | Context per step (median) | Median time | Instructions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `baseline` | 42c27e4 | deepseek-v4.1-flash | 12/12 | 13,535 | 20.6s | 25,204 chars |
| `slim-v1` | ed8c31f capability-gated rules | deepseek-v4.1-flash | 12/12 | 11,370 | 16.6s | 14,217 chars |
| `muse-baseline` | 42c27e4 | muse-spark-1.3-contributor | 12/12 | 13,298 | 35.6s | 25,204 chars |
| `muse-slim-v1` | ed8c31f | muse-spark-1.3-contributor | 12/12 | 11,283 | 36.1s | 14,217 chars |
| `muse-slim-v2` | 9eeeae5 teammate system prompt, trimmed per-message text | muse-spark-1.3-contributor | 12/12 | **9,183** | 31.6s | 13,999 chars |

| `muse-current` | 014c57d all fixes to date, 8 cases | muse-spark-1.3-contributor | **16/16** | — | 29.6s | 14,106 chars |

The 8-case set adds `teammate-help` (ask Scout; exactly one consultation; answer relayed) and `learn-skill` (/learn ends in a skill proposal waiting for review). Before this session's fixes, `learn-skill` was 0/2 and `teammate-help` took ~100s with repeated asks.

A one-step "hi" costs 12,410 tokens at baseline and 8,140 at 9eeeae5 on Muse Spark. `muse-slim-v1` and `muse-slim-v2` overlapped in time, so their timings are not comparable; token counts are. The default model is `opencode-go/muse-spark-1.3-contributor`. The free-tier `opencode/…-free` models return 403 for OpenBot's restricted tool configuration and cannot be evaluated.

## Fixed prompt budget next to Hermes (offline, 23 Sep 2026)

What a model receives before the owner's first word, in a fresh chat with the default setup:

| | OpenBot (9eeeae5, fresh teammate) | Hermes Agent CLI (`hermes prompt-size`) |
| :--- | :--- | :--- |
| System prompt + instructions | 14,280 chars (teammate prompt + AGENTS.md) | 21,935 chars system prompt + 5,881 skills index + 616 user profile |
| Per-message wrapper | 3,631 chars | — |
| Tools | 24 enabled tools | 20 tools, 35,772 bytes of JSON schema |
| Measured context for "hi" | 8,140 tokens (Muse Spark, one step) | not measured live |

Limits: Hermes was measured with its own `prompt-size` command on this Mac's install (41 installed skills feed its skills index; model gpt-5.6-sol), OpenBot with a live one-step run on Muse Spark. Different tokenizers and tool sets, and no live Hermes run on the same model, so this compares fixed overhead only — not answer quality, speed, or cost.
