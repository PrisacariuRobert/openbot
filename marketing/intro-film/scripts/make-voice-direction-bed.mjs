// Original, sample-free sound-direction sketch. Not Apple music.
// Plucked delay-line strings, brushed noise and a brief approval pause.
import fs from "node:fs";
import path from "node:path";

const rate = 48000,
  seconds = 22,
  count = rate * seconds;
const left = new Float32Array(count),
  right = new Float32Array(count);
let seed = 20260907;
const random = () =>
  (((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296) *
    2 -
  1;
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
function write(at, samples, gain, pan = 0) {
  const start = Math.round(at * rate);
  const l = Math.sqrt((1 - pan) / 2),
    r = Math.sqrt((1 + pan) / 2);
  for (let i = 0; i < samples.length && start + i < count; i++) {
    if (start + i < 0) continue;
    left[start + i] += samples[i] * gain * l;
    right[start + i] += samples[i] * gain * r;
  }
}
function pluck(at, note, gain, pan = 0, length = 1.5) {
  const delay = Math.round(rate / hz(note));
  const ring = Float32Array.from({ length: delay }, () => random());
  const samples = new Float32Array(Math.ceil(length * rate));
  for (let i = 0; i < samples.length; i++) {
    const p = i % delay;
    samples[i] =
      ring[p] * Math.min(1, i / 90) * Math.min(1, (samples.length - i) / 900);
    ring[p] = (ring[p] + ring[(p + 1) % delay]) * 0.497;
  }
  write(at, samples, gain, pan);
  write(at + 0.094, samples, gain * 0.09, -pan);
  write(at + 0.173, samples, gain * 0.045, pan);
}
function brush(at, gain, pan, length = 0.035) {
  let previous = 0;
  const samples = Float32Array.from(
    { length: Math.round(length * rate) },
    (_, i) => {
      const next = random();
      const high = next - previous;
      previous = next;
      return high * Math.exp((-i / rate) * 170) * Math.min(1, i / 25);
    },
  );
  write(at, samples, gain, pan);
}
function thud(at, gain = 0.18) {
  const samples = Float32Array.from({ length: rate * 0.2 }, (_, i) => {
    const t = i / rate;
    return (
      Math.sin(2 * Math.PI * (58 * t + 0.9 * (1 - Math.exp(-t * 70)))) *
      Math.exp(-t * 29) *
      Math.min(1, t * 800)
    );
  });
  write(at, samples, gain);
}

// Sparse original motif; leave the voice's question and decision uncovered.
[
  [0.12, 62, 0.7, -0.45],
  [0.39, 69, 0.36, 0.3],
  [1.14, 74, 0.35, -0.2],
  [2.34, 66, 0.33, 0.25],
  [3.05, 69, 0.28, -0.4],
  [4.35, 59, 0.4, -0.4],
  [5.58, 66, 0.25, 0.3],
  [6.16, 71, 0.3, -0.2],
  [7.34, 69, 0.26, 0.4],
  [8.45, 62, 0.26, -0.3],
  [12.82, 62, 0.6, -0.4],
  [13.09, 69, 0.32, 0.3],
  [13.98, 74, 0.35, -0.2],
  [15.08, 66, 0.3, 0.4],
  [16.22, 69, 0.28, -0.4],
  [18.62, 62, 0.65, -0.35],
  [18.68, 66, 0.5, 0.1],
  [18.74, 69, 0.4, 0.35],
  [19.35, 74, 0.38, -0.1],
].forEach(([at, n, g, p]) => pluck(at, n, g, p, 2));

for (const at of [0.12, 2.34, 4.35, 6.16, 12.82, 15.08, 16.22, 18.62])
  thud(at, 0.1);
for (const [i, at] of [
  1.22, 2.05, 2.9, 4.96, 5.77, 6.61, 7.16, 13.4, 14.52, 15.63, 16.74,
].entries())
  brush(at, 0.026, i % 2 ? 0.5 : -0.5);
// A single dry tactile click at the exact editorial approval frame: 355 / 30.
brush(355 / 30, 0.06, 0, 0.025);

// Picture-shaped dynamics: opening, lower bed for voice, quiet approval,
// resolving end phrase. Never normalize each element to loudness independently.
for (let i = 0; i < count; i++) {
  const t = i / rate;
  const fade = Math.min(1, t / 0.04) * Math.min(1, Math.max(0, (22 - t) / 1.8));
  const duck = t < 0.8 ? 1 : t < 18 ? 0.48 : 0.85;
  const approval =
    t > 10.8 && t < 11.72 ? 0 : t >= 11.72 && t < 12.7 ? 0.18 : 1;
  left[i] *= fade * duck * approval;
  right[i] *= fade * duck * approval;
}
const out = Buffer.alloc(44 + count * 4);
out.write("RIFF", 0);
out.writeUInt32LE(out.length - 8, 4);
out.write("WAVE", 8);
out.write("fmt ", 12);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(rate, 24);
out.writeUInt32LE(rate * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write("data", 36);
out.writeUInt32LE(count * 4, 40);
for (let i = 0; i < count; i++) {
  out.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, left[i])) * 32767),
    44 + i * 4,
  );
  out.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, right[i])) * 32767),
    46 + i * 4,
  );
}
const target = path.resolve("public/audio/voice-direction-bed.wav");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
console.log(target);
