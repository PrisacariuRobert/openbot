# Hero jobs

The three jobs people come back for (task J1). Each file here is one job's synthetic data, its written constraints, its time and token budget, and what a correct result must and mustn't contain. `src/server/hero-jobs.ts` loads them, holds each job's request (`heroJobPrompt`) and decides whether a run got it right (`checkHeroJob`). The reliability harness (J2) serves this data to the Mac tools and runs each job against real and scripted models.

All data is made up. Every address uses a reserved `.example` domain, and a test fails if one doesn't.

| Job | What it does | The trap |
| :--- | :--- | :--- |
| `morning-brief.json` | Today's calendar in order plus early tomorrow, at most five mails that need the owner, reminders due or overdue | Newsletters, automatic notifications, a completed reminder, yesterday's and next week's events |
| `waiting-on-me.json` | Mail and Messages threads that need an answer; a Mail draft for each mail; nothing sent | While the job runs, Tom writes that his question is settled: a teammate that drafts from its first read drafts a reply nobody needs |
| `meeting-prep.json` | The next meeting, the attendees' recent mail and the owner's note, on one page | While the job runs, the meeting moves from 15:00 to 16:00; another person's mail and an unrelated note are noise |

Receipts to a spreadsheet (`npm run benchmark:expenses`) and research with sources checked by a second teammate already have benchmarks.

## How each job avoids the usual failures

Long-task benchmarks keep finding the same three failures: agents lose track of constraints, miss information that arrives mid-task, and skip verification ([OSWorld 2.0](https://osworld-v2.xlang.ai/)). So:

- **The constraints travel with the job.** They're written into the request itself (`heroJobPrompt`, and `morningBriefPrompt` for the routine), not left to a system prompt the model may weigh less. Each fixture lists the same constraints in `constraints`.
- **It looks again just before acting.** The waiting-on-me request re-reads each thread before saving its draft; meeting prep re-checks the meeting's time before writing. The fixtures' `afterFirstRead` holds what arrives mid-task, so only a run that looks again passes.
- **It checks its own result.** Each request ends with "Before you answer, check: …", and the checks here then decide independently.

## What a check looks at

- `inOrder`: titles with their times, in this order. A time matches however it's written ("15:00", "15.00", "3 pm").
- `mentions` and `neverMentions`: what must and mustn't appear.
- `maxWords`: the job's length limit.
- `sources`: each source must be named, so the owner knows where things came from.
- `writes`: the only write tools allowed and, for Mail drafts, exactly whom they're to. Tools that send are never allowed.
- `neverClaims`: phrases that would claim something was sent, added or created.
- `budget`: seconds, model steps and context tokens for one run.

The checks are deliberately literal: a run passes only if a person reading the answer would find the same facts. When a model words something correctly in a way a check doesn't recognise, fix the check and say so in the commit.
