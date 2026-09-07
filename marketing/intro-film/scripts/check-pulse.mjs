import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const source = fs.readFileSync("src/PulseFilm.tsx", "utf8");
const durations = [...source.matchAll(/durationInFrames=\{(\d+)\}/g)].map(
  (match) => Number(match[1]),
);
assert.equal(durations.length, 12);
assert.equal(
  durations.reduce((sum, n) => sum + n, 0),
  3240,
);
assert.equal((source.match(/<Audio /g) || []).length, 1);
assert.match(source, /staticFile\("audio\/openbot-pulse.wav"\)/);
assert.doesNotMatch(
  source,
  /FullIntroduction|VoiceDirection|full-timing|voice-test/,
);
for (const file of fs.readdirSync("src/pulse")) {
  const contents = fs.readFileSync(path.join("src/pulse", file), "utf8");
  assert.doesNotMatch(
    contents,
    /<Audio\b|<Video\b|\.mp3|\.wav/,
    `${file} cannot introduce hidden audio`,
  );
  assert.doesNotMatch(
    contents,
    /https?:\/\//,
    `${file} must use local bundled assets`,
  );
}
const probe = JSON.parse(
  execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      "out/openbot-pulse-no-voice.mp4",
    ],
    { encoding: "utf8" },
  ),
);
const video = probe.streams.filter((s) => s.codec_type === "video");
const audio = probe.streams.filter((s) => s.codec_type === "audio");
assert.equal(video.length, 1);
assert.equal(audio.length, 1);
assert.equal(video[0].width, 1920);
assert.equal(video[0].height, 1080);
assert.equal(video[0].r_frame_rate, "60/1");
assert.equal(Number(video[0].nb_frames), 3240);
assert.equal(audio[0].channels, 2);
assert.ok(Math.abs(Number(probe.format.duration) - 54) < 0.15);
console.log(
  "PASS: 3240 frames; 12 scenes; one instrumental-only audio source; no old voice dependencies; local assets; 1080p60 stereo export.",
);
