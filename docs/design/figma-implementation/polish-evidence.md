# Markdown and visual polish — 19 September 2026

Follow-up to the user's screenshots of raw Markdown tables, inappropriate pink cards, and oversized connection disclosures.

- Enabled GFM in document previews, review findings, task summaries, skill instructions and recipe examples. Documents now have heading hierarchy, paragraph/list spacing, scrollable tables and code blocks, and checklist formatting. Raw HTML remains disabled in the preview.
- Replaced fixed Pixel-colored surfaces with mascot-derived tints for teammate notes, AI introduction, teammate editor and authored result cards. Generic Projects, phone and workflow surfaces are neutral. Missing message-author color falls back to neutral, not pink.
- Made connection disclosures compact, aligned statuses and actions, removed doubled card padding, and tightened project empty states. Corrected the GitHub action's icon contrast. Shared settings refinements apply across workspace pages and narrow layouts.
- Added actual rendered table/checklist assertions and a green Scout card-color assertion to the packaged Electron acceptance harness. The fixture document includes a usage table, checklist and code block.

Evidence uses an isolated host and synthetic records. No provider test, account action or model run is dispatched by the visual checks. Physical phones remain outside this local acceptance.

Validation: production TypeScript/Vite build, acceptance TypeScript check, unsigned Apple-silicon package, and final packaged Electron harness all passed. The harness covered all 14 workspace pages at desktop/390px/320px, Markdown table and checklist rendering, Scout's green tint, drafts, downloads, memory saving, import cancellation, navigation and zero uncaught renderer errors. Screenshots under `qa/figma-implementation/actual/` and the contact sheet were refreshed. Logs: `polish-build-final.log`, `polish-package-final.log`, `polish-electron-final.log`. The full 857-test suite was not rerun for this presentation-only follow-up; its preceding result remains historical.

One final attempt began before packaging had completed and could not find the embedded Node binary. A subsequent cold launch exceeded the harness's old 15-second allowance on the busy host. After packaging completed, the harness used the same 90-second startup allowance as the desktop shell; all final checks passed without changes to interaction assertions.
