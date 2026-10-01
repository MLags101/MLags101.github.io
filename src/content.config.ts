/**
 * Content model — the single source of truth for every page on the site.
 *
 * Rules that keep data from drifting:
 *  - A fact lives in exactly one place. Project metadata lives only in that project's
 *    frontmatter; listings, the home page and the resume page all query these collections.
 *  - References point one way. Projects reference skills / experience; "used in N projects"
 *    and "projects at <org>" are computed in src/lib/content.ts.
 *  - The build fails on bad data: unknown skill ids, missing images, end-before-start, etc.
 *
 * Field reference with examples: docs/CONTENT.md
 */
import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/** "2025-06" or "2025-06-14" → Date (always formatted in UTC; see src/lib/dates.ts). */
const month = z.coerce.date();
const link = z.object({
  label: z.string(),
  url: z.string(),
  kind: z.enum(['behance', 'github', 'video', 'paper', 'cad', 'website', 'other']).default('other'),
});
/** model-viewer vector: "x y z" with optional m units, e.g. "0.12m 0.04m -0.3m". */
const vec3 = z.string().regex(/^\s*-?[\d.]+(e-?\d+)?m?\s+-?[\d.]+(e-?\d+)?m?\s+-?[\d.]+(e-?\d+)?m?\s*$/, 'expected "x y z"');
/** Folder-per-entry collections use the folder name as the id (projects/eevi/index.mdx → "eevi"). */
const folderId = ({ entry }: { entry: string }) => entry.split('/')[0]!;

const skills = defineCollection({
  loader: file('src/content/skills.yaml'),
  schema: z.object({
    name: z.string(),
    group: z.enum(['languages', 'cad-sim', 'electronics', 'robotics', 'fabrication']),
    aliases: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
  }),
});

const hotspot = z.object({
  id: z.string(),
  label: z.string(),
  partNo: z.string().optional(),
  detail: z.string(),
});

const projects = defineCollection({
  loader: glob({ pattern: '*/index.mdx', base: './src/content/projects', generateId: folderId }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        /** One or two sentences for cards and meta descriptions. */
        summary: z.string().max(220),
        category: z.enum(['research', 'professional', 'team', 'personal', 'coursework']),
        start: month,
        /** Omit for ongoing work. */
        end: month.optional(),
        status: z.enum(['complete', 'in-progress', 'paused', 'concept']).default('complete'),
        featured: z.boolean().default(false),
        /** Higher sorts first within listings (ties broken by date). */
        order: z.number().default(0),
        draft: z.boolean().default(false),
        cover: image(),
        coverAlt: z.string().min(8),
        /** Optional hero override: a looping video (public/ path) or a 3D model id. */
        heroVideo: z.string().optional(),
        model: reference('models').optional(),
        role: z.string(),
        context: reference('experience').optional(),
        team: z.string().optional(),
        skills: z.array(reference('skills')).min(1),
        specs: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
        lineage: z.object({ family: z.string(), version: z.string(), order: z.number() }).optional(),
        related: z.array(reference('projects')).default([]),
        links: z.array(link).default([]),
        log: z.array(z.object({ date: month, title: z.string(), note: z.string().optional() })).default([]),
      })
      .refine((d) => !d.end || d.end >= d.start, { message: '`end` is before `start`', path: ['end'] }),
});

const experience = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './src/content/experience', generateId: folderId }),
  schema: ({ image }) =>
    z.object({
      org: z.string(),
      /** Short badge text when there is no logo, e.g. "GTRI". */
      mark: z.string().max(6),
      orgUrl: z.string().optional(),
      logo: image().optional(),
      location: z.string(),
      type: z.enum(['internship', 'co-op', 'research', 'team', 'leadership']),
      start: month,
      /** Omit while ongoing. */
      end: month.optional(),
      /** Promotion ladder, newest first. Position dates are optional. */
      positions: z
        .array(z.object({ title: z.string(), start: month.optional(), end: month.optional() }))
        .min(1),
      summary: z.string().max(260),
      highlights: z.array(z.string()).default([]),
      skills: z.array(reference('skills')).default([]),
      /** Show on the resume page (and in resume order). */
      onResume: z.boolean().default(true),
      draft: z.boolean().default(false),
    }),
});

const research = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/research' }),
  schema: z.object({
    title: z.string(),
    kind: z.enum(['paper', 'poster', 'talk', 'thesis', 'report', 'ongoing']),
    date: month,
    venue: z.string().optional(),
    authors: z.array(z.string()).default([]),
    summary: z.string(),
    links: z.array(link).default([]),
    experience: reference('experience').optional(),
    project: reference('projects').optional(),
  }),
});

const models = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/models' }),
  schema: z.object({
    /** Public path to an optimized GLB, e.g. /models/kermit-v3/model.glb */
    src: z.string().regex(/^\/models\/.+\.glb$/),
    poster: z.string(),
    alt: z.string(),
    sizeMB: z.number(),
    cameraOrbit: z.string().default('35deg 70deg auto'),
    cameraTarget: z.string().default('auto auto auto'),
    exposure: z.number().default(1),
    hotspots: z
      .array(hotspot.extend({ position: vec3, normal: vec3, orbit: z.string().optional(), target: vec3.optional(), fov: z.string().optional() }))
      .default([]),
  }),
});

const diagrams = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/diagrams' }),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      groups: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      nodes: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          sub: z.string().optional(),
          group: z.string().optional(),
          col: z.number().int().min(0),
          row: z.number().min(0),
        }),
      ),
      edges: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          label: z.string().optional(),
          kind: z.enum(['data', 'rf', 'power', 'video']).default('data'),
        }),
      ),
    })
    .superRefine((d, ctx) => {
      const ids = new Set(d.nodes.map((n) => n.id));
      const groups = new Set(d.groups.map((g) => g.id));
      for (const e of d.edges)
        for (const end of [e.from, e.to])
          if (!ids.has(end)) ctx.addIssue({ code: 'custom', message: `edge references unknown node "${end}"` });
      for (const n of d.nodes)
        if (n.group && !groups.has(n.group)) ctx.addIssue({ code: 'custom', message: `node "${n.id}" has unknown group "${n.group}"` });
    }),
});

export const collections = { skills, projects, experience, research, models, diagrams };
