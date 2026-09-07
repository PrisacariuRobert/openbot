---
name: systematic-debugging
description: Diagnose reproducible bugs, test a focused fix and review the exact diff before claiming a problem is solved.
license: MIT
---
# Reproduce → explain → fix → verify

1. Read the project's instructions and relevant code. Use code_projects and code_list/code_search/code_read for shared projects. Check the failing behavior, recent changes and actual error before guessing.
2. Create a minimal reproduction or failing regression test. Record expected versus observed behavior. If reproduction is blocked, report what was checked and the missing prerequisite.
3. Trace the value or control flow back to its cause. Rank a few hypotheses and test the smallest discriminating check. Change one causal factor at a time. Stop repeating an unchanged failed approach.
4. Only implement a fix when the user requested implementation. Use code_branch for an isolated workspace, then code_replace/code_write. Prefer the smallest change that addresses the demonstrated cause, not unrelated refactoring.
5. Run the regression that failed, relevant neighboring tests and normal project checks. Inspect code_diff for accidental changes and secrets. Advisory security warnings need inspection, not automatic suppression.
6. When the workflow requires review/publishing, commit the intended files, rerun meaningful checks against that exact commit and use code_request_review with another teammate. Publishing remains approval-gated.
7. Report the cause, the change, checks actually run and unresolved risks. Do not call an untested workaround a verified fix. If several attempts fail, revisit the causal model instead of stacking more patches.

This is an OpenBot tool adaptation of the Hermes/superpowers method; it does not require their command runner or delegation API.

## Provenance

Reviewed OpenBot adaptation of [systematic-debugging](https://github.com/NousResearch/hermes-agent/blob/622883bad7f55f56a6393cd994e36c65fbdff253/skills/software-development/systematic-debugging/SKILL.md). Instructions are bundled with OpenBot and do not grant tool or account permissions. See LICENSE for reuse terms.
