// Original, deterministic 120 BPM instrumental. No voice, samples or remote calls.
// Form follows the picture: arrival / driving groove / owner pause / lift / resolve.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const demo = process.argv.includes("--demo");
const studio = process.argv.includes("--studio");
const stem = studio
  ? "openbot-studio-motion"
  : demo
    ? "openbot-workflow-demo"
    : "openbot-pulse";
const gapStart = studio ? 50 : demo ? 34.5 : 35;
const gapEnd = studio ? 52 : demo ? 37 : 39;
const resolve = studio ? 60.5 : demo ? 78.5 : 50.5;
const inGap = (time) => time >= gapStart && time < gapEnd;
const sr = 48000,
  seconds = studio ? 64 : demo ? 82 : 54,
  length = sr * seconds;
const channels = [new Float32Array(length), new Float32Array(length)];
let seed = 70954;
const noise = () =>
  ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 2147483648 - 1;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const tau = Math.PI * 2;
function add(at, duration, render, gain = 1, pan = 0, echo = false) {
  const start = Math.round(at * sr),
    n = Math.floor(duration * sr);
  const left = Math.sqrt((1 - pan) / 2),
    right = Math.sqrt((1 + pan) / 2);
  for (let i = 0; i < n && start + i < length; i++) {
    if (start + i < 0) continue;
    const sample =
      render(i / sr, i) *
      gain *
      Math.min(1, i / 100) *
      Math.min(1, (n - i) / 500);
    channels[0][start + i] += sample * left;
    channels[1][start + i] += sample * right;
    if (echo) {
      for (let e = 1; e <= 3; e++) {
        const j = start + i + Math.round(sr * 0.375 * e);
        if (j >= length) break;
        const v = sample * 0.17 ** e;
        channels[e % 2][j] += v;
      }
    }
  }
}
function kick(at, gain = 0.75) {
  add(
    at,
    0.6,
    (t) =>
      Math.sin(tau * (43 * t + 1.45 * (1 - Math.exp(-t * 42)))) *
        Math.exp(-t * 8.5) +
      noise() * 0.05 * Math.exp(-t * 230),
    gain,
  );
}
function snare(at, gain = 0.15) {
  let last = 0;
  add(
    at,
    0.22,
    (t) => {
      const r = noise();
      const high = r - last * 0.65;
      last = r;
      return (
        high *
          (Math.exp(-t * 23) + 0.25 * Math.exp(-Math.abs(t - 0.026) * 150)) +
        0.2 * Math.sin(tau * 180 * t) * Math.exp(-t * 45)
      );
    },
    gain,
  );
}
function hat(at, open = false, gain = 0.07, pan = 0.25) {
  let low = 0;
  add(
    at,
    open ? 0.26 : 0.09,
    (t) => {
      const n = noise();
      low = low * 0.8 + n * 0.2;
      return (n - low) * Math.exp(-t * (open ? 21 : 70));
    },
    gain,
    pan,
  );
}
function bass(at, note, duration = 0.36, gain = 0.28) {
  const f = hz(note);
  add(
    at,
    duration,
    (t) => {
      const env = Math.min(1, t * 150) * Math.exp(-t * 3.5);
      return (
        (Math.sin(tau * f * t) +
          0.25 * Math.sin(tau * f * 2 * t) +
          0.065 * Math.sin(tau * f * 3 * t)) *
        env
      );
    },
    gain,
  );
}
function pluck(at, note, gain = 0.16, pan = 0) {
  const f = hz(note);
  add(
    at,
    1.5,
    (t) =>
      Math.sin(
        tau * f * t + 1.5 * Math.sin(tau * f * 2 * t) * Math.exp(-t * 9),
      ) * Math.exp(-t * 6),
    gain,
    pan,
    true,
  );
}
function chord(at, notes, duration = 1.85, gain = 0.06) {
  for (let v = 0; v < notes.length; v++) {
    const f = hz(notes[v]);
    add(
      at,
      duration,
      (t) => {
        let wave = 0;
        for (let k = 1; k < 7; k++)
          wave +=
            (Math.sin(tau * f * k * t) + Math.sin(tau * f * 1.0021 * k * t)) /
            (k * k);
        const env = Math.min(1, t * 7) * Math.min(1, (duration - t) * 3);
        const pump = 0.45 + 0.55 * Math.min(1, ((t + 0.02) % 0.5) * 4);
        return wave * env * pump;
      },
      gain,
      (v - 1.5) * 0.3,
    );
  }
}
function sweep(at, duration, gain = 0.15, up = true) {
  let low = 0;
  add(
    at,
    duration,
    (t) => {
      const progress = t / duration;
      const r = noise();
      low = low * 0.93 + r * 0.07;
      const window = Math.sin(progress * Math.PI) ** 2;
      const tone = Math.sin(tau * (90 * t + (up ? 1 : -1) * 80 * t * t));
      return ((r - low) * 0.32 + tone * 0.2) * window;
    },
    gain,
    0,
  );
}

