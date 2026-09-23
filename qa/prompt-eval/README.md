# Live teammate prompt eval

`scripts/prompt-eval.ts` starts a throwaway OpenBot on a fresh data folder, sends six fixed requests to one teammate through the real API and model runtime, and checks the outcome (greeting, per-currency CSV totals, weekday routine, saved preference, no false "email sent" claim, saved 5-item checklist). It records time, model steps and context tokens (input + cache reads, summed over steps).

```sh
node --import tsx scripts/prompt-eval.ts --repeat 2 --label my-change
```

It uses the owner's own OpenCode model access and never touches the real studio. Run the baseline from a clean checkout of the base commit so a server started mid-run cannot pick up edited code.

| Label | Commit | Model | Passed | Median time | Median context | Instructions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `baseline` | 42c27e4 | opencode-go/deepseek-v4.1-flash | 12/12 | 20.6s | 54,147 | 25,204 chars |
| `slim-v1` | capability-gated rules | opencode-go/deepseek-v4.1-flash | 12/12 | 16.6s | 33,293 | 14,217 chars |

Two attempts per case: timings are noisy; context size is the stable signal.
