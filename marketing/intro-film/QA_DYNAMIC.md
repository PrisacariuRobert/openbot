# Dynamic introduction — export review

Reviewed 7 September 2026. This supersedes the first cut for creative review only; it does not establish product release readiness.

## Export

- File: `out/openbot-introduction-dynamic.mp4`
- Picture: 1920 × 1080, H.264, 60 fps, 3120 frames (52 seconds).
- Container duration: 52.053333 seconds, including AAC padding.
- Audio: stereo AAC, 48 kHz, locally synthesized original score.
- Size: 12,402,181 bytes.
- SHA-256: `b1ab011cb0b3c08e865b818048caa02beb2ddae63f5435303e2605ac2ba7f2cc`.

## Checks completed

- TypeScript and ESLint passed via `npm run lint`.
- Remotion completed all 3120 frames and encoding after the final adjustment.
- FFmpeg decoded the complete final file without reported errors.
- FFprobe confirmed the resolution, frame rate, frame count and audio format above.
- Encoded audio measured -16.82 LUFS integrated, -3.78 dBTP true peak and 4.30 LU loudness range. These are measured input values, not a claim that a normalization pass was applied.
- `git diff --check` passed.
- A 16-frame scene contact sheet and denser opening/device-transition samples were visually inspected. The samples cover the macro mascot reveal, pull-back, provider orbit, artifact fan, calendar tracking, approval transition and phone-to-Mac reveal.
- The initial chat push-in exposed a headline collision. The headline now clears earlier; the corrected final export was inspected at 10.7 seconds and no longer contains the collision.

This is sampled visual review plus full-file technical decoding, not a human full-length screening with sound. Watch the complete movie with sound before publication, paying particular attention to reading time during camera movement. Contact sheets in `out/` are review aids, not release deliverables.

## Preserved and scoped

The original `openbot-introduction.mp4` and its source remain intact. The revision uses editable frame-driven vector characters, perspective transforms, object-led cuts and independently timed motion rather than paid generation. No accounts, app permissions, installed app builds or release settings were changed for this revision. Nothing was published.

All depicted tasks, messages, approvals and device handoffs are staged illustrations. Capability conditions and release checks remain in `CAPABILITY_REVIEW.md`, outside the film. This asset must not be used as evidence that unverified workflows currently ship.
