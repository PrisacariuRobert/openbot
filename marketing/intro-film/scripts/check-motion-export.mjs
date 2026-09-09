import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const output = 'out/openbot-motion-story.mp4';
const source = readFileSync('src/LaunchFilm.tsx', 'utf8');
const durations = [...source.matchAll(/durationInFrames=\{(\d+)\}/g)].map(m => Number(m[1]));
assert.equal(durations.length, 7);
assert.equal(durations.reduce((a, b) => a + b, 0), 3600);
assert.doesNotMatch(source, /ActualStudioFilm|actual-ui\//);
assert.equal((source.match(/<Audio\s/g) || []).length, 1);
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], {encoding: 'utf8'}));
const video = probe.streams.find(s => s.codec_type === 'video');
const audio = probe.streams.find(s => s.codec_type === 'audio');
assert.equal(video.codec_name, 'h264');
assert.equal(video.width, 1920);
assert.equal(video.height, 1080);
assert.equal(video.r_frame_rate, '60/1');
assert.equal(Number(video.nb_frames), 3600);
assert.equal(audio.channels, 2);
assert.ok(Math.abs(Number(probe.format.duration) - 60) < .15);
execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-'], {stdio:'pipe'});
console.log(JSON.stringify({output, frames:3600, duration:probe.format.duration,
  decodedWithoutErrors:true, bytes:statSync(output).size,
  sha256:createHash('sha256').update(readFileSync(output)).digest('hex'),
  scope:'Animated fictional product demonstration, not real-account proof or creative approval.'}, null, 2));
