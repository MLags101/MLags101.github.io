/**
 * Lets MDX reference co-located images by file name:
 *
 *   <Figure src="frame-v2.jpg" alt="…" />            → src/content/projects/<this project>/images/frame-v2.jpg
 *   <Figure src="eevi/frame-v2.jpg" alt="…" />       → another project's image
 *
 * The project page sets Astro.locals.projectSlug before rendering its MDX body, so
 * components resolve names against the right folder. Unknown names fail the build.
 */
import type { ImageMetadata } from 'astro';

const images = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/projects/*/images/*.{jpg,jpeg,png,webp,gif,svg}',
  { eager: true },
);

export type ImageSrc = string | ImageMetadata;

export function resolveImage(src: ImageSrc, slug?: string): ImageMetadata {
  if (typeof src !== 'string') return src;
  const clean = src.replace(/^\.\//, '').replace(/^images\//, '');
  const [maybeSlug, ...rest] = clean.split('/');
  const key =
    rest.length > 0
      ? `/src/content/projects/${maybeSlug}/images/${rest.join('/').replace(/^images\//, '')}`
      : `/src/content/projects/${slug}/images/${clean}`;
  const mod = images[key];
  if (!mod) {
    const known = Object.keys(images)
      .filter((k) => k.includes(`/projects/${slug}/`))
      .map((k) => k.split('/').pop())
      .join(', ');
    throw new Error(`Image "${src}" not found for project "${slug}". Looked for ${key}.\nAvailable: ${known}`);
  }
  return mod.default;
}