// Sparse physical pulses before the first downbeat.
kick(0.2, 0.4);
pluck(0.35, 74, 0.11, -0.45);
pluck(0.85, 69, 0.09, 0.3);
bass(1.5, 38, 0.75, 0.3);
sweep(1.5, 2.48, 0.21);
pluck(2, 62, 0.13, -0.2);
pluck(2.5, 65, 0.12, 0.3);
pluck(3, 69, 0.15, 0);
const progression = [
  [38, [50, 57, 62, 65]],
  [34, [46, 53, 58, 62]],
  [41, [53, 57, 60, 65]],
  [36, [48, 55, 60, 64]],
];
for (let bar = 2; bar < (studio ? 31 : demo ? 40 : 26); bar++) {
  const at = bar * 2;
  const [root, notes] = progression[Math.floor((bar - 2) / 2) % 4];
  const section = studio
    ? inGap(at)
      ? 0
      : at < 20
        ? 0.85
        : at < 30
          ? 1.1
          : at < 34
            ? 0.48
            : at < 48
              ? 1.05
              : at < 52
                ? 0.5
                : 1.15
    : demo
      ? inGap(at)
        ? 0
        : at < 15
          ? 0.66
          : at < 29
            ? 0.8
            : at < 37
              ? 0.48
              : at < 49
                ? 0.85
                : at < 59
                  ? 0.78
                  : at < 65
                    ? 0.42
                    : 0.85
      : at < 16
        ? 0.85
        : at < 24
          ? 1
          : at < 31
            ? 0.9
            : at < 35
              ? 0.8
              : at < 39
                ? 0
                : 1.05;
  if (section === 0) continue;
  chord(at, notes, 1.9, 0.05 * section);
  for (let b = 0; b < 4; b++) {
    const t = at + b * 0.5;
    if (inGap(t)) continue;
    kick(t, 0.57 * section);
    if (b % 2 === 1) snare(t, 0.19 * section);
    hat(t + 0.25, b === 3, 0.065 * section, b % 2 ? 0.35 : -0.35);
    if (at >= 16) {
      hat(t + 0.375, false, 0.025, -0.4);
    }
  }
  for (const [offset, degree] of [
    [0.125, 0],
    [0.75, 0],
    [1.125, 7],
    [1.625, 0],
    [1.875, 12],
  ]) {
    if (inGap(at + offset)) continue;
    bass(at + offset, root + degree, 0.31, 0.29 * section);
  }
  const melody =
    bar % 2
      ? [notes[2] + 12, notes[1] + 12, notes[3] + 12]
      : [notes[2] + 12, notes[3] + 12, notes[1] + 12];
  for (let p = 0; p < 3; p++) {
    const t = at + [0.25, 1, 1.75][p];
    if (inGap(t)) continue;
    pluck(t, melody[p], (at < 16 ? 0.065 : 0.09) * section, (p - 1) * 0.5);
  }
}
// Picture accents. Quiet decision, then a renewed lift when the conversation travels.
for (const at of studio
  ? [
      1.5, 2.7, 4, 7, 8, 9.75, 13.7, 16.4, 20, 23.5, 26.6, 30, 33.55, 34.15,
      36.2, 37.7, 39.5, 42, 43.6, 45.6, 48, 52, 54, 56.6, 58, 60.5,
    ]
  : demo
    ? [
        4, 7, 10.1, 15, 18.65, 23, 29, 35.45, 37, 39.8, 42.6, 44.95, 47.45, 49,
        54.15, 59, 65.2, 67, 71.5, 74, 78,
      ]
    : [4, 8, 11, 16, 18, 20, 22, 24, 28, 31, 44, 48]) {
  kick(at, 0.23);
  sweep(at - 0.32, 0.55, 0.11);
}
sweep(gapStart - 1.5, 1.5, 0.17);
pluck(gapStart + 0.12, 62, 0.15, -0.25);
pluck(gapEnd - 1.8, 69, 0.1, 0.3);
add(gapEnd - 0.82, 0.05, (t) => noise() * Math.exp(-t * 180), 0.13);
sweep(gapEnd - 0.7, 0.7, 0.22);
kick(gapEnd, 0.65);
chord(gapEnd, [50, 57, 62, 65], 1, 0.06);
for (let b = 1; b < 4; b++) {
  kick(gapEnd + b * 0.25, 0.2);
  hat(gapEnd + b * 0.25, false, 0.06);
}
// Resolve under the final signature instead of cutting a loop in the middle.
kick(resolve, 0.28);
chord(resolve, [50, 57, 62, 65], 3.45, 0.057);
pluck(resolve + 0.05, 74, 0.13, -0.35);
pluck(resolve + 0.3, 77, 0.095, 0.25);
pluck(resolve + 0.8, 81, 0.07, 0.4);

// Gentle bus shaping; a 1 second true silence-free tail fade.
let peak = 0;
for (let i = 0; i < length; i++) {
  const t = i / sr;
  const duck =
    t >= gapStart && t < gapStart + 1.5
      ? 0.45
      : t > seconds - 2.3
        ? Math.max(0, (seconds - t) / 2.3)
        : 1;
  const fade = Math.min(1, t / 0.04) * Math.min(1, (seconds - t) / 0.7);
  for (let c = 0; c < 2; c++) {
    channels[c][i] = Math.tanh(channels[c][i] * 1.15) * duck * fade;
    peak = Math.max(peak, Math.abs(channels[c][i]));
  }
}
const wav = Buffer.alloc(44 + length * 4);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sr, 24);
wav.writeUInt32LE(sr * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(length * 4, 40);
for (let i = 0; i < length; i++)
  for (let c = 0; c < 2; c++)
    wav.writeInt16LE(
      Math.round((channels[c][i] / peak) * 0.84 * 32767),
      44 + (i * 2 + c) * 2,
    );
fs.mkdirSync("public/audio", { recursive: true });
fs.writeFileSync(`public/audio/${stem}-premaster.wav`, wav);
execFileSync("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  `public/audio/${stem}-premaster.wav`,
  "-af",
  "loudnorm=I=-15.5:TP=-1.5:LRA=9",
  "-ar",
  String(sr),
  "-c:a",
  "pcm_s16le",
  `public/audio/${stem}.wav`,
]);
console.log(
  JSON.stringify({
    seconds,
    bpm: 120,
    channels: 2,
    sampleRate: sr,
    narration: false,
    output: `public/audio/${stem}.wav`,
  }),
);
