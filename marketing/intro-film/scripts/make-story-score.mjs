// Picture-specific, original synthesis. No samples, network calls or paid services.
import fs from "node:fs";
import path from "node:path";

const sr = 48000;
const seconds = 47;
const n = seconds * sr;
const channels = [new Float32Array(n), new Float32Array(n)];
const tau = Math.PI * 2;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
let seed = 7042026;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return (seed >>> 0) / 2147483648 - 1;
};
function add(at, len, amp, pan, sample) {
  const begin = Math.round(at * sr);
  const count = Math.min(Math.round(len * sr), n - begin);
  const l = Math.cos(((pan + 1) * Math.PI) / 4),
    r = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let j = 0; j < count; j++) {
    const x = sample(j / sr, j / count) * amp;
    channels[0][begin + j] += x * l;
    channels[1][begin + j] += x * r;
  }
}
function key(at, midi, amp = 0.07, pan = 0, len = 2.4) {
  const f = hz(midi);
  add(at, len, amp, pan, (t, p) => {
    const attack = 1 - Math.exp(-t * 240);
    const tine = Math.sin(
      tau * f * t + Math.sin(tau * f * 2.003 * t) * 1.1 * Math.exp(-t * 5.2),
    );
    return (
      (tine * Math.exp(-t * 3.0) +
        0.24 * Math.sin(tau * f * 1.001 * t) * Math.exp(-t * 1.8)) *
      attack *
      Math.min(1, (1 - p) * 12)
    );
  });
}
function pad(at, chord, len, amp) {
  chord.forEach((m, i) =>
    add(
      at,
      len,
      amp,
      (i - 1.5) * 0.35,
      (t, p) =>
        Math.min(1, t / 1.2) *
        Math.min(1, (1 - p) * 3) *
        (Math.sin(tau * hz(m) * t) * 0.6 +
          Math.sin(tau * hz(m) * 1.002 * t) * 0.3 +
          Math.sin(tau * hz(m) * 2 * t) * 0.08),
    ),
  );
}
function kick(at, amp = 0.22) {
  add(
    at,
    0.48,
    amp,
    0,
    (t) =>
      Math.sin(tau * (44 * t + 92 * 0.018 * (1 - Math.exp(-t / 0.018)))) *
      Math.exp(-t * 11) *
      Math.min(1, t * 1800),
  );
}
function bass(at, midi, len, amp = 0.12) {
  add(
    at,
    len,
    amp,
    0,
    (t, p) =>
      (Math.sin(tau * hz(midi) * t) + 0.14 * Math.sin(tau * hz(midi) * 2 * t)) *
      Math.min(1, t * 110) *
      Math.min(1, (1 - p) * 10) *
      Math.exp(-t * 2.0),
  );
}
function tick(at, amp = 0.065, pan = 0.4, len = 0.07) {
  let low = 0;
  add(at, len, amp, pan, (t, p) => {
    const v = noise();
    low += 0.13 * (v - low);
    return (v - low) * Math.exp(-p * 12) * Math.min(1, t * 3000);
  });
}
function clap(at) {
  let prev = 0;
  add(at, 0.2, 0.09, -0.15, (t) => {
    const v = noise();
    const high = v - prev;
    prev = v;
    return (
      high *
      (Math.exp(-t * 45) +
        0.42 * Math.exp(-Math.abs(t - 0.016) * 95) +
        0.25 * Math.exp(-Math.abs(t - 0.03) * 120))
    );
  });
}
function sweep(at, len = 0.6, amp = 0.07, reverse = false) {
  let low = 0;
  add(at, len, amp, reverse ? 0.3 : -0.3, (t, p) => {
    low += (0.03 + 0.1 * p) * (noise() - low);
    return low * Math.sin(Math.PI * p) ** 2 * 2;
  });
}

