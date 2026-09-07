# See it work — QA

Date: 2026-09-07. Composition: `OpenBot-See-It-Work`.

The requested change is to the film, not the app runtime. Previous cuts are preserved. No account, permission, installed app, release status or publication was changed.

## Checks

- TypeScript and ESLint passed after creating the continuous app walkthrough.
- `test:demo` passed: the first parsing draft fails two of four local sample cases; the improved parser passes all four. Three fictional exports normalize to 1240, 420 and 89.50 EUR, totaling €1,749.50. The movie's budget and totals share this fixture. This is not proof of an autonomous self-improving agent.
- Studio loaded the exact new composition and reported 4920 frames, 60 fps, 1920 × 1080. The approval and code-repair states were visually inspected in the live preview.
- Initial render timed out at frame 346 with a 30-second frame timeout. A retry with two render workers and a 60-second timeout completed; no user apps or background processes were stopped. The continuous camera was centered so it no longer cropped the app's sidebar during the main workflow.
- `check:demo` passed: ten scene durations sum to 4920 frames; the new composition contains one instrumental audio source and no old voice imports; the export contains one 1920 × 1080 / 60 fps / 4920-frame video stream and one 48 kHz stereo audio stream.
- Reviewed two-second frame samples across the full export and the approval/code-repair screens in Studio. The app remains on the same task; the source total carries through the budget, deck and email. No clipped main message or test/approval controls were found in the inspected frames.
- FFmpeg full-file decode passed without errors. Final H.264/AAC container: 82.048 seconds, 13,411,470 bytes.
- Final audio measurement: -14.9 LUFS integrated, -1.4 dBFS true peak, 4.7 LU loudness range. This is a technical measurement, not human creative/listening approval.
- SHA-256: `1a35eae7ab29cab8843170ddab880cf3ce861f202f0785f4744a05a8ab205fed`.
- Export: `out/openbot-see-it-work.mp4`; contact sheet: `out/demo-contact.png`; review manifest: `demo-export.json`.

## Scope before publication

The in-app UI is staged. Build/test/fix/reuse timing is editorial, not measured performance. No real sign-in, email delivery, autonomous code build, routine execution or phone handoff is demonstrated. Source/behavior claims remain governed by `CAPABILITY_REVIEW.md`; the full self-improvement cycle is not certified by the sample parser tests.
