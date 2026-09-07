import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import "./check-demo-fixture.mjs";

const source = fs.readFileSync("src/DemoFilm.tsx", "utf8");
const durations = [...source.matchAll(/durationInFrames=\{(\d+)\}/g)].map(
  (match) => Number(match[1]),
);
assert.equal(durations.length, 10);
assert.equal(
  durations.reduce((sum, value) => sum + value, 0),
  4920,
);
assert.equal((source.match(/<Audio\s/g) || []).length, 1);
assert.match(source, /staticFile\("audio\/openbot-workflow-demo.wav"\)/);
assert.doesNotMatch(
  source,
  /VoiceDirection|FullIntroduction|full-timing|voice-test/,
);
for (const file of fs.readdirSync("src/demo")) {
  const contents = fs.readFileSync(`src/demo/${file}`, "utf8");
  assert.doesNotMatch(
    contents,
    /<Audio\b|<Video\b|\.mp3|\.wav/,
    `${file} must not introduce additional audio`,
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
      "out/openbot-see-it-work.mp4",
    ],
    { encoding: "utf8" },
  ),
);
const video = probe.streams.filter((stream) => stream.codec_type === "video");
const audio = probe.streams.filter((stream) => stream.codec_type === "audio");
assert.equal(video.length, 1);
assert.equal(audio.length, 1);
assert.equal(video[0].width, 1920);
assert.equal(video[0].height, 1080);
assert.equal(video[0].r_frame_rate, "60/1");
assert.equal(Number(video[0].nb_frames), 4920);
assert.equal(audio[0].channels, 2);
assert.equal(audio[0].sample_rate, "48000");
assert.ok(Math.abs(Number(probe.format.duration) - 82) < 0.15);
console.log(
  "PASS: persistent app walkthrough; 10 scenes; 4920 frames; instrumental only; shared expense/test fixture; 1080p60 stereo export.",
);
