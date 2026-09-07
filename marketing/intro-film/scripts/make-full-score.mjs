// Original procedural composition, voiced-edit aware. No stock or Apple audio.
import fs from "node:fs";
const timing = JSON.parse(
  fs.readFileSync("public/audio/full-timing.json", "utf8"),
);
const sr = 48000,
  seconds = timing.durationInFrames / 30,
  n = Math.ceil(seconds * sr);
const channels = [new Float32Array(n), new Float32Array(n)];
let seed = 7092026;
const rnd = () =>
  ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 2147483648 - 1;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
function put(at, samples, amp, pan = 0) {
  const start = Math.round(at * sr);
  for (let i = 0; i < samples.length && start + i < n; i++) {
    if (start + i < 0) continue;
    channels[0][start + i] += samples[i] * amp * Math.sqrt((1 - pan) / 2);
    channels[1][start + i] += samples[i] * amp * Math.sqrt((1 + pan) / 2);
  }
}
function string(at, m, amp = 0.3, pan = 0, len = 2) {
  const delay = Math.round(sr / hz(m)),
    ring = Float32Array.from({ length: delay }, rnd),
    a = new Float32Array(Math.ceil(len * sr));
  for (let i = 0; i < a.length; i++) {
    const k = i % delay;
    a[i] = ring[k] * Math.min(1, i / 100) * Math.min(1, (a.length - i) / 1200);
    ring[k] = (ring[k] + ring[(k + 1) % delay]) * 0.4975;
  }
  put(at, a, amp, pan);
  put(at + 0.127, a, amp * 0.09, -pan);
}
function bass(at, m, amp = 0.05) {
  const a = Float32Array.from({ length: sr * 0.55 }, (_, i) => {
    const t = i / sr;
    return (
      (Math.sin(2 * Math.PI * hz(m) * t) +
        0.13 * Math.sin(4 * Math.PI * hz(m) * t)) *
      Math.min(1, t * 110) *
      Math.exp(-t * 5)
    );
  });
  put(at, a, amp);
}
function tap(at, amp = 0.02, pan = 0) {
  let prev = 0;
  const a = Float32Array.from({ length: sr * 0.065 }, (_, i) => {
    const r = rnd(),
      v = r - prev;
    prev = r;
    return v * Math.exp((-i / sr) * 105) * Math.min(1, i / 20);
  });
  put(at, a, amp, pan);
}
function kick(at) {
  const a = Float32Array.from({ length: sr * 0.23 }, (_, i) => {
    const t = i / sr;
    return (
      Math.sin(2 * Math.PI * (48 * t + 1.2 * (1 - Math.exp(-t * 45)))) *
      Math.exp(-t * 20) *
      Math.min(1, t * 950)
    );
  });
  put(at, a, 0.08);
}
const beat = 60 / 108;
const chords = [
  [62, 66, 69, 73],
  [59, 62, 66, 69],
  [55, 59, 62, 66],
  [57, 61, 64, 69],
];
for (let bar = 0; bar * beat * 4 < seconds - 5; bar++) {
  const at = bar * beat * 4,
    chord = chords[bar % 4];
  // Work section has more forward motion; setup and decisions are sparse.
  const work = at > 30 && at < 66,
    quiet = at > 76 && at < 85.5;
  if (quiet) {
    if (bar % 2 === 0) string(at, chord[0], 0.15, -0.3, 3);
    continue;
  }
  string(at + 0.02, chord[0], 0.36, -0.4);
  string(at + beat * 1.5, chord[2], 0.2, 0.3);
  string(at + beat * 2.75, chord[3], 0.17, -0.2);
  bass(at, chord[0] - 24);
  if (work) {
    string(at + beat * 0.75, chord[1] + 12, 0.11, 0.4);
    kick(at);
    kick(at + beat * 2.5);
  }
  tap(at + beat, work ? 0.035 : 0.018, 0.3);
  tap(at + beat * 3, work ? 0.03 : 0.016, -0.3);
}
const ending = timing.chapters[9].from / 30;
[62, 66, 69, 73].forEach((m, i) =>
  string(ending + 4.2 + i * 0.07, m, 0.38, (i - 1.5) * 0.25, 5),
);
const approval =
  timing.chapters[6].from / 30 +
  (timing.chapters[6].durationInFrames / 30) * 0.42;
tap(approval, 0.1);
for (let i = 0; i < n; i++) {
  const t = i / sr;
  let gain = Math.min(1, t / 0.15) * Math.min(1, (seconds - t) / 2.4);
  const speaking = timing.chapters.some(
    (c) =>
      t >= (c.from + c.lead) / 30 && t < (c.from + c.lead + c.voiceFrames) / 30,
  );
  gain *= speaking ? 0.4 : 0.75;
  if (t > approval - 0.75 && t < approval - 0.05) gain = 0;
  for (const channel of channels) channel[i] *= gain;
}
const b = Buffer.alloc(44 + n * 4);
b.write("RIFF");
b.writeUInt32LE(b.length - 8, 4);
b.write("WAVE", 8);
b.write("fmt ", 12);
b.writeUInt32LE(16, 16);
b.writeUInt16LE(1, 20);
b.writeUInt16LE(2, 22);
b.writeUInt32LE(sr, 24);
b.writeUInt32LE(sr * 4, 28);
b.writeUInt16LE(4, 32);
b.writeUInt16LE(16, 34);
b.write("data", 36);
b.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++)
  for (let c = 0; c < 2; c++)
    b.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767),
      44 + i * 4 + c * 2,
    );
fs.writeFileSync("public/audio/openbot-full-score.wav", b);
console.log(`Original ${seconds.toFixed(2)}s stereo score generated.`);
