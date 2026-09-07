# Page-watch verification

0.35.0 working tree · 5 September 2026. Not a release, deployment or parity claim.

- 15 focused assertions/subtests: normalized/selected HTML, RSS/Atom clocks, unsafe addresses, size limits, bounded diffs, baseline/unchanged zero dispatch, changes/reversions, monitor restart, transactional rollback, failed reads, pause/edit/delete in flight, leadership loss, shutdown and corruption.
- Full `npm run verify`: release/native source checks, TypeScript, acceptance typecheck and production build passed. Final suite includes 271 tests after the chat-routing regression case.
- Xcode beta: 18 native Mac and 11 iPhone simulator unit tests passed, including the new watch-state/config decoding checks. This establishes build/unit compatibility, not physical-device proof.
- Opt-in `OPENBOT_BENCHMARK_MODEL=opencode/muse-spark-1.3-contributor-free npm run benchmark:page-watch`: production HTTP API, real public HTTPS read, SQLite baseline, host-process restart, real OpenCode/Spark execution and downloadable report. Baseline/unchanged checks created zero runs; one changed check created one job; a subsequent unchanged check created no duplicate.
- Live outcome: 38.9 seconds including checking/waiting; 16,133 input tokens, 1,167 output tokens, nine model steps. This is provider-reported usage, not a dollar estimate or competitor comparison.
- Independent artifact check: `watch-report.md` names the removed Monday 10:00 line, cites `https://example.com/`, includes observation times and explicitly identifies the line as synthetic. No personal data or external writes.
- A second live Spark case with `OPENBOT_BENCHMARK_CREATE_ONLY=1` created an hourly **paused** page watch through natural chat and the real tool adapter. No page was fetched and no monitoring job ran. 20.1 seconds, 14,446 input tokens, 706 output tokens, six model steps. The shortcut parser was fixed so it cannot drop conditions or paused/draft instructions into an enabled unconditional schedule.

## Reproduction and limits

The script fetches example.com, saves/checks its real baseline, stops the disposable host, inserts one **synthetic line into that local baseline only**, restarts and checks again. It never edits the website or claims it published a workshop announcement. Model use is opt-in, bounded to three minutes/12 steps/35,000 tokens; usage reporting can arrive late. The owner's studio is not targeted.

Static text only: no logged-in browser, JavaScript, screenshots, visual/link-only differences, social DMs or semantic truth checking. RSS/Atom entries must fit the full bounded comparison; oversized sources fail explicitly rather than silently truncating. Changes between polls may not be observed. Polling requires an online runner. Changed-content work can use models and require ordinary action approvals.

## Final UI and regression pass

- Web editor inspected at desktop and 390px widths; document width 390px, form scroll/client width both 344px. URL/section/interval edits and pause saved through the real API. Clearing a section with normal keyboard input persisted. Help text spacing was tightened after visual review.
- Evidence download returned HTTP 200 as inert `text/plain` and contained the independently checked synthetic removed line.
- Native Mac preview installed with an intact backup, reconnected to the existing idle studio, and visually confirmed the Page changes form. No watch was created in the owner's data. The rebuilt bundle passed a system-only-PATH cold-start test with isolated data, HTTP health/UI/API checks and clean shutdown with an open event stream.
- Scheduled polling has a minimum 15-minute interval; the owner's explicit Check now can run sooner. Physical iPhone/cellular and public relay deployment were not tested here.
