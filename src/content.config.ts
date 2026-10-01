/**
 * Content model. Two places, two jobs:
 *
 *   src/data/      FACTS you edit by hand — projects.yaml (dates, skills, specs…),
 *                  experience.yaml, skills.yaml, research.yaml, site.yaml, plus one YAML per
 *                  3D model / robot / diagram.
 *   src/content/   WRITE-UPS — projects/<slug>/index.mdx (prose + components) and images/.
 *
 * Rules that keep data from drifting:
 *  - A fact lives in exactly one place. Listings, the home page and the resume all read
 *    these collections; nothing is restated in the MDX.
 *  - References point one way. Projects name their skills / experience; "used in N
 *    projects" and "projects at <org>" are computed in src/lib/content.ts.
 *  - The build fails on bad data (unknown skill ids, missing images, end before start…)
 *    with a message naming the file and field.
 *
 * Field reference with examples: docs/CONTENT.md · Map of the repo: SITE_GUIDE.md
 */
import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

const blank = (v: unknown) => (v === null || v === '' || v === 'present' || v === 'ongoing' ? undefined : v);
/** "2025-06" (or a full date) → Date. Formatted in UTC everywhere; see src/lib/dates.ts. */
const month = z.preprocess(blank, z.coerce.date());
/** Optional month — empty, `present` or `ongoing` all mean "still going". */
const monthOpt = z.preprocess(blank, z.coerce.date().optional());
const link = z.object({
  label: z.string(),
  url: z.string(),
  kind: z.enum(['github', 'video', 'paper', 'cad', 'website', 'other']).default('other'),
});
/** "x y z" with optional m units, e.g. "0.12m 0.04m -0.3m". */
const vec3 = z.string().regex(/^\s*-?[\d.]+(e-?\d+)?m?\s+-?[\d.]+(e-?\d+)?m?\s+-?[\d.]+(e-?\d+)?m?\s*$/, 'expected "x y z"');
const list = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => v ?? [], z.array(t));

// ── facts (src/data) ──────────────────────────────────────────────────────

const skills = defineCollection({
  loader: file('src/data/skills.yaml'),
  schema: z.object({
    name: z.string(),
    group: z.enum(['languages', 'cad-sim', 'electronics', 'robotics', 'fabrication']),
    aliases: list(z.string()),
    /** Listed in the Skills section of /resume. */
    resume: z.boolean().default(false),
    /** Projects that used this tool — the source of every project's tool chips. */
    projects: list(reference('projects')),
  }),
});

const projects = defineCollection({
  loader: file('src/data/projects.yaml'),
  schema: z
    .object({
      title: z.string(),
      /** One or two sentences for cards and meta descriptions. */
      summary: z.string().max(240),
      category: z.enum(['research', 'professional', 'team', 'personal', 'coursework']),
      start: month,
      end: monthOpt,
      status: z.enum(['complete', 'in-progress', 'paused', 'concept']).default('complete'),
      featured: z.boolean().default(false),
      /** Funded by an Invention Studio Maker Grant (counted on the home page). */
      makerGrant: z.boolean().default(false),
      /** Higher sorts first within listings (ties broken by date). */
      order: z.number().default(0),
      draft: z.boolean().default(false),
      /** File name in src/content/projects/<slug>/images/ (resolved in src/lib/content.ts). */
      cover: z.string(),
      coverAlt: z.string().min(8),
      /** Optional hero override: a looping video (public/ path) or a 3D model id. */
      heroVideo: z.string().optional(),
      model: reference('models').optional(),
      role: z.string(),
      context: reference('experience').optional(),
      team: z.string().optional(),
      specs: list(z.object({ label: z.string(), value: z.coerce.string() })),
      lineage: z.object({ family: z.string(), version: z.coerce.string(), order: z.number() }).optional(),
      related: list(reference('projects')),
      links: list(link),
      log: list(z.object({ date: month, title: z.string(), note: z.string().optional() })),
    })
    .refine((d) => !d.end || d.end >= d.start, { message: '`end` is before `start`', path: ['end'] }),
});

