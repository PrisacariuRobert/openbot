/** Writes the sound for the "Waiting for you" film as a WAV file: a soft music bed (a slow pad and a gentle plucked
 * pattern that follow the scenes) and small clean sounds for every on-screen event (a whoosh for each headline, a soft
 * thud when a piece lands, a click for each tap, a chime when something is approved, a rewind, a count-up).
 * Everything is synthesised here from scratch, so there is nothing to license and nothing to download.
 *
 *   node scripts/motion/make-audio.mjs out.wav
 *
 * The cue times match scripts/motion/waiting-for-you-v2.html; change both together. */
import { writeFileSync } from "node:fs";

const SR = 48000;
const DURATION = 28.4;
const N = Math.floor(SR * DURATION);
const out = process.argv[2] || "film-audio.wav";

// ---- tiny deterministic noise, so the audio is identical every run ----
let seed = 20261005;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;

// ---- buses: music and effects, each with its own reverb send ----
const music = [new Float32Array(N), new Float32Array(N)];
const sfx = [new Float32Array(N), new Float32Array(N)];
const wetMusic = [new Float32Array(N), new Float32Array(N)];
const wetSfx = [new Float32Array(N), new Float32Array(N)];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const note = (name) => { const m = /^([A-G])([#b]?)(\d)$/.exec(name); return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0); };

/** Adds a mono signal to a bus at a time, panned (-1 left, 1 right), with a reverb send amount. */
function put(bus, wet, start, signal, gain, pan = 0, send = 0) {
  const at = Math.floor(start * SR), l = gain * Math.cos((pan + 1) * Math.PI / 4), r = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < signal.length && at + i < N; i++) {
    if (at + i < 0) continue;
    const v = signal[i];
    bus[0][at + i] += v * l; bus[1][at + i] += v * r;
    if (send) { wet[0][at + i] += v * send; wet[1][at + i] += v * send; }
  }
}
const env = (t, a, d) => Math.min(1, t / a) * Math.exp(-t / d);

// ---- instruments ----
/** A soft pad: detuned saws and a sine under them, slow attack and release, warmed by a low-pass. */
function pad(freq, seconds, attack = 1.4, release = 1.8) {
  const n = Math.floor((seconds + release) * SR), s = new Float32Array(n);
  const detunes = [-7, 0, 7].map((c) => Math.pow(2, c / 1200));
  const ph = detunes.map(() => rand());
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    detunes.forEach((d, k) => { ph[k] = (ph[k] + freq * d / SR) % 1; v += (ph[k] * 2 - 1) * 0.3; });
    v += Math.sin(2 * Math.PI * freq * t) * 0.5;
    const g = Math.min(1, t / attack) * (t < seconds ? 1 : Math.max(0, 1 - (t - seconds) / release));
    const cutoff = 0.05 + 0.04 * Math.sin(t * 0.35);
    lp += (v - lp) * cutoff;
    s[i] = lp * g;
  }
  return s;
}
/** A plucked string (Karplus-Strong): a short noise burst circulating in a delay line. */
function pluck(freq, seconds = 1.6, brightness = 0.5) {
  const n = Math.floor(seconds * SR), s = new Float32Array(n), len = Math.max(2, Math.round(SR / freq)), line = new Float32Array(len);
  let smooth = 0;
  for (let i = 0; i < len; i++) { smooth += (noise() - smooth) * 0.22; line[i] = smooth * brightness * 2.4; }   // a rounded burst, not a harsh one
  let p = 0, prev = 0, soft = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[p];
    const next = (cur + prev) * 0.5 * 0.9975;
    line[p] = next; prev = cur; p = (p + 1) % len;
    soft += (cur - soft) * 0.3;                                       // and the top end taken off
    s[i] = soft * Math.min(1, i / 240);
  }
  return s;
}
/** A glassy bell: a few inharmonic partials with slow decay. */
function bell(freq, seconds = 2.4) {
  const n = Math.floor(seconds * SR), s = new Float32Array(n), partials = [[1, 1, 1.1], [2.76, 0.38, 0.55], [5.4, 0.16, 0.3], [8.9, 0.07, 0.18]];
  for (let i = 0; i < n; i++) { const t = i / SR; let v = 0; for (const [m, a, d] of partials) v += Math.sin(2 * Math.PI * freq * m * t) * a * Math.exp(-t / d); s[i] = v * Math.min(1, t / 0.003); }
  return s;
}
function click() { const n = Math.floor(0.05 * SR), s = new Float32Array(n); let hp = 0; for (let i = 0; i < n; i++) { const t = i / SR; const x = noise(); hp = x - hp * 0.2; s[i] = (hp * 0.5 * Math.exp(-t / 0.004) + Math.sin(2 * Math.PI * 2600 * t) * 0.5 * Math.exp(-t / 0.012)); } return s; }
function thud(freq = 150, seconds = 0.28) { const n = Math.floor(seconds * SR), s = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; const f = freq * (1 + 1.4 * Math.exp(-t / 0.03)); ph += 2 * Math.PI * f / SR; s[i] = Math.sin(ph) * Math.exp(-t / 0.075) * 0.9 + noise() * Math.exp(-t / 0.006) * 0.25; } return s; }
/** Band-passed noise that sweeps from one frequency to another: a whoosh, or (rising) a rewind. */
function sweep(seconds, f0, f1, q = 1.6, shape = "swell") {
  const n = Math.floor(seconds * SR), s = new Float32Array(n);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n, f = f0 * Math.pow(f1 / f0, t), w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), b0 = a, a0 = 1 + a, a1 = -2 * Math.cos(w), a2 = 1 - a;
    const x = noise();
    const y = (b0 * x - b0 * 0 - a1 * y1 - a2 * y2) / a0; y2 = y1; y1 = y;
    const g = shape === "swell" ? Math.sin(Math.PI * Math.pow(t, 0.8)) : Math.pow(t, 1.5);
    s[i] = y * g * 3.2;
  }
  return s;
}
function tick(freq = 900) { const n = Math.floor(0.09 * SR), s = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; s[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / 0.018) * Math.min(1, t / 0.001); } return s; }

