# Reliability

How often Sidemates gets the [hero jobs](../qa/hero-jobs/README.md) right, by model. Every run uses the same synthetic Mac data, so nothing personal is involved, and is checked by the same rules: the right facts, nothing that doesn't belong, sources named, nothing sent, and drafts only for people still waiting. The bar before a release ships is 9 of 10 runs for each job on each kind of AI.

Live runs use the owner's own model access and are started by hand (`scripts/hero-jobs.ts --model …`). CI runs the same jobs against a scripted model on every push; that checks Sidemates' plumbing, not any model, so it isn't listed here.

**No live runs yet.** This page fills in when the owner runs the jobs against real models; until then, Sidemates makes no claim about how often they succeed.

