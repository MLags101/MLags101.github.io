#!/usr/bin/env node
/**
 * Re-encode source videos into small, web-friendly MP4s + a poster frame.
 * Jobs are listed in scripts/videos.json. Requires ffmpeg on PATH
 * (Windows: `winget install -e --id Gyan.FFmpeg`).
 *
 *   npm run media:videos                 # encode every job whose output is missing
 *   npm run media:videos -- --force      # re-encode everything
 *   npm run media:videos -- path/in.mov public/media/<slug>/name.mp4 [--start 2 --duration 8 --no-audio]
 *
 * Each job: { in, out, start?, duration?, maxWidth=1280, crf=26, audio=false, rotate?: "cw"|"ccw"|"180" }
 * Phone videos carry rotation metadata that ffmpeg applies automatically — only set `rotate`
 * if the generated poster still comes out sideways.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGET_MB = 5;
const args = process.argv.slice(2);
const force = args.includes('--force');

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

let jobs;
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.match(/^--(start|duration)$/));
if (positional.length === 2) {
  jobs = [{ in: positional[0], out: positional[1], start: flag('--start'), duration: flag('--duration'), audio: !args.includes('--no-audio') }];
} else {
  jobs = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/videos.json'), 'utf8'));
}

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...argv], { stdio: 'inherit' });
  if (r.error) throw new Error('ffmpeg not found on PATH — install it first (see docs/MEDIA.md).');
  if (r.status !== 0) throw new Error(`ffmpeg exited with ${r.status}`);
}

for (const job of jobs) {
  const src = path.resolve(ROOT, job.in);
  const out = path.resolve(ROOT, job.out);
  const poster = out.replace(/\.mp4$/, '.jpg');
  if (!fs.existsSync(src)) { console.warn(`skip (missing source): ${job.in}`); continue; }
  if (fs.existsSync(out) && !force && positional.length !== 2) { console.log(`ok   ${job.out}`); continue; }
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const filters = [`scale='min(${job.maxWidth ?? 1280},iw)':-2`, 'fps=30'];
  if (job.rotate === 'cw') filters.push('transpose=1');
  if (job.rotate === 'ccw') filters.push('transpose=2');
  if (job.rotate === '180') filters.push('transpose=1,transpose=1');

  const trim = [...(job.start ? ['-ss', String(job.start)] : []), ...(job.duration ? ['-t', String(job.duration)] : [])];
  const audio = job.audio ? ['-c:a', 'aac', '-b:a', '96k', '-ac', '1'] : ['-an'];
  const encode = (rate) => ffmpeg([...trim, '-i', src, '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'slow', ...rate, '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-map_metadata', '-1', ...audio, out]);

  encode(['-crf', String(job.crf ?? 26)]);
  let mb = fs.statSync(out).size / 1e6;
  if (mb > TARGET_MB) {
    // Too big: cap the bitrate so the file lands under the budget.
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' });
    const seconds = Number(probe.stdout.trim()) || 30;
    const kbps = Math.min(1500, Math.floor((TARGET_MB * 0.9 * 8000) / seconds) - (job.audio ? 96 : 0));
    encode(['-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`]);
    mb = fs.statSync(out).size / 1e6;
  }
  ffmpeg(['-ss', '0.5', '-i', out, '-frames:v', '1', '-q:v', '4', poster]);
  console.log(`done ${job.out}  ${mb.toFixed(2)} MB  (+ poster ${path.basename(poster)})`);
}