// ---- the music: a slow chord for each scene, and a gentle pattern on top ----
const chords = [
  { from: 0.0, to: 3.2, notes: ["D2", "A2", "F3", "C4", "E4"], root: "D1" },
  { from: 3.2, to: 7.2, notes: ["Bb1", "F2", "D3", "A3", "D4"], root: "Bb0" },
  { from: 7.2, to: 11.3, notes: ["G1", "D2", "Bb2", "F3", "A3"], root: "G0" },
  { from: 11.3, to: 15.4, notes: ["F1", "C2", "A2", "E3", "G3"], root: "F0" },
  { from: 15.4, to: 19.1, notes: ["G1", "D2", "Bb2", "F3", "C4"], root: "G0" },
  { from: 19.1, to: 22.8, notes: ["Bb1", "F2", "D3", "A3", "C4"], root: "Bb0" },
  { from: 22.8, to: 28.4, notes: ["D2", "A2", "F#3", "A3", "E4"], root: "D1" },
];
for (const [index, chord] of chords.entries()) {
  const seconds = chord.to - chord.from, loud = index === 0 ? 0.55 : index === chords.length - 1 ? 1.0 : 0.85;
  chord.notes.forEach((name, k) => put(music, wetMusic, chord.from - 0.5, pad(midi(note(name)), seconds + 0.5), 0.085 * loud, (k - 2) * 0.28, 0.5));
  put(music, wetMusic, chord.from, pad(midi(note(chord.root)) * 2, seconds, 0.6, 1.0), 0.16 * loud, 0, 0.1);   // a soft low foundation
}
// the gentle pattern: eighth notes of the chord, rising and falling, starting with the second scene
const beat = 60 / 108 / 2;
const pattern = [0, 2, 3, 2, 4, 3, 2, 1];
for (const chord of chords.slice(1)) {
  const last = chord === chords[chords.length - 1];
  const tones = chord.notes.map((n) => note(n) + 12);
  let step = 0;
  for (let t = Math.ceil(chord.from / beat) * beat; t < chord.to - 0.05; t += beat, step++) {
    if (last && t > 25.4 && step % 2) continue;
    const idx = pattern[step % pattern.length] % tones.length, vel = 0.6 + 0.4 * (step % 4 === 0 ? 1 : 0.55);
    put(music, wetMusic, t, pluck(midi(tones[idx]), 1.4, 0.55), 0.2 * vel, Math.sin(step * 0.9) * 0.5, 0.55);
  }
}
put(music, wetMusic, 22.8, bell(midi(note("D5")), 4.5), 0.07, -0.2, 0.6);
put(music, wetMusic, 23.1, bell(midi(note("A5")), 4.5), 0.05, 0.25, 0.6);
put(music, wetMusic, 24.7, bell(midi(note("F#5")), 4.0), 0.045, 0.0, 0.6);

