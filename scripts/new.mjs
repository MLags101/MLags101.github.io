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
 * New entries start as `draft: true`: visible in `npm run dev`, hidden from the live site
 * until you flip it. Field reference: docs/CONTENT.md
 */
import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import * as yaml from 'js-yaml';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'src/content');
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

const skills = yaml.load(fs.readFileSync(path.join(CONTENT, 'skills.yaml'), 'utf8'));
const experienceIds = fs.existsSync(path.join(CONTENT, 'experience'))
  ? fs.readdirSync(path.join(CONTENT, 'experience')).filter((d) => fs.existsSync(path.join(CONTENT, 'experience', d, 'index.md')))
  : [];

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
  fs.appendFileSync(path.join(CONTENT, 'skills.yaml'), `- { id: ${id}, name: ${JSON.stringify(title)}, group: ${group} }\n`);
  console.log(`✓ Added skill "${title}" (${id}) to src/content/skills.yaml`);
  process.exit(0);
}

const slug = flags.slug ?? (interactive ? await ask(p.text({ message: 'URL slug', initialValue: slugify(title), validate: (v) => (/^[a-z0-9-]+$/.test(v) ? undefined : 'kebab-case only') })) : slugify(title));

const target =
  type === 'project'
    ? path.join(CONTENT, 'projects', slug, 'index.mdx')
    : type === 'experience'
      ? path.join(CONTENT, 'experience', slug, 'index.md')
      : path.join(CONTENT, 'research', `${slug}.md`);
if (fs.existsSync(target)) bail(`${path.relative(ROOT, target)} already exists.`);

const start = flags.start ?? (interactive ? await ask(p.text({ message: 'Start (YYYY-MM)', initialValue: thisMonth, validate: (v) => (ym.test(v) ? undefined : 'Use YYYY-MM') })) : thisMonth);
if (!ym.test(start)) bail('--start must be YYYY-MM');

let vars = { title, slug, start, end: '# end: YYYY-MM          # omit while ongoing' };

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
    let lineage = '# lineage: { family: Kermit, version: V4, order: 4 }';
    if (family) {
      const version = flags.version ?? (interactive ? await ask(p.text({ message: 'Version label', placeholder: 'V2' })) : 'V?');
      lineage = `lineage: { family: ${family}, version: ${version}, order: 99 }   # order = position in the family`;
    }
    vars = {
      ...vars,
      category,
      status: end ? 'complete' : 'in-progress',
      featured: String(!!featured),
      context: context ? `context: ${context}` : '# context: invention-studio   # experience entry this belongs to',
      lineage,
    };
  } else {
    const etype = flags.type ?? (interactive ? await ask(p.select({ message: 'Type', options: EXP_TYPES.map((t) => ({ value: t, label: t })) })) : 'internship');
    if (!EXP_TYPES.includes(etype)) bail(`Unknown type "${etype}"`);
    vars = { ...vars, type: etype, mark: (flags.mark ?? title.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)).toUpperCase() };
  }
}

// ── write ──
const templateFile = { project: 'project.mdx', experience: 'experience.md', research: 'research.md' }[type];
const body = fill(fs.readFileSync(path.join(TEMPLATES, templateFile), 'utf8'), vars);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, body);

if (type === 'project') {
  // Placeholder cover so the build passes immediately; replace it with a real image.
  const imgDir = path.join(path.dirname(target), 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="100%" height="100%" fill="#111317"/>
    <g stroke="#22262d">${Array.from({ length: 25 }, (_, i) => `<line x1="${i * 64}" y1="0" x2="${i * 64}" y2="1000"/>`).join('')}${Array.from({ length: 16 }, (_, i) => `<line x1="0" y1="${i * 64}" x2="1600" y2="${i * 64}"/>`).join('')}</g>
    <text x="96" y="860" font-family="monospace" font-size="28" fill="#ff6b2c" letter-spacing="4">COVER PLACEHOLDER — REPLACE images/cover.jpg</text>
    <text x="96" y="800" font-family="sans-serif" font-size="88" font-weight="600" fill="#e8eaed">${title.replace(/[<&]/g, '')}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toFile(path.join(imgDir, 'cover.jpg'));
}

const rel = path.relative(ROOT, target).split(path.sep).join('/');
const steps =
  type === 'project'
    ? [
        `Edit ${rel}`,
        `Drop photos into ${path.dirname(rel)}/images/ (replace cover.jpg)`,
        'Videos: add a job to scripts/videos.json → npm run media:videos',
        'Preview: npm run dev → http://localhost:4321/projects/' + slug,
        'Publish: set draft: false, commit, push',
      ]
    : [`Edit ${rel}`, 'Preview: npm run dev', 'Publish: set draft: false, commit, push'];

if (interactive) {
  p.note(steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), 'Next steps');
  p.outro(`Created ${rel}`);
} else {
  console.log(`✓ Created ${rel}`);
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
}
