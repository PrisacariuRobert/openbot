// Local QA helper. Requires the owner's existing whisper.cpp runtime/model.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const bin = process.env.OPENBOT_WHISPER_BIN,
  model = process.env.OPENBOT_WHISPER_MODEL;
if (!bin || !model)
  throw new Error(
    "Set OPENBOT_WHISPER_BIN and OPENBOT_WHISPER_MODEL to your local installation.",
  );
const timing = JSON.parse(
  fs.readFileSync("public/audio/full-timing.json", "utf8"),
);
fs.mkdirSync("out/narration-qa", { recursive: true });
const report = [];
for (const chapter of timing.chapters) {
  const target = path.resolve("out/narration-qa", chapter.id);
  execFileSync(
    bin,
    [
      "-m",
      model,
      "-f",
      path.resolve("public", chapter.audio),
      "-ojf",
      "-of",
      target,
      "--no-prints",
    ],
    { stdio: "pipe" },
  );
  const result = JSON.parse(fs.readFileSync(target + ".json", "utf8"));
  report.push({
    id: chapter.id,
    script: chapter.text,
    transcript: result.transcription.map((x) => x.text.trim()).join(" "),
    phrases: result.transcription.map((x) => ({
      start: x.offsets.from / 1000,
      end: x.offsets.to / 1000,
      text: x.text.trim(),
    })),
  });
}
fs.writeFileSync(
  "out/narration-qa/report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
