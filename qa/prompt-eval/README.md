# Live teammate prompt eval

`scripts/prompt-eval.ts` starts a throwaway Sidemates on a fresh data folder, sends six fixed requests to one teammate through the real API and model runtime, and checks the outcome (greeting, per-currency CSV totals, weekday routine, saved preference, no false "email sent" claim, saved 5-item checklist). It records time, model steps and context tokens (input + cache reads, summed over steps).

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

| `muse-final` | ef1c4db, 11 cases incl. browser, decline and Hermes import | muse-spark-1.3-contributor | **22/22** | — | 20.6s | 14,106 chars |

The 8-case set adds `teammate-help` (ask Scout; exactly one consultation; answer relayed) and `learn-skill` (/learn ends in a skill proposal waiting for review). Before this session's fixes, `learn-skill` was 0/2 and `teammate-help` took ~100s with repeated asks.

A one-step "hi" costs 12,410 tokens at baseline and 8,140 at 9eeeae5 on Muse Spark. `muse-slim-v1` and `muse-slim-v2` overlapped in time, so their timings are not comparable; token counts are. The default model is `opencode-go/muse-spark-1.3-contributor`. The free-tier `opencode/…-free` models return 403 for Sidemates' restricted tool configuration and cannot be evaluated.

## Fixed prompt budget next to Hermes (offline, 23 Sep 2026)

What a model receives before the owner's first word, in a fresh chat with the default setup:

| | Sidemates (9eeeae5, fresh teammate) | Hermes Agent CLI (`hermes prompt-size`) |
| :--- | :--- | :--- |
| System prompt + instructions | 14,280 chars (teammate prompt + AGENTS.md) | 21,935 chars system prompt + 5,881 skills index + 616 user profile |
| Per-message wrapper | 3,631 chars | — |
| Tools | 24 enabled tools | 20 tools, 35,772 bytes of JSON schema |
| Measured context for "hi" | 8,140 tokens (Muse Spark, one step) | not measured live |

Limits: Hermes was measured with its own `prompt-size` command on this Mac's install (41 installed skills feed its skills index; model gpt-5.6-sol), Sidemates with a live one-step run on Muse Spark. Different tokenizers and tool sets, and no live Hermes run on the same model, so this compares fixed overhead only — not answer quality, speed, or cost.

## What "hi" sends, measured offline (task A7, 8 October 2026)

`scripts/prompt-size.ts` starts a throwaway Sidemates with a stand-in model on loopback, sends "hi" through the real API and OpenCode, and measures the first model request byte for byte: the system text, the per-message wrapper and the tool definitions. No model account or key is involved, so anyone can run it:

```sh
node --import tsx scripts/prompt-size.ts --label my-change
```

Tokens are estimated from characters at 4.37 characters per token. That ratio comes from the same request measured at 9eeeae5 (35,540 characters, `size-at-9eeeae5.json`) against that commit's live greeting (8,140 tokens on Muse Spark). It is an estimate for comparing changes; the live eval stays the record.

| Profile | Before A7 (`size-baseline.json`) | After A7 (`size-a7.json`) |
| :--- | :--- | :--- |
| The eval's greeting: Nova, browser off, every tool group | 38,330 chars, 27 tools ≈ 8,771 tokens | 22,620 chars, 27 tools ≈ 5,176 tokens (−41%) |
| Nova with web on, every tool group | 48,622 chars, 37 tools ≈ 11,126 tokens | 31,105 chars, 37 tools ≈ 7,118 tokens (−36%) |
| The starter writer's groups (documents, teamwork) | — | 18,863 chars, 21 tools ≈ 4,316 tokens |
| Core tools only | — | 12,014 chars, 14 tools ≈ 2,749 tokens |

What changed:
- The saved instructions (AGENTS.md) went from 15,042 to about 3,800 characters. The rules and the tool descriptions most teammates have now live in versioned files in `src/server/prompts/`, and nothing is said twice: completion and style rules travel with each request, capability rules sit in the instructions, and tool advice sits in each tool's description.
- Which apps and websites a teammate can reach is sent once per request; with nothing connected and the browser off it is one line.
- A teammate's own greeting is no longer resent as "conversation continuity" when the owner hasn't written yet.
- Teammates have optional tool groups (documents and spreadsheets, routines and reminders, working with teammates). The starter researcher and writer get documents and teamwork; the first teammate keeps every group. The owner changes them under Advanced Teammate Options, and a group that's off is refused by the server too.
- Web pages already reach the model as compact text (one line per visible element, at most 250 elements and 30,000 characters), not HTML or screenshots, so A7 leaves that as it is.

The 3,000-token target is met for a teammate with only the core tools. A teammate with every group stays near 5,200 tokens, mostly the tool definitions: OpenCode adds a 57-character JSON-schema line to each one, and task, routine and spreadsheet tools have detailed parameters.

The live eval still has to be run by the owner, who has the OpenCode Go key: `node --import tsx scripts/prompt-eval.ts --repeat 2 --label a7`. OpenCode's free models refuse to run a Sidemates teammate ("restricted to use inside OpenCode", checked 8 October 2026), so it can't run without that key.