// Abmaj9 / Fm9 / Dbmaj9 / Ebadd9. A lean half-time groove, not a loop under slides.
const harmony = [
  [44, 55, 60, 63, 70],
  [41, 51, 56, 60, 67],
  [37, 53, 56, 60, 63],
  [39, 55, 58, 65, 70],
];
for (let bar = 0; bar < 11; bar++) {
  const at = bar * 4 + 2;
  const chord = harmony[bar % 4];
  const restrained = at >= 26 && at < 30;
  pad(at, chord.slice(1), 5.2, restrained ? 0.016 : 0.022);
  for (let step = 0; step < 16; step++) {
    const when = at + step * 0.25;
    if (when >= 43 || (when >= 25.75 && when < 29.4)) continue;
    const airy = when < 6;
    if (step % 2 === 0 || (!airy && [3, 11, 15].includes(step)))
      key(
        when,
        harmony[bar % 4][[2, 3, 4, 3, 1, 3, 4, 2][Math.floor(step / 2)]] +
          (step % 4 === 0 ? 12 : 0),
        airy ? 0.04 : 0.056,
        Math.sin(step * 1.3) * 0.62,
        1.7,
      );
    if (!airy) {
      if ([0, 6, 8, 14].includes(step))
        kick(when, step === 0 || step === 8 ? 0.22 : 0.13);
      if ([0, 3, 6, 8, 11, 14].includes(step))
        bass(when, chord[0] - 12, step % 2 ? 0.21 : 0.36);
      if (step === 4 || step === 12) clap(when);
      tick(
        when + (step % 2 ? 0.012 : 0),
        step % 2 ? 0.038 : 0.018,
        ((step % 4) - 1.5) * 0.45,
      );
    }
  }
}
// A small three-note identity motif; arrival, interaction, resolution.
[0.25, 0.55, 0.85].forEach((at, i) =>
  key(at, [72, 75, 79][i], 0.085, (i - 1) * 0.2, 2.2),
);
for (const at of [1.75, 1.93, 2.08, 2.22, 2.38, 2.53])
  tick(at, 0.04, Math.sin(at * 7) * 0.7);
for (const at of [
  2.8, 4.68, 6.1, 7.35, 9.0, 12.2, 14.0, 16.12, 18.12, 20.3, 23.0, 25.65, 29.0,
  30.1, 33.1, 37.3, 39.1, 41.2, 43.5,
]) {
  sweep(Math.max(0, at - 0.24), 0.48, at === 25.65 ? 0.025 : 0.08);
  tick(at, 0.035, 0, 0.05);
}
// Approval is an audible pause, followed by a discrete confirmation.
key(29.08, 75, 0.11, -0.1, 2.3);
key(29.2, 79, 0.08, 0.1, 2.3);
// Resolved end signature: give the title space instead of carrying drums to the end.
pad(43.45, [55, 60, 63, 70], 3.5, 0.042);
[72, 75, 79].forEach((m, i) =>
  key(43.9 + i * 0.19, m, 0.085, (i - 1) * 0.28, 2.8),
);

// Short stereo reflections, fed from dry samples (no unstable feedback loop).
const dryL = channels[0].slice(),
  dryR = channels[1].slice();
for (let i = Math.round(sr * 0.18); i < n; i++) {
  channels[0][i] += dryR[i - Math.round(sr * 0.18)] * 0.12;
  if (i >= sr * 0.27) channels[1][i] += dryL[i - Math.round(sr * 0.27)] * 0.12;
}
let peak = 0;
for (let i = 0; i < n; i++)
  for (const c of channels) {
    c[i] =
      Math.tanh(c[i] * 1.2) *
      Math.min(1, i / (sr * 0.05)) *
      Math.min(1, (n - i) / (sr * 0.75));
    peak = Math.max(peak, Math.abs(c[i]));
  }
const gain = 0.76 / peak;
const wav = Buffer.alloc(44 + n * 4);
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
wav.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++)
  for (let c = 0; c < 2; c++)
    wav.writeInt16LE(
      Math.round(channels[c][i] * gain * 32767),
      44 + i * 4 + c * 2,
    );
const dest = path.resolve("public/audio/openbot-story-score.wav");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, wav);
console.log(`Original story score: ${seconds}s; stereo ${sr} Hz; ${dest}`);
