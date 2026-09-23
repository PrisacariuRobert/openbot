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

A one-step "hi" costs 12,410 tokens at baseline and 8,140 at 9eeeae5 on Muse Spark. `muse-slim-v1` and `muse-slim-v2` overlapped in time, so their timings are not comparable; token counts are. The default model is `opencode-go/muse-spark-1.3-contributor`. The free-tier `opencode/…-free` models return 403 for OpenBot's restricted tool configuration and cannot be evaluated.
