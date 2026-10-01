/**
 * Site-wide facts, loaded from src/data/site.yaml (edit that file, not this one).
 * Validated at build time so a typo fails loudly instead of rendering blank.
 */
import { load } from 'js-yaml';
import { z } from 'astro/zod';
import raw from './data/site.yaml?raw';

const schema = z.object({
  name: z.string(),
  initials: z.string().max(3),
  role: z.string(),
  identity: z.array(z.string()).default([]),
  tagline: z.string(),
  description: z.string(),
  availability: z.string().default(''),
  location: z.string(),
  email: z.email(),
  links: z.object({ linkedin: z.url(), github: z.url().optional() }),
  resumePdf: z.string(),
  education: z.object({
    school: z.string(),
    degree: z.string(),
    detail: z.string(),
    location: z.string(),
    minor: z.string().optional(),
    graduation: z.string(),
    gpa: z.coerce.string(),
  }),
  honors: z.array(z.string()).default([]),
  nav: z.array(z.object({ href: z.string(), label: z.string() })),
});

const parsed = schema.safeParse(load(raw));
if (!parsed.success) {
  throw new Error(`src/data/site.yaml is invalid:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
}

export const site = parsed.data;
export type Site = typeof site;
