import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const episode = JSON.parse(fs.readFileSync("episode.json", "utf8"));
const segments = episode.segments.filter((s) => s.id.startsWith("full-"));
if (segments.length !== 10)
  throw new Error("Expected all ten full-introduction chapters.");
const chapters = segments.map((segment, i) => {
  const asset = episode.assets.find((a) => a.id === segment.audioAsset);
  if (!asset) throw new Error(`Missing narration: ${segment.id}`);
  const file = path.resolve("public", asset.file);
  const info = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
  const seconds = Number(info.format.duration);
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error(`Invalid audio: ${file}`);
  const lead = i === 0 ? 24 : 12,
    tail = i === 9 ? 90 : 25;
  return {
    id: segment.id,
    label: segment.id.slice(8),
    audio: asset.file,
    text: segment.text,
    voiceFrames: Math.ceil(seconds * 30),
    lead,
    durationInFrames: lead + Math.ceil(seconds * 30) + tail,
  };
});
let start = 0;
for (const chapter of chapters) {
  chapter.from = start;
  start += chapter.durationInFrames;
}
const result = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: start,
  chapters,
};
fs.writeFileSync(
  "public/audio/full-timing.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      seconds: start / 30,
      chapters: chapters.map((c) => ({
        id: c.id,
        from: c.from / 30,
        seconds: c.durationInFrames / 30,
      })),
    },
    null,
    2,
  ),
);
