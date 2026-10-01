// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

/**
 * Old Jekyll URLs → new routes. GitHub Pages paths are case-sensitive, so the
 * keys must match the old folder names exactly. Each becomes a tiny static
 * redirect page, so links on LinkedIn / old resumes keep working.
 */
const legacyRedirects = {
  '/Glider': '/projects/glider',
  '/Marlin': '/projects/marlin',
  '/MrToad': '/projects/mr-toad',
  '/Quadfrog': '/projects/quadfrog',
  '/Remote': '/projects/custom-remote',
  '/robin': '/projects/robin',
  '/STMRemote': '/projects/stm-remote',
  '/Shuttle_Model': '/projects/shuttle-model',
  '/TyphoonBGC': '/projects/typhoon-bgc',
  '/eevi': '/projects/eevi',
  '/electronicsbox': '/projects/electronics-box',
};

export default defineConfig({
  site: 'https://mlags101.github.io',
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap()],
  redirects: legacyRedirects,
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  // Inline page CSS (~30 KB) — removes the render-blocking request on first paint.
  build: { inlineStylesheets: 'always' },
  vite: {
    // model-viewer (three.js) is ~1 MB but lazy-loaded only on pages with a 3D model.
    build: { assetsInlineLimit: 2048, chunkSizeWarningLimit: 1100 },
  },
});
