import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import "./check-demo-fixture.mjs";

const source = fs.readFileSync("src/StudioFilm.tsx", "utf8");
const durations = [...source.matchAll(/durationInFrames=\{(\d+)\}/g)].map((m) =>
  Number(m[1]),
);
assert.equal(durations.length, 6);
assert.equal(
  durations.reduce((a, b) => a + b, 0),
  3840,
);
assert.equal((source.match(/<Audio\s/g) || []).length, 1);
assert.match(source, /audio\/openbot-studio-motion.wav/);
for (const file of fs.readdirSync("src/studio-film")) {
  assert.doesNotMatch(
    fs.readFileSync(`src/studio-film/${file}`, "utf8"),
    /<Audio\b|<Video\b|\.mp3|\.wav|Math.random|Date.now/,
  );
}
const output = "out/openbot-in-motion.mp4";
const probe = JSON.parse(
  execFileSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
    { encoding: "utf8" },
  ),
);
const video = probe.streams.filter((s) => s.codec_type === "video"),
  audio = probe.streams.filter((s) => s.codec_type === "audio");
assert.equal(video.length, 1);
assert.equal(audio.length, 1);
assert.equal(video[0].codec_name, "h264");
assert.equal(video[0].width, 1920);
assert.equal(video[0].height, 1080);
assert.equal(video[0].r_frame_rate, "60/1");
assert.equal(Number(video[0].nb_frames), 3840);
assert.equal(audio[0].channels, 2);
assert.equal(audio[0].sample_rate, "48000");
assert.ok(Math.abs(Number(probe.format.duration) - 64) < 0.15);
execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"], {
  stdio: "pipe",
});
const report = {
  output,
  duration: probe.format.duration,
  frames: 3840,
  resolution: "1920x1080",
  fps: 60,
  audio: "original stereo instrumental; no narration",
  bytes: fs.statSync(output).size,
  sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(output))
    .digest("hex"),
  decodedWithoutErrors: true,
  scope: "staged marketing illustration; not production execution evidence",
};
fs.writeFileSync(
  "out/studio-export-check.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
