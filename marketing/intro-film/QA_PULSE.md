# Pulse — no-voice edit

Date: 2026-09-07. Composition: `OpenBot-Pulse-No-Voice`.

## Scope

The owner rejected the 103-second narration-led cut. This is a separate 54-second, 3240-frame, 60 fps film with a new instrumental score and shorter editorial beats. No old narration is referenced by the new composition. The earlier cuts and voice assets are preserved. No app behavior, owner permissions, data, installed app, release status or external publication changed.

The full-product overview remains visible: conversation and team consultation, AI choice, signed-in browser workflow, Mac/apps/files context, presentations/spreadsheets/websites/code, routines, memory/teaching/skills, approved self-extension, sensitive-action review, device continuity and open-source/MCP identity. Self-extension is 4 seconds, not the center of the entire film. Exact chapter times are in the README.

## Provenance and claims

- Motion, fictional product artwork, copy and instrumental are original local source. Mascots remain animated vector shapes, not flattened images.
- Provider marks, font and icons retain the notices in the project README.
- One audio source: `public/audio/openbot-pulse.wav`. No voice model, voice service, commercial song or Apple media is used in this cut.
- Test counts, monetary values, messages, tool files, approvals and devices are staged illustrations. They do not prove execution or away access. Existing `CAPABILITY_REVIEW.md` publication gates still apply; no unfinished badges have been added to the picture.
- Technical checks do not constitute human creative or listening approval.

## Verification

- TypeScript and ESLint: passed.
- Original stereo score generated locally: 54 seconds, 48 kHz; measured -14.6 LUFS integrated, -1.4 dBFS true peak before AAC encoding.
- Studio selected the exact new composition; metadata reported 3240 frames / 60 fps / 1920 × 1080. Runtime error check returned `null`.
- Reviewed one-second samples across the rendered film, plus the shared-answer and self-extension shots in Studio. Revised tight headline spacing, the sign-in backdrop, continuous calendar movement, correct weekday date progression and the memory/teaching/skill choreography; rendered again after those changes.
- `npm run check:pulse`: passed. Checks all twelve scene durations sum to 3240 frames, the new composition references only the instrumental, scene files cannot introduce other media/audio or remote assets, and the export is 1080p60 with one stereo audio stream.
- Final full-file FFmpeg decode: passed without errors. H.264 1920 × 1080, 60 fps, 3240 video frames; stereo AAC 48 kHz. Container duration 54.058667 seconds (AAC tail), 18,676,448 bytes.
- Final AAC mix: -14.7 LUFS integrated; -1.5 dBFS true peak; 3.7 LU loudness range. No clipping detected by the measurement; this is not a claim of human listening approval.
- Final SHA-256: `ed47adf08c61f2dbc9b159f10e6ff5cb570a94c589c2501e8ec4f0a81208641e`.
- Root README / changelog whitespace check: passed. Final export: `out/openbot-pulse-no-voice.mp4`. Contact sheet: `out/pulse-contact.png`. Review manifest: `pulse-export.json`.