// ---- the effects, one cue for each thing that happens on screen ----
const whooshes = [0.3, 3.4, 7.25, 11.45, 15.5, 19.2, 23.05];                                // each headline arrives
for (const t of whooshes) put(sfx, wetSfx, t, sweep(0.75, 350, 2600), 0.07, rand() * 0.4 - 0.2, 0.25);
put(sfx, wetSfx, 0.2, sweep(3.0, 300, 3600, 1.2, "rise"), 0.06, 0, 0.2);                   // the flood of mail
for (const t of [3.7, 3.95, 4.2, 4.45]) put(sfx, wetSfx, t + 0.18, thud(170 - (t - 3.7) * 30), 0.24, 0, 0.2);   // four cards land
put(sfx, wetSfx, 5.05, tick(1400), 0.14, 0, 0.4);                                           // the "4 to review" pill
put(sfx, wetSfx, 7.62, thud(150), 0.22, 0, 0.2);                                            // the reply card
put(sfx, wetSfx, 9.3, click(), 0.3, -0.2, 0.15);                                            // Save draft
put(sfx, wetSfx, 9.45, bell(midi(note("E5")), 1.6), 0.13, 0, 0.5); put(sfx, wetSfx, 9.58, bell(midi(note("B5")), 1.8), 0.11, 0.2, 0.5);   // approved
put(sfx, wetSfx, 9.75, thud(130), 0.16, 0, 0.2);
for (const [i, t] of [11.9, 12.1, 12.3, 12.5, 12.7].entries()) put(sfx, wetSfx, t + 0.12, tick(620 + i * 140), 0.2, (i - 2) * 0.2, 0.3);   // five approvals
put(sfx, wetSfx, 13.2, thud(140), 0.2, 0, 0.2);                                             // the offer
put(sfx, wetSfx, 14.25, click(), 0.3, -0.2, 0.15);                                          // Yes, do these automatically
put(sfx, wetSfx, 14.42, bell(midi(note("G5")), 1.8), 0.13, 0, 0.5); put(sfx, wetSfx, 14.55, bell(midi(note("D6")), 2.0), 0.1, 0.2, 0.5);
put(sfx, wetSfx, 14.8, tick(1100), 0.12, -0.2, 0.3); put(sfx, wetSfx, 15.0, tick(1300), 0.12, 0.2, 0.3);   // the two reassurances
put(sfx, wetSfx, 15.95, thud(150), 0.2, 0, 0.2);                                            // the row arrives
put(sfx, wetSfx, 17.25, click(), 0.3, 0.2, 0.15);                                           // Undo
put(sfx, wetSfx, 17.3, sweep(1.0, 2400, 280, 1.4, "swell"), 0.1, 0, 0.3);                  // the rewind
put(sfx, wetSfx, 19.6, thud(140), 0.2, 0, 0.2);                                             // the list
for (const [i, t] of [19.85, 20.0, 20.15, 20.3, 20.45].entries()) put(sfx, wetSfx, t + 0.1, tick(700 + i * 90), 0.14, 0, 0.2);
for (let i = 0; i < 24; i++) put(sfx, wetSfx, 20.62 + i * 0.058, tick(500 + i * 38), 0.07 + i * 0.002, 0, 0.15);     // the total counts up
put(sfx, wetSfx, 22.0, bell(midi(note("A5")), 2.0), 0.12, 0, 0.5); put(sfx, wetSfx, 22.13, bell(midi(note("E6")), 2.2), 0.1, 0.2, 0.5);
put(sfx, wetSfx, 21.3, thud(150), 0.18, 0, 0.2);
for (const [i, t] of [23.9, 24.05, 24.2].entries()) put(sfx, wetSfx, t, thud(190 + i * 40, 0.22), 0.15, (i - 1) * 0.5, 0.3);   // the three teammates
put(sfx, wetSfx, 24.7, sweep(1.1, 500, 4200, 1.3, "swell"), 0.07, 0, 0.3);                  // the name
put(sfx, wetSfx, 25.3, bell(midi(note("D6")), 3.0), 0.08, 0, 0.6);

