# A little more possible — animated product story

**Current revision:** [Connected product flow](FLOW_REVIEW.md). The active
composition now uses `src/flow/` and `out/openbot-connected-flow.mp4`, with
visible navigation throughout the app. The notes below describe preserved
earlier directions, not the current master.

Current 60-second, 1920×1080, 60 fps product film. No voiceover. Uses the original OpenBot instrumental score, not Apple music or footage. Earlier exports remain available for comparison, including the rejected screen-tour direction.

The active film animates the Studio layout as editable vectors and React layers: conversation, browser side panel, team handoff, approval, files, routine and model choice. It does not cycle through Settings screenshots. Mascot paths are adapted from the product’s `Character.tsx` and `mascot-catalog.ts`. Messages and results are fictional demo content; no personal account data is included. The website retains real app captures for its main conversation examples.

## Story

- 0–6.67s: a character arrives and becomes part of the conversation.
- 6.67–16.67s: shared notes and browser work in the same window.
- 16.67–25s: teammates travel into a shared project review and one answer.
- 25–35s: approve a plan, then build the missing tool.
- 35–45s: receive files and project changes; ask for a regular check-in.
- 45–51.67s: bring subscriptions and choose models, without a setup tutorial.
- 51.67–60s: create a custom character; open-source closing invitation.

The named teammates are examples, not a fixed cast. The custom-character moment shows a name, role, shape and color change.

## Boundaries

This is promotional choreography, not a real-account execution recording or proof of release readiness. It deliberately makes no claim that Chrome cookie import works, that every provider subscription is supported, that all actions are verified, or that away access requires no setup. Download availability stays on the website and remains pending the real beta release.

## Editing

Composition: `OpenBot-A-Little-More-Possible`.

The active timeline is `src/LaunchFilm.tsx`, with animated scenes in `src/launch/`. A consistent 1.2× editorial clock shortens the previous 72-second animated story to 60 seconds while preserving matched camera endpoints. `OpenBot-Screen-Tour-Archive` preserves `src/ActualStudioFilm.tsx` for comparison.

Render the current revision with `npx remotion render src/index.ts OpenBot-A-Little-More-Possible out/openbot-motion-story.mp4 --codec h264 --crf 18 --concurrency 3`. Prepare its score with `node scripts/prepare-motion-score.mjs`. Check the finished export with `node scripts/check-motion-export.mjs`.

The final creative direction is still subject to the owner’s review. This is not an Apple-affiliated production.

### Current export checks

- Project TypeScript and focused ESLint pass. Full-file decode passes; 3,600 frames, 1920×1080 at 60 fps, AAC stereo, 60.053 seconds.
- Original score: measured −14.4 LUFS integrated, −1.5 dBFS true peak after pitch-preserving retiming. No narration or commercial samples.
- Export: 13,564,655 bytes; SHA-256 `1030a95cebad6421cb40b1c0cde062eb670637648e1b72a2f5674ebbc9d84cb8`.
- Reviewed scene samples and browser playback. The website's synchronized description track covers the same 60-second story.

## Historical refinement passes — 8 September 2026

The notes below record earlier revisions. The current scope and export are described above.

The active composition now contains the refinement. The first export remains at `out/openbot-a-little-more-possible.mp4` for comparison. The new render is `out/openbot-a-little-more-possible-refined.mp4`.

- First task appears earlier; the opening camera settles sooner.
- Camera positions match across the browser/team and tool/delivery joins instead of snapping back to a different zoom.
- Three short 18-frame dissolves soften those joins; compensating sequence handles keep the runtime at 3,840 frames / 64 seconds.
- Headlines have a separate lower safe area and slightly quieter typography.
- The approval receives a deliberate pointer action; the new score’s pause occurs at that decision rather than during the routine.
- Custom teammate appearance changes smoothly instead of switching shapes in one frame.
- A legible source-project invitation appears on the final hold. No download or release-availability claim was added.

Generate the separate score with `node scripts/make-pulse-score.mjs --launch`. This preserves the earlier `--studio`, `--demo` and default score outputs. Render the refined export with:

```sh
npx remotion render src/index.ts OpenBot-A-Little-More-Possible out/openbot-a-little-more-possible-refined.mp4 --codec h264 --crf 18 --concurrency 2 --timeout 60000
```

Following the owner's subsequent approval on 8 September, the private website now contains the refined export. Its audience remains owner-private; no public launch was made. The social plan lives in `marketing/ORGANIC_LAUNCH_PLAYBOOK.md`, with conditional post drafts in `marketing/SOCIAL_POSTS.md`.

### Refinement verification

- Focused ESLint and project TypeScript checks passed.
- Full render and full-file FFmpeg decode passed: H.264, 1920×1080, 60 fps, 3,840 picture frames, AAC audio; container duration 64.043 seconds.
- Export size: 13,839,792 bytes. Measured integrated audio loudness −14.5 LUFS; true peak −1.5 dBFS.
- Approval, caption and closing frames were visually inspected. Studio playback was exercised from the start through approximately 62 seconds without a visible error. The exported transition was also inspected.
- SHA-256: `803d720f48637fb5228de6416a3d00f30d12e0d57acb19d7266e85c19886a62b`.
- This is a technically checked revision for creative review, not owner approval or proof of real product execution. No product code, website deployment or social account was changed in this pass.

## Bring-your-own-AI and continuity pass — 8 September 2026

- Added an eight-second product moment: “Bring your subscriptions. Choose your models.” The illustration distinguishes subscription, API and local-model connections and makes model assignment per teammate visible. A legible qualification says supported providers/plans only; their terms and limits apply. It does not claim every subscription or model is supported.
- Replaced all whole-scene dissolves with clipped, 54-frame conversation-body handoffs. The sidebar, composer and window remain in place, and each incoming scene begins at the outgoing camera pose. This removes overlapping copies of the interface.
- Browser inspector opens and closes by changing its actual width, with coordinated conversation padding. Sidebar/header mascot timing continues across scene boundaries.
- The delivery conversation scrolls to reveal the routine request instead of clipping it behind the composer. The routine overlay clears before the next scene.
- The final background moves continuously from light to dark; custom mascot shape, name and palette remain in the film. Neither the film nor the site implies the three example teammates are fixed.
- The separate `--choice` score follows the expanded 72-second timeline and resolves under the closing invitation. Previous audio and video exports remain available; no voiceover or commercial samples were added.

Current export: `out/openbot-a-little-more-possible-choice.mp4`. Earlier comparison exports are unchanged. Public release, app downloads and social publication remain outside this update.
