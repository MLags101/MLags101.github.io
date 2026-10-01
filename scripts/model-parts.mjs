#!/usr/bin/env node
/**
 * List the CAD part names in an optimized model — copy one into a hotspot's `part:` field.
 *
 *   npm run model:parts -- kermit-v3            # all parts, biggest first
 *   npm run model:parts -- kermit-v3 motor      # filter by name
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const [id, filter = ''] = process.argv.slice(2);
if (!id) {
  console.error('Usage: npm run model:parts -- <model-id> [filter]');
  process.exit(1);
}
const file = path.join(ROOT, 'public/models', id, 'parts.json');
if (!fs.existsSync(file)) {
  console.error(`No ${path.relative(ROOT, file)} — run npm run model:optimize first.`);
  process.exit(1);
}
const { parts, animations = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = Object.entries(parts)
  .filter(([name]) => name.toLowerCase().includes(filter.toLowerCase()))
  .sort((a, b) => b[1].size.reduce((x, y) => x * y, 1) - a[1].size.reduce((x, y) => x * y, 1));
const mm = (v) => `${Math.round(v * 1000)}`.padStart(4);
console.log(`${'PART NAME'.padEnd(46)} SIZE mm (x × y × z)     CENTER m`);
for (const [name, p] of rows)
  console.log(`${JSON.stringify(name).padEnd(46)} ${p.size.map(mm).join(' ×')}     ${p.center.map((v) => v.toFixed(3)).join(' ')}`);
console.log(`\n${rows.length} part(s)${animations.length ? ` · animations: ${animations.join(', ')}` : ' · no animations in this GLB'}`);
