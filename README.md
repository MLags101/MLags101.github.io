# mlags101.github.io

Michael Lagana's engineering portfolio — projects, experience, research and resume.
Built with [Astro](https://astro.build), deployed to GitHub Pages by GitHub Actions.

## Quick start

```bash
npm install          # once (Node 22+; Windows: winget install OpenJS.NodeJS.LTS)
npm run dev          # http://localhost:4321 — live reload, drafts visible
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ exactly as it will deploy
```

Push to `main` → the **Deploy** workflow publishes the site. Every other branch / PR runs **CI**
(type check, content lint, build, link check).

## Adding things

| I want to…                         | Do this                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Add a project                      | `npm run new` (or `npm run new -- project "Name" --category personal …`)    |
| Add a job / team / lab             | `npm run new -- experience "Org name" --type internship`                     |
| Add a skill to the registry        | `npm run new -- skill "LabVIEW" --group cad-sim`                             |
| Add photos to a project            | Drop them in `src/content/projects/<slug>/images/`, reference by file name   |
| Add a video                        | Add a job to `scripts/videos.json`, run `npm run media:videos`               |
| Add a 3D model with labeled parts  | `npm run model:optimize -- export.glb <id>` → see [docs/3D-MODELS.md](docs/3D-MODELS.md) |
| Draw a block diagram               | Add `src/content/diagrams/<id>.yaml`, use `<Diagram id="<id>" />`            |
| Update contact info / nav / school | `src/site.config.ts`                                                         |
| Replace the resume PDF             | Overwrite `public/resume/Michael-Lagana-Resume.pdf`                          |
| Check content before pushing       | `npm run lint:content`                                                       |

Full guides: **[docs/CONTENT.md](docs/CONTENT.md)** (writing pages, every frontmatter field, component
cheat sheet) · **[docs/MEDIA.md](docs/MEDIA.md)** (photos, video) · **[docs/3D-MODELS.md](docs/3D-MODELS.md)**.

## Layout

```
src/
  content/              ← all the words, data and project photos
    projects/<slug>/    index.mdx + images/          (one folder per project)
    experience/<slug>/  index.md (+ optional logo)
    research/           *.md
    diagrams/           *.yaml   block diagrams
    models/             *.yaml   3D model hotspots
    skills.yaml         the skill registry
  content.config.ts     schemas — the build fails on bad data
  site.config.ts        name, email, links, education, nav
  components/           layout · cards · media · data · ui
  layouts/ pages/ lib/ styles/
public/                 served as-is: videos (media/), 3D models (models/), resume PDF, favicon
scripts/                new.mjs · check-content · encode-videos · optimize-model · migrate/
docs/                   how-to guides
_archive/               (git-ignored) the old Jekyll site + full-resolution originals
```

## Design rules

Dark technical theme with a light toggle; one accent (`--accent`); tokens in `src/styles/tokens.css`.
Motion is restrained and disappears under `prefers-reduced-motion`. Each fact lives in exactly one
place — never repeat a project's title/date/skills in its body text; the layout renders them.
