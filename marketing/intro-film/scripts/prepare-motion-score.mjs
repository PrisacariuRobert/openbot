import { execFileSync } from 'node:child_process';

// Original project instrumental, pitch-preserving acceleration. The music's
// decision pause and resolve follow the exact same editorial clock as the film.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'public/audio/openbot-launch-choice.wav',
  '-af', 'atempo=1.2,afade=t=out:st=58.6:d=1.4', '-t', '60', '-c:a', 'pcm_s16le',
  'public/audio/openbot-launch-motion.wav'], { stdio: 'inherit' });
