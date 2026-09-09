# Connected product flow — 8 September 2026

The current `OpenBot-A-Little-More-Possible` composition is an uninterrupted,
60-second animated app walkthrough. It replaces the previous film’s fixed
sidebar and conversation-only changes. Earlier scene sources and MP4 exports
are preserved.

## What changes on screen

1. Select Nova in the sidebar, type a request and click Send.
2. Open the computer panel, switch browser tabs, read notes and close the panel.
3. Open the shared studio conversation, then select Pixel. Sidebar previews and
   the header reflect the active conversation and work status.
4. Open the tool proposal, approve its exact scope, then see the build complete.
5. Click the returned file and read its preview.
6. Open Workspace → Settings → Routines. Create a check-in, choose weekdays,
   save it and see it in the list and Scout’s sidebar preview.
7. Open Settings → Your AI, choose Pixel’s model and save it. The film retains
   the supported-provider and plan qualification.
8. Use the sidebar plus to create Iris: name, role, character and AI connection.
   Iris joins the sidebar and the film ends with a new conversation.

Navigation follows the current `src/studio/Studio.tsx` Workspace, Settings,
conversation and drawer routes. The creator fields follow
`src/studio/CreateTeammate.tsx`. Mascots and brand marks reuse existing film
assets derived from the product. The render is staged fictional content, not a
recording of real-account execution or proof of feature/release readiness.

## Implementation and review

- `src/flow/timeline.ts` drives 34 visible clicks and their resulting UI state.
- The cursor lives inside the same camera rig as the app, keeping its tip
  attached to the controls during pans and zooms.
- Thread selection, previews, header, composer, drawers, menus and saved results
  persist together. Only task progress advances without a user action.
- Original instrumental score, no voiceover, no stock app screenshots and no
  Apple music or footage. The existing 60-second score is unchanged.
- Preview export and live Studio playback were reviewed. Click targets were
  measured against the rendered browser DOM for browser tabs, approval,
  artifact preview, navigation, repeat/model menus and teammate creation.
- `scripts/check-flow-timeline.mjs` checks click ordering, state changes,
  approval gating, model/routine persistence, creation and the exact duration.
- `scripts/check-flow-export.mjs` checks the final H.264 dimensions/frame rate,
  stereo audio, duration, frame count, full decode and content hash.

Final master: `out/openbot-connected-flow.mp4`. Earlier half-resolution review:
`out/openbot-flow-review.mp4`. The previous master remains
`out/openbot-motion-story.mp4` for comparison.

This revision still needs the owner’s creative approval. No release or public
social announcement is included.

## Final export

- H.264, 1920 × 1080, 60 fps, 3,600 frames, AAC stereo.
- Duration 60.053 seconds; full-file decode passes.
- 21,638,749 bytes; SHA-256
  `b484b652727dcaf62dc0e0a18e2b7df3e1c50f23ef83ae520c43fd4ad38adf1a`.
- TypeScript, focused ESLint and the 34-click timeline checks pass.