// ---- reverb (a small Schroeder room, bright and short) ----
function reverb(input, size) {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.floor(d * size)), aps = [225, 556].map((d) => Math.floor(d * size));
  const result = [new Float32Array(N), new Float32Array(N)];
  for (const ch of [0, 1]) {
    const lines = combs.map((d) => ({ buf: new Float32Array(d + ch * 23), i: 0, lp: 0 }));
    const apb = aps.map((d) => ({ buf: new Float32Array(d + ch * 11), i: 0 }));
    for (let n = 0; n < N; n++) {
      let acc = 0;
      for (const c of lines) { const o = c.buf[c.i]; c.lp += (o - c.lp) * 0.32; c.buf[c.i] = input[ch][n] + c.lp * 0.84; c.i = (c.i + 1) % c.buf.length; acc += o; }
      let y = acc * 0.25;
      for (const a of apb) { const o = a.buf[a.i]; const x = y + o * 0.5; a.buf[a.i] = x; y = o - x * 0.5; a.i = (a.i + 1) % a.buf.length; }
      result[ch][n] = y;
    }
  }
  return result;
}
const rm = reverb(wetMusic, 1.5), rs = reverb(wetSfx, 0.8);

// ---- mix: music sits under the effects; a gentle limiter; a fade at the very end ----
const pcm = new Int16Array(N * 2);
let peak = 0;
const mix = [new Float32Array(N), new Float32Array(N)];
for (const ch of [0, 1]) for (let n = 0; n < N; n++) {
  const t = n / SR;
  const fadeIn = Math.min(1, t / 0.6), fadeOut = t > DURATION - 2.4 ? Math.max(0, (DURATION - t) / 2.4) : 1;
  const v = (music[ch][n] * 0.9 + rm[ch][n] * 0.55 + sfx[ch][n] * 1.0 + rs[ch][n] * 0.5) * fadeIn * fadeOut;
  mix[ch][n] = v; if (Math.abs(v) > peak) peak = Math.abs(v);
}
const norm = Math.min(1.6, 0.8 / Math.max(peak, 1e-6));
for (let n = 0; n < N; n++) for (const ch of [0, 1]) {
  const v = Math.tanh(mix[ch][n] * norm * 1.05);
  pcm[n * 2 + ch] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
}
const header = Buffer.alloc(44), dataBytes = pcm.length * 2;
header.write("RIFF", 0); header.writeUInt32LE(36 + dataBytes, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(dataBytes, 40);
writeFileSync(out, Buffer.concat([header, Buffer.from(pcm.buffer)]));
console.log(`Wrote ${out} (${DURATION}s, peak before normalising ${peak.toFixed(2)}).`);
