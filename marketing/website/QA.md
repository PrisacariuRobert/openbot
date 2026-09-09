# Website review — 8 September 2026

This is a private marketing preview, not an application release or an end-to-end product certification.

## Current revision: connected product flow

- Replaced the conversation-only film with a 60-second continuous walkthrough.
  The cursor selects sidebar conversations, opens browser tabs, reviews an
  approval, opens the returned file, saves a routine, changes Pixel’s model and
  creates Iris. Sidebar selection, previews, header, composer and panels respond
  to the same timeline. It is staged UI animation, not a real-account recording.
- Preserved the original score, vector mascots and all other website sections.
  Captions describe the new actions and the video URL has a fresh cache key.
- Export is 1920 × 1080 H.264 at 60 fps, 3,600 frames, stereo AAC and 60.053
  seconds. Full-file decode passes. SHA-256:
  `b484b652727dcaf62dc0e0a18e2b7df3e1c50f23ef83ae520c43fd4ad38adf1a`.
- The source timeline passes 34 synchronized-click/state checks. Key cursor
  coordinates were checked against the actual rendered controls in Studio.
- Site access was rechecked: owner-only, no external viewers or allowed groups.
  There is still no app release or public announcement.
- Desktop playback reached the end at 60.053 seconds without a media error.
  The phone player was replayed at 390 × 844; its settled 322 × 181 rectangle
  fits inside the 358px dialog, and page width stays 390px. The new source URL
  and 1920 × 1080 video metadata were confirmed in the browser.
- Site lint, TypeScript and production build pass. The built film hash matches
  the final master above.

The following sections are historical checks of earlier revisions.

## Earlier revision: the real application layout

- Replaced the invented conversation and approval artwork with captures from `src/studio/Studio.tsx` and its actual components.
- Subscriptions, API/local connections, model assignment and Settings have selectable previews. Phone previews use the real 390px responsive interface, not a miniature desktop screenshot.
- Captures use a disposable fixture, synthetic messages and sample model choices. No real host, private accounts or model calls are involved.
- The app passed 62 route/theme/viewport/draft-preservation checks. The capture harness additionally checks stable settings widths, compact provider rows, back navigation and mobile containment.
- The 72-second film now uses these captured app surfaces, with a continuous camera, masked screen handoffs and animated mascot accents. Older film reviews below do not certify this revision.
- Verified desktop (1440px) and phone (390px) preview tabs and image sources, without horizontal overflow. The phone uses its own capture rather than a crop of desktop.
- Checked film playback advancing beyond 61 seconds without a media error. Export: H.264/AAC, 1920×1080, 60 fps, 72.043 seconds, 22,036,247 bytes; full decode passes. SHA-256: `c915db90628ce38835237d83159e44114741c3d887e67766312104d1d1f24918`.

## Latest change: bring-your-own-AI

- Added a hero link and dedicated section explaining supported subscriptions, API keys and compatible local models. Provider selection and model assignment per teammate are explicit; no claim of universal subscription support or included AI allowance was added.
- Checked the new section at 1440×1000 and 390×844: three desktop columns become one phone column, with no horizontal page overflow.
- The previous product-frame fix is preserved: desktop frames 1141×705 / 770×476; phone frames 456×282 / 346×214. The wider mobile hero remains intentionally cropped inside its stage.
- Workflow tabs still change the conversation; custom name and color still update the mascot preview.
- Expanded film and descriptive text track to 72 seconds, including the provider-choice moment and revised conversation transitions. Prior reviews below refer to earlier exports, not the current asset.

## Verified locally

- Lint, TypeScript and production build pass.
- npm audit reports zero known vulnerabilities for the installed dependency tree.
- Desktop (1440 × 1000) and phone (390 × 844) layouts have no horizontal page overflow.
- Workflow tabs change the example conversation.
- Teammate preview supports an editable name, six shapes and six colors. Desktop and phone changes were exercised.
- The film dialog opens and closes, and the video plays without a media error on the phone layout. Its metadata reports 1920 × 1080 and approximately 64 seconds; a descriptive text track is provided.
- “Get OpenBot” reaches the release-status section. It does not pretend a downloadable application is already available.
- Source links point to the real repository. No credentials, real conversations or account information are used in the product illustrations.

## Release boundaries

- Teammate customization here is an interactive illustration; it does not create a teammate in the installed app.
- Product scenes are fictional demonstrations, not proof of completed real-account workflows.
- App downloads and public announcement remain deferred until the application is ready.
- Film, branding and public copy still need the owner's final creative approval before a public launch.

## Spacing and film update — 8 September 2026

- Fixed the scaled product illustration retaining an unscaled 890px normal-flow height. The canvas is now absolutely positioned inside its aspect-ratio frame, so no blank card remains below it.
- At 1440px viewport width, the two visible preview frames measure 1141×705 and 770×476; at 390px, they measure 456×282 (intentional wide hero) and 346×214. Heights match the 1440:890 artwork ratio, rounded to pixels.
- Page scroll width matches viewport width at both test sizes. Workflow tabs still switch normally.
- The film player loads the refined 64.043-second export without a media error. Asset SHA-256: `803d720f48637fb5228de6416a3d00f30d12e0d57acb19d7266e85c19886a62b`. Its URL has a new version key so visitors do not reuse the previous cached film.
- Updated the closing text track to include the source-project invitation.
- Lint, TypeScript and production build pass. The owner approved updating the existing private site, not changing its audience or releasing the app.
# Animated story update — 8 September 2026

This section describes the preceding film; the connected-flow revision above is current.

- Removed the four-way Settings screenshot tour (subscriptions, API/local, models, Settings) and the full permissions screenshot. The actual app controls are unchanged.
- Kept real conversation examples and editable mascot previews. The provider section now communicates choice in one compact illustration.
- Replaced the 72-second screen-tour video with the 60-second animated story, restored the moving window and character transitions, and synchronized the text track. No voiceover.
- Current asset: H.264, 1920×1080, 60 fps, 3,600 frames; AAC stereo; 60.053 seconds; full-file decode passed. SHA-256 `1030a95cebad6421cb40b1c0cde062eb670637648e1b72a2f5674ebbc9d84cb8`.
- Phone (390×844) and desktop (1440×1000) views have no horizontal page overflow. The removed Settings tour is absent in the rendered page.
- Browser player loaded the replacement with the correct duration/dimensions and progressed through playback without a media error. Review samples include the opening, browser work, handoff, approval, delivery, AI choice and closing.
- Site TypeScript, lint and production build passed. No app release or public announcement was made; the site audience remains owner-private.