const experience = defineCollection({
  loader: file('src/data/experience.yaml'),
  schema: z.object({
    org: z.string(),
    /** Short badge text when there is no logo, e.g. "GTRI". */
    mark: z.string().max(6),
    /** File name in src/assets/logos/. */
    logo: z.string().optional(),
    /** Optional photo, file name in src/assets/site/. */
    photo: z.string().optional(),
    /** Research: show this lab as the large feature on /research. */
    featured: z.boolean().default(false),
    /** Research: PI / advisor shown with the lab. */
    advisor: z.string().optional(),
    /** Extra media for the Research page: project images as "project-slug/file.jpg". */
    gallery: list(z.object({ src: z.string(), alt: z.string() })),
    /** A video (public/ path) shown with the lab on /research. */
    video: z.string().optional(),
    orgUrl: z.string().optional(),
    location: z.string(),
    type: z.enum(['internship', 'co-op', 'research', 'team', 'leadership']),
    start: month,
    end: monthOpt,
    /** Promotion ladder, newest first. Position dates are optional. */
    positions: z.array(z.object({ title: z.string(), start: monthOpt, end: monthOpt })).min(1),
    /** A few plain sentences for the Experience page. */
    summary: z.string().max(480),
    /** Resume bullets — used on /resume only. */
    highlights: list(z.string()),
    skills: list(reference('skills')),
    /** Show on the resume page. */
    onResume: z.boolean().default(true),
    draft: z.boolean().default(false),
  }),
});

const research = defineCollection({
  loader: file('src/data/research.yaml'),
  schema: z.object({
    title: z.string(),
    kind: z.enum(['paper', 'poster', 'talk', 'thesis', 'report', 'ongoing']),
    date: month,
    venue: z.string().optional(),
    authors: list(z.string()),
    summary: z.string(),
    links: list(link),
    experience: reference('experience').optional(),
    project: reference('projects').optional(),
  }),
});

/** Which face of a part a hotspot marker sits on (see docs/3D-MODELS.md). */
const side = z.enum(['top', 'bottom', 'front', 'back', 'left', 'right']);

const models = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/data/models' }),
  schema: z.object({
    /** Public path to an optimized GLB, e.g. /models/kermit-v3/model.glb */
    src: z.string().regex(/^\/models\/.+\.glb$/),
    poster: z.string(),
    alt: z.string(),
    sizeMB: z.number(),
    /** Model axis that points "forward" — decides what `from: front` means for hotspots. */
    forward: z.enum(['+x', '-x', '+z', '-z']).default('+z'),
    cameraOrbit: z.string().default('35deg 70deg auto'),
    cameraTarget: z.string().default('auto auto auto'),
    exposure: z.number().default(1),
    /**
     * Hotspots. Easiest: name a CAD `part` (see `npm run model:parts -- <id>`) and the
     * build finds the marker position on that part's `from` side. Or give an explicit
     * position/normal captured with Shift+click in ?author mode.
     */
    hotspots: list(
      z
        .object({
          id: z.string(),
          label: z.string(),
          partNo: z.string().optional(),
          detail: z.string(),
          part: z.string().optional(),
          from: side.default('top'),
          position: vec3.optional(),
          normal: vec3.optional(),
          orbit: z.string().optional(),
          fov: z.string().optional(),
        })
        .refine((h) => h.part || h.position, { message: 'hotspot needs `part` or `position`' }),
    ),
    /**
     * Animations baked into the GLB (SolidWorks motion study / Blender). Each becomes a
     * button; `scrub: true` ties the animation to scroll position instead.
     */
    animations: list(
      z.object({
        name: z.string(),
        label: z.string(),
        loop: z.boolean().default(false),
        scrub: z.boolean().default(false),
      }),
    ),
    /** Color overrides baked in by `npm run model:optimize` (not read at runtime). */
    appearance: z
      .object({
        defaultColor: z.string().optional(),
        flattenTextures: z.union([z.boolean(), z.string()]).optional(),
        parts: list(
          z.object({
            match: z.union([z.string(), z.array(z.string())]),
            color: z.string().regex(/^#[0-9a-f]{6}$/i, 'use a hex color like "#24272c"'),
            roughness: z.number().min(0).max(1).optional(),
            metalness: z.number().min(0).max(1).optional(),
          }),
        ),
      })
      .optional(),
  }),
});

