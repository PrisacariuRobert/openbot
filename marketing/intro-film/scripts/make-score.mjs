// Original deterministic music and transition sound design. No samples or services.
import fs from "node:fs";
import path from "node:path";

const rate = 48000;
const dynamic = process.argv.includes("--dynamic");
const duration = dynamic ? 52 : 80.4;
const length = Math.round(rate * duration);
const left = new Float32Array(length);
const right = new Float32Array(length);
const TAU = Math.PI * 2;
const note = (midi) => 440 * 2 ** ((midi - 69) / 12);
let seed = 1709;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return (seed >>> 0) / 4294967296;
};

function voice(start, seconds, frequency, amplitude, pan = 0, type = "felt") {
  const first = Math.floor(start * rate);
  const count = Math.min(Math.floor(seconds * rate), length - first);
  const l = Math.cos(((pan + 1) * Math.PI) / 4),
    r = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    let signal;
    if (type === "pad") {
      const envelope = Math.min(1, t / 1.7) * Math.min(1, (seconds - t) / 2.2);
      signal =
        envelope *
        (Math.sin(TAU * frequency * t) * 0.65 +
          Math.sin(TAU * frequency * 1.002 * t) * 0.2 +
          Math.sin(TAU * frequency * 2 * t) * 0.1);
    } else if (type === "kick") {
      signal =
        Math.sin(TAU * (48 * t + 65 * 0.025 * (1 - Math.exp(-t / 0.025)))) *
        Math.exp(-t * 15) *
        Math.min(1, t * 1000);
    } else if (type === "bass") {
      signal =
        Math.min(1, t / 0.05) *
        Math.exp(-t * 2.8) *
        Math.min(1, (seconds - t) / 0.1) *
        Math.sin(TAU * frequency * t);
    } else {
      const envelope =
        (1 - Math.exp(-t * 140)) *
        Math.exp(-t * 2.5) *
        Math.min(1, (seconds - t) / 0.12);
      signal =
        envelope *
        (Math.sin(TAU * frequency * t) +
          0.17 * Math.sin(TAU * frequency * 2.002 * t) * Math.exp(-t * 3) +
          0.08 * Math.sin(TAU * frequency * 3.97 * t) * Math.exp(-t * 5));
    }
    left[first + i] += signal * amplitude * l;
    right[first + i] += signal * amplitude * r;
  }
}

function air(start, seconds, amplitude, rise = false) {
  const first = Math.floor(start * rate);
  const count = Math.min(Math.floor(seconds * rate), length - first);
  let low = 0;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const n = random() * 2 - 1;
    low = 0.93 * low + 0.07 * n;
    const env = rise
      ? Math.sin(Math.PI * t) ** 2
      : Math.exp(-t * 8) * Math.min(1, t * 100);
    left[first + i] += low * env * amplitude;
    right[first + i] += low * env * amplitude * 0.87;
  }
}

// Dadd9 / Bm7 / Gmaj7 / Asus2. Sparse, warm and deliberately unhurried.
const chords = [
  [50, 57, 61, 66, 76],
  [47, 54, 57, 62, 69],
  [43, 54, 59, 62, 69],
  [45, 52, 59, 64, 69],
];
const beat = 60 / (dynamic ? 120 : 112);
const bar = beat * 8;
for (
  let start = 0, section = 0;
  start < (dynamic ? 48 : 76);
  start += bar, section++
) {
  const chord = chords[section % chords.length];
  chord
    .slice(1, 4)
    .forEach((midi, i) =>
      voice(start, bar + 2, note(midi), 0.045, (i - 1) * 0.5, "pad"),
    );
  const pattern = [2, 4, 3, 1, 2, 3, 4, 3];
  for (let i = 0; i < 8; i++) {
    if (start < (dynamic ? 2 : 5) && i > 2) continue;
    voice(
      start + beat * i,
      2.1,
      note(chord[pattern[i]] + (i % 3 === 0 ? 12 : 0)),
      start < 11 ? 0.065 : 0.092,
      Math.sin(i * 2) * 0.46,
    );
    if (start > (dynamic ? 2 : 10) && start < (dynamic ? 46 : 68)) {
      if (i % 2 === 0)
        voice(start + beat * i, 0.85, note(chord[0] - 12), 0.105, 0, "bass");
      air(start + beat * (i + 0.5), 0.13, 0.028);
      if (dynamic) {
        voice(start + beat * i, 0.4, 48, i % 2 ? 0.055 : 0.14, 0, "kick");
        air(start + beat * (i + 0.5), 0.08, 0.035);
        if (i % 2) air(start + beat * i, 0.13, 0.1);
      }
    }
  }
}

// Sound design is tied to picture edits and the final OpenBot signature.
for (const cut of dynamic
  ? [
      1.6, 3.4, 5, 6.3, 7.1, 9.5, 12, 15.2, 19, 22.6, 24.2, 27, 28.2, 29.7,
      31.2, 33, 36.2, 38, 39.6, 41.2, 45, 48.2,
    ]
  : [5.6, 11.2, 20.8, 28.4, 38, 45.6, 53.2, 60.8, 70.4]) {
  air(
    cut - (dynamic ? 0.25 : 0.55),
    dynamic ? 0.45 : 0.85,
    dynamic ? 0.11 : 0.07,
    true,
  );
  voice(cut, 1.4, note(86), 0.035, 0.3);
}
[62, 66, 69, 76].forEach((midi, i) =>
  voice(
    (dynamic ? 48.2 : 74.1) + i * 0.15,
    dynamic ? 3.7 : 5.3,
    note(midi),
    0.095,
    (i - 1.5) * 0.2,
  ),
);

// Quiet stereo space from the original dry synthesis, not external reverb assets.
for (let i = Math.floor(rate * 0.26); i < length; i++) {
  left[i] += right[i - Math.floor(rate * 0.26)] * 0.15;
  right[i] += left[i - Math.floor(rate * 0.19)] * 0.12;
}
let peak = 0;
for (let i = 0; i < length; i++) {
  const t = i / rate;
  const fade = Math.min(1, t / 1.5) * Math.min(1, (duration - t) / 2.6);
  left[i] *= fade;
  right[i] *= fade;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const gain = 0.65 / Math.max(peak, 0.001);
const wav = Buffer.alloc(44 + length * 4);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(length * 4, 40);
for (let i = 0; i < length; i++) {
  wav.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, left[i] * gain)) * 32767),
    44 + i * 4,
  );
  wav.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, right[i] * gain)) * 32767),
    46 + i * 4,
  );
}
const output = path.resolve(
  dynamic
    ? "public/audio/openbot-dynamic-score.wav"
    : "public/audio/openbot-original-score.wav",
);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, wav);
console.log(`Original score: ${duration}s, stereo ${rate} Hz; ${output}`);
