# In motion — export review

Reviewed 7 September 2026. Composition: `OpenBot-In-Motion`.

## Verified

- ESLint and TypeScript: `npm run lint` passed.
- Fixture: 2 failed checks in the first parser, 4 passing checks after correction, 3 receipts, €1,749.50 total. This is a local fictional-data helper, not an autonomous production agent run.
- `npm run check:studio` passed: six scenes, 3840 frames, 1920 × 1080, H.264, 60 fps, one stereo 48 kHz audio stream. Entire export decoded without errors.
- File: `out/openbot-in-motion.mp4`, 12,687,556 bytes. Container duration 64.042667 s includes AAC padding; picture is exactly 64 seconds.
- SHA-256: `b8848eb93bf858be212cb88a2055c70366aec3dc422756316cbb1e04e4228f05`.
- Instrumental only: source-contract checks require exactly one score and reject scene-local audio/video or voice files. The original score is synthesized locally, with no remote service or paid generation. Measured WAV loudness is approximately −14.5 LUFS, −1.35 dBTP.
- Remotion preview reported no current runtime error; the selected composition reported 3840 frames at 60 fps. Playback was exercised and paused for handoff.

## Visual checks

Inspected the newer native Mac candidate privately, then reconstructed the layout using only fictional content. The older installed build was not treated as the current visual reference. The local web app on port 4310 was unavailable.

Reviewed native-style setup, close-up composer, consultation, tool checks, email approval, two-device handoff and mascot signature in Studio. Fixed an off-screen work-updates sheet caused by a transformed zero-height wrapper, adjusted close-up framing and opening mascot position, and moved the phone clock clear of the island. Re-rendered after those fixes.

Reviewed a 16-frame contact sheet extracted from the final MP4 at four-second spacing: `out/studio-contact-sheet.jpg`. The corrected work-updates panel, file previews, exact email review, devices and final mascot family remain in frame. Close-up shots intentionally crop the outer application window; the primary message or sheet stays legible.

## Scope

Editable marketing illustration, not a recording of the live application. No owner conversations, private files or accounts appear in the asset. No external action, publication, push, merge or product-runtime change occurred. The depicted self-extension, send, routine and phone states retain the separate capability/release gates in `CAPABILITY_REVIEW.md` and `STUDIO_DIRECTION.md`. Technical QA does not substitute for owner creative approval or an end-to-end pilot.

All prior films and render commands remain available. README and changelog identify the new cut without changing the application version.
