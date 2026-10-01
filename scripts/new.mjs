#!/usr/bin/env node
/**
 * Scaffold new content from a template.
 *
 *   npm run new                                  # interactive
 *   npm run new -- project "Kermit V4" --category personal --start 2026-09 \
 *                  --role "Sole designer" --skills solidworks,ardupilot [--end 2026-12] \
 *                  [--featured] [--family Kermit --version V4] [--context invention-studio]
 *   npm run new -- experience "SpaceX" --type internship --start 2027-06 --role "Avionics Intern"
 *   npm run new -- research "Paper title" --start 2026-10
 *   npm run new -- skill "LabVIEW" --group cad-sim
 *
 * Projects get a block in src/data/projects.yaml (the facts) plus
 * src/content/projects/<slug>/index.mdx (the write-up) and an images/ folder. Experience and
 * research entries are appended to src/data/experience.yaml / research.yaml.
 *
 * New entries start as `draft: true`: visible in `npm run dev`, hidden from the live site
 * until you delete that line. Field reference: docs/CONTENT.md · map: SITE_GUIDE.md
 */
import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import * as yaml from 'js-yaml';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'src/content');
const DATA = path.join(ROOT, 'src/data');
const TEMPLATES = path.join(ROOT, 'scripts/templates');

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else flags[key] = argv[++i];
  } else positional.push(a);
}

const TYPES = ['project', 'experience', 'research', 'skill'];
const CATEGORIES = ['research', 'professional', 'team', 'personal', 'coursework'];
const EXP_TYPES = ['internship', 'co-op', 'research', 'team', 'leadership'];
const SKILL_GROUPS = ['languages', 'cad-sim', 'electronics', 'robotics', 'fabrication'];
const interactive = process.stdout.isTTY && positional.length < 2;

const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ym = /^\d{4}-(0[1-9]|1[0-2])$/;
const thisMonth = new Date().toISOString().slice(0, 7);

function bail(msg) {
  p.cancel(msg);
  process.exit(1);
}
async function ask(fn) {
  const v = await fn;
  if (p.isCancel(v)) bail('Cancelled.');
  return v;
}

const readYaml = (f) => yaml.load(fs.readFileSync(path.join(DATA, f), 'utf8')) ?? {};
const skills = readYaml('skills.yaml');
const experienceIds = Object.keys(readYaml('experience.yaml'));

/** Map free-text skill names / aliases to ids. */
function resolveSkillIds(list) {
  const out = [];
  for (const raw of list) {
    const q = raw.trim().toLowerCase();
    if (!q) continue;
    const hit = skills.find((s) => s.id === q || s.name.toLowerCase() === q || (s.aliases ?? []).some((a) => a.toLowerCase() === q));
    if (!hit) bail(`Unknown skill "${raw}". Add it first: npm run new -- skill "${raw}" --group <group>`);
    out.push(hit.id);
  }
  return [...new Set(out)];
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

// ── main ────────────────────────────────────────────────────────────────
if (interactive) p.intro(' new content ');

const type = positional[0] ?? (interactive ? await ask(p.select({ message: 'What are you adding?', options: TYPES.map((t) => ({ value: t, label: t })) })) : bail('Missing type. Usage: npm run new -- <project|experience|research|skill> "Title"'));
if (!TYPES.includes(type)) bail(`Unknown type "${type}" — use one of: ${TYPES.join(', ')}`);

const title =
  positional[1] ??
  (interactive ? await ask(p.text({ message: type === 'experience' ? 'Organization' : type === 'skill' ? 'Skill name' : 'Title', validate: (v) => (v?.trim() ? undefined : 'Required') })) : bail('Missing title.'));

// ── skill: append to the registry and stop ──
if (type === 'skill') {
  const id = flags.id ?? slugify(title);
  if (skills.some((s) => s.id === id)) bail(`Skill "${id}" already exists.`);
  const group = flags.group ?? (interactive ? await ask(p.select({ message: 'Group', options: SKILL_GROUPS.map((g) => ({ value: g, label: g })) })) : bail('Missing --group'));
  if (!SKILL_GROUPS.includes(group)) bail(`Unknown group "${group}"`);
  fs.appendFileSync(path.join(DATA, 'skills.yaml'), `- { id: ${id}, name: ${JSON.stringify(title)}, group: ${group} }\n`);
  console.log(`✓ Added skill "${title}" (${id}) to src/data/skills.yaml`);
  process.exit(0);
}

const slug = flags.slug ?? (interactive ? await ask(p.text({ message: 'ID / URL slug', initialValue: slugify(title), validate: (v) => (/^[a-z0-9-]+$/.test(v) ? undefined : 'kebab-case only') })) : slugify(title));

const dataFile = { project: 'projects.yaml', experience: 'experience.yaml', research: 'research.yaml' }[type];
if (Object.hasOwn(readYaml(dataFile), slug)) bail(`"${slug}" already exists in src/data/${dataFile}.`);
const bodyFile = path.join(CONTENT, 'projects', slug, 'index.mdx');
if (type === 'project' && fs.existsSync(bodyFile)) bail(`${path.relative(ROOT, bodyFile)} already exists.`);

const start = flags.start ?? (interactive ? await ask(p.text({ message: 'Start (YYYY-MM)', initialValue: thisMonth, validate: (v) => (ym.test(v) ? undefined : 'Use YYYY-MM') })) : thisMonth);
if (!ym.test(start)) bail('--start must be YYYY-MM');

let vars = { title, slug, start, end: '# end: YYYY-MM   # leave out while ongoing' };

if (type === 'project' || type === 'experience') {
  const end = flags.end ?? (interactive ? await ask(p.text({ message: 'End (YYYY-MM, blank = ongoing)', placeholder: 'ongoing', validate: (v) => (!v || ym.test(v) ? undefined : 'Use YYYY-MM or leave blank') })) : '');
  if (end && !ym.test(end)) bail('--end must be YYYY-MM');
  const role = flags.role ?? (interactive ? await ask(p.text({ message: type === 'project' ? 'Your role' : 'Position title', placeholder: 'Sole designer' })) : 'TODO');

  let skillIds = flags.skills ? resolveSkillIds(String(flags.skills).split(',')) : [];
  if (!flags.skills && interactive) {
    skillIds = await ask(
      p.autocompleteMultiselect({
        message: 'Skills / tools (type to filter, space to pick)',
        options: skills.map((s) => ({ value: s.id, label: s.name, hint: s.group })),
        required: type === 'project',
      }),
    );
  }
  if (type === 'project' && skillIds.length === 0) bail('Projects need at least one skill (--skills a,b)');

  vars = { ...vars, role: role || 'TODO', skills: skillIds.join(', '), end: end ? `end: ${end}` : vars.end };

  if (type === 'project') {
    const category = flags.category ?? (interactive ? await ask(p.select({ message: 'Category', options: CATEGORIES.map((c) => ({ value: c, label: c })) })) : 'personal');
    if (!CATEGORIES.includes(category)) bail(`Unknown category "${category}"`);
    const context = flags.context ?? (interactive && experienceIds.length ? await ask(p.select({ message: 'Done as part of… (links it on the Experience page)', options: [{ value: '', label: '— none —' }, ...experienceIds.map((e) => ({ value: e, label: e }))] })) : '');
    const featured = flags.featured === true || (interactive && !flags.featured ? await ask(p.confirm({ message: 'Feature on the home page?', initialValue: false })) : false);
    const family = flags.family ?? (interactive ? await ask(p.text({ message: 'Part of a version lineage? Family name (blank = no)', placeholder: 'e.g. Kermit' })) : '');
    let lineage = '# lineage: { family: Kermit, version: V4, order: 4 }   # links versions with a strip';
    if (family) {
      const version = flags.version ?? (interactive ? await ask(p.text({ message: 'Version label', placeholder: 'V2' })) : 'V?');
      lineage = `lineage: { family: ${family}, version: ${version}, order: 99 }   # order = position in the family`;
    }
    vars = {
      ...vars,
      category,
      status: end ? 'complete' : 'in-progress',
      featured: String(!!featured),
      context: context ? `context: ${context}` : '# context: invention-studio   # experience id this was part of',
      lineage,
    };
  } else {
    const etype = flags.type ?? (interactive ? await ask(p.select({ message: 'Type', options: EXP_TYPES.map((t) => ({ value: t, label: t })) })) : 'internship');
    if (!EXP_TYPES.includes(etype)) bail(`Unknown type "${etype}"`);
    vars = { ...vars, type: etype, mark: (flags.mark ?? title.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)).toUpperCase() };
  }
}