const robots = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/data/robots' }),
  schema: z.object({
    /** Public path to the URDF, e.g. /robots/dum-i/urdf/dum-i.urdf */
    urdf: z.string().regex(/^\/robots\/.+\.urdf$/),
    /** ROS package name(s) used in package:// mesh paths → public folder. */
    packages: z.record(z.string(), z.string()).default({}),
    alt: z.string(),
    poster: z.string().optional(),
    /** Rotate the model so it stands upright (URDFs are usually Z-up). */
    up: z.enum(['+z', '+y']).default('+z'),
    cameraDistance: z.number().optional(),
    /** Show a slider for every movable joint. */
    sliders: z.boolean().default(true),
    /** Named joint configurations, in radians (or meters for prismatic joints). */
    poses: list(z.object({ id: z.string(), label: z.string(), joints: z.record(z.string(), z.number()) })),
    /** A looping demo that eases through poses in order. */
    sequence: z
      .object({ poses: z.array(z.string()).min(2), seconds: z.number().default(1.6), hold: z.number().default(0.6), autoplay: z.boolean().default(false) })
      .optional(),
    /** Link colors baked in by `npm run robot:import` (not read at runtime). */
    appearance: z.object({ default: z.string().optional(), links: z.record(z.string(), z.string()).default({}) }).optional(),
  }),
});

/** PCB designs imported with `npm run pcb:import` — files in public/pcbs/<id>/. */
const pcbs = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/data/pcbs' }),
  schema: z.object({
    name: z.string(),
    alt: z.string(),
    /** 3D board (a model id) shown in the viewer's 3D tab. */
    model: reference('models').optional(),
  }),
});

const diagrams = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/data/diagrams' }),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      /** Ambient "signal" pulses along every link while the diagram is on screen. */
      animate: z.boolean().default(true),
      groups: list(z.object({ id: z.string(), label: z.string() })),
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
      /** Named signal paths (node ids in order) — each gets a "trace" button that animates it. */
      flows: list(z.object({ id: z.string(), label: z.string(), path: z.array(z.string()).min(2) })),
    })
    .superRefine((d, ctx) => {
      const ids = new Set(d.nodes.map((n) => n.id));
      const groups = new Set(d.groups.map((g) => g.id));
      const hasEdge = (a: string, b: string) => d.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
      for (const e of d.edges)
        for (const end of [e.from, e.to])
          if (!ids.has(end)) ctx.addIssue({ code: 'custom', message: `edge references unknown node "${end}"` });
      for (const n of d.nodes)
        if (n.group && !groups.has(n.group)) ctx.addIssue({ code: 'custom', message: `node "${n.id}" has unknown group "${n.group}"` });
      for (const f of d.flows)
        for (let i = 0; i < f.path.length - 1; i++)
          if (!hasEdge(f.path[i]!, f.path[i + 1]!))
            ctx.addIssue({ code: 'custom', message: `flow "${f.id}": no edge between "${f.path[i]}" and "${f.path[i + 1]}"` });
    }),
});

// ── write-ups (src/content) ─────────────────────────────────────────────────

/** Project bodies: src/content/projects/<slug>/index.mdx — no frontmatter needed. */
const projectBodies = defineCollection({
  loader: glob({
    pattern: '*/index.mdx',
    base: './src/content/projects',
    generateId: ({ entry }: { entry: string }) => entry.split('/')[0]!,
  }),
  schema: z.object({}).passthrough(),
});

export const collections = { skills, projects, experience, research, models, robots, pcbs, diagrams, projectBodies };
