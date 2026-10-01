/**
 * Content queries. Pages never call getCollection() directly — they go through here so
 * drafts, sorting and computed relationships ("used in N projects") behave the same everywhere.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'>;
export type Experience = CollectionEntry<'experience'>;
export type Skill = CollectionEntry<'skills'>;
export type Research = CollectionEntry<'research'>;

/** Drafts render in `astro dev` (with a DRAFT ribbon) but never ship. */
const visible = ({ data }: { data: { draft?: boolean } }) => !(import.meta.env.PROD && data.draft);

const NOW = new Date();
const endOf = (d: { end?: Date }) => (d.end ?? NOW).getTime();

export const CATEGORY_LABELS: Record<Project['data']['category'], string> = {
  research: 'Research',
  professional: 'Professional',
  team: 'Teams & Orgs',
  personal: 'Personal',
  coursework: 'Coursework',
};
export const CATEGORY_ORDER: Project['data']['category'][] = ['research', 'professional', 'team', 'personal', 'coursework'];

export const EXPERIENCE_LABELS: Record<Experience['data']['type'], string> = {
  internship: 'Internship',
  'co-op': 'Co-op',
  research: 'Research',
  team: 'Student Team',
  leadership: 'Leadership',
};

export const SKILL_GROUP_LABELS: Record<Skill['data']['group'], string> = {
  languages: 'Languages',
  'cad-sim': 'CAD & Simulation',
  electronics: 'Electronics & Embedded',
  robotics: 'Robotics & Flight Systems',
  fabrication: 'Fabrication',
};

/** All visible projects, newest first (ongoing work counts as "now"); `order` breaks ties. */
export async function getProjects() {
  const all = await getCollection('projects', visible);
  return all.sort((a, b) => endOf(b.data) - endOf(a.data) || b.data.order - a.data.order);
}

export async function getFeaturedProjects() {
  const all = await getProjects();
  return all.filter((p) => p.data.featured).sort((a, b) => b.data.order - a.data.order || endOf(b.data) - endOf(a.data));
}

/** Experience, most recent first. */
export async function getExperience() {
  const all = await getCollection('experience', visible);
  return all.sort((a, b) => endOf(b.data) - endOf(a.data) || b.data.start.getTime() - a.data.start.getTime());
}

export async function getResearch() {
  const all = await getCollection('research');
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getSkills() {
  return getCollection('skills');
}

/** skill id → ids of projects that reference it. */
export async function getSkillUsage() {
  const usage = new Map<string, string[]>();
  for (const p of await getProjects())
    for (const s of p.data.skills) usage.set(s.id, [...(usage.get(s.id) ?? []), p.id]);
  for (const e of await getExperience())
    for (const s of e.data.skills) if (!usage.has(s.id)) usage.set(s.id, []);
  return usage;
}

/** Resolve skill references to entries (throws on an unknown id — the schema already guards this). */
export async function resolveSkills(refs: { id: string }[]) {
  const skills = await getSkills();
  const byId = new Map(skills.map((s) => [s.id, s]));
  return refs.map((r) => {
    const s = byId.get(r.id);
    if (!s) throw new Error(`Unknown skill "${r.id}" — add it to src/content/skills.yaml`);
    return s;
  });
}

/** Projects whose `context` is this experience entry. */
export async function getProjectsFor(experienceId: string) {
  return (await getProjects()).filter((p) => p.data.context?.id === experienceId);
}

/** Every version in this project's lineage family, oldest first (empty if none). */
export async function getLineage(project: Project) {
  const fam = project.data.lineage?.family;
  if (!fam) return [];
  const all = await getCollection('projects', visible);
  return all.filter((p) => p.data.lineage?.family === fam).sort((a, b) => a.data.lineage!.order - b.data.lineage!.order);
}

/** Explicit `related` + lineage-free siblings from the same context, up to `limit`. */
export async function getRelated(project: Project, limit = 3) {
  const all = await getProjects();
  const explicit = project.data.related.map((r) => all.find((p) => p.id === r.id)).filter((p): p is Project => !!p);
  const sameContext = all.filter(
    (p) => p.id !== project.id && project.data.context && p.data.context?.id === project.data.context.id,
  );
  const out: Project[] = [];
  for (const p of [...explicit, ...sameContext]) if (!out.some((o) => o.id === p.id) && p.id !== project.id) out.push(p);
  return out.slice(0, limit);
}

export async function getExperienceEntry(id: string) {
  return getEntry('experience', id);
}
