/**
 * Content queries. Pages never call getCollection() directly — they go through here so
 * drafts, sorting, image resolution and computed relationships ("used in N projects")
 * behave the same everywhere.
 */
import type { ImageMetadata } from 'astro';
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { resolveImage } from './media';

type ProjectData = CollectionEntry<'projects'>['data'];
type ExperienceData = CollectionEntry<'experience'>['data'];

type SkillRef = { id: string; collection: 'skills' };
/**
 * A project with its cover resolved to an image and its tools filled in from
 * src/data/skills.yaml (each tool lists the projects that used it).
 */
export type Project = Omit<CollectionEntry<'projects'>, 'data'> & {
  data: Omit<ProjectData, 'cover'> & { cover: ImageMetadata; skills: SkillRef[] };
};
export type Experience = Omit<CollectionEntry<'experience'>, 'data'> & {
  data: Omit<ExperienceData, 'logo' | 'photo' | 'gallery'> & {
    logo?: ImageMetadata;
    photo?: ImageMetadata;
    gallery: { src: ImageMetadata; alt: string }[];
  };
};
export type Skill = CollectionEntry<'skills'>;
export type Research = CollectionEntry<'research'>;

const logos = import.meta.glob<{ default: ImageMetadata }>('/src/assets/logos/*.{png,jpg,jpeg,webp,svg}', { eager: true });
const sitePhotos = import.meta.glob<{ default: ImageMetadata }>('/src/assets/site/*.{png,jpg,jpeg,webp}', { eager: true });

/** Drafts render in `astro dev` (with a DRAFT ribbon) but never ship. */
const visible = ({ data }: { data: { draft?: boolean } }) => !(import.meta.env.PROD && data.draft);

const NOW = new Date();
const endOf = (d: { end?: Date }) => (d.end ?? NOW).getTime();

export const CATEGORY_LABELS: Record<ProjectData['category'], string> = {
  research: 'Research',
  professional: 'Professional',
  team: 'Teams & Orgs',
  personal: 'Personal',
  coursework: 'Coursework',
};
export const CATEGORY_ORDER: ProjectData['category'][] = ['research', 'professional', 'team', 'personal', 'coursework'];

export const EXPERIENCE_LABELS: Record<ExperienceData['type'], string> = {
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

/** Tool chips are ordered by group (most telling first), then by their order in skills.yaml. */
const GROUP_ORDER: Skill['data']['group'][] = ['robotics', 'cad-sim', 'electronics', 'fabrication', 'languages'];

const toProject = (e: CollectionEntry<'projects'>, skills: Skill[]): Project => ({
  ...e,
  data: {
    ...e.data,
    cover: resolveImage(e.data.cover, e.id),
    skills: skills
      .filter((s) => s.data.projects.some((p) => p.id === e.id))
      .sort((a, b) => GROUP_ORDER.indexOf(a.data.group) - GROUP_ORDER.indexOf(b.data.group))
      .map((s) => ({ id: s.id, collection: 'skills' as const })),
  },
});

let cache: Promise<Project[]> | undefined;
async function allProjects() {
  cache ??= (async () => {
    const [meta, bodies, skills] = await Promise.all([getCollection('projects'), getCollection('projectBodies'), getCollection('skills')]);
    // Every project needs both halves — catch a typo'd slug in either place.
    const bodyIds = new Set(bodies.map((b) => b.id));
    const metaIds = new Set(meta.map((m) => m.id));
    for (const id of metaIds)
      if (!bodyIds.has(id)) throw new Error(`projects.yaml has "${id}" but src/content/projects/${id}/index.mdx doesn't exist.`);
    for (const id of bodyIds)
      if (!metaIds.has(id)) throw new Error(`src/content/projects/${id}/index.mdx has no "${id}:" entry in src/data/projects.yaml.`);
    return meta.map((m) => toProject(m, skills));
  })();
  return cache;
}

/** All visible projects, newest first (ongoing work counts as "now"); `order` breaks ties. */
export async function getProjects() {
  return (await allProjects()).filter(visible).sort((a, b) => endOf(b.data) - endOf(a.data) || b.data.order - a.data.order);
}

export async function getFeaturedProjects() {
  const all = await getProjects();
  return all.filter((p) => p.data.featured).sort((a, b) => b.data.order - a.data.order || endOf(b.data) - endOf(a.data));
}

/** The MDX write-up for a project (render it with `render()` from astro:content). */
export async function getProjectBody(id: string) {
  const body = await getEntry('projectBodies', id);
  if (!body) throw new Error(`No write-up for project "${id}"`);
  return body;
}

const pick = (glob: Record<string, { default: ImageMetadata }>, dir: string, file: string | undefined, where: string) => {
  if (!file) return undefined;
  const mod = glob[`/${dir}/${file}`];
  if (!mod) throw new Error(`experience.yaml → ${where}: "${file}" not found in ${dir}/`);
  return mod.default;
};

const toExperience = (e: CollectionEntry<'experience'>): Experience => {
  const { logo, photo, gallery, ...rest } = e.data;
  return {
    ...e,
    data: {
      ...rest,
      logo: pick(logos, 'src/assets/logos', logo, `${e.id}.logo`),
      photo: pick(sitePhotos, 'src/assets/site', photo, `${e.id}.photo`),
      // "slug/file.jpg" = a project image; a bare file name = src/assets/site/.
      gallery: gallery.map((g, i) => ({
        alt: g.alt,
        src: g.src.includes('/') ? resolveImage(g.src) : pick(sitePhotos, 'src/assets/site', g.src, `${e.id}.gallery[${i}]`)!,
      })),
    },
  };
};

/** Experience, most recent first. */
export async function getExperience() {
  const all = (await getCollection('experience', visible)).map(toExperience);
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
    if (!s) throw new Error(`Unknown tool "${r.id}" — add it to src/data/skills.yaml`);
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
  return (await allProjects())
    .filter(visible)
    .filter((p) => p.data.lineage?.family === fam)
    .sort((a, b) => a.data.lineage!.order - b.data.lineage!.order);
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
  const e = await getEntry('experience', id);
  return e ? toExperience(e) : undefined;
}