// ── write ──
// Facts: append a block to the data file (everything else in the file is untouched).
const dataPath = path.join(DATA, dataFile);
const block = fill(fs.readFileSync(path.join(TEMPLATES, `${type}.yaml`), 'utf8'), vars);
fs.writeFileSync(dataPath, fs.readFileSync(dataPath, 'utf8').replace(/\s*$/, '\n') + block);

if (type === 'project') {
  // Write-up + placeholder cover so the build passes immediately; replace the cover.
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  fs.writeFileSync(bodyFile, fill(fs.readFileSync(path.join(TEMPLATES, 'project.mdx'), 'utf8'), vars));
  const imgDir = path.join(path.dirname(bodyFile), 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="100%" height="100%" fill="#111317"/>
    <g stroke="#22262d">${Array.from({ length: 25 }, (_, i) => `<line x1="${i * 64}" y1="0" x2="${i * 64}" y2="1000"/>`).join('')}${Array.from({ length: 16 }, (_, i) => `<line x1="0" y1="${i * 64}" x2="1600" y2="${i * 64}"/>`).join('')}</g>
    <text x="96" y="860" font-family="monospace" font-size="28" fill="#ff6b2c" letter-spacing="4">COVER PLACEHOLDER — REPLACE images/cover.jpg</text>
    <text x="96" y="800" font-family="sans-serif" font-size="88" font-weight="600" fill="#e8eaed">${title.replace(/[<&]/g, '')}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toFile(path.join(imgDir, 'cover.jpg'));
}

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const steps =
  type === 'project'
    ? [
        `Facts (dates, skills, specs, cover): src/data/projects.yaml → ${slug}:`,
        `Write-up: ${rel(bodyFile)}`,
        `Photos: ${rel(path.dirname(bodyFile))}/images/ (replace cover.jpg)`,
        'Videos: add a job to scripts/videos.json → npm run media:videos',
        `Preview: npm run dev → http://localhost:4321/projects/${slug}`,
        'Publish: delete the `draft: true` line, commit, push',
      ]
    : [`Fill in the TODOs under ${slug}: in ${rel(dataPath)}`, 'Preview: npm run dev', 'Publish: delete the `draft: true` line, commit, push'];

if (interactive) {
  p.note(steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), 'Next steps');
  p.outro(`Added ${slug}`);
} else {
  console.log(`✓ Added ${slug} (${type})`);
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
}
